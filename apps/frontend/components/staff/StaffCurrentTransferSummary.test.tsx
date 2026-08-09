import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClientVisitTransferEvent } from '@quokkaq/shared-types';
import {
  StaffCurrentTransferSummary,
  type StaffCurrentTransferSummaryProps
} from './StaffCurrentTransferSummary';

const messages: Record<string, string> = {
  'visitor_context.last_transfer': 'Last transfer',
  'visitor_context.transfer_show_all': 'Show all transfers',
  'visitor_context.transferred_at': 'Transferred {time}',
  'visitor_context.transfer_service_flow': '{from} → {to}',
  'visitor_context.transfer_counter_flow': 'Counters: {from} → {to}',
  'visitor_context.transfer_counter_to_zone_queue':
    'Counters: {from} → zone queue',
  'visitor_context.transfer_zone_flow': 'Zones: {from} → {to}',
  'visitor_context.transfer_service_from': 'Previous service: {value}',
  'visitor_context.transfer_service_to': 'New service: {value}',
  'visitor_context.transfer_counter_from': 'From counter: {value}',
  'visitor_context.transfer_counter_to': 'To counter: {value}',
  'visitor_context.transfer_zone_from': 'From zone: {value}',
  'visitor_context.transfer_zone_to': 'To zone: {value}'
};

function t(key: string, values?: Record<string, string | number | Date>) {
  return (messages[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) =>
    String(values?.[name] ?? '')
  );
}

function transfer(
  overrides: Partial<ClientVisitTransferEvent> = {}
): ClientVisitTransferEvent {
  return {
    at: '2026-08-09T09:00:00.000Z',
    ...overrides
  };
}

function renderSummary(
  overrides: Partial<StaffCurrentTransferSummaryProps> = {}
) {
  const props: StaffCurrentTransferSummaryProps = {
    trail: [],
    locale: 'en',
    t,
    onOpenFullTrail: vi.fn(),
    ...overrides
  };

  return { ...render(<StaffCurrentTransferSummary {...props} />), props };
}

afterEach(cleanup);

describe('StaffCurrentTransferSummary', () => {
  it('renders nothing when the transfer trail is missing or empty', () => {
    const missing = renderSummary({ trail: undefined });
    expect(missing.container).toBeEmptyDOMElement();
    missing.unmount();

    const empty = renderSummary({ trail: [] });
    expect(empty.container).toBeEmptyDOMElement();
  });

  it('shows only the latest transfer and only its populated display lines', () => {
    const older = transfer({
      at: '2026-08-09T10:00:00.000Z',
      fromServiceNameEn: 'Old service',
      toServiceNameEn: 'Older service',
      fromCounterName: 'Counter 1',
      toCounterName: 'Counter 2'
    });
    const latest = transfer({
      at: '2026-08-09T12:00:00.000Z',
      fromServiceNameEn: 'Payments',
      toServiceNameEn: 'Documents',
      fromZoneLabel: 'Welcome',
      toZoneLabel: 'Service hall'
    });

    const { container } = renderSummary({ trail: [latest, older] });

    expect(screen.getByText('Payments → Documents')).toBeVisible();
    expect(screen.getByText('Zones: Welcome → Service hall')).toBeVisible();
    expect(screen.queryByText(/Old service/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Counters:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/served by|employee/i)).not.toBeInTheDocument();
    expect(container.querySelector('time')).toHaveAttribute(
      'datetime',
      latest.at
    );
  });

  it.each([
    {
      dimension: 'service',
      event: transfer({ fromServiceNameEn: 'Payments' }),
      expected: 'Previous service: Payments'
    },
    {
      dimension: 'counter',
      event: transfer({ toCounterName: 'Counter 8' }),
      expected: 'To counter: Counter 8'
    },
    {
      dimension: 'zone',
      event: transfer({ toZoneLabel: 'Zone B' }),
      expected: 'To zone: Zone B'
    }
  ])(
    'labels an available one-sided $dimension without a placeholder',
    ({ event, expected }) => {
      renderSummary({ trail: [event] });

      expect(screen.getByText(expected)).toBeVisible();
      expect(screen.queryByText(/—/)).not.toBeInTheDocument();
    }
  );

  it('keeps the zone-to-queue wording for a one-sided counter transfer', () => {
    renderSummary({
      trail: [
        transfer({
          transferKind: 'zone',
          fromCounterName: 'Counter 4'
        })
      ]
    });

    expect(screen.getByText('Counters: Counter 4 → zone queue')).toBeVisible();
    expect(screen.queryByText(/—/)).not.toBeInTheDocument();
  });

  it('opens the full transfer trail from its labelled button', async () => {
    const user = userEvent.setup();
    const onOpenFullTrail = vi.fn();
    renderSummary({
      trail: [transfer({ fromServiceNameEn: 'Payments' })],
      onOpenFullTrail
    });

    await user.click(
      screen.getByRole('button', { name: 'Show all transfers' })
    );
    expect(onOpenFullTrail).toHaveBeenCalledOnce();
  });
});
