/** Forced surface colors when the visitor enables high-contrast in kiosk a11y (overrides custom unit colors for typography areas). */
export const KIOSK_FORCED_HIGH_CONTRAST = {
  headerBackground: '#0a0a0a',
  bodyBackground: '#0a0a0a',
  serviceGridBackground: '#111111',
  /** Logo sits on a neutral block (not the branded header fill). */
  logoSurround: '#e5e5e5',
  textOnHeader: '#ffffff',
  textOnBody: '#f5f5f5',
  textMuted: '#a3a3a3',
  focusRing: '#fbbf24',
  borderStrong: '#fafafa'
} as const;
