import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { updateScreenLayoutTemplate } from '@/lib/api/generated/auth';
import {
  acknowledgeTerminalExperienceManifest,
  getTerminalExperienceManifest
} from '@/lib/api/generated/terminal-experience';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function requestHeaders(init: RequestInit | undefined): Headers {
  return new Headers(init?.headers);
}

describe('generated experience authentication boundaries', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends terminal Bearer credentials through the generated manifest and acknowledgement operations', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ mode: 'legacy' }), { status: 200 })
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await getTerminalExperienceManifest({
      headers: { Authorization: 'Bearer terminal-jwt' }
    });
    await acknowledgeTerminalExperienceManifest(
      {
        status: 'rejected',
        versionId: 'version-7',
        reasonCode: 'renderer.timeout'
      },
      { headers: { Authorization: 'Bearer terminal-jwt' } }
    );

    const [manifestURL, manifestInit] = fetchMock.mock.calls[0] ?? [];
    expect(manifestURL).toBe('/api/terminal/experience');
    expect(manifestInit).toMatchObject({ method: 'GET' });
    expect(requestHeaders(manifestInit).get('authorization')).toBe(
      'Bearer terminal-jwt'
    );
    expect(manifestInit?.credentials).toBeUndefined();

    const [ackURL, ackInit] = fetchMock.mock.calls[1] ?? [];
    expect(ackURL).toBe('/api/terminal/experience/ack');
    expect(ackInit).toMatchObject({ method: 'POST' });
    expect(requestHeaders(ackInit).get('authorization')).toBe(
      'Bearer terminal-jwt'
    );
    expect(JSON.parse(String(ackInit?.body))).toEqual({
      status: 'rejected',
      versionId: 'version-7',
      reasonCode: 'renderer.timeout'
    });
  });

  it('sends the generated builder operation through the ordinary cookie-authenticated mutator', async () => {
    const storage = new MemoryStorage();
    storage.setItem('quokkaq_active_company_id', 'company-17');
    storage.setItem('NEXT_LOCALE', 'ru');
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('window', {
      localStorage: storage,
      navigator: { language: 'ru-RU' }
    });
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: 'template-a', definition: {} }), {
        status: 200
      })
    );

    await updateScreenLayoutTemplate('template-a', {
      definition: { schemaVersion: 1 }
    });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/companies/me/screen-layout-templates/template-a');
    expect(init).toMatchObject({ method: 'PUT', credentials: 'include' });
    const headers = requestHeaders(init);
    expect(headers.get('authorization')).toBeNull();
    expect(headers.get('x-company-id')).toBe('company-17');
    expect(headers.get('accept-language')).toBe('ru');
  });
});
