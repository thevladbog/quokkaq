/** Stored on clock widget `config` (see screen builder + renderer). */
export type ClockTimeFormatMode = 'locale' | '12h' | '24h';

/**
 * How the clock should show hours: follow UI locale, force 12h (AM/PM), or 24h.
 * Legacy `use24h: true|false` is still read when `clockTimeFormat` is absent.
 */
export function parseClockDisplayMode(
  config: Record<string, unknown> | undefined
): ClockTimeFormatMode {
  const c = config ?? {};
  const fmt = c.clockTimeFormat;
  if (fmt === '24h' || fmt === '12h' || fmt === 'locale') {
    return fmt;
  }
  if (c.use24h === true) {
    return '24h';
  }
  if (c.use24h === false) {
    return '12h';
  }
  return 'locale';
}

/** Argument for {@link ScreenClockWidget} `use24Hour`. */
export function clockUse24HourFromConfig(
  config: Record<string, unknown> | undefined
): boolean | undefined {
  const m = parseClockDisplayMode(config);
  if (m === '24h') {
    return true;
  }
  if (m === '12h') {
    return false;
  }
  return undefined;
}
