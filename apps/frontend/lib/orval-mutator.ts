import { throwApiHttpErrorFromBody } from './api-errors';
import { authenticatedApiFetch } from './authenticated-api-fetch';

/**
 * HTTP layer for Orval-generated React Query hooks (auth + JWT refresh via {@link authenticatedApiFetch}).
 * Matches Orval's default fetch mutator signature: `(url, RequestInit) => Promise<T>`.
 */
export async function orvalMutator<T>(
  url: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await authenticatedApiFetch(url, init);

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
