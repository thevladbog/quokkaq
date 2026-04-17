/** Strip Next.js `[locale]` prefix from pathname (e.g. `/en/staff` → `/staff`). */
export function pathWithoutLocale(pathname: string): string {
  return pathname.replace(/^\/[a-z]{2}\//, '/').replace(/^\/[a-z]{2}$/, '/');
}
