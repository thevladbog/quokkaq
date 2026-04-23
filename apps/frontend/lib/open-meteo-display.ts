/**
 * Resolves current temperature and WMO weather code from typical Open-Meteo JSON
 * (current, hourly, or daily blocks).
 * @see https://open-meteo.com/en/docs#weathervariables
 */
export function resolveOpenMeteoSnapshot(raw: Record<string, unknown>): {
  temperatureC: number | null;
  /** WMO Weather interpretation code (0–99). */
  weatherCode: number | null;
} {
  const current = raw.current as
    | { temperature_2m?: number; weather_code?: number }
    | null
    | undefined;
  if (current && typeof current.temperature_2m === 'number') {
    return {
      temperatureC: current.temperature_2m,
      weatherCode:
        typeof current.weather_code === 'number' ? current.weather_code : null
    };
  }

  const hourly = raw.hourly as
    | {
        time?: string[];
        temperature_2m?: (number | null)[];
        weather_code?: (number | null)[];
      }
    | null
    | undefined;
  const hTemps = hourly?.temperature_2m;
  const hTimes = hourly?.time;
  const hCodes = hourly?.weather_code;
  if (hTemps?.length) {
    const tempAt = (i: number) => {
      const v = hTemps[i];
      return typeof v === 'number' && !Number.isNaN(v) ? v : null;
    };
    const codeAt = (i: number) => {
      const c = hCodes?.[i];
      return typeof c === 'number' && !Number.isNaN(c) ? c : null;
    };
    if (hTimes && hTimes.length === hTemps.length) {
      const now = Date.now();
      let bestIdx = 0;
      let bestDiff = Infinity;
      for (let i = 0; i < hTimes.length; i++) {
        const ts = Date.parse(hTimes[i]!);
        if (Number.isNaN(ts)) continue;
        const d = Math.abs(ts - now);
        if (d < bestDiff) {
          bestDiff = d;
          bestIdx = i;
        }
      }
      const t = tempAt(bestIdx);
      if (t != null) {
        return { temperatureC: t, weatherCode: codeAt(bestIdx) };
      }
    }
    for (let i = 0; i < hTemps.length; i++) {
      const t = tempAt(i);
      if (t != null) {
        return { temperatureC: t, weatherCode: codeAt(i) };
      }
    }
  }

  const daily = raw.daily as
    | {
        temperature_2m_max?: (number | null)[];
        weather_code?: (number | null)[];
      }
    | null
    | undefined;
  const m = daily?.temperature_2m_max?.[0];
  const dCode = daily?.weather_code?.[0];
  if (typeof m === 'number' && !Number.isNaN(m)) {
    return {
      temperatureC: m,
      weatherCode:
        typeof dCode === 'number' && !Number.isNaN(dCode) ? dCode : null
    };
  }

  return { temperatureC: null, weatherCode: null };
}
