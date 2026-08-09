import { describe, expect, it } from 'vitest';
import { TicketModelSchema, type Ticket } from '@/lib/api';
import {
  deriveStaffQueueView,
  getStaffPrimaryAction,
  summarizeServiceScope
} from './staff-workstation-view';

function ticket(
  id: string,
  serviceId: string,
  serviceZoneId: string,
  createdAt = '2026-08-09T09:00:00.000Z'
): Ticket {
  return TicketModelSchema.parse({
    id,
    queueNumber: id.toUpperCase(),
    unitId: 'unit-1',
    serviceId,
    serviceZoneId,
    status: 'waiting',
    createdAt
  });
}

describe('deriveStaffQueueView', () => {
  it('keeps call-next scope while temporarily showing the full zone queue', () => {
    const result = deriveStaffQueueView({
      waitingTickets: [
        ticket('a', 'service-a', 'zone-1'),
        ticket('b', 'service-b', 'zone-1')
      ],
      selectedServiceIds: ['service-a'],
      allLeafServiceIds: ['service-a', 'service-b'],
      onlyMyZone: true,
      counterServiceZoneId: 'zone-1',
      showAllTemporarily: true
    });

    expect(result.scopedWaiting.map((item) => item.id)).toEqual(['a']);
    expect(result.visibleWaiting.map((item) => item.id)).toEqual(['a', 'b']);
    expect(result.callNextServiceIds).toEqual(['service-a']);
  });

  it('omits the call-next service filter when all leaf services are selected', () => {
    const result = deriveStaffQueueView({
      waitingTickets: [ticket('a', 'service-a', 'zone-1')],
      selectedServiceIds: ['service-a', 'service-b'],
      allLeafServiceIds: ['service-a', 'service-b'],
      onlyMyZone: false,
      showAllTemporarily: false
    });

    expect(result.callNextServiceIds).toBeUndefined();
  });

  it('filters the scoped queue to one selected service', () => {
    const result = deriveStaffQueueView({
      waitingTickets: [
        ticket('a', 'service-a', 'zone-1'),
        ticket('b', 'service-b', 'zone-1')
      ],
      selectedServiceIds: ['service-a'],
      allLeafServiceIds: ['service-a', 'service-b'],
      onlyMyZone: false,
      showAllTemporarily: false
    });

    expect(result.scopedWaiting.map((item) => item.id)).toEqual(['a']);
    expect(result.callNextServiceIds).toEqual(['service-a']);
  });

  it('applies the zone filter before the service filter', () => {
    const result = deriveStaffQueueView({
      waitingTickets: [
        ticket('other-zone', 'service-a', 'zone-2'),
        ticket('my-zone', 'service-b', 'zone-1')
      ],
      selectedServiceIds: ['service-a'],
      allLeafServiceIds: ['service-a', 'service-b'],
      onlyMyZone: true,
      counterServiceZoneId: 'zone-1',
      showAllTemporarily: false
    });

    expect(result.zoneWaiting.map((item) => item.id)).toEqual(['my-zone']);
    expect(result.scopedWaiting).toEqual([]);
  });

  it('keeps the queue unfiltered when there are no leaf services', () => {
    const result = deriveStaffQueueView({
      waitingTickets: [ticket('a', 'service-a', 'zone-1')],
      selectedServiceIds: [],
      allLeafServiceIds: [],
      onlyMyZone: false,
      showAllTemporarily: false
    });

    expect(result.scopedWaiting.map((item) => item.id)).toEqual(['a']);
    expect(result.callNextServiceIds).toBeUndefined();
  });

  it('sorts each queue view from earliest to latest creation time', () => {
    const result = deriveStaffQueueView({
      waitingTickets: [
        ticket('late', 'service-a', 'zone-1', '2026-08-09T10:00:00.000Z'),
        ticket('early', 'service-b', 'zone-1', '2026-08-09T08:00:00.000Z')
      ],
      selectedServiceIds: ['service-a', 'service-b'],
      allLeafServiceIds: ['service-a', 'service-b'],
      onlyMyZone: false,
      showAllTemporarily: false
    });

    expect(result.zoneWaiting.map((item) => item.id)).toEqual([
      'early',
      'late'
    ]);
    expect(result.scopedWaiting.map((item) => item.id)).toEqual([
      'early',
      'late'
    ]);
    expect(result.visibleWaiting.map((item) => item.id)).toEqual([
      'early',
      'late'
    ]);
  });

  it('shows only scoped rows when the temporary full-list override is off', () => {
    const result = deriveStaffQueueView({
      waitingTickets: [
        ticket('a', 'service-a', 'zone-1'),
        ticket('b', 'service-b', 'zone-1')
      ],
      selectedServiceIds: ['service-a'],
      allLeafServiceIds: ['service-a', 'service-b'],
      onlyMyZone: true,
      counterServiceZoneId: 'zone-1',
      showAllTemporarily: false
    });

    expect(result.visibleWaiting.map((item) => item.id)).toEqual(['a']);
  });
});

describe('getStaffPrimaryAction', () => {
  it.each([
    [undefined, false, 'call_next'],
    ['called', false, 'start_service'],
    ['in_service', false, 'complete'],
    ['called', true, 'resume']
  ] as const)(
    'returns %s for status %s and break %s',
    (status, onBreak, action) => {
      expect(getStaffPrimaryAction(status, onBreak)).toBe(action);
    }
  );
});

describe('summarizeServiceScope', () => {
  const leaves = [
    { id: 'service-a', label: 'Service A' },
    { id: 'service-b', label: 'Service B' },
    { id: 'service-c', label: 'Service C' }
  ];

  it('summarizes all services', () => {
    expect(
      summarizeServiceScope(
        leaves,
        leaves.map((leaf) => leaf.id)
      )
    ).toEqual({
      kind: 'all',
      labels: ['Service A', 'Service B', 'Service C'],
      count: 3
    });
  });

  it('summarizes one selected service', () => {
    expect(summarizeServiceScope(leaves, ['service-b'])).toEqual({
      kind: 'single',
      labels: ['Service B'],
      count: 1
    });
  });

  it('summarizes multiple selected services with their exact count', () => {
    expect(summarizeServiceScope(leaves, ['service-a', 'service-c'])).toEqual({
      kind: 'multiple',
      labels: ['Service A', 'Service C'],
      count: 2
    });
  });
});
