import { describe, expect, it } from 'vitest';
import {
  BookingModelSchema,
  DesktopTerminalKindSchema,
  DesktopTerminalSchema,
  effectiveDesktopTerminalKind,
  KioskConfigSchema,
  TicketModelSchema,
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

describe('KioskConfigSchema', () => {
  it('accepts optional appointment check-in and phone flags', () => {
    const r = KioskConfigSchema.safeParse({
      isPreRegistrationEnabled: true,
      isAppointmentCheckinEnabled: true,
      isAppointmentPhoneLookupEnabled: true
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.isAppointmentCheckinEnabled).toBe(true);
      expect(r.data.isAppointmentPhoneLookupEnabled).toBe(true);
    }
  });

  it('parses empty object', () => {
    const r = KioskConfigSchema.safeParse({});
    expect(r.success).toBe(true);
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
      expect(r.data.isPlatformAdmin).toBe(false);
      expect(r.data.isTenantAdmin).toBe(false);
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

  it('sets isPlatformAdmin when roles include platform_admin', () => {
    const r = UserModelSchema.safeParse({
      id: 'u1',
      name: 'Op',
      roles: ['platform_admin']
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.isPlatformAdmin).toBe(true);
      expect(r.data.isTenantAdmin).toBe(false);
    }
  });

  it('sets isTenantAdmin when tenantRoles include system_admin', () => {
    const r = UserModelSchema.safeParse({
      id: 'u1',
      name: 'Sys',
      tenantRoles: [{ id: 'tr1', name: 'System', slug: 'system_admin' }]
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.isTenantAdmin).toBe(true);
      expect(r.data.isPlatformAdmin).toBe(false);
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

const minimalTicket = {
  id: 'ticket-1',
  queueNumber: 'А-42',
  unitId: 'unit-1',
  serviceId: 'svc-1',
  status: 'waiting'
};

describe('TicketModelSchema', () => {
  it('parses a minimal valid ticket', () => {
    const r = TicketModelSchema.safeParse(minimalTicket);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.id).toBe('ticket-1');
      expect(r.data.queueNumber).toBe('А-42');
      expect(r.data.status).toBe('waiting');
    }
  });

  it('preserves queuePosition and estimatedWaitSeconds when present', () => {
    const r = TicketModelSchema.safeParse({
      ...minimalTicket,
      queuePosition: 3,
      estimatedWaitSeconds: 180
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.queuePosition).toBe(3);
      expect(r.data.estimatedWaitSeconds).toBe(180);
    }
  });

  it('preserves smsOptInAvailable: true (Bug 1 regression)', () => {
    const r = TicketModelSchema.safeParse({
      ...minimalTicket,
      smsOptInAvailable: true
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.smsOptInAvailable).toBe(true);
    }
  });

  it('preserves smsOptInAvailable: false', () => {
    const r = TicketModelSchema.safeParse({
      ...minimalTicket,
      smsOptInAvailable: false
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.smsOptInAvailable).toBe(false);
    }
  });

  it('preserves visitorPhoneKnown and smsPostTicketStepRequired (kiosk DTO)', () => {
    const r = TicketModelSchema.safeParse({
      ...minimalTicket,
      visitorPhoneKnown: true,
      smsPostTicketStepRequired: true
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.visitorPhoneKnown).toBe(true);
      expect(r.data.smsPostTicketStepRequired).toBe(true);
    }
  });

  it('smsPostTicketStepRequired and visitorPhoneKnown are undefined when absent', () => {
    const r = TicketModelSchema.safeParse(minimalTicket);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.smsPostTicketStepRequired).toBeUndefined();
      expect(r.data.visitorPhoneKnown).toBeUndefined();
    }
  });

  it('smsOptInAvailable is undefined when absent (optional field)', () => {
    const r = TicketModelSchema.safeParse(minimalTicket);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.smsOptInAvailable).toBeUndefined();
    }
  });

  it('strips truly unknown fields', () => {
    const r = TicketModelSchema.safeParse({
      ...minimalTicket,
      unknownField: 'should-be-stripped',
      anotherUnknown: 42
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(
        (r.data as Record<string, unknown>)['unknownField']
      ).toBeUndefined();
      expect(
        (r.data as Record<string, unknown>)['anotherUnknown']
      ).toBeUndefined();
    }
  });

  it('allows optional fields to be absent', () => {
    const r = TicketModelSchema.safeParse(minimalTicket);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.client).toBeUndefined();
      expect(r.data.counter).toBeUndefined();
      expect(r.data.service).toBeUndefined();
      expect(r.data.preRegistration).toBeUndefined();
    }
  });

  it('accepts nullable counter set to null', () => {
    const r = TicketModelSchema.safeParse({ ...minimalTicket, counter: null });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.counter).toBeNull();
    }
  });

  it('fails when required fields are missing', () => {
    const r = TicketModelSchema.safeParse({ id: 'ticket-1' });
    expect(r.success).toBe(false);
  });
});
