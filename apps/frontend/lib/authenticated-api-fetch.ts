/**
 * Browser-oriented fetch to the Next `/api` proxy. Session uses HttpOnly cookies (same-origin);
 * optional `Authorization: Bearer` from caller headers for non-browser clients (kiosk, scripts).
 * Legacy: on 401, POST /auth/refresh tries the session cookie first, then Bearer refresh from
 * localStorage. We do not send a stale `access_token` from localStorage on every request; that
 * could override an active cookie session. Bearer access is attached only after a legacy refresh
 * succeeded (see {@link tryRefreshSessionOnce}).
 */
import { logger } from './logger';
import { isOtelBrowserRumEnabled } from './otel-env';

export const API_BASE_URL = '/api';

function isAuthRefreshPath(endpoint: string): boolean {
  const e = endpoint.split('?')[0] ?? '';
  return e === '/auth/refresh' || e.endsWith('/auth/refresh');
}

/** Persisted active tenant (company) for X-Company-Id; must match ActiveCompanyContext. */
export const ACTIVE_COMPANY_ID_STORAGE_KEY = 'quokkaq_active_company_id';

/** Dispatched when the stored active company id changes (including logout cleanup). */
export const ACTIVE_COMPANY_CHANGED_EVENT = 'quokkaq:active-company-changed';

function activeCompanyIdHeader(): Record<string, string> {
  if (typeof window === 'undefined') {
    return {};
  }
  const id = localStorage.getItem(ACTIVE_COMPANY_ID_STORAGE_KEY)?.trim();
  if (!id) {
    return {};
  }
  return { 'X-Company-Id': id };
}

export function isRequestAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }
  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return true;
    }
    const msg = error.message.toLowerCase();
    if (
      msg.includes('signal is aborted') ||
      msg.includes('the operation was aborted') ||
      msg.includes('user aborted')
    ) {
      return true;
    }
  }
  return false;
}

function hasContentTypeHeader(callerHeaders: HeadersInit | undefined): boolean {
  if (!callerHeaders) return false;
  if (callerHeaders instanceof Headers) {
    return callerHeaders.has('content-type');
  }
  if (Array.isArray(callerHeaders)) {
    return callerHeaders.some(
      (pair) => pair.length >= 2 && pair[0].toLowerCase() === 'content-type'
    );
  }
  if (typeof callerHeaders === 'object') {
    return Object.keys(callerHeaders).some(
      (k) => k.toLowerCase() === 'content-type'
    );
  }
  return false;
}

function isMultipartBody(body: unknown): boolean {
  if (body == null) return false;
  return (
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    body instanceof Blob ||
    body instanceof ArrayBuffer ||
    (typeof SharedArrayBuffer !== 'undefined' &&
      body instanceof SharedArrayBuffer) ||
    ArrayBuffer.isView(body)
  );
}

/**
 * Merges injected headers with caller headers using the Fetch Headers API (names are case-insensitive).
 * Injected `authHeaders` are applied first; caller values win on conflicts (same as prior object-spread behavior).
 */
