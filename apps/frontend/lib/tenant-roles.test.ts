import { describe, expect, it } from 'vitest';
import {
  isTenantSystemAdminSlug,
  TENANT_ROLE_SLUG_SYSTEM_ADMIN
} from '@/lib/tenant-roles';

describe('tenant-roles', () => {
  it('exports the reserved system admin slug', () => {
    expect(TENANT_ROLE_SLUG_SYSTEM_ADMIN).toBe('system_admin');
  });

  describe('isTenantSystemAdminSlug', () => {
    it('returns true for exact system_admin', () => {
      expect(isTenantSystemAdminSlug('system_admin')).toBe(true);
    });

    it('trims whitespace', () => {
      expect(isTenantSystemAdminSlug('  system_admin  ')).toBe(true);
    });

    it('returns false for other slugs and empty', () => {
      expect(isTenantSystemAdminSlug('operator')).toBe(false);
      expect(isTenantSystemAdminSlug('')).toBe(false);
      expect(isTenantSystemAdminSlug(undefined)).toBe(false);
      expect(isTenantSystemAdminSlug(null)).toBe(false);
    });
  });
});
