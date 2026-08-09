import type { Ticket } from '@/lib/api';

export type StaffPrimaryAction =
  'call_next' | 'start_service' | 'complete' | 'resume';

export type StaffServiceScopeStatus =
  'pending' | 'error' | 'hydrating' | 'ready';

export interface StaffQueueViewInput {
  waitingTickets: readonly Ticket[];
  serviceScopeStatus: StaffServiceScopeStatus;
  selectedServiceIds: readonly string[];
  allLeafServiceIds: readonly string[];
  onlyMyZone: boolean;
  counterServiceZoneId?: string | null;
  showAllTemporarily: boolean;
}

export interface StaffQueueView {
  serviceScopeReady: boolean;
  zoneWaiting: Ticket[];
  scopedWaiting: Ticket[];
  visibleWaiting: Ticket[];
  callNextServiceIds: string[] | undefined;
}

function byCreationTime(left: Ticket, right: Ticket): number {
  return (left.createdAt ?? '').localeCompare(right.createdAt ?? '');
}

function normalizeServiceZoneId(
  serviceZoneId: string | null | undefined
): string | null {
  const normalized = serviceZoneId?.trim();
  return normalized ? normalized : null;
}

export function deriveStaffQueueView({
  waitingTickets,
  serviceScopeStatus,
  selectedServiceIds,
  allLeafServiceIds,
  onlyMyZone,
  counterServiceZoneId,
  showAllTemporarily
}: StaffQueueViewInput): StaffQueueView {
  if (serviceScopeStatus !== 'ready') {
    return {
      serviceScopeReady: false,
      zoneWaiting: [],
      scopedWaiting: [],
      visibleWaiting: [],
      callNextServiceIds: undefined
    };
  }

  const normalizedCounterServiceZoneId =
    normalizeServiceZoneId(counterServiceZoneId);
  const zoneWaiting = waitingTickets
    .filter(
      (ticket) =>
        !onlyMyZone ||
        normalizeServiceZoneId(ticket.serviceZoneId) ===
          normalizedCounterServiceZoneId
    )
    .sort(byCreationTime);
  const hasLeafServices = allLeafServiceIds.length > 0;
  const selectedServiceSet = new Set(selectedServiceIds);
  const allServicesSelected =
    hasLeafServices &&
    allLeafServiceIds.every((id) => selectedServiceSet.has(id));
  const callNextServiceIds =
    !hasLeafServices || allServicesSelected
      ? undefined
      : [...selectedServiceIds];
  const scopedWaiting =
    callNextServiceIds === undefined
      ? zoneWaiting
      : zoneWaiting.filter((ticket) =>
          selectedServiceSet.has(ticket.serviceId)
        );

  return {
    serviceScopeReady: true,
    zoneWaiting,
    scopedWaiting,
    visibleWaiting: showAllTemporarily ? zoneWaiting : scopedWaiting,
    callNextServiceIds
  };
}

export function getStaffPrimaryAction(
  ticketStatus: string | undefined,
  workstationOnBreak: boolean
): StaffPrimaryAction {
  if (workstationOnBreak) return 'resume';
  if (!ticketStatus) return 'call_next';
  if (ticketStatus === 'called') return 'start_service';
  if (ticketStatus === 'in_service') return 'complete';
  return 'start_service';
}

export function summarizeServiceScope(
  leaves: readonly { id: string; label: string }[],
  selectedIds: readonly string[]
): { kind: 'all' | 'single' | 'multiple'; labels: string[]; count: number } {
  const selectedIdSet = new Set(selectedIds);
  const selectedLeaves = leaves.filter((leaf) => selectedIdSet.has(leaf.id));
  const count = selectedLeaves.length;

  return {
    kind: count === leaves.length ? 'all' : count === 1 ? 'single' : 'multiple',
    labels: selectedLeaves.map((leaf) => leaf.label),
    count
  };
}