function mergeRequestInitHeaders(
  callerHeaders: HeadersInit | undefined,
  authHeaders: Record<string, string>
): Record<string, string> {
  const h = new Headers();
  for (const [name, value] of Object.entries(authHeaders)) {
    h.set(name, value);
  }
  if (callerHeaders !== undefined && callerHeaders !== null) {
    if (callerHeaders instanceof Headers) {
      callerHeaders.forEach((value, key) => {
        h.set(key, value);
      });
    } else if (Array.isArray(callerHeaders)) {
      for (const pair of callerHeaders) {
        if (pair.length >= 2) {
          h.set(String(pair[0]), String(pair[1]));
        }
      }
    } else if (typeof callerHeaders === 'object') {
      for (const [k, v] of Object.entries(
        callerHeaders as Record<string, string>
      )) {
        h.set(k, String(v));
      }
    }
  }
  const out: Record<string, string> = {};
  h.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function getRequestIdFromCallerHeaders(
  callerHeaders: HeadersInit | undefined
): string | undefined {
  if (callerHeaders == null) {
    return undefined;
  }
  if (callerHeaders instanceof Headers) {
    return (
      callerHeaders.get('X-Request-Id') ??
      callerHeaders.get('x-request-id') ??
      undefined
    );
  }
  if (Array.isArray(callerHeaders)) {
    for (const pair of callerHeaders) {
      if (pair.length >= 2 && pair[0].toLowerCase() === 'x-request-id') {
        return String(pair[1]);
      }
    }
    return undefined;
  }
  for (const k of Object.keys(callerHeaders as Record<string, string>)) {
    if (k.toLowerCase() === 'x-request-id') {
      return String((callerHeaders as Record<string, string>)[k]);
    }
  }
  return undefined;
}

function newRequestId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  const cr = globalThis.crypto;
  if (cr && typeof cr.getRandomValues === 'function') {
    cr.getRandomValues(bytes);
  } else {
    for (let i = 0; i < byteLength; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** W3C Trace Context traceparent (version 00, sampled). */
function newTraceParentValue(): string {
  const traceId = randomHex(16);
  const spanId = randomHex(8);
  return `00-${traceId}-${spanId}-01`;
}

function getTraceParentFromCallerHeaders(
  callerHeaders: HeadersInit | undefined
): string | undefined {
  return getHeaderValueInsensitive(callerHeaders, 'traceparent');
}

function getTraceStateFromCallerHeaders(
  callerHeaders: HeadersInit | undefined
): string | undefined {
  return getHeaderValueInsensitive(callerHeaders, 'tracestate');
}

function getHeaderValueInsensitive(
  callerHeaders: HeadersInit | undefined,
  nameLower: string
): string | undefined {
  if (callerHeaders == null) {
    return undefined;
  }
  if (callerHeaders instanceof Headers) {
    return callerHeaders.get(nameLower) ?? undefined;
  }
  if (Array.isArray(callerHeaders)) {
    for (const pair of callerHeaders) {
      if (
        pair.length >= 2 &&
        pair[0].toLowerCase() === nameLower.toLowerCase()
      ) {
        return String(pair[1]);
      }
    }
    return undefined;
  }
  for (const k of Object.keys(callerHeaders as Record<string, string>)) {
    if (k.toLowerCase() === nameLower.toLowerCase()) {
      return String((callerHeaders as Record<string, string>)[k]);
    }
  }
  return undefined;
}

function getOrCreateTraceParent(
  callerHeaders: HeadersInit | undefined
): string {
  return (
    getTraceParentFromCallerHeaders(callerHeaders) ?? newTraceParentValue()
  );
}

/** When OTel fetch instrumentation is on, it injects W3C headers; avoid duplicates. SSR keeps manual trace. */
function shouldAttachManualTraceContext(): boolean {
  if (typeof window === 'undefined') {
    return true;
  }
  return !isOtelBrowserRumEnabled();
}

/** Reuses caller-provided X-Request-Id or generates one (for backend log correlation). */
export function getOrCreateRequestId(
  callerHeaders: HeadersInit | undefined
): string {
  return getRequestIdFromCallerHeaders(callerHeaders) ?? newRequestId();
}

/** Adds X-Request-Id, W3C traceparent/tracestate to RequestInit; caller headers win. */
export function fetchInitWithRequestId(init?: RequestInit): RequestInit {
  const safe = init ?? {};
  const requestId = getOrCreateRequestId(safe.headers);
  const extra: Record<string, string> = {
    'X-Request-Id': requestId
  };
  if (shouldAttachManualTraceContext()) {
    const traceParent = getOrCreateTraceParent(safe.headers);
    const traceState = getTraceStateFromCallerHeaders(safe.headers);
    extra.traceparent = traceParent;
    if (traceState !== undefined && traceState !== '') {
      extra.tracestate = traceState;
    }
  }
  return {
    ...safe,
    headers: mergeRequestInitHeaders(safe.headers, extra)
  };
}

function headersInitWithoutAuthorization(
  callerHeaders: HeadersInit | undefined
): HeadersInit | undefined {
  if (callerHeaders === undefined) {
    return undefined;
  }
  if (callerHeaders instanceof Headers) {
    const h = new Headers();
    callerHeaders.forEach((value, key) => {
      if (key.toLowerCase() !== 'authorization') {
        h.set(key, value);
      }
    });
    return h;
  }
  if (Array.isArray(callerHeaders)) {
    return callerHeaders.filter(
      (pair) => pair.length >= 2 && pair[0].toLowerCase() !== 'authorization'
    );
  }
  const o = { ...(callerHeaders as Record<string, string>) };
  for (const k of Object.keys(o)) {
    if (k.toLowerCase() === 'authorization') {
      delete o[k];
    }
  }
  return o;
}

/** Legacy Bearer access token from localStorage (migration). Not used when session is cookie-only. */
function legacyAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('access_token');
}

function legacyRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('refresh_token');
}

async function postRefreshCookie(): Promise<Response> {
  return fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' }
  });
}

