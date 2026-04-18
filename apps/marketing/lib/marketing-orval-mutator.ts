/**
 * Orval mutator for marketing app: direct backend from server components.
 * Same response envelope as frontend {@link publicBackendOrvalMutator}.
 */
export async function marketingOrvalMutator<T>(
  url: string,
  init: RequestInit = {}
): Promise<T> {
  const raw =
    process.env.MARKETING_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    '';
  const base = raw.replace(/\/$/, '');
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
    throw Object.assign(new Error('Marketing API request failed'), {
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
