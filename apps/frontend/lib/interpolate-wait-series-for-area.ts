/**
 * Builds a continuous series for Recharts Area fill: linear interpolation between
 * known hourly values (first→last non-null). Single non-null point is widened to
 * up to 3 adjacent hours with the same value so a flat segment renders with fill.
 */
export function interpolateWaitSeriesForArea(
  values: (number | null | undefined)[]
): (number | null)[] {
  const n = values.length;
  const raw: (number | null)[] = values.map((v) =>
    v != null && Number.isFinite(v) ? v : null
  );

  const knownIdx: number[] = [];
  for (let i = 0; i < n; i++) {
    if (raw[i] != null) knownIdx.push(i);
  }

  if (knownIdx.length === 0) {
    return raw.map(() => null);
  }

  if (knownIdx.length === 1) {
    const k = knownIdx[0]!;
    const v = raw[k]!;
    const out: (number | null)[] = raw.map(() => null);
    out[k] = v;
    if (k > 0) out[k - 1] = v;
    if (k < n - 1) out[k + 1] = v;
    return out;
  }

  const first = knownIdx[0]!;
  const last = knownIdx[knownIdx.length - 1]!;
  const out: (number | null)[] = raw.map(() => null);

  for (let i = 0; i < n; i++) {
    if (raw[i] != null) {
      out[i] = raw[i]!;
    }
  }

  for (let j = 0; j < n; j++) {
    if (raw[j] != null) continue;
    if (j < first || j > last) continue;
    let p = j - 1;
    while (p >= 0 && raw[p] == null) p--;
    let q = j + 1;
    while (q < n && raw[q] == null) q++;
    if (p < 0 || q >= n || raw[p] == null || raw[q] == null) continue;
    const vp = raw[p]!;
    const vq = raw[q]!;
    out[j] = vp + ((vq - vp) * (j - p)) / (q - p);
  }

  return out;
}
