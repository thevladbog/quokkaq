import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

describe('POST /api/telemetry/traces', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.unstubAllEnvs();
    process.env.OTEL_BROWSER_INGEST_SECRET = 'test-secret';
    process.env.OTEL_BROWSER_INGEST_TRUST_FORWARDED_HEADERS = 'true';
    process.env.OTEL_BROWSER_INGEST_RATE_WINDOW_MS = '60000';
    process.env.OTEL_BROWSER_INGEST_RATE_LIMIT_IP = '100000';
    process.env.OTEL_BROWSER_INGEST_RATE_LIMIT_KEY = '100000';
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function makeRequest(
    body: BodyInit | null | undefined,
    opts?: { forwardedFor?: string; contentType?: string }
  ) {
    const forwardedFor = opts?.forwardedFor ?? '198.51.100.1';
    return new NextRequest('http://localhost/api/telemetry/traces', {
      method: 'POST',
      body: body ?? null,
      headers: {
        'x-forwarded-for': forwardedFor,
        'x-otel-ingest-key': 'test-secret',
        'content-type': opts?.contentType ?? 'application/json'
      }
    });
  }

  it('returns 400 when body is empty', async () => {
    vi.stubEnv('OTEL_BROWSER_INGEST_UPSTREAM', 'http://collector/v1/traces');
    const res = await POST(makeRequest(new Uint8Array(0)));
    expect(res.status).toBe(400);
    const j = (await res.json()) as { detail?: string };
    expect(j.detail).toMatch(/Empty body/);
  });

  it('returns 400 when JSON is invalid', async () => {
    vi.stubEnv('OTEL_BROWSER_INGEST_UPSTREAM', 'http://collector/v1/traces');
    const res = await POST(makeRequest('not-json'));
    expect(res.status).toBe(400);
    const j = (await res.json()) as { detail?: string };
    expect(j.detail).toMatch(/Invalid JSON/);
  });

  it('returns 400 when payload is not a valid OTLP traces object', async () => {
    vi.stubEnv('OTEL_BROWSER_INGEST_UPSTREAM', 'http://collector/v1/traces');
    const res = await POST(makeRequest('[]'));
    expect(res.status).toBe(400);
  });

  it('returns 503 when upstream is not configured', async () => {
    vi.stubEnv('OTEL_BROWSER_INGEST_UPSTREAM', '');
    vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', '');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(503);
  });

  it('proxies valid JSON to upstream and returns upstream response', async () => {
    vi.stubEnv(
      'OTEL_BROWSER_INGEST_UPSTREAM',
      'http://collector.test/v1/traces'
    );
    fetchMock.mockResolvedValue(
      new Response('upstream-ok', {
        status: 200,
        statusText: 'OK',
        headers: { 'x-test': 'from-upstream' }
      })
    );

    const res = await POST(makeRequest('{"resourceSpans":[]}'));
    expect(res.status).toBe(200);
    expect(res.headers.get('x-test')).toBe('from-upstream');
    expect(await res.text()).toBe('upstream-ok');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(call[0]).toBe('http://collector.test/v1/traces');
  });
});
