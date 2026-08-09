'use client';

import {
  ArrowRightLeft,
  Ban,
  CheckCircle2,
  PhoneCall,
  PhoneForwarded,
  Play,
  Undo2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Ticket } from '@/lib/api';
import { getStaffPrimaryAction } from '@/lib/staff-workstation-view';

type TFn = (
  key: string,
  values?: Record<string, string | number | Date>
) => string;

export interface StaffWorkstationActionPanelProps {
  t: TFn;
  workstationOnBreak?: boolean;
  currentTicket: Ticket | undefined;
  waitingCount: number;
  conflictingActionPending: boolean;
  actionError?: string | null;
  resumePending?: boolean;
  releasePending?: boolean;
  callNextPending: boolean;
  confirmArrivalPending: boolean;
  completePending: boolean;
  transferPending: boolean;
  noShowPending: boolean;
  returnToQueuePending?: boolean;
  recallPending?: boolean;
  onResume?: () => void;
  onCallNext: () => void;
  onConfirmArrival: () => void;
  onComplete: () => void;
  onOpenTransfer: () => void;
  onNoShow: () => void;
  onReturnToQueue?: () => void;
  onRecall?: () => void;
}

export function StaffWorkstationActionPanel({
  t,
  workstationOnBreak = false,
  currentTicket,
  waitingCount,
  conflictingActionPending,
  actionError = null,
  resumePending = false,
  releasePending = false,
  callNextPending,
  confirmArrivalPending,
  completePending,
  transferPending,
  noShowPending,
  returnToQueuePending = false,
  recallPending = false,
  onResume,
  onCallNext,
  onConfirmArrival,
  onComplete,
  onOpenTransfer,
  onNoShow,
  onReturnToQueue,
  onRecall
}: StaffWorkstationActionPanelProps) {
  const primaryAction = getStaffPrimaryAction(
    currentTicket?.status,
    workstationOnBreak
  );
  const isCalled = currentTicket?.status === 'called';
  const isInService = currentTicket?.status === 'in_service';
  const showReturnToQueue =
    Boolean(onReturnToQueue) && (isCalled || isInService);
  const showRecall = Boolean(onRecall) && isCalled;
  const showTransfer = isCalled || isInService;
  const showNoShow = isCalled;
  const isCallNextDisabled =
    waitingCount === 0 || conflictingActionPending || callNextPending;

  return (
    <div className='border-border/60 bg-muted/20 flex flex-col gap-3 rounded-lg border p-2.5'>
      {primaryAction === 'call_next' && (
        <Button
          type='button'
          className='h-11 w-full font-semibold'
          data-variant='primary-workflow'
          onClick={onCallNext}
          disabled={isCallNextDisabled}
          aria-busy={callNextPending || undefined}
        >
          <PhoneForwarded className='h-4 w-4' />
          {callNextPending
            ? t('actions.processing_action')
            : t('actions.callNext')}
        </Button>
      )}
      {primaryAction === 'start_service' && (
        <Button
          type='button'
          className='h-11 w-full font-semibold'
          data-variant='primary-workflow'
          onClick={onConfirmArrival}
          disabled={conflictingActionPending || confirmArrivalPending}
          aria-busy={confirmArrivalPending || undefined}
        >
          <CheckCircle2 className='h-4 w-4' />
          {confirmArrivalPending
            ? t('actions.processing_action')
            : t('actions.startService')}
        </Button>
      )}
      {primaryAction === 'complete' && (
        <Button
          type='button'
          className='h-11 w-full font-semibold'
          data-variant='primary-workflow'
          onClick={onComplete}
          disabled={conflictingActionPending || completePending}
          aria-busy={completePending || undefined}
        >
          <CheckCircle2 className='h-4 w-4' />
          {completePending
            ? t('actions.processing_action')
            : t('current.complete')}
        </Button>
      )}
      {primaryAction === 'resume' && (
        <Button
          type='button'
          className='h-11 w-full font-semibold'
          data-variant='primary-workflow'
          onClick={onResume}
          disabled={
            !onResume ||
            conflictingActionPending ||
            resumePending ||
            releasePending
          }
          aria-busy={resumePending || undefined}
        >
          <Play className='h-4 w-4' />
          {resumePending
            ? t('actions.processing_action')
            : t('workstation.resume')}
        </Button>
      )}

      {primaryAction === 'call_next' && waitingCount === 0 && (
        <p className='text-muted-foreground text-sm' role='status'>
          {t('actions.call_next_empty_reason')}
        </p>
      )}
      {primaryAction === 'resume' && (
        <p className='text-muted-foreground text-sm' role='status'>
          {t('actions.disabled_on_break_reason')}
        </p>
      )}
      {actionError && (
        <p className='text-destructive text-sm' role='alert'>
          {t('actions.action_error', { message: actionError })}
        </p>
      )}

      {primaryAction !== 'resume' &&
      (showRecall || showNoShow || showReturnToQueue || showTransfer) ? (
        <div className='flex flex-wrap items-start gap-3'>
          {showRecall && (
            <Button
              type='button'
              size='sm'
              variant='outline'
              className='h-9 font-medium'
              title={t('actions.recall_hint')}
              onClick={onRecall}
              disabled={conflictingActionPending || recallPending}
            >
              <PhoneCall className='h-4 w-4' />
              {recallPending
                ? t('actions.processing_action')
                : t('actions.recall')}
            </Button>
          )}
          {showNoShow && (
            <Button
              type='button'
              size='sm'
              variant='outline'
              className='text-destructive hover:text-destructive h-9 border-red-200/80 bg-red-50/50 font-medium hover:bg-red-50 dark:border-red-900/50 dark:bg-red-950/25 dark:hover:bg-red-950/40'
              onClick={onNoShow}
              disabled={conflictingActionPending || noShowPending}
            >
              <Ban className='h-3.5 w-3.5' />
              {t('actions.noShow')}
            </Button>
          )}
          {showReturnToQueue && (
            <Button
              type='button'
              size='sm'
              variant='outline'
              className='h-9 font-medium'
              title={t('actions.returnToQueue_hint')}
              onClick={onReturnToQueue}
              disabled={conflictingActionPending || returnToQueuePending}
            >
              <Undo2 className='h-4 w-4' />
              {returnToQueuePending
                ? t('actions.processing_action')
                : t('actions.returnToQueue')}
            </Button>
          )}
          {showTransfer && (
            <Button
              type='button'
              size='sm'
              variant='outline'
              className='h-9 font-medium'
              onClick={onOpenTransfer}
              disabled={conflictingActionPending || transferPending}
            >
              <ArrowRightLeft className='h-3.5 w-3.5' />
              {t('actions.transfer')}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
