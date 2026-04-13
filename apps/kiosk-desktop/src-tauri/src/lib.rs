//! QuokkaQ Kiosk: remote webview + local Go print agent sidecar.

use std::collections::HashSet;
use std::io::Write;
use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
use std::sync::Mutex;
use std::time::Duration;

use base64::Engine;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Url};
use tauri::webview::PageLoadEvent;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

const AGENT_HTTP: &str = "http://127.0.0.1:17431";
const PROFILE_FILE: &str = "desktop-profile.json";

/// URL that successfully loaded `splash.html` (cached on first load; needed because scheme/host differ by platform).
static RESOLVED_SPLASH_URL: Mutex<Option<Url>> = Mutex::new(None);

fn remember_splash_url(u: Url) {
    let path = u.path();
    if !(path.ends_with("splash.html") || path.contains("/splash.html")) {
        return;
    }
    if let Ok(mut g) = RESOLVED_SPLASH_URL.lock() {
        *g = Some(u);
    }
}

fn cached_splash_url() -> Option<Url> {
    RESOLVED_SPLASH_URL.lock().ok().and_then(|g| g.clone())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopProfile {
    api_base_url: String,
    access_token: String,
    unit_id: String,
    default_locale: String,
    app_base_url: String,
    /// From server terminal settings; missing in older profile files = false.
    #[serde(default)]
    kiosk_fullscreen: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BootstrapResponse {
    token: String,
    unit_id: String,
    default_locale: String,
    app_base_url: String,
    #[serde(default)]
    kiosk_fullscreen: bool,
}

/// If `QUOKKAQ_KIOSK_FULLSCREEN` is set to a non-empty value, it wins (1/true/yes/on → fullscreen).
fn effective_kiosk_fullscreen(from_profile: bool) -> bool {
    if let Ok(v) = std::env::var("QUOKKAQ_KIOSK_FULLSCREEN") {
        if !v.trim().is_empty() {
            return matches!(
                v.to_ascii_lowercase().as_str(),
                "1" | "true" | "yes" | "on"
            );
        }
    }
    from_profile
}

fn apply_kiosk_window_mode(win: &tauri::WebviewWindow, fullscreen: bool) {
    let _ = win.set_fullscreen(fullscreen);
    let _ = win.set_decorations(!fullscreen);
}

fn trim_slash(s: &str) -> &str {
    s.trim_end_matches('/')
}

/// `host:port` or `host` (default port 9100).
fn parse_printer_socket_addr(target: &str) -> Result<SocketAddr, String> {
    let t = target.trim();
    if t.is_empty() {
        return Err("empty printer target".to_string());
    }
    if let Ok(a) = t.parse::<SocketAddr>() {
        return Ok(a);
    }
    format!("{t}:9100")
        .to_socket_addrs()
        .map_err(|e| format!("invalid printer address {t}: {e}"))?
        .next()
        .ok_or_else(|| format!("could not resolve printer address {t}"))
}

/// Raw ESC/POS over TCP from **this process** (needed so macOS Local Network privacy applies to
/// QuokkaQ Kiosk.app; the Go sidecar is a separate executable and may not get the prompt).
fn print_raw_via_tcp(target: &str, raw: &[u8]) -> Result<(), String> {
    let addr = parse_printer_socket_addr(target)?;
    let mut stream =
        TcpStream::connect_timeout(&addr, Duration::from_secs(5)).map_err(|e| e.to_string())?;
    stream
        .set_write_timeout(Some(Duration::from_secs(10)))
        .map_err(|e| e.to_string())?;
    stream.write_all(raw).map_err(|e| e.to_string())?;
    stream.flush().map_err(|e| e.to_string())?;
    Ok(())
}

fn config_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_config_dir()
        .map_err(|e| format!("app_config_dir: {e}"))
}

fn read_desktop_profile(app: &AppHandle) -> Option<DesktopProfile> {
    let path = config_dir(app).ok()?.join(PROFILE_FILE);
    let raw = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

fn profile_is_ready(p: &DesktopProfile) -> bool {
    !p.access_token.is_empty()
        && !p.unit_id.is_empty()
        && !p.app_base_url.is_empty()
        && !p.default_locale.is_empty()
}

fn write_desktop_profile(app: &AppHandle, profile: &DesktopProfile) -> Result<(), String> {
    let dir = config_dir(app)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(PROFILE_FILE);
    let data =
        serde_json::to_string_pretty(profile).map_err(|e| format!("profile json: {e}"))?;
    std::fs::write(path, data).map_err(|e| e.to_string())
}

fn kiosk_url_from_profile(p: &DesktopProfile) -> Result<tauri::Url, String> {
    let base = trim_slash(p.app_base_url.trim());
    let loc = p.default_locale.trim();
    let loc = if loc.is_empty() { "en" } else { loc };
    let url = format!("{}/{}/kiosk/{}", base, loc, p.unit_id.trim());
    url.parse()
        .map_err(|e| format!("kiosk url parse error: {e}"))
}

/// Legacy single-line URL file (no token injection).
const LEGACY_KIOSK_URL_FILE: &str = "kiosk-url.txt";

fn read_legacy_kiosk_url_file(app: &AppHandle) -> Option<tauri::Url> {
    let dir = config_dir(app).ok()?;
    let path = dir.join(LEGACY_KIOSK_URL_FILE);
    let s = std::fs::read_to_string(path).ok()?;
    let t = s.trim();
    if t.is_empty() {
        return None;
    }
    t.parse().ok()
}

fn inject_token_later(win: tauri::WebviewWindow, token: String, locale: String) {
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(1800));
        let tok_js = serde_json::to_string(&token).unwrap_or_else(|_| "\"\"".to_string());
        let loc_js = serde_json::to_string(&locale).unwrap_or_else(|_| "\"en\"".to_string());
        let script = format!(
            "try {{ localStorage.setItem('access_token', {tok_js}); localStorage.setItem('NEXT_LOCALE', {loc_js}); }} catch (e) {{ console.error(e); }}"
        );
        let _ = win.eval(script);
    });
}

