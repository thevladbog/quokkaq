'use client';

import {
  ArrowRightLeft,
  Ban,
  CheckCircle2,
  PhoneForwarded,
  Undo2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Ticket } from '@/lib/api';
import { cn } from '@/lib/utils';

type TFn = (
  key: string,
  values?: Record<string, string | number | Date>
) => string;

export interface StaffWorkstationActionPanelProps {
  t: TFn;
  /** When true, all queue actions are disabled (operator on break). */
  workstationOnBreak?: boolean;
  currentTicket: Ticket | undefined;
  waitingCount: number;
  callNextPending: boolean;
  confirmArrivalPending: boolean;
  completePending: boolean;
  transferPending: boolean;
  noShowPending: boolean;
  returnToQueuePending?: boolean;
  onCallNext: () => void;
  onConfirmArrival: () => void;
  onComplete: () => void;
  onOpenTransfer: () => void;
  onNoShow: () => void;
  onReturnToQueue?: () => void;
}

export function StaffWorkstationActionPanel({
  t,
  workstationOnBreak = false,
  currentTicket,
  waitingCount,
  callNextPending,
  confirmArrivalPending,
  completePending,
  transferPending,
  noShowPending,
  returnToQueuePending = false,
  onCallNext,
  onConfirmArrival,
  onComplete,
  onOpenTransfer,
  onNoShow,
  onReturnToQueue
}: StaffWorkstationActionPanelProps) {
  const hasCurrent = Boolean(currentTicket);
  const callNextDisabled =
    workstationOnBreak || callNextPending || waitingCount === 0 || hasCurrent;
  /** Call next is always disabled here; hiding saves vertical space until the guest is confirmed. */
  const showCallNext = currentTicket?.status !== 'called';
  const showReturnToQueue =
    Boolean(onReturnToQueue) &&
    (currentTicket?.status === 'called' ||
      currentTicket?.status === 'in_service');

  return (
    <div className='border-border/60 bg-muted/20 flex flex-col gap-3 rounded-lg border p-2.5'>
      <div className='flex min-w-0 flex-wrap items-start gap-3'>
        {showCallNext ? (
          <Button
            size='sm'
            className={cn(
              'h-9 min-w-[10rem] shrink-0 font-semibold',
              'bg-primary text-primary-foreground hover:bg-primary/90'
            )}
            onClick={onCallNext}
            disabled={callNextDisabled}
          >
            <PhoneForwarded className='mr-1.5 h-4 w-4 shrink-0' />
            {callNextPending ? t('processing') : t('actions.callNext')}
          </Button>
        ) : null}
        {currentTicket?.status === 'called' && (
          <Button
            size='sm'
            className='h-9 min-w-[11rem] shrink-0 border-0 bg-emerald-600 font-semibold text-white hover:bg-emerald-700'
            onClick={onConfirmArrival}
            disabled={workstationOnBreak || confirmArrivalPending}
          >
            <CheckCircle2 className='mr-1.5 h-4 w-4 shrink-0' />
            {t('actions.startService')}
          </Button>
        )}
        <Button
          size='sm'
          variant='outline'
          className='h-9 min-w-[7rem] shrink-0 font-medium'
          onClick={onComplete}
          disabled={workstationOnBreak || !hasCurrent || completePending}
        >
          <CheckCircle2 className='mr-1.5 h-3.5 w-3.5' />
          {t('current.complete')}
        </Button>
        <Button
          size='sm'
          variant='outline'
          className='h-9 min-w-[7rem] shrink-0 font-medium'
          onClick={onOpenTransfer}
          disabled={workstationOnBreak || !hasCurrent || transferPending}
        >
          <ArrowRightLeft className='mr-1.5 h-3.5 w-3.5' />
          {t('actions.transfer')}
        </Button>
        <Button
          size='sm'
          variant='outline'
          className='text-destructive hover:text-destructive h-9 min-w-[7rem] shrink-0 border-red-200/80 bg-red-50/50 font-medium hover:bg-red-50 dark:border-red-900/50 dark:bg-red-950/25 dark:hover:bg-red-950/40'
          onClick={onNoShow}
          disabled={workstationOnBreak || !hasCurrent || noShowPending}
        >
          <Ban className='mr-1.5 h-3.5 w-3.5' />
          {t('actions.noShow')}
        </Button>
      </div>
      {showReturnToQueue ? (
        <div className='flex flex-wrap items-start gap-3'>
          <Button
            type='button'
            size='sm'
            variant='outline'
            className='h-9 min-w-[9rem] shrink-0 font-medium'
            title={t('actions.returnToQueue_hint')}
            onClick={onReturnToQueue}
            disabled={
              workstationOnBreak ||
              returnToQueuePending ||
              transferPending ||
              completePending ||
              noShowPending
            }
          >
            <Undo2 className='mr-1.5 h-4 w-4 shrink-0' />
            {returnToQueuePending
              ? t('processing')
              : t('actions.returnToQueue')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
