import { describe, expect, it } from 'vitest';
import {
  BookingModelSchema,
  DesktopTerminalKindSchema,
  DesktopTerminalSchema,
  effectiveDesktopTerminalKind,
  UnitKindSchema,
  UserModelSchema
} from './index';

const desktopTerminalMinimal = {
  id: 't1',
  unitId: 'u1',
  defaultLocale: 'en',
  createdAt: '2020-01-01T00:00:00Z',
  updatedAt: '2020-01-01T00:00:00Z'
};

describe('DesktopTerminalSchema', () => {
  it('treats omitted kind with counterId as counter_guest_survey', () => {
    const r = DesktopTerminalSchema.safeParse({
      ...desktopTerminalMinimal,
      counterId: 'c1'
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.kind).toBe('counter_guest_survey');
  });

  it('keeps kiosk when no counter binding', () => {
    const r = DesktopTerminalSchema.safeParse({ ...desktopTerminalMinimal });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.kind).toBe('kiosk');
  });

  it('maps explicit kiosk with counterId to counter_guest_survey', () => {
    const r = DesktopTerminalSchema.safeParse({
      ...desktopTerminalMinimal,
      kind: 'kiosk',
      counterId: 'c1'
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.kind).toBe('counter_guest_survey');
  });

  it('preserves counter_board', () => {
    const r = DesktopTerminalSchema.safeParse({
      ...desktopTerminalMinimal,
      kind: 'counter_board',
      counterId: 'c1'
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.kind).toBe('counter_board');
  });

  it('preserves counter_guest_survey when counterId is omitted', () => {
    const r = DesktopTerminalSchema.safeParse({
      ...desktopTerminalMinimal,
      kind: 'counter_guest_survey'
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.kind).toBe('counter_guest_survey');
  });

  it('preserves counter_board without counterId', () => {
    const r = DesktopTerminalSchema.safeParse({
      ...desktopTerminalMinimal,
      kind: 'counter_board'
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.kind).toBe('counter_board');
  });

  it('rejects unknown kind (enum) before transform', () => {
    const r = DesktopTerminalSchema.safeParse({
      ...desktopTerminalMinimal,
      // @ts-expect-error exercise invalid wire value
      kind: 'some_unknown_string'
    });
    expect(r.success).toBe(false);
  });

  it('aligns transform output with effectiveDesktopTerminalKind', () => {
    const input = {
      ...desktopTerminalMinimal,
      kind: 'kiosk' as const,
      counterId: 'c1'
    };
    const parsed = DesktopTerminalSchema.safeParse(input);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.kind).toBe(
        effectiveDesktopTerminalKind({
          kind: 'kiosk',
          counterId: 'c1'
        })
      );
    }
  });
});

describe('DesktopTerminalKindSchema', () => {
  it('rejects values outside the terminal kind union', () => {
    expect(DesktopTerminalKindSchema.safeParse('not_a_kind').success).toBe(
      false
    );
  });
});

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