fn should_auto_redirect_from_splash(app: &AppHandle) -> bool {
    if let Ok(u) = std::env::var("QUOKKAQ_KIOSK_URL") {
        if !u.trim().is_empty() {
            return true;
        }
    }
    if let Some(p) = read_desktop_profile(app) {
        if profile_is_ready(&p) {
            return true;
        }
    }
    read_legacy_kiosk_url_file(app).is_some()
}

/// `Some(fs)` only when navigation used `desktop-profile.json` (so window mode matches that profile).
fn apply_initial_navigation(
    app: &AppHandle,
    win: &tauri::WebviewWindow,
) -> Result<Option<bool>, String> {
    if let Ok(u) = std::env::var("QUOKKAQ_KIOSK_URL") {
        let t = u.trim();
        if !t.is_empty() {
            let url: tauri::Url = t
                .parse()
                .map_err(|e| format!("QUOKKAQ_KIOSK_URL parse error: {e}"))?;
            win.navigate(url).map_err(|e| e.to_string())?;
            return Ok(None);
        }
    }

    if let Some(p) = read_desktop_profile(app) {
        if profile_is_ready(&p) {
            let url = kiosk_url_from_profile(&p)?;
            win.navigate(url).map_err(|e| e.to_string())?;
            inject_token_later(win.clone(), p.access_token.clone(), p.default_locale.clone());
            return Ok(Some(p.kiosk_fullscreen));
        }
    }

    if let Some(url) = read_legacy_kiosk_url_file(app) {
        win.navigate(url).map_err(|e| e.to_string())?;
        return Ok(None);
    }

    Ok(None)
}

fn remove_saved_kiosk_urls(app: &AppHandle) -> Result<(), String> {
    let dir = config_dir(app)?;
    let _ = std::fs::remove_file(dir.join(PROFILE_FILE));
    let _ = std::fs::remove_file(dir.join(LEGACY_KIOSK_URL_FILE));
    Ok(())
}

