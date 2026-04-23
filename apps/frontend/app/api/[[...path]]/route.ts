import { NextRequest, NextResponse } from 'next/server';

// Proxy /api/* to the Go backend. Rewrites in next.config are unreliable with Turbopack dev;
// this route always forwards so /api/platform/* and the rest of the API work consistently.

export const runtime = 'nodejs';

/**
 * Go API base URL for this Next server (browser calls use `/api/...` only).
 * Priority: API_UPSTREAM_URL → NEXT_PUBLIC_API_URL → http://127.0.0.1:3001 (backend default PORT).
 */
function upstreamBase(): string {
  const raw =
    process.env.API_UPSTREAM_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    'http://127.0.0.1:3001';
  return raw.replace(/\/+$/, '');
}

type RouteCtx = { params: Promise<{ path?: string[] }> };

async function proxy(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const { path = [] } = await ctx.params;
  const suffix = path.length ? path.join('/') : '';
  const target = `${upstreamBase()}/${suffix}${req.nextUrl.search}`;

  const headers = new Headers();
  // Intentionally omit x-forwarded-for / x-real-ip: client values can spoof IP when the Go API uses TRUSTED_PROXY_CIDRS.
  for (const name of [
    'authorization',
    'cookie',
    'content-type',
    'accept-language',
    'accept',
    'x-company-id',
    'x-setup-token',
    'x-request-id',
    'traceparent',
    'tracestate'
  ]) {
    const v = req.headers.get(name);
    if (v) headers.set(name, v);
  }

  const init: RequestInit & { duplex?: 'half' } = {
    method: req.method,
    headers,
    redirect: 'manual'
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = req.body;
    init.duplex = 'half';
  }

  const ac = new AbortController();
  const kill = setTimeout(() => ac.abort(), 25_000);
  try {
    return await fetch(target, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(kill);
  }
}

function toNextResponse(res: Response): NextResponse {
  const headers = new Headers(res.headers);
  headers.delete('transfer-encoding');
  return new NextResponse(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers
  });
}

async function handle(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  try {
    const res = await proxy(req, ctx);
    return toNextResponse(res);
  } catch (e) {
    console.error('[api proxy]', upstreamBase(), e);
    return NextResponse.json(
      { error: 'Upstream API unreachable', detail: String(e) },
      { status: 502 }
    );
  }
}

export function GET(req: NextRequest, ctx: RouteCtx) {
  return handle(req, ctx);
}
export function POST(req: NextRequest, ctx: RouteCtx) {
  return handle(req, ctx);
}
export function PUT(req: NextRequest, ctx: RouteCtx) {
  return handle(req, ctx);
}
export function PATCH(req: NextRequest, ctx: RouteCtx) {
  return handle(req, ctx);
}
export function DELETE(req: NextRequest, ctx: RouteCtx) {
  return handle(req, ctx);
}
export function OPTIONS(req: NextRequest, ctx: RouteCtx) {
  return handle(req, ctx);
}
