import { throwApiHttpErrorFromBody } from './api-errors';
import {
  API_BASE_URL,
  fetchInitWithRequestId
} from './authenticated-api-fetch';

/**
 * Orval mutator for counter-display terminal JWT (no staff refresh).
 * Pass `Authorization: Bearer <terminal>` in RequestInit.headers.
 */
export async function terminalOrvalMutator<T>(
  url: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(
    `${API_BASE_URL}${url}`,
    fetchInitWithRequestId(init)
  );

  if (response.status === 204 || response.status === 205) {
    return {
      data: undefined,
      status: response.status,
      headers: response.headers
    } as T;
  }

  const text = await response.text();

  if (!response.ok) {
    throwApiHttpErrorFromBody(response.status, text || '{}');
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