fn navigate_main_to_splash(app: &AppHandle) -> Result<(), String> {
    let win = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;

    let mut seen: HashSet<String> = HashSet::new();
    let mut candidates: Vec<Url> = Vec::new();
    let mut push = |u: Url| {
        let key = u.as_str().to_string();
        if seen.insert(key) {
            candidates.push(u);
        }
    };

    if let Some(u) = cached_splash_url() {
        push(u);
    }
    for s in [
        "http://tauri.localhost/splash.html",
        "https://tauri.localhost/splash.html",
        "tauri://localhost/splash.html",
    ] {
        if let Ok(u) = s.parse::<Url>() {
            push(u);
        }
    }

    let mut last_err = "no splash navigation candidates".to_string();
    for u in candidates {
        match win.navigate(u.clone()) {
            Ok(()) => {
                apply_kiosk_window_mode(&win, false);
                return Ok(());
            }
            Err(e) => last_err = format!("navigate {}: {e}", u.as_str()),
        }
    }
    Err(last_err)
}

fn spawn_print_agent(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let shell = app.shell();
        let sidecar = match shell.sidecar("quokkaq-kiosk-agent") {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[quokkaq-kiosk] sidecar init failed: {e}");
                return;
            }
        };
        let (mut rx, _child) = match sidecar.spawn() {
            Ok(p) => p,
            Err(e) => {
                eprintln!("[quokkaq-kiosk] sidecar spawn failed: {e}");
                return;
            }
        };
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    eprintln!("[agent] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Stderr(line) => {
                    eprintln!("[agent] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Error(err) => {
                    eprintln!("[quokkaq-kiosk] sidecar error: {err}");
                }
                CommandEvent::Terminated(status) => {
                    eprintln!("[quokkaq-kiosk] sidecar terminated: {status:?}");
                    break;
                }
                _ => {}
            }
        }
    });
}

/// Send a print job: **`tcp`** opens a socket from this app (macOS Local Network); **`system`**
/// forwards to the local Go agent (CUPS / Windows spooler).
#[tauri::command]
fn print_receipt(
    mode: String,
    target: String,
    address: Option<String>,
    payload_base64: String,
) -> Result<(), String> {
    let mut mode = mode.trim().to_ascii_lowercase();
    let mut target = target.trim().to_string();
    if mode.is_empty() && target.is_empty() {
        if let Some(addr) = address.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()) {
            mode = "tcp".to_string();
            target = addr.to_string();
        }
    }
    if mode.is_empty() {
        mode = "tcp".to_string();
    }
    if target.is_empty() {
        return Err("target or address is required".to_string());
    }

    let raw = base64::engine::general_purpose::STANDARD
        .decode(payload_base64.trim())
        .map_err(|e| format!("invalid base64 payload: {e}"))?;

    if mode == "tcp" {
        return print_raw_via_tcp(&target, &raw);
    }

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;

    let body = serde_json::json!({
        "mode": mode,
        "target": target,
        "payload": payload_base64,
    });

    let resp = client
        .post(format!("{AGENT_HTTP}/v1/print"))
        .json(&body)
        .send()
        .map_err(|e| format!("agent request failed: {e}"))?;

    if !resp.status().is_success() {
        let text = resp.text().unwrap_or_default();
        return Err(format!("agent error: {text}"));
    }

    Ok(())
}

/// JSON string: `{ "printers": [...], "error"?: string }` from the local agent.
#[tauri::command]
fn list_printers() -> Result<String, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(format!("{AGENT_HTTP}/v1/printers"))
        .send()
        .map_err(|e| format!("agent request failed: {e}"))?;

    if !resp.status().is_success() {
        let text = resp.text().unwrap_or_default();
        return Err(format!("agent error: {text}"));
    }

    resp.text().map_err(|e| e.to_string())
}

