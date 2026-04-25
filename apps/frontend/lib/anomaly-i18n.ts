/**
 * Resolves operational anomaly `kind` + `message` from the API/WS to locale UI strings.
 * Backend stores English `message` and stable `kind` codes; known kinds map via `anomalies.*` in messages.
 */

export const KNOWN_ANOMALY_KINDS = [
  'arrival_spike',
  'mass_no_show',
  'slow_service'
] as const;

export type KnownAnomalyKind = (typeof KNOWN_ANOMALY_KINDS)[number];

const knownSet = new Set<string>(KNOWN_ANOMALY_KINDS);

export function isKnownAnomalyKind(
  kind: string | null | undefined
): kind is KnownAnomalyKind {
  return kind != null && knownSet.has(kind);
}

/** Display fallback when `kind` is not in the known set (e.g. future server codes). */
export function formatUnknownAnomalyKindLabel(kind: string): string {
  return kind.replace(/_/g, ' ');
}

type AnomaliesTranslate = (key: string) => string;

function kindKey(kind: KnownAnomalyKind): `kind_${KnownAnomalyKind}` {
  return `kind_${kind}`;
}

function messageKey(kind: KnownAnomalyKind): `message_${KnownAnomalyKind}` {
  return `message_${kind}`;
}

export function getAnomalyKindLabel(
  kind: string | null | undefined,
  t: AnomaliesTranslate
): string {
  if (kind == null || kind === '') {
    return '—';
  }
  if (isKnownAnomalyKind(kind)) {
    return t(kindKey(kind));
  }
  return formatUnknownAnomalyKindLabel(kind);
}

export function getAnomalyMessage(
  kind: string | null | undefined,
  messageFallback: string | null | undefined,
  t: AnomaliesTranslate
): string {
  if (isKnownAnomalyKind(kind)) {
    return t(messageKey(kind));
  }
  if (messageFallback != null && messageFallback !== '') {
    return messageFallback;
  }
  if (kind != null && kind !== '') {
    return formatUnknownAnomalyKindLabel(kind);
  }
  return '—';
}
