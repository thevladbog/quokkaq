/** Registered by `CookieConsentAndGtm` so footer / legal links can reopen the banner. */
let openPreferences: (() => void) | null = null;

export function registerCookieConsentOpener(fn: (() => void) | null): void {
  openPreferences = fn;
}

export function openCookieConsentPreferences(): void {
  openPreferences?.();
}
