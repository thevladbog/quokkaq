/**
 * Orval mutator for server-side calls to the real backend (no Next `/api` proxy, no cookies).
 * Matches the shape returned by {@link orvalMutator}: `{ data, status, headers }`.
 */
export async function publicBackendOrvalMutator<T>(
  url: string,
  init: RequestInit = {}
): Promise<T> {
  const base = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');
  const response = await fetch(`${base}${url}`, {
    ...init,
    next: { revalidate: 300 }
  });

  if (response.status === 204 || response.status === 205) {
    return {
      data: undefined,
      status: response.status,
      headers: response.headers
    } as T;
  }

  const text = await response.text();

  if (!response.ok) {
    let body: unknown = text;
    try {
      body = text.trim() ? JSON.parse(text) : text;
    } catch {
      /* keep text */
    }
    throw Object.assign(new Error('Public API request failed'), {
      status: response.status,
      body
    });
  }

  let responseData: unknown;
  if (!text.trim()) {
    responseData = undefined;
  } else {
    responseData = JSON.parse(text);
  }

  return {
    data: responseData,
    status: response.status,
    headers: response.headers
  } as T;
}