async function postRefreshBearer(refreshToken: string): Promise<Response> {
  return fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${refreshToken}`
    }
  });
}

/** If the refresh response includes rotated bearer tokens, persist them for legacy clients. */
async function persistRotatedTokensFromRefreshResponse(
  res: Response
): Promise<void> {
  if (typeof window === 'undefined' || res.status !== 200) {
    return;
  }
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) {
    return;
  }
  const clone = res.clone();
  try {
    const data: unknown = await clone.json();
    if (!data || typeof data !== 'object') {
      return;
    }
    const rec = data as Record<string, unknown>;
    const at =
      (typeof rec.accessToken === 'string' && rec.accessToken) ||
      (typeof rec.access_token === 'string' && rec.access_token) ||
      (typeof rec.token === 'string' && rec.token);
    const rt =
      (typeof rec.refreshToken === 'string' && rec.refreshToken) ||
      (typeof rec.refresh_token === 'string' && rec.refresh_token);
    if (typeof at === 'string' && at.trim() !== '') {
      localStorage.setItem('access_token', at);
    }
    if (typeof rt === 'string' && rt.trim() !== '') {
      localStorage.setItem('refresh_token', rt);
    }
  } catch {
    // Ignore malformed refresh JSON; cookies may still carry the session.
  }
}

type RefreshSessionResult = {
  ok: boolean;
  /** True when rotation used `Authorization: Bearer <refresh>` (cookie refresh did not succeed). */
  usedBearerRefresh: boolean;
};

let refreshSessionInFlight: Promise<RefreshSessionResult> | null = null;

/**
 * Single-flight refresh: concurrent 401s await the same refresh attempt.
 * `ok` when a refresh returned HTTP 200. `usedBearerRefresh` means the session was renewed via
 * legacy Bearer refresh — callers may attach `access_token` from localStorage on the retry.
 */
async function tryRefreshSessionOnce(): Promise<RefreshSessionResult> {
  if (refreshSessionInFlight) {
    return refreshSessionInFlight;
  }
  const run = async (): Promise<RefreshSessionResult> => {
    try {
      let refreshRes = await postRefreshCookie();
      await persistRotatedTokensFromRefreshResponse(refreshRes);
      if (refreshRes.status === 200) {
        return { ok: true, usedBearerRefresh: false };
      }
      const rt = legacyRefreshToken();
      if (!rt) {
        return { ok: false, usedBearerRefresh: false };
      }
      refreshRes = await postRefreshBearer(rt);
      await persistRotatedTokensFromRefreshResponse(refreshRes);
      if (refreshRes.status === 200) {
        return { ok: true, usedBearerRefresh: true };
      }
      return { ok: false, usedBearerRefresh: false };
    } finally {
      refreshSessionInFlight = null;
    }
  };
  refreshSessionInFlight = run();
  return refreshSessionInFlight;
}

function clearClientAuthSession(): void {
  if (typeof window === 'undefined') {
    return;
  }
  void fetch(`${API_BASE_URL}/auth/logout`, {
    method: 'POST',
    credentials: 'include'
  }).catch(() => {});
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem(ACTIVE_COMPANY_ID_STORAGE_KEY);
  try {
    window.dispatchEvent(new CustomEvent(ACTIVE_COMPANY_CHANGED_EVENT));
  } catch (e) {
    logger.error('Failed to dispatch active company change event', e);
  }
  try {
    window.dispatchEvent(new CustomEvent('auth:logout'));
  } catch (e) {
    logger.error('Failed to dispatch auth:logout event', e);
  }
}

/**
 * Authenticated fetch to the Next.js API proxy (`/api/...`). Uses cookies (`credentials: 'include'`).
 * On 401, tries POST /auth/refresh (cookie first, then legacy Bearer refresh), then retries once.
 */
export async function authenticatedApiFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  let currentLocale: string | null = null;

  if (typeof window !== 'undefined') {
    const lsLocale = localStorage.getItem('NEXT_LOCALE');
    const navLocale = window.navigator?.language?.split('-')[0] || 'en';
    const inferredLocale = lsLocale || navLocale;
    currentLocale = ['en', 'ru'].includes(inferredLocale)
      ? inferredLocale
      : 'en';
  }

  const url = `${API_BASE_URL}${endpoint}`;
  const { headers: callerHeaders, body, ...restOptions } = options;

  const requestId = getOrCreateRequestId(callerHeaders);
  const traceParent = getOrCreateTraceParent(callerHeaders);
  const traceState = getTraceStateFromCallerHeaders(callerHeaders);

  const shouldSetContentType =
    !hasContentTypeHeader(callerHeaders) && !isMultipartBody(body);

  const authHeaders: Record<string, string> = {
    ...(shouldSetContentType && { 'Content-Type': 'application/json' }),
    ...(currentLocale && { 'Accept-Language': currentLocale }),
    ...activeCompanyIdHeader(),
    'X-Request-Id': requestId,
    ...(shouldAttachManualTraceContext()
      ? {
          traceparent: traceParent,
          ...(traceState !== undefined && traceState !== ''
            ? { tracestate: traceState }
            : {})
        }
      : {})
  };

  const config: RequestInit = {
    ...restOptions,
    credentials: 'include',
    ...(body !== undefined && { body }),
    headers: mergeRequestInitHeaders(callerHeaders, authHeaders)
  };

  try {
    let response = await fetch(url, config);

    if (
      response.status === 401 &&
      typeof window !== 'undefined' &&
      !isAuthRefreshPath(endpoint)
    ) {
      try {
        const refreshed = await tryRefreshSessionOnce();

        if (refreshed.ok) {
          const retryShouldSetContentType =
            !hasContentTypeHeader(
              headersInitWithoutAuthorization(callerHeaders)
            ) && !isMultipartBody(body);

          const newLegacy = legacyAccessToken();
          const retryAuthHeaders: Record<string, string> = {
            ...(retryShouldSetContentType && {
              'Content-Type': 'application/json'
            }),
            ...(refreshed.usedBearerRefresh &&
              newLegacy && {
                Authorization: `Bearer ${newLegacy}`
              }),
            ...(currentLocale && { 'Accept-Language': currentLocale }),
            ...activeCompanyIdHeader(),
            'X-Request-Id': requestId,
            ...(shouldAttachManualTraceContext()
              ? {
                  traceparent: traceParent,
                  ...(traceState !== undefined && traceState !== ''
                    ? { tracestate: traceState }
                    : {})
                }
              : {})
          };

          const retryConfig: RequestInit = {
            ...restOptions,
            credentials: 'include',
            ...(body !== undefined && { body }),
            headers: mergeRequestInitHeaders(
              headersInitWithoutAuthorization(callerHeaders),
              retryAuthHeaders
            )
          };

          response = await fetch(url, retryConfig);
        }
      } catch (refreshError) {
        if (!isRequestAbortError(refreshError)) {
          logger.error('Token refresh failed:', refreshError);
        }
      }

      if (response.status === 401) {
        clearClientAuthSession();
        return response;
      }
    }

    return response;
  } catch (error) {
    if (!isRequestAbortError(error)) {
      logger.error(`API request failed for ${url}:`, error);
    }
    throw error;
  }
}
