/**
 * Orval mutator for server-side calls to the real backend (no Next `/api` proxy, no cookies).
 * Matches the shape returned by {@link orvalMutator}: `{ data, status, headers }`.
 */
const DEFAULT_TIMEOUT_MS = 10_000;

function mergeTimeoutSignal(
  userSignal: AbortSignal | undefined,
  timeoutMs: number
): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const timers: ReturnType<typeof setTimeout>[] = [];

  const dispose = () => {
    for (const t of timers) clearTimeout(t);
    timers.length = 0;
    if (userSignal) userSignal.removeEventListener('abort', onUserAbort);
  };

  const onUserAbort = () => {
    dispose();
    controller.abort();
  };

  if (userSignal) {
    if (userSignal.aborted) {
      controller.abort();
      return { signal: controller.signal, dispose: () => {} };
    }
    userSignal.addEventListener('abort', onUserAbort, { once: true });
  }

  timers.push(
    setTimeout(() => {
      dispose();
      controller.abort();
    }, timeoutMs)
  );

  return {
    signal: controller.signal,
    dispose
  };
}

export async function publicBackendOrvalMutator<T>(
  url: string,
  init: RequestInit = {}
): Promise<T> {
  const base = (process.env.NEXT_PUBLIC_API_URL ?? '')
    .trim()
    .replace(/\/$/, '');
  if (!base) {
    throw new Error(
      'NEXT_PUBLIC_API_URL is not set; cannot call the public backend from this mutator.'
    );
  }

  const method = (init.method ?? 'GET').toUpperCase();
  const cacheable = method === 'GET' || method === 'HEAD';
  const { signal, dispose } = mergeTimeoutSignal(
    init.signal ?? undefined,
    DEFAULT_TIMEOUT_MS
  );

  try {
    const response = await fetch(`${base}${url}`, {
      ...(cacheable ? { next: { revalidate: 300 } } : {}),
      ...init,
      signal
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
  } finally {
    dispose();
  }
}
