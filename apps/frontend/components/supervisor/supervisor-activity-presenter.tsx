import type { ShiftActivityItem } from '@/lib/api';
import { getLocalizedName } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  CircleDot,
  MessageSquare,
  Moon,
  PhoneForwarded,
  RotateCcw,
  Tags,
  Undo2,
  UserRound
} from 'lucide-react';

/** Mirrors backend `internal/ticketaudit` action names. */
export const TicketHistoryAction = {
  Created: 'ticket.created',
  Called: 'ticket.called',
  Recalled: 'ticket.recalled',
  StatusChanged: 'ticket.status_changed',
  Transferred: 'ticket.transferred',
  ReturnedToQueue: 'ticket.returned_to_queue',
  EODFlagged: 'ticket.eod_flagged',
  VisitorUpdated: 'ticket.visitor_updated',
  OperatorCommentUpdated: 'ticket.operator_comment_updated',
  VisitorTagsUpdated: 'ticket.visitor_tags_updated'
} as const;

const VISITOR_TAGS_REASON_MAX = 80;
const COMMENT_SNIPPET_MAX = 60;

function truncateReason(s: string, maxLen: number): string {
  const t = s.trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1)}…`;
}

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

/** Build a display label for a service from audit payload (default name + optional ru/en). */
function localizedServiceLabelFromPayload(
  p: Record<string, unknown>,
  fieldPrefix: 'to' | 'from',
  locale: string
): string {
  const label =
    str(p[`${fieldPrefix}_service_label`]) ??
    str(p[`${fieldPrefix}ServiceLabel`]);
  const nameRu =
    str(p[`${fieldPrefix}_service_name_ru`]) ??
    str(p[`${fieldPrefix}ServiceNameRu`]);
  const nameEn =
    str(p[`${fieldPrefix}_service_name_en`]) ??
    str(p[`${fieldPrefix}ServiceNameEn`]);
  const base = label?.trim() ?? '';
  if (!base) return '—';
  return getLocalizedName(base, nameRu, nameEn, locale);
}

function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x === 'string') {
      const s = x.trim();
      if (s) out.push(s);
    }
  }
  return out;
}

export type ActivityTranslate = (
  key: string,
  values?: Record<string, string | number>
) => string;

/** Localized ticket status token from API (snake_case). */
export function translateTicketStatusForActivity(
  raw: string | undefined,
  t: ActivityTranslate
): string {
  if (!raw || !raw.trim()) return '—';
  const s = raw.trim();
  switch (s) {
    case 'served':
      return t('activityTicketStatus.served');
    case 'no_show':
      return t('activityTicketStatus.no_show');
    case 'completed':
      return t('activityTicketStatus.completed');
    case 'waiting':
      return t('activityTicketStatus.waiting');
    case 'called':
      return t('activityTicketStatus.called');
    case 'in_service':
      return t('activityTicketStatus.in_service');
    case 'cancelled':
      return t('activityTicketStatus.cancelled');
    default:
      return s;
  }
}

export type SupervisorActivityPresentation = {
  icon: LucideIcon;
  line: string;
  /** Tailwind classes for the icon (foreground). */
  iconClassName: string;
};

export function getSupervisorActivityPresentation(
  item: ShiftActivityItem,
  t: ActivityTranslate,
  locale: string
): SupervisorActivityPresentation {
  const q = item.queueNumber;
  const p = payloadRecord(item.payload);

  switch (item.action) {
    case TicketHistoryAction.Created:
      return {
        icon: CircleDot,
        iconClassName: 'text-sky-600 dark:text-sky-400',
        line: t('activityEvent.created', { queueNumber: q })
      };
    case TicketHistoryAction.Called: {
      const source = str(p.source);
      if (source === 'pick') {
        return {
          icon: PhoneForwarded,
          iconClassName: 'text-violet-600 dark:text-violet-400',
          line: t('activityEvent.calledPick', { queueNumber: q })
        };
      }
      return {
        icon: PhoneForwarded,
        iconClassName: 'text-violet-600 dark:text-violet-400',
        line: t('activityEvent.called', { queueNumber: q })
      };
    }
    case TicketHistoryAction.Recalled:
      return {
        icon: RotateCcw,
        iconClassName: 'text-amber-600 dark:text-amber-400',
        line: t('activityEvent.recalled', { queueNumber: q })
      };
    case TicketHistoryAction.StatusChanged: {
      const reason = str(p.reason);
      const toStatus = str(p.to_status) ?? str(p.toStatus);
      const statusLabel = translateTicketStatusForActivity(toStatus, t);
      if (reason === 'force_release') {
        return {
          icon: AlertTriangle,
          iconClassName: 'text-orange-600 dark:text-orange-400',
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
          iconClassName: 'text-emerald-600 dark:text-emerald-400',
          line: t('activityEvent.statusTerminal', {
            queueNumber: q,
            status: statusLabel
          })
        };
      }
      if (toStatus === 'in_service') {
        return {
          icon: CircleDot,
          iconClassName: 'text-blue-600 dark:text-blue-400',
          line: t('activityEvent.statusInService', { queueNumber: q })
        };
      }
      return {
        icon: CircleDot,
        iconClassName: 'text-slate-600 dark:text-slate-400',
        line: t('activityEvent.statusChanged', {
          queueNumber: q,
          status: statusLabel
        })
      };
    }
    case TicketHistoryAction.Transferred: {
      const kind = str(p.transfer_kind);
      if (kind === 'zone') {
        const zone =
          str(p.to_zone_name) ||
          (str(p.to_service_zone_id) ?? '').trim() ||
          '—';
        const service = localizedServiceLabelFromPayload(p, 'to', locale);
        return {
          icon: ArrowRightLeft,
          iconClassName: 'text-indigo-600 dark:text-indigo-400',
          line: t('activityEvent.transferredZone', {
            queueNumber: q,
            zone,
            service
          })
        };
      }
      return {
        icon: ArrowRightLeft,
        iconClassName: 'text-indigo-600 dark:text-indigo-400',
        line: t('activityEvent.transferred', { queueNumber: q })
      };
    }
    case TicketHistoryAction.ReturnedToQueue:
      return {
        icon: Undo2,
        iconClassName: 'text-cyan-600 dark:text-cyan-400',
        line: t('activityEvent.returnedToQueue', { queueNumber: q })
      };
    case TicketHistoryAction.EODFlagged:
      return {
        icon: Moon,
        iconClassName: 'text-slate-500 dark:text-slate-400',
        line: t('activityEvent.eodFlagged', { queueNumber: q })
      };
    case TicketHistoryAction.VisitorUpdated:
      return {
        icon: UserRound,
        iconClassName: 'text-teal-600 dark:text-teal-400',
        line: t('activityEvent.visitorUpdated', { queueNumber: q })
      };
    case TicketHistoryAction.OperatorCommentUpdated: {
      const toComment = str(p.to_comment) ?? str(p.toComment);
      if (toComment && toComment.trim()) {
        return {
          icon: MessageSquare,
          iconClassName: 'text-rose-600 dark:text-rose-400',
          line: t('activityEvent.operatorCommentUpdatedWithSnippet', {
            queueNumber: q,
            snippet: truncateReason(toComment, COMMENT_SNIPPET_MAX)
          })
        };
      }
      return {
        icon: MessageSquare,
        iconClassName: 'text-rose-600 dark:text-rose-400',
        line: t('activityEvent.operatorCommentUpdated', { queueNumber: q })
      };
    }
    case TicketHistoryAction.VisitorTagsUpdated: {
      const added = strArray(p.added_tag_labels ?? p.addedTagLabels);
      const removed = strArray(p.removed_tag_labels ?? p.removedTagLabels);
      const reasonRaw = str(p.reason);
      const reasonTrimmed =
        reasonRaw && reasonRaw.trim()
          ? truncateReason(reasonRaw, VISITOR_TAGS_REASON_MAX)
          : '';

      if (added.length > 0 || removed.length > 0) {
        const segments: string[] = [];
        if (added.length > 0) {
          segments.push(
            t('activityEvent.visitorTagsAuditAdded', {
              list: added.join(', ')
            })
          );
        }
        if (removed.length > 0) {
          segments.push(
            t('activityEvent.visitorTagsAuditRemoved', {
              list: removed.join(', ')
            })
          );
        }
        const changes = segments.join('. ');
        if (reasonTrimmed) {
          return {
            icon: Tags,
            iconClassName: 'text-fuchsia-600 dark:text-fuchsia-400',
            line: t('activityEvent.visitorTagsUpdatedWithChangesAndReason', {
              queueNumber: q,
              changes,
              reason: reasonTrimmed
            })
          };
        }
        return {
          icon: Tags,
          iconClassName: 'text-fuchsia-600 dark:text-fuchsia-400',
          line: t('activityEvent.visitorTagsUpdatedWithChanges', {
            queueNumber: q,
            changes
          })
        };
      }

      if (reasonRaw && reasonRaw.trim()) {
        return {
          icon: Tags,
          iconClassName: 'text-fuchsia-600 dark:text-fuchsia-400',
          line: t('activityEvent.visitorTagsUpdatedWithReason', {
            queueNumber: q,
            reason: reasonTrimmed
          })
        };
      }
      return {
        icon: Tags,
        iconClassName: 'text-fuchsia-600 dark:text-fuchsia-400',
        line: t('activityEvent.visitorTagsUpdated', { queueNumber: q })
      };
    }
    default:
      return {
        icon: CircleDot,
        iconClassName: 'text-muted-foreground',
        line: t('activityEvent.generic', {
          queueNumber: q,
          action: item.action
        })
      };
  }
}
