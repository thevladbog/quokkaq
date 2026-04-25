/**
 * Forced surface colors when the visitor enables high-contrast in kiosk a11y
 * (overrides custom unit colors for typography areas).
 *
 * Kept **visually distinct** from the base `dark` preset (≈#0f / #1a / #14): here we use
 * true black chrome and a **lighter** service area so the grid reads as a separate panel,
 * not “the same as dark with a different hex”.
 */
export const KIOSK_FORCED_HIGH_CONTRAST = {
  headerBackground: '#000000',
  bodyBackground: '#000000',
  /** Mid-gray “content well” vs `dark` preset’s #141414 — see kiosk-base-theme `dark`. */
  serviceGridBackground: '#2d2d2d',
  /** Logo sits on a neutral block (not the branded header fill). */
  logoSurround: '#e5e5e5',
  textOnHeader: '#ffffff',
  textOnBody: '#f5f5f5',
  /** Slightly higher than on #0a/11 so 7:1+ still holds on the lighter #2d grid. */
  textMuted: '#c8c8c8',
  focusRing: '#fbbf24',
  borderStrong: '#ffffff'
} as const;
