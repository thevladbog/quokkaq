/**
 * Browser-oriented fetch (localStorage, window, refresh). Safe from Client Components
 * and other client-only code; do not call authenticated flows from React Server Components.
 * This file intentionally does not use the Next.js `"use client"` directive so `@/lib/api`
 * can stay importable from the server for types and non-browser paths.
 */
import { logger } from './logger';

export const API_BASE_URL = '/api';

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

/**
 * Defaults first, then caller headers on top — so explicit `Authorization` (refresh/me)
 * wins over the access token from localStorage, while `Content-Type` from callers no longer
 * wipes auth (the old `...options` after `headers` bug).
 */
function mergeRequestInitHeaders(
  callerHeaders: HeadersInit | undefined,
  authHeaders: Record<string, string>
): Record<string, string> {
  const fromCaller: Record<string, string> = {};
  if (callerHeaders instanceof Headers) {
    callerHeaders.forEach((value, key) => {
      fromCaller[key] = value;
    });
  } else if (Array.isArray(callerHeaders)) {
    for (const pair of callerHeaders) {
      if (pair.length >= 2) fromCaller[pair[0]] = String(pair[1]);
    }
  } else if (callerHeaders && typeof callerHeaders === 'object') {
    Object.assign(fromCaller, callerHeaders as Record<string, string>);
  }
  return { ...authHeaders, ...fromCaller };
}

/** Caller headers without Authorization so retry merges keep the refreshed Bearer token. */
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

function clearClientAuthSession(): void {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  try {
    window.dispatchEvent(new CustomEvent('auth:logout'));
  } catch (e) {
    logger.error('Failed to dispatch auth:logout event', e);
  }
}

/**
 * Authenticated fetch to the Next.js API proxy (`/api/...`). Performs JWT refresh on 401 once (client only).
 */
export async function authenticatedApiFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  let token = null;
  let refreshToken = null;
  let currentLocale = null;

  if (typeof window !== 'undefined') {
    token = localStorage.getItem('access_token') || null;
    refreshToken = localStorage.getItem('refresh_token') || null;

    const lsLocale = localStorage.getItem('NEXT_LOCALE');
    const navLocale = window.navigator?.language?.split('-')[0] || 'en';
    const inferredLocale = lsLocale || navLocale;
    currentLocale = ['en', 'ru'].includes(inferredLocale)
      ? inferredLocale
      : 'en';
  }

  const url = `${API_BASE_URL}${endpoint}`;
  const { headers: callerHeaders, ...restOptions } = options;

  const authHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...(currentLocale && { 'Accept-Language': currentLocale })
  };

  const config: RequestInit = {
    ...restOptions,
    headers: mergeRequestInitHeaders(callerHeaders, authHeaders)
  };

  try {
    let response = await fetch(url, config);

    if (response.status === 401 && typeof window !== 'undefined') {
      try {
        if (refreshToken) {
          const refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${refreshToken}`
            }
          });

          if (refreshResponse.ok) {
            const refreshData: unknown = await refreshResponse.json();
            const data =
              refreshData && typeof refreshData === 'object'
                ? (refreshData as Record<string, unknown>)
                : null;
            const newAccessToken =
              (typeof data?.accessToken === 'string' && data.accessToken) ||
              (typeof data?.access_token === 'string' && data.access_token) ||
              (typeof data?.token === 'string' && data.token) ||
              null;

            if (!newAccessToken) {
              logger.error(
                'Token refresh: response OK but no access token field',
                {
                  status: refreshResponse.status,
                  url: refreshResponse.url,
                  body: refreshData
                }
              );
            } else {
              localStorage.setItem('access_token', newAccessToken);

              const retryAuthHeaders: Record<string, string> = {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${newAccessToken}`,
                ...(currentLocale && { 'Accept-Language': currentLocale })
              };
              const retryConfig: RequestInit = {
                ...restOptions,
                headers: mergeRequestInitHeaders(
                  headersInitWithoutAuthorization(callerHeaders),
                  retryAuthHeaders
                )
              };

              response = await fetch(url, retryConfig);
            }
          }
        }
      } catch (refreshError) {
        if (!isRequestAbortError(refreshError)) {
          logger.error('Token refresh failed:', refreshError);
        }
      }

      if (response.status === 401) {
        clearClientAuthSession();
        throw new Error(`Unauthorized: ${await response.text()}`);
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
