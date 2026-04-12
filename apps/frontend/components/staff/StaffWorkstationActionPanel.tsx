'use client';

import {
  ArrowRightLeft,
  Ban,
  CheckCircle2,
  PhoneForwarded
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
  onCallNext: () => void;
  onConfirmArrival: () => void;
  onComplete: () => void;
  onOpenTransfer: () => void;
  onNoShow: () => void;
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
  onCallNext,
  onConfirmArrival,
  onComplete,
  onOpenTransfer,
  onNoShow
}: StaffWorkstationActionPanelProps) {
  const hasCurrent = Boolean(currentTicket);
  const callNextDisabled =
    workstationOnBreak || callNextPending || waitingCount === 0 || hasCurrent;

  return (
    <div
      className={cn(
        'border-border/60 bg-muted/20 flex flex-col gap-3 rounded-lg border p-2.5',
        'sm:flex-row sm:flex-wrap sm:items-center'
      )}
    >
      <div className='flex min-w-0 flex-1 flex-wrap gap-3'>
        <Button
          size='sm'
          className={cn(
            'h-9 flex-1 font-semibold sm:min-w-[10rem] sm:flex-none',
            'bg-primary text-primary-foreground hover:bg-primary/90'
          )}
          onClick={onCallNext}
          disabled={callNextDisabled}
        >
          <PhoneForwarded className='mr-1.5 h-4 w-4 shrink-0' />
          {callNextPending ? t('processing') : t('actions.callNext')}
        </Button>
        {currentTicket?.status === 'called' && (
          <Button
            size='sm'
            className='h-9 flex-1 border-0 bg-emerald-600 font-semibold text-white hover:bg-emerald-700 sm:min-w-[11rem] sm:flex-none'
            onClick={onConfirmArrival}
            disabled={workstationOnBreak || confirmArrivalPending}
          >
            <CheckCircle2 className='mr-1.5 h-4 w-4 shrink-0' />
            {t('actions.startService')}
          </Button>
        )}
      </div>
      <div className='flex flex-wrap gap-3 sm:ml-auto'>
        <Button
          size='sm'
          variant='outline'
          className='h-9 min-w-[7rem] flex-1 font-medium sm:flex-none'
          onClick={onComplete}
          disabled={workstationOnBreak || !hasCurrent || completePending}
        >
          <CheckCircle2 className='mr-1.5 h-3.5 w-3.5' />
          {t('current.complete')}
        </Button>
        <Button
          size='sm'
          variant='outline'
          className='h-9 min-w-[7rem] flex-1 font-medium sm:flex-none'
          onClick={onOpenTransfer}
          disabled={workstationOnBreak || !hasCurrent || transferPending}
        >
          <ArrowRightLeft className='mr-1.5 h-3.5 w-3.5' />
          {t('actions.transfer')}
        </Button>
        <Button
          size='sm'
          variant='outline'
          className='text-destructive hover:text-destructive h-9 min-w-[7rem] flex-1 border-red-200/80 bg-red-50/50 font-medium hover:bg-red-50 sm:flex-none dark:border-red-900/50 dark:bg-red-950/25 dark:hover:bg-red-950/40'
          onClick={onNoShow}
          disabled={workstationOnBreak || !hasCurrent || noShowPending}
        >
          <Ban className='mr-1.5 h-3.5 w-3.5' />
          {t('actions.noShow')}
        </Button>
      </div>
    </div>
  );
}
