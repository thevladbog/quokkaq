import { describe, expect, it } from 'vitest';
import { BookingModelSchema, UnitKindSchema, UserModelSchema } from './index';

describe('UnitKindSchema', () => {
  it('accepts allowed enum values', () => {
    expect(UnitKindSchema.safeParse('subdivision').success).toBe(true);
    expect(UnitKindSchema.safeParse('service_zone').success).toBe(true);
  });

  it('rejects unknown kind', () => {
    expect(UnitKindSchema.safeParse('invalid').success).toBe(false);
  });
});

describe('UserModelSchema', () => {
  it('parses minimal user', () => {
    const r = UserModelSchema.safeParse({ id: 'u1', name: 'Ada' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.roles).toEqual([]);
      expect(r.data.tenantRoles).toEqual([]);
      expect(r.data.isActive).toBe(true);
    }
  });

  it('treats tenantRoles null as empty list', () => {
    const r = UserModelSchema.safeParse({
      id: 'u1',
      name: 'Ada',
      tenantRoles: null
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.tenantRoles).toEqual([]);
    }
  });
});

describe('BookingModelSchema', () => {
  it('parses required booking fields', () => {
    const r = BookingModelSchema.safeParse({
      id: 'b1',
      unitId: 'unit-1',
      serviceId: 'svc-1',
      status: 'confirmed',
      code: 'ABC'
    });
    expect(r.success).toBe(true);
  });

  it('fails when required field missing', () => {
    const r = BookingModelSchema.safeParse({
      id: 'b1',
      unitId: 'unit-1',
      serviceId: 'svc-1',
      status: 'confirmed'
    });
    expect(r.success).toBe(false);
  });
});
