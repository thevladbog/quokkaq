import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  normalizeTenantSlug,
  resolvePublicApiBase,
  resolvePublicAppBase
} from '@/components/organization/organization-auth-shared';

describe('organization-auth-shared', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('normalizeTenantSlug', () => {
    it('lowercases and collapses spaces and punctuation to dashes', () => {
      expect(normalizeTenantSlug('  My Company Name  ')).toBe(
        'my-company-name'
      );
    });

    it('strips leading and trailing dashes', () => {
      expect(normalizeTenantSlug('---foo-bar---')).toBe('foo-bar');
    });

    it('collapses repeated internal dashes', () => {
      expect(normalizeTenantSlug('a---b')).toBe('a-b');
    });

    it('allows digits', () => {
      expect(normalizeTenantSlug('unit42')).toBe('unit42');
    });

    it('drops invalid characters', () => {
      expect(normalizeTenantSlug('café!')).toBe('caf');
    });
  });

  describe('resolvePublicApiBase', () => {
    it('uses trimmed server URL and strips trailing slash', () => {
      expect(resolvePublicApiBase(' https://api.example.com/ ')).toBe(
        'https://api.example.com'
      );
    });

    it('falls back to NEXT_PUBLIC_API_URL when server URL empty', () => {
      vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:3999/');
      expect(resolvePublicApiBase(null)).toBe('http://localhost:3999');
    });

    it('uses localhost default when no env and no server URL', () => {
      vi.stubEnv('NEXT_PUBLIC_API_URL', '');
      expect(resolvePublicApiBase(undefined)).toBe('http://localhost:3001');
    });
  });

  describe('resolvePublicAppBase', () => {
    it('uses trimmed server URL and strips trailing slash', () => {
      expect(resolvePublicAppBase(' https://app.example.com/path/ ')).toBe(
        'https://app.example.com/path'
      );
    });

    it('falls back to NEXT_PUBLIC_APP_URL when server URL empty', () => {
      vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://kiosk.example.com/');
      expect(resolvePublicAppBase('')).toBe('https://kiosk.example.com');
    });

    it('uses localhost default when no env and no server URL', () => {
      vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
      expect(resolvePublicAppBase(undefined)).toBe('http://localhost:3000');
    });
  });
});
