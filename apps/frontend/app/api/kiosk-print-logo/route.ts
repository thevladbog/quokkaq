import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

function allowedHosts(): Set<string> {
  const set = new Set<string>(['localhost', '127.0.0.1']);
  const extra =
    process.env.PRINT_ASSET_ALLOWED_HOSTS?.split(/[,;\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean) ?? [];
  for (const h of extra) {
    set.add(h);
  }
  for (const raw of [
    process.env.NEXT_PUBLIC_API_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.AWS_PUBLIC_ENDPOINT
  ]) {
    const t = raw?.trim();
    if (!t) continue;
    try {
      set.add(new URL(t).hostname.toLowerCase());
    } catch {
      /* ignore */
    }
  }
  return set;
}

function trustPublicLogoPaths(): boolean {
  const v =
    process.env.PRINT_ASSET_ALLOW_PUBLIC_LOGO_PATHS?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/**
 * When enabled, allow HTTPS URLs whose path contains our storage prefix for public logos
 * (`public/logos/` in S3/MinIO keys). Reduces 403 when the object host is not listed in env.
 * SSRF: only enable if you trust your deployment network; prefer explicit PRINT_ASSET_ALLOWED_HOSTS.
 */
function isTrustedPublicLogoUrl(u: URL): boolean {
  if (!trustPublicLogoPaths()) {
    return false;
  }
  if (
    !u.pathname.includes('/public/logos/') &&
    !u.pathname.includes('/public/printer-logos/')
  ) {
    return false;
  }
  if (u.protocol === 'https:') {
    return true;
  }
  const h = u.hostname.toLowerCase();
  return u.protocol === 'http:' && (h === 'localhost' || h === '127.0.0.1');
}

function isAllowedLogoUrl(u: URL): boolean {
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return false;
  }
  if (allowedHosts().has(u.hostname.toLowerCase())) {
    return true;
  }
  return isTrustedPublicLogoUrl(u);
}

/**
 * Server-side fetch of kiosk logo for ESC/POS raster: browser `fetch(logoUrl)` often fails on MinIO/S3
 * (no CORS). The kiosk page calls this same-origin endpoint instead.
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('url');
  if (!raw?.trim()) {
    return NextResponse.json({ error: 'missing url' }, { status: 400 });
  }
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: 'invalid url' }, { status: 400 });
  }
  if (!isAllowedLogoUrl(target)) {
    return NextResponse.json({ error: 'host not allowed' }, { status: 403 });
  }

  const ac = new AbortController();
  const kill = setTimeout(() => ac.abort(), 20_000);
  try {
    const res = await fetch(target.toString(), {
      signal: ac.signal,
      redirect: 'follow',
      headers: { Accept: 'image/*,*/*' }
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: 'upstream failed', status: res.status },
        { status: 502 }
      );
    }
    const contentType =
      res.headers.get('content-type') || 'application/octet-stream';
    const buf = await res.arrayBuffer();
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=300'
      }
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  } finally {
    clearTimeout(kill);
  }
}
