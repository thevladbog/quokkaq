import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiHttpError } from './api-errors';
import { orvalMutator } from './orval-mutator';
import { authenticatedApiFetch } from './authenticated-api-fetch';

vi.mock('./authenticated-api-fetch', () => ({
  authenticatedApiFetch: vi.fn()
}));

function mockResponse(init: {
  status: number;
  ok?: boolean;
  text: string;
  headers?: Headers;
}): Response {
  const headers = init.headers ?? new Headers();
  const ok = init.ok ?? (init.status >= 200 && init.status < 300);
  return {
    status: init.status,
    ok,
    headers,
    text: async () => init.text
  } as Response;
}

describe('orvalMutator', () => {
  beforeEach(() => {
    vi.mocked(authenticatedApiFetch).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns parsed JSON body with status and headers on 200', async () => {
    const headers = new Headers({ 'x-test': '1' });
    vi.mocked(authenticatedApiFetch).mockResolvedValue(
      mockResponse({
        status: 200,
        text: JSON.stringify({ foo: 'bar' }),
        headers
      })
    );

    const result = await orvalMutator<{
      data: unknown;
      status: number;
      headers: Headers;
    }>('/platform/companies', { method: 'GET' });

    expect(result.status).toBe(200);
    expect(result.data).toEqual({ foo: 'bar' });
    expect(result.headers.get('x-test')).toBe('1');
    expect(authenticatedApiFetch).toHaveBeenCalledWith('/platform/companies', {
      method: 'GET'
    });
  });

  it('returns data undefined when response body is whitespace only', async () => {
    vi.mocked(authenticatedApiFetch).mockResolvedValue(
      mockResponse({ status: 200, text: '  \n  ' })
    );

    const result = await orvalMutator<{ data: unknown; status: number }>(
      '/x',
      {}
    );

    expect(result.status).toBe(200);
    expect(result.data).toBeUndefined();
  });

  it('returns wrapped empty data for 204', async () => {
    vi.mocked(authenticatedApiFetch).mockResolvedValue(
      mockResponse({ status: 204, text: '', ok: true })
    );

    const result = await orvalMutator<{ data: undefined; status: number }>(
      '/x',
      {
        method: 'DELETE'
      }
    );

    expect(result.status).toBe(204);
    expect(result.data).toBeUndefined();
  });

  it('returns wrapped empty data for 205', async () => {
    vi.mocked(authenticatedApiFetch).mockResolvedValue(
      mockResponse({ status: 205, text: '', ok: true })
    );

    const result = await orvalMutator<{ data: undefined; status: number }>(
      '/x',
      {}
    );

    expect(result.status).toBe(205);
    expect(result.data).toBeUndefined();
  });

  it('throws ApiHttpError when response is not ok with JSON message', async () => {
    vi.mocked(authenticatedApiFetch).mockResolvedValue(
      mockResponse({
        status: 400,
        ok: false,
        text: JSON.stringify({ message: 'bad request', code: 'INVALID' })
      })
    );

    await expect(orvalMutator('/x', {})).rejects.toMatchObject({
      name: 'ApiHttpError',
      status: 400,
      code: 'INVALID',
      message: 'bad request'
    });
  });

  it('throws ApiHttpError with summary when error body has no message', async () => {
    vi.mocked(authenticatedApiFetch).mockResolvedValue(
      mockResponse({
        status: 502,
        ok: false,
        text: '{}'
      })
    );

    try {
      await orvalMutator('/x', {});
      expect.fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiHttpError);
      expect((e as ApiHttpError).status).toBe(502);
      expect((e as ApiHttpError).message).toMatch(/502/);
    }
  });
});
