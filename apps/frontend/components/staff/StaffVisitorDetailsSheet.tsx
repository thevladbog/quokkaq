'use client';

import { useRef } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet';
import type { Ticket } from '@/lib/api';
import { StaffVisitorContextPanel } from './StaffVisitorContextPanel';

type TFn = (
  key: string,
  values?: Record<string, string | number | Date>
) => string;

export interface StaffVisitorDetailsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unitId: string;
  ticket: Ticket | undefined;
  locale: string;
  t: TFn;
}

export function StaffVisitorDetailsSheet({
  open,
  onOpenChange,
  unitId,
  ticket,
  locale,
  t
}: StaffVisitorDetailsSheetProps) {
  const openerRef = useRef<HTMLElement | null>(null);

  if (!ticket) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className='w-full overflow-hidden sm:max-w-xl'
        onOpenAutoFocus={() => {
          const activeElement = document.activeElement;
          openerRef.current =
            activeElement instanceof HTMLElement ? activeElement : null;
        }}
        onCloseAutoFocus={(event) => {
          if (openerRef.current?.isConnected) {
            event.preventDefault();
            openerRef.current.focus();
          }
        }}
      >
        <SheetHeader className='border-border/50 shrink-0 space-y-1 border-b px-4 py-3 text-left'>
          <SheetTitle>{t('visitor_context.details_title')}</SheetTitle>
          <SheetDescription>
            {t('visitor_context.details_description')}
          </SheetDescription>
        </SheetHeader>
        <div
          data-testid='staff-visitor-details-sheet-body'
          className='min-h-0 flex-1 overflow-y-auto px-4 pb-4'
        >
          <StaffVisitorContextPanel
            unitId={unitId}
            ticket={ticket}
            locale={locale}
            t={t}
            variant='sheet'
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
