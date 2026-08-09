import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TicketModelSchema, type Ticket } from '@/lib/api';
import {
  StaffCurrentTicketHero,
  type StaffCurrentTicketHeroProps
} from './StaffCurrentTicketHero';

vi.mock('@/components/staff/StaffVisitorTagsEditModal', () => ({
  StaffVisitorTagsEditModal: () => null
}));

const now = new Date('2026-08-09T12:00:00.000Z');

const messages: Record<string, string> = {
  'current.visitor_section': 'Visitor',
  'current.no_visitor_profile': 'No visitor profile',
  'current.visitor_portrait_aria': 'Visitor portrait',
  'current.service': 'Service',
  'current.called_time': 'Time since call',
  'queue.number': 'Number',
  'queue.waiting': 'Waiting',
  'queue.max_label': 'Max',
  'queue.service_time': 'Service time',
  'queue.sla_warning': 'Approaching limit',
  'queue.sla_overdue': 'Limit exceeded',
  'queue.sla_label': 'SLA',
  'statuses.called': 'Called',
  'statuses.in_service': 'In service',
  'visitor_context.open_details': 'Visitor details'
};

function t(key: string, values?: Record<string, string | number | Date>) {
  return (messages[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) =>
    String(values?.[name] ?? '')
  );
}

function ticket(status: 'called' | 'in_service', overrides: Partial<Ticket>) {
  return TicketModelSchema.parse({
    id: 'ticket-1',
    queueNumber: 'A001',
    unitId: 'unit-1',
    serviceId: 'service-1',
    status,
    createdAt: new Date(now.getTime() - 185_000).toISOString(),
    calledAt: new Date(now.getTime() - 65_000).toISOString(),
    ...overrides
  });
}

function renderHero(overrides: Partial<StaffCurrentTicketHeroProps> = {}) {
  const props: StaffCurrentTicketHeroProps = {
    unitId: 'unit-1',
    ticket: ticket('called', {}),
    serviceName: 'Localized payments',
    t,
    onShowDetails: vi.fn(),
    locale: 'en',
    onOpenVisitorDetails: vi.fn(),
    canReadUserData: false,
    ...overrides
  };

  return render(<StaffCurrentTicketHero {...props} />);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('StaffCurrentTicketHero', () => {
  it('shows localized service and live elapsed time for a called ticket', () => {
    renderHero();

    expect(screen.getByText('Service')).toBeVisible();
    expect(screen.getByText('Localized payments')).toBeVisible();
    expect(screen.getByText('Time since call')).toBeVisible();
    expect(screen.getByText('01:05')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Visitor details' })).toHaveClass(
      'h-9'
    );
  });

  it.each([
    { elapsedSeconds: 95, expected: 'Approaching limit' },
    { elapsedSeconds: 101, expected: 'Limit exceeded' }
  ])(
    'adds textual SLA status at $elapsedSeconds seconds of a 100 second service budget',
    ({ elapsedSeconds, expected }) => {
      renderHero({
        ticket: ticket('in_service', {
          confirmedAt: new Date(
            now.getTime() - elapsedSeconds * 1_000
          ).toISOString(),
          maxServiceTime: 100
        })
      });

      expect(screen.getByText('SLA')).toBeVisible();
      expect(screen.getByText(expected)).toBeVisible();
    }
  );
});