#[tauri::command]
fn pair_terminal(
    app: AppHandle,
    api_base_url: String,
    pairing_code: String,
) -> Result<(), String> {
    let base = trim_slash(api_base_url.trim());
    if base.is_empty() {
        return Err("apiBaseUrl is required".to_string());
    }
    let code = pairing_code.trim();
    if code.is_empty() {
        return Err("pairing code is required".to_string());
    }

    let url = format!("{}/auth/terminal/bootstrap", base);
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(45))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .post(&url)
        .json(&serde_json::json!({ "code": code }))
        .send()
        .map_err(|e| format!("request failed: {e}"))?;

    let status = resp.status();
    let text = resp.text().map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("API {status}: {text}"));
    }

    let body: BootstrapResponse =
        serde_json::from_str(&text).map_err(|e| format!("invalid API response: {e}"))?;

    let profile = DesktopProfile {
        api_base_url: base.to_string(),
        access_token: body.token.clone(),
        unit_id: body.unit_id.clone(),
        default_locale: body.default_locale.clone(),
        app_base_url: trim_slash(body.app_base_url.trim()).to_string(),
        kiosk_fullscreen: body.kiosk_fullscreen,
    };
    write_desktop_profile(&app, &profile)?;

    let win = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    let kiosk = kiosk_url_from_profile(&profile)?;
    win.navigate(kiosk).map_err(|e| e.to_string())?;
    apply_kiosk_window_mode(&win, effective_kiosk_fullscreen(profile.kiosk_fullscreen));
    inject_token_later(win, body.token, body.default_locale);

    Ok(())
}

/// Delete `desktop-profile.json`, legacy `kiosk-url.txt`, and open the pairing splash again.
#[tauri::command]
fn reset_desktop_pairing(app: AppHandle) -> Result<(), String> {
    remove_saved_kiosk_urls(&app)?;
    navigate_main_to_splash(&app)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trim_slash_removes_trailing_slashes() {
        assert_eq!(trim_slash("https://example.com///"), "https://example.com");
        assert_eq!(trim_slash("path"), "path");
    }

    #[test]
    fn parse_printer_socket_addr_accepts_host_port_and_host_only() {
        let a = parse_printer_socket_addr("127.0.0.1:9100").expect("parse");
        assert_eq!(a.port(), 9100);
        let b = parse_printer_socket_addr("127.0.0.1").expect("parse host only");
        assert_eq!(b.port(), 9100);
    }

    #[test]
    fn profile_is_ready_checks_required_strings() {
        let base = DesktopProfile {
            api_base_url: "https://api".into(),
            access_token: "t".into(),
            unit_id: "u".into(),
            default_locale: "en".into(),
            app_base_url: "https://app".into(),
            kiosk_fullscreen: false,
        };
        assert!(profile_is_ready(&base));
        let mut missing_token = base.clone();
        missing_token.access_token.clear();
        assert!(!profile_is_ready(&missing_token));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .on_page_load(|_webview, payload| {
            if payload.event() != PageLoadEvent::Finished {
                return;
            }
            remember_splash_url(payload.url().clone());
        })
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            print_receipt,
            list_printers,
            pair_terminal,
            reset_desktop_pairing
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            spawn_print_agent(handle.clone());

            if let Some(win) = app.get_webview_window("main") {
                if should_auto_redirect_from_splash(&handle) {
                    let h = handle.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(Duration::from_millis(200));
                        let app_for_thread = h.clone();
                        let _ = h.run_on_main_thread(move || {
                            if let Some(win) = app_for_thread.get_webview_window("main") {
                                if let Ok(u) = win.url() {
                                    remember_splash_url(u);
                                }
                                match apply_initial_navigation(&app_for_thread, &win) {
                                    Ok(fs) => {
                                        apply_kiosk_window_mode(
                                            &win,
                                            effective_kiosk_fullscreen(fs.unwrap_or(false)),
                                        );
                                    }
                                    Err(e) => {
                                        eprintln!("[quokkaq-kiosk] initial navigation failed: {e}");
                                    }
                                }
                            }
                        });
                    });
                } else {
                    if let Ok(u) = win.url() {
                        remember_splash_url(u);
                    }
                    let profile_kiosk_fs = apply_initial_navigation(&handle, &win)?;
                    apply_kiosk_window_mode(
                        &win,
                        effective_kiosk_fullscreen(profile_kiosk_fs.unwrap_or(false)),
                    );
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
