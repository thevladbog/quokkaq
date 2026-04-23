'use client';

import { cn } from '@/lib/utils';
import type { LucideProps } from 'lucide-react';
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudHail,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Sun
} from 'lucide-react';

/**
 * WMO Weather interpretation codes (Open-Meteo).
 * @see https://open-meteo.com/en/docs#weathervariables
 */
export function WmoWeatherIcon({
  code,
  className,
  ...rest
}: { code: number | null } & LucideProps) {
  const c = code;
  const p = {
    className,
    strokeWidth: 1.5,
    'aria-hidden': true,
    ...rest
  } as const;

  if (c == null) {
    return <Cloud {...p} />;
  }

  if (c === 0) {
    return <Sun {...p} className={cn('text-amber-500', className)} />;
  }
  if (c === 1) {
    return <CloudSun {...p} className={cn('text-amber-500/90', className)} />;
  }
  if (c === 2) {
    return <CloudSun {...p} className={cn('text-slate-500', className)} />;
  }
  if (c === 3) {
    return <Cloud {...p} className={cn('text-slate-500', className)} />;
  }
  if (c === 45 || c === 48) {
    return <CloudFog {...p} className={cn('text-slate-400', className)} />;
  }
  if (c >= 51 && c <= 55) {
    return <CloudDrizzle {...p} className={cn('text-slate-500', className)} />;
  }
  if (c === 56 || c === 57) {
    return <CloudDrizzle {...p} className={cn('text-sky-600', className)} />;
  }
  if (c >= 61 && c <= 65) {
    return <CloudRain {...p} className={cn('text-sky-600', className)} />;
  }
  if (c === 66 || c === 67) {
    return <CloudHail {...p} className={cn('text-slate-500', className)} />;
  }
  if (c >= 71 && c <= 77) {
    return <CloudSnow {...p} className={cn('text-sky-400', className)} />;
  }
  if (c >= 80 && c <= 82) {
    return <CloudRain {...p} className={cn('text-sky-600', className)} />;
  }
  if (c === 85 || c === 86) {
    return <CloudSnow {...p} className={cn('text-sky-500', className)} />;
  }
  if (c >= 95 && c <= 99) {
    return (
      <CloudLightning {...p} className={cn('text-amber-600', className)} />
    );
  }
  return <Cloud {...p} className={cn('text-slate-500', className)} />;
}
