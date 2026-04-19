'use client';

import { useEffect } from 'react';

/**
 * Loads browser OpenTelemetry RUM once when `NEXT_PUBLIC_OTEL_ENABLED=true`.
 * Dynamic import keeps the OTel bundle off the critical path when disabled.
 */
export function OtelBrowserInit() {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_OTEL_ENABLED !== 'true') {
      return;
    }
    void import('@/lib/otel-browser').then((m) => {
      m.initOtelBrowser();
    });
  }, []);

  return null;
}
