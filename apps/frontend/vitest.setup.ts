import '@testing-library/jest-dom/vitest';

const otelEnabled = process.env.NEXT_PUBLIC_OTEL_ENABLED;
if (otelEnabled === undefined || otelEnabled.trim() === '') {
  process.env.NEXT_PUBLIC_OTEL_ENABLED = 'false';
}
