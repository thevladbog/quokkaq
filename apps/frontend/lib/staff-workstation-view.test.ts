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
  serviceZoneId?: string | null,
  createdAt: string | null | undefined = '2026-08-09T09:00:00.000Z'
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
      serviceScopeStatus: 'ready',
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
      serviceScopeStatus: 'ready',
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
      serviceScopeStatus: 'ready',
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
      serviceScopeStatus: 'ready',
      selectedServiceIds: ['service-a'],
      allLeafServiceIds: ['service-a', 'service-b'],
      onlyMyZone: true,
      counterServiceZoneId: 'zone-1',
      showAllTemporarily: false
    });

    expect(result.zoneWaiting.map((item) => item.id)).toEqual(['my-zone']);
    expect(result.scopedWaiting).toEqual([]);
  });

  it('keeps only unzoned tickets for an unzoned counter', () => {
    const result = deriveStaffQueueView({
      waitingTickets: [
        ticket('unzoned', 'service-a'),
        ticket('zoned', 'service-a', 'zone-1')
      ],
      serviceScopeStatus: 'ready',
      selectedServiceIds: ['service-a'],
      allLeafServiceIds: ['service-a', 'service-b'],
      onlyMyZone: true,
      counterServiceZoneId: null,
      showAllTemporarily: false
    });

    expect(result.zoneWaiting.map((item) => item.id)).toEqual(['unzoned']);
    expect(result.scopedWaiting.map((item) => item.id)).toEqual(['unzoned']);
    expect(result.visibleWaiting.map((item) => item.id)).toEqual(['unzoned']);
    expect(result.callNextServiceIds).toEqual(['service-a']);
  });

  it('keeps the queue unfiltered when there are no leaf services', () => {
    const result = deriveStaffQueueView({
      waitingTickets: [ticket('a', 'service-a', 'zone-1')],
      serviceScopeStatus: 'ready',
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
      serviceScopeStatus: 'ready',
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

  it('sorts tickets without a creation time after timestamped tickets', () => {
    const result = deriveStaffQueueView({
      waitingTickets: [
        ticket('missing', 'service-a', 'zone-1', null),
        ticket('known', 'service-a', 'zone-1', '2026-08-09T08:00:00.000Z')
      ],
      serviceScopeStatus: 'ready',
      selectedServiceIds: ['service-a'],
      allLeafServiceIds: ['service-a'],
      onlyMyZone: false,
      showAllTemporarily: false
    });

    expect(result.visibleWaiting.map((item) => item.id)).toEqual([
      'known',
      'missing'
    ]);
  });

  it('shows only scoped rows when the temporary full-list override is off', () => {
    const result = deriveStaffQueueView({
      waitingTickets: [
        ticket('a', 'service-a', 'zone-1'),
        ticket('b', 'service-b', 'zone-1')
      ],
      serviceScopeStatus: 'ready',
      selectedServiceIds: ['service-a'],
      allLeafServiceIds: ['service-a', 'service-b'],
      onlyMyZone: true,
      counterServiceZoneId: 'zone-1',
      showAllTemporarily: false
    });

    expect(result.visibleWaiting.map((item) => item.id)).toEqual(['a']);
  });

  it.each(['pending', 'error', 'hydrating'] as const)(
    'fails closed while the service scope is %s',
    (serviceScopeStatus) => {
      const result = deriveStaffQueueView({
        waitingTickets: [ticket('a', 'service-a', 'zone-1')],
        serviceScopeStatus,
        selectedServiceIds: [],
        allLeafServiceIds: [],
        onlyMyZone: false,
        showAllTemporarily: true
      });

      expect(result.serviceScopeReady).toBe(false);
      expect(result.zoneWaiting).toEqual([]);
      expect(result.scopedWaiting).toEqual([]);
      expect(result.visibleWaiting).toEqual([]);
    }
  );

  it('uses a hydrated persisted selection for queue and call-next scope', () => {
    const result = deriveStaffQueueView({
      waitingTickets: [
        ticket('a', 'service-a', 'zone-1'),
        ticket('b', 'service-b', 'zone-1')
      ],
      serviceScopeStatus: 'ready',
      selectedServiceIds: ['service-b'],
      allLeafServiceIds: ['service-a', 'service-b'],
      onlyMyZone: false,
      showAllTemporarily: false
    });

    expect(result.serviceScopeReady).toBe(true);
    expect(result.visibleWaiting.map((item) => item.id)).toEqual(['b']);
    expect(result.callNextServiceIds).toEqual(['service-b']);
  });

  it('treats a genuinely loaded empty catalog as ready all-services scope', () => {
    const result = deriveStaffQueueView({
      waitingTickets: [ticket('a', 'legacy-service', 'zone-1')],
      serviceScopeStatus: 'ready',
      selectedServiceIds: [],
      allLeafServiceIds: [],
      onlyMyZone: false,
      showAllTemporarily: false
    });

    expect(result.serviceScopeReady).toBe(true);
    expect(result.visibleWaiting.map((item) => item.id)).toEqual(['a']);
    expect(result.callNextServiceIds).toBeUndefined();
  });
});

describe('getStaffPrimaryAction', () => {
  it.each([
    [undefined, false, 'call_next'],
    ['called', false, 'start_service'],
    ['in_service', false, 'complete'],
    ['unexpected_active_status', false, 'blocked'],
    ['called', true, 'resume']
  ] as const)(
    'returns the right action for status %s and break %s (expects %s)',
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
