import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const MAX_LOGO_FETCH_REDIRECTS = 5;

/** Logo objects are stored under these key prefixes (see backend upload + storage). */
function isSafeLogoPath(pathname: string): boolean {
  const p = pathname.toLowerCase();
  return p.includes('/public/logos/') || p.includes('/public/printer-logos/');
}

/**
 * Returns a base URL built only from trusted configuration whose origin equals `parsed.origin`.
 * Origins come from env (full URL → origin) and PRINT_ASSET_ALLOWED_HOSTS — no implicit loopback
 * unless the same host appears in those settings.
 */
function resolveTrustedBaseForParsed(parsed: URL): URL | null {
  if (parsed.username || parsed.password) {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }
  if (!isSafeLogoPath(parsed.pathname)) {
    return null;
  }

  for (const raw of [
    process.env.NEXT_PUBLIC_API_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.AWS_PUBLIC_ENDPOINT
  ]) {
    const t = raw?.trim();
    if (!t) continue;
    try {
      const base = new URL(t);
      if (base.origin === parsed.origin) {
        return base;
      }
    } catch {
      /* ignore invalid env URL */
    }
  }

  const extraHosts =
    process.env.PRINT_ASSET_ALLOWED_HOSTS?.split(/[,;\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean) ?? [];
  for (const h of extraHosts) {
    for (const scheme of ['https:', 'http:'] as const) {
      try {
        const base = new URL(`${scheme}//${h}`);
        if (base.origin === parsed.origin) {
          return base;
        }
      } catch {
        /* ignore */
      }
    }
  }

  return null;
}

/**
 * Build href for the upstream request: trusted origin from env-based `URL` only, then append
 * path + query from the parsed URL (CodeQL-friendly concatenation).
 */
function buildServerSafeLogoFetchHref(parsed: URL): string | null {
  const base = resolveTrustedBaseForParsed(parsed);
  if (!base) {
    return null;
  }
  const pathAndQuery = `${parsed.pathname}${parsed.search}`;
  const href = base.origin + pathAndQuery;
  try {
    const verify = new URL(href);
    if (verify.origin !== base.origin) {
      return null;
    }
    if (!isSafeLogoPath(verify.pathname)) {
      return null;
    }
  } catch {
    return null;
  }
  return href;
}

async function fetchUpstreamLogo(
  initialParsed: URL,
  signal: AbortSignal
): Promise<{ contentType: string; buf: ArrayBuffer }> {
  let currentHref = buildServerSafeLogoFetchHref(initialParsed);
  if (!currentHref) {
    throw new Error('forbidden');
  }
  const headers = { Accept: 'image/*,*/*' };

  for (let hop = 0; hop <= MAX_LOGO_FETCH_REDIRECTS; hop++) {
    const res = await fetch(currentHref, {
      signal,
      redirect: 'manual',
      headers
    });

    if (res.status >= 200 && res.status < 300) {
      const contentType =
        res.headers.get('content-type') || 'application/octet-stream';
      const buf = await res.arrayBuffer();
      return { contentType, buf };
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) {
        throw new Error('redirect_no_location');
      }
      const nextParsed = new URL(loc, currentHref);
      const nextHref = buildServerSafeLogoFetchHref(nextParsed);
      if (!nextHref) {
        throw new Error('redirect_target_forbidden');
      }
      currentHref = nextHref;
      continue;
    }

    throw new Error(`upstream_${res.status}`);
  }

  throw new Error('too_many_redirects');
}

/**
 * Server-side fetch of kiosk logo for ESC/POS raster: browser `fetch(logoUrl)` often fails on MinIO/S3
 * (no CORS). The kiosk page calls this same-origin endpoint instead.
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('url');
  if (!raw?.trim()) {
    return NextResponse.json({ error: 'missing url' }, { status: 400 });
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return NextResponse.json({ error: 'invalid url' }, { status: 400 });
  }

  if (!buildServerSafeLogoFetchHref(parsed)) {
    return NextResponse.json({ error: 'host not allowed' }, { status: 403 });
  }

  const ac = new AbortController();
  const kill = setTimeout(() => ac.abort(), 20_000);
  try {
    const { contentType, buf } = await fetchUpstreamLogo(parsed, ac.signal);
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=300'
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'forbidden' || msg === 'redirect_target_forbidden') {
      return NextResponse.json({ error: 'host not allowed' }, { status: 403 });
    }
    if (
      msg === 'redirect_no_location' ||
      msg === 'too_many_redirects' ||
      msg.startsWith('upstream_')
    ) {
      return NextResponse.json({ error: msg }, { status: 502 });
    }
    return NextResponse.json({ error: msg }, { status: 502 });
  } finally {
    clearTimeout(kill);
  }
}
