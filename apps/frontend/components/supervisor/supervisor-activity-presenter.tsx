import type { ShiftActivityItem } from '@/lib/api';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  CircleDot,
  Moon,
  PhoneForwarded,
  RotateCcw,
  Undo2
} from 'lucide-react';

/** Mirrors backend `internal/ticketaudit` action names. */
export const TicketHistoryAction = {
  Created: 'ticket.created',
  Called: 'ticket.called',
  Recalled: 'ticket.recalled',
  StatusChanged: 'ticket.status_changed',
  Transferred: 'ticket.transferred',
  ReturnedToQueue: 'ticket.returned_to_queue',
  EODFlagged: 'ticket.eod_flagged'
} as const;

function payloadRecord(
  payload: ShiftActivityItem['payload']
): Record<string, unknown> {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  return {};
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

export type ActivityTranslate = (
  key: string,
  values?: Record<string, string | number>
) => string;

export function getSupervisorActivityPresentation(
  item: ShiftActivityItem,
  t: ActivityTranslate
): { icon: LucideIcon; line: string } {
  const q = item.queueNumber;
  const p = payloadRecord(item.payload);

  switch (item.action) {
    case TicketHistoryAction.Created:
      return {
        icon: CircleDot,
        line: t('activityEvent.created', { queueNumber: q })
      };
    case TicketHistoryAction.Called: {
      const source = str(p.source);
      if (source === 'pick') {
        return {
          icon: PhoneForwarded,
          line: t('activityEvent.calledPick', { queueNumber: q })
        };
      }
      return {
        icon: PhoneForwarded,
        line: t('activityEvent.called', { queueNumber: q })
      };
    }
    case TicketHistoryAction.Recalled:
      return {
        icon: RotateCcw,
        line: t('activityEvent.recalled', { queueNumber: q })
      };
    case TicketHistoryAction.StatusChanged: {
      const reason = str(p.reason);
      const toStatus = str(p.to_status) ?? str(p.toStatus);
      if (reason === 'force_release') {
        return {
          icon: AlertTriangle,
          line: t('activityEvent.forceReleased', { queueNumber: q })
        };
      }
      if (
        toStatus === 'served' ||
        toStatus === 'no_show' ||
        toStatus === 'completed'
      ) {
        return {
          icon: CheckCircle2,
          line: t('activityEvent.statusTerminal', {
            queueNumber: q,
            status: toStatus
          })
        };
      }
      if (toStatus === 'in_service') {
        return {
          icon: CircleDot,
          line: t('activityEvent.statusInService', { queueNumber: q })
        };
      }
      return {
        icon: CircleDot,
        line: t('activityEvent.statusChanged', {
          queueNumber: q,
          status: toStatus ?? '—'
        })
      };
    }
    case TicketHistoryAction.Transferred:
      return {
        icon: ArrowRightLeft,
        line: t('activityEvent.transferred', { queueNumber: q })
      };
    case TicketHistoryAction.ReturnedToQueue:
      return {
        icon: Undo2,
        line: t('activityEvent.returnedToQueue', { queueNumber: q })
      };
    case TicketHistoryAction.EODFlagged:
      return {
        icon: Moon,
        line: t('activityEvent.eodFlagged', { queueNumber: q })
      };
    default:
      return {
        icon: CircleDot,
        line: t('activityEvent.generic', {
          queueNumber: q,
          action: item.action
        })
      };
  }
}
