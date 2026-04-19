import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  resolveUpstreamTracesUrl,
  validateOtlpTracePayload
} from './otlp-traces-proxy';

describe('validateOtlpTracePayload', () => {
  it('accepts empty object', () => {
    expect(validateOtlpTracePayload({})).toBe(true);
  });

  it('accepts object with resourceSpans array', () => {
    expect(validateOtlpTracePayload({ resourceSpans: [] })).toBe(true);
  });

  it('rejects null', () => {
    expect(validateOtlpTracePayload(null)).toBe(false);
  });

  it('rejects arrays', () => {
    expect(validateOtlpTracePayload([])).toBe(false);
  });

  it('rejects resourceSpans when not an array', () => {
    expect(validateOtlpTracePayload({ resourceSpans: {} })).toBe(false);
  });
});

describe('resolveUpstreamTracesUrl', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns null when neither env is set', () => {
    vi.stubEnv('OTEL_BROWSER_INGEST_UPSTREAM', '');
    vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', '');
    expect(resolveUpstreamTracesUrl(process.env)).toBeNull();
  });

  it('prefers OTEL_BROWSER_INGEST_UPSTREAM and strips trailing slashes', () => {
    vi.stubEnv(
      'OTEL_BROWSER_INGEST_UPSTREAM',
      'http://collector:4318/v1/traces///'
    );
    vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://ignored:4318');
    expect(resolveUpstreamTracesUrl(process.env)).toBe(
      'http://collector:4318/v1/traces'
    );
  });

  it('appends /v1/traces to OTEL_EXPORTER_OTLP_ENDPOINT when base has no path', () => {
    vi.stubEnv('OTEL_BROWSER_INGEST_UPSTREAM', '');
    vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://localhost:4318');
    expect(resolveUpstreamTracesUrl(process.env)).toBe(
      'http://localhost:4318/v1/traces'
    );
  });

  it('does not duplicate path when base already ends with /v1/traces', () => {
    vi.stubEnv('OTEL_BROWSER_INGEST_UPSTREAM', '');
    vi.stubEnv(
      'OTEL_EXPORTER_OTLP_ENDPOINT',
      'http://localhost:4318/v1/traces'
    );
    expect(resolveUpstreamTracesUrl(process.env)).toBe(
      'http://localhost:4318/v1/traces'
    );
  });
});
