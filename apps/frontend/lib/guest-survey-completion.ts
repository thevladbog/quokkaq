/**
 * SurveyDefinition.completionMessage from API: map of locale -> Markdown string.
 */
export function buildCompletionMessagePayload(
  en: string,
  ru: string
): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  const e = en.trim();
  const r = ru.trim();
  if (e) out.en = e;
  if (r) out.ru = r;
  return Object.keys(out).length > 0 ? out : undefined;
}

export function parseCompletionMessageFromRow(raw: unknown): {
  en: string;
  ru: string;
} {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { en: '', ru: '' };
  }
  const o = raw as Record<string, unknown>;
  const en = typeof o.en === 'string' ? o.en : '';
  const ru = typeof o.ru === 'string' ? o.ru : '';
  return { en, ru };
}

/** Pick Markdown for locale with fallbacks; null if nothing configured. */
export function pickCompletionMarkdown(
  raw: unknown,
  locale: string
): string | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const pick = (k: string): string | null => {
    const v = o[k];
    return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
  };
  return pick(locale) ?? pick('en') ?? pick('ru') ?? null;
}
