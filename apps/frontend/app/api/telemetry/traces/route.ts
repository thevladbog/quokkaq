import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * OTLP HTTP traces ingest (browser → Next → collector).
 * Browser POSTs JSON OTLP to same origin; this route forwards to the internal collector.
 *
 * Upstream URL: `OTEL_BROWSER_INGEST_UPSTREAM` (full `/v1/traces` URL) or
 * `OTEL_EXPORTER_OTLP_ENDPOINT` base (e.g. http://localhost:4318) + `/v1/traces`.
 */
function resolveUpstreamTracesUrl(): string | null {
  const explicit = process.env.OTEL_BROWSER_INGEST_UPSTREAM?.trim();
  if (explicit) {
    return explicit.replace(/\/+$/, '');
  }
  const base = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  if (!base) {
    return null;
  }
  const u = base.replace(/\/+$/, '');
  if (u.endsWith('/v1/traces')) {
    return u;
  }
  return `${u}/v1/traces`;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.OTEL_BROWSER_INGEST_SECRET?.trim();
  if (secret) {
    const sent = req.headers.get('x-otel-ingest-key') ?? '';
    if (sent !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const upstream = resolveUpstreamTracesUrl();
  if (!upstream) {
    return NextResponse.json(
      {
        error:
          'Telemetry ingest is not configured (set OTEL_BROWSER_INGEST_UPSTREAM or OTEL_EXPORTER_OTLP_ENDPOINT on the Next server)'
      },
      { status: 503 }
    );
  }

  const contentType = req.headers.get('content-type') ?? 'application/json';

  const ac = new AbortController();
  const kill = setTimeout(() => ac.abort(), 25_000);
  try {
    const res = await fetch(upstream, {
      method: 'POST',
      headers: {
        'Content-Type': contentType
      },
      body: req.body,
      signal: ac.signal
    });

    const outHeaders = new Headers(res.headers);
    outHeaders.delete('transfer-encoding');

    return new NextResponse(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: outHeaders
    });
  } catch (e) {
    console.error('[telemetry/traces] upstream fetch failed', upstream, e);
    return NextResponse.json(
      { error: 'Upstream OTLP unreachable', detail: String(e) },
      { status: 502 }
    );
  } finally {
    clearTimeout(kill);
  }
}
