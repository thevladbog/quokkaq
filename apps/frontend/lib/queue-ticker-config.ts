export type QueueTickerDirection = 'left' | 'right';

export function parseQueueTickerDirection(v: unknown): QueueTickerDirection {
  return v === 'right' ? 'right' : 'left';
}

/** One full marquee loop duration (seconds), clamped. */
export function parseQueueTickerDurationSeconds(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return 24;
  return Math.min(120, Math.max(8, Math.round(n)));
}

/** Normalized props from widget `config` JSON. */
export function queueTickerConfigFromRecord(
  raw: Record<string, unknown> | undefined
): {
  labelRu: string;
  labelEn: string;
  direction: QueueTickerDirection;
  durationSeconds: number;
} {
  const c = raw ?? {};
  return {
    labelRu: String((c as { labelRu?: unknown }).labelRu ?? ''),
    labelEn: String((c as { labelEn?: unknown }).labelEn ?? ''),
    direction: parseQueueTickerDirection(
      (c as { direction?: unknown }).direction
    ),
    durationSeconds: parseQueueTickerDurationSeconds(
      (c as { durationSeconds?: unknown }).durationSeconds
    )
  };
}

export function resolveQueueTickerLabel(
  locale: string,
  labelRu: string | undefined,
  labelEn: string | undefined,
  fallback: string
): { text: string; isCustom: boolean } {
  const ru = (labelRu ?? '').trim();
  const en = (labelEn ?? '').trim();
  const preferRu = locale.toLowerCase().startsWith('ru');
  if (preferRu) {
    if (ru) return { text: ru, isCustom: true };
    if (en) return { text: en, isCustom: true };
  } else {
    if (en) return { text: en, isCustom: true };
    if (ru) return { text: ru, isCustom: true };
  }
  return { text: fallback, isCustom: false };
}
