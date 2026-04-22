'use client';

import { useEffect, useState } from 'react';
import { unitsApi } from '@/lib/api';
import { logger } from '@/lib/logger';

/**
 * Renders Open-Meteo style JSON: { current: { temperature_2m, weather_code } } or custom cached shape.
 */
export function ScreenWeatherWidget({
  unitId,
  feedId
}: {
  unitId: string;
  feedId: string;
}) {
  const [label, setLabel] = useState<string>('—');
  useEffect(() => {
    if (!feedId) return;
    const load = async () => {
      try {
        const raw = (await unitsApi.getPublicFeedData(
          unitId,
          feedId
        )) as Record<string, unknown> | null;
        if (!raw) return;
        const cur = raw.current as
          | { temperature_2m?: number; weather_code?: number }
          | undefined;
        if (cur?.temperature_2m != null) {
          setLabel(`${Math.round(cur.temperature_2m)}°C`);
        } else {
          setLabel(JSON.stringify(raw).slice(0, 80));
        }
      } catch (e) {
        logger.error('weather widget', e);
      }
    };
    void load();
    const iv = setInterval(load, 300_000);
    return () => clearInterval(iv);
  }, [unitId, feedId]);
  return <div className='text-4xl font-semibold tabular-nums'>{label}</div>;
}
