import { NextRequest, NextResponse } from 'next/server';

import {
  resolveUpstreamTracesUrl,
  validateOtlpTracePayload
} from '@/lib/telemetry/otlp-traces-proxy';

export const runtime = 'nodejs';

/** Not authentication — browser-exposed routing key only (see .env.example). */
const INGEST_KEY_HEADER = 'x-otel-ingest-key';

const DEFAULT_MAX_BODY_BYTES = 512 * 1024;
const DEFAULT_RATE_WINDOW_MS = 60_000;
const DEFAULT_MAX_PER_IP_PER_WINDOW = 120;
const DEFAULT_MAX_PER_KEY_PER_WINDOW = 240;

type RateBucket = { count: number; windowStart: number };

const rateBuckets = new Map<string, RateBucket>();

function envPositiveInt(name: string, fallback: number): number {
  const v = process.env[name]?.trim();
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function checkRateLimit(
  mapKey: string,
  maxPerWindow: number,
  windowMs: number
): boolean {
  const now = Date.now();
  let b = rateBuckets.get(mapKey);
  if (!b || now - b.windowStart >= windowMs) {
    b = { count: 1, windowStart: now };
    rateBuckets.set(mapKey, b);
    if (rateBuckets.size > 50_000) {
      for (const [k, v] of rateBuckets) {
        if (now - v.windowStart >= windowMs * 2) rateBuckets.delete(k);
      }
    }
    return true;
  }
  if (b.count >= maxPerWindow) return false;
  b.count += 1;
  return true;
}

/** Only use spoofable forwarded headers when explicitly enabled (trusted reverse proxy). */
function clientIp(req: NextRequest): string {
  const trust = process.env.OTEL_BROWSER_INGEST_TRUST_FORWARDED_HEADERS;
  if (trust !== 'true' && trust !== '1') {
    return 'unknown';
  }
  const xf = req.headers.get('x-forwarded-for');
  if (xf) {
    const first = xf.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const windowMs = envPositiveInt(
    'OTEL_BROWSER_INGEST_RATE_WINDOW_MS',
    DEFAULT_RATE_WINDOW_MS
  );
  const maxPerIp = envPositiveInt(
    'OTEL_BROWSER_INGEST_RATE_LIMIT_IP',
    DEFAULT_MAX_PER_IP_PER_WINDOW
  );
  const maxPerKey = envPositiveInt(
    'OTEL_BROWSER_INGEST_RATE_LIMIT_KEY',
    DEFAULT_MAX_PER_KEY_PER_WINDOW
  );

  const ip = clientIp(req);
  if (!checkRateLimit(`ip:${ip}`, maxPerIp, windowMs)) {
    return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
  }

  const routingSecret = process.env.OTEL_BROWSER_INGEST_SECRET?.trim();
  const sentKey = req.headers.get(INGEST_KEY_HEADER) ?? '';

  if (routingSecret) {
    if (sentKey !== routingSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (
      !checkRateLimit(`key:${hashRoutingKey(sentKey)}`, maxPerKey, windowMs)
    ) {
      return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
    }
  }

  const maxBody = envPositiveInt(
    'OTEL_BROWSER_INGEST_MAX_BODY_BYTES',
    DEFAULT_MAX_BODY_BYTES
  );
  const cl = req.headers.get('content-length');
  if (cl) {
    const n = Number.parseInt(cl, 10);
    if (Number.isFinite(n) && n > maxBody) {
      return NextResponse.json({ error: 'Payload Too Large' }, { status: 413 });
    }
  }

  let raw: ArrayBuffer;
  try {
    raw = await req.arrayBuffer();
  } catch {
    return NextResponse.json({ error: 'Bad Request' }, { status: 400 });
  }
  if (raw.byteLength > maxBody) {
    return NextResponse.json({ error: 'Payload Too Large' }, { status: 413 });
  }
  if (raw.byteLength === 0) {
    return NextResponse.json(
      { error: 'Bad Request', detail: 'Empty body' },
      { status: 400 }
    );
  }

  let parsed: unknown;
  try {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(raw);
    parsed = JSON.parse(text) as unknown;
  } catch {
    return NextResponse.json(
      { error: 'Bad Request', detail: 'Invalid JSON' },
      { status: 400 }
    );
  }

  if (!validateOtlpTracePayload(parsed)) {
    return NextResponse.json(
      {
        error: 'Bad Request',
        detail:
          'Invalid OTLP traces JSON (expected object with optional resourceSpans array)'
      },
      { status: 400 }
    );
  }

  const upstream = resolveUpstreamTracesUrl(process.env);
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
    const init: RequestInit & { duplex?: 'half' } = {
      method: 'POST',
      headers: {
        'Content-Type': contentType
      },
      body: Buffer.from(raw),
      duplex: 'half',
      signal: ac.signal
    };
    const res = await fetch(upstream, init);

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
      { error: 'Upstream OTLP unreachable; see server logs' },
      { status: 502 }
    );
  } finally {
    clearTimeout(kill);
  }
}

/** Short stable id for rate-limit bucketing without storing the raw key in the map key string. */
function hashRoutingKey(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (Math.imul(31, h) + key.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16);
}
