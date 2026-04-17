import type { ComboboxOption } from '@/components/ui/combobox';

/**
 * Current UTC offset for an IANA zone, e.g. `UTC+3` or `UTC−05:00` (en-US → UTC).
 * Uses "now" so DST is reflected for zones that observe it.
 */
export function formatUtcOffsetLabel(timeZone: string): string | null {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'shortOffset'
    });
    const part = fmt
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName')?.value;
    if (!part?.trim()) return null;
    // Typical: "GMT+3", "GMT-05:00", "GMT"
    return part.replace(/^GMT/i, 'UTC');
  } catch {
    return null;
  }
}

function buildLabelWithUtcOffset(timeZone: string): string {
  const off = formatUtcOffsetLabel(timeZone);
  return off && off !== timeZone ? `${timeZone} (${off})` : timeZone;
}

/** When Intl.supportedValuesOf is unavailable (very old runtimes). */
const FALLBACK_IANA = [
  'UTC',
  'Europe/Moscow',
  'Europe/Kaliningrad',
  'Europe/Samara',
  'Asia/Yekaterinburg',
  'Asia/Novosibirsk',
  'Asia/Vladivostok',
  'Europe/London',
  'America/New_York',
  'Asia/Tokyo'
] as const;

function buildTimezoneKeywords(
  tz: string,
  offsetLabel: string | null
): string[] {
  const parts = tz.split('/');
  const last = parts[parts.length - 1]?.replace(/_/g, ' ') ?? '';
  const out = new Set<string>([tz, last]);
  for (const p of parts) {
    if (p) out.add(p.replace(/_/g, ' '));
  }
  if (offsetLabel) {
    out.add(offsetLabel);
    const digits = offsetLabel.match(/[−\-+]?\d+(?::\d{2})?/g);
    if (digits) {
      for (const d of digits) out.add(d);
    }
  }
  return [...out];
}

/**
 * Options for a searchable IANA timezone combobox. Ensures `currentValue` is
 * listed even if it is not in the engine’s supported set (legacy or typo).
 */
export function buildIanaTimezoneComboboxOptions(
  currentValue?: string | null
): ComboboxOption[] {
  const ids =
    typeof Intl !== 'undefined' && typeof Intl.supportedValuesOf === 'function'
      ? Intl.supportedValuesOf('timeZone')
      : [...FALLBACK_IANA];

  const sorted = [...ids].sort((a, b) => a.localeCompare(b));
  const seen = new Set<string>();
  const opts: ComboboxOption[] = [];

  const push = (tz: string) => {
    if (seen.has(tz)) return;
    seen.add(tz);
    const offsetLabel = formatUtcOffsetLabel(tz);
    opts.push({
      value: tz,
      label: buildLabelWithUtcOffset(tz),
      keywords: buildTimezoneKeywords(tz, offsetLabel)
    });
  };

  const trimmed = currentValue?.trim();
  if (trimmed) push(trimmed);
  for (const tz of sorted) push(tz);

  return opts;
}
