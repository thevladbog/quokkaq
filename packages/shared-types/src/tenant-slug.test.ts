import { describe, expect, it } from 'vitest';
import {
  isValidTenantSlug,
  normalizeTenantSlug,
  RESERVED_TENANT_SLUGS
} from './tenant-slug';

describe('tenant-slug', () => {
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

  it('reserved set matches backend cardinality', () => {
    expect(RESERVED_TENANT_SLUGS.size).toBe(14);
  });

  it('isValidTenantSlug rejects reserved and short', () => {
    expect(isValidTenantSlug('login')).toBe(false);
    expect(isValidTenantSlug('ab')).toBe(false);
    expect(isValidTenantSlug('valid-slug')).toBe(true);
  });
});
