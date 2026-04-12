'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { unitsApi, type UnitClient } from '@/lib/api';
import { Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type TFn = (
  key: string,
  values?: Record<string, string | number | Date>
) => string;

export interface StaffCreateTicketLeaf {
  id: string;
  label: string;
}

export interface StaffCreateTicketModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unitId: string;
  leaves: StaffCreateTicketLeaf[];
  isPending: boolean;
  onCreate: (input: { serviceId: string; clientId?: string }) => void;
  t: TFn;
}

function formatVisitorChip(c: UnitClient): string {
  const name = [c.firstName ?? '', c.lastName ?? '']
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ');
  const phone = (c.phoneE164 ?? '').trim();
  if (name && phone) return `${name} · ${phone}`;
  return name || phone || '—';
}

export function StaffCreateTicketModal({
  open,
  onOpenChange,
  unitId,
  leaves,
  isPending,
  onCreate,
  t
}: StaffCreateTicketModalProps) {
  const [serviceId, setServiceId] = useState('');
  const [selectedVisitor, setSelectedVisitor] = useState<UnitClient | null>(
    null
  );
  const [visitorPopoverOpen, setVisitorPopoverOpen] = useState(false);
  const [visitorQuery, setVisitorQuery] = useState('');
  const [debouncedVisitorQ, setDebouncedVisitorQ] = useState('');

  useEffect(() => {
    const timerId = window.setTimeout(
      () => setDebouncedVisitorQ(visitorQuery.trim()),
      400
    );
    return () => window.clearTimeout(timerId);
  }, [visitorQuery]);

  const serviceOptions: ComboboxOption[] = useMemo(
    () =>
      leaves.map((l) => ({
        value: l.id,
        label: l.label,
        keywords: [l.label, l.id]
      })),
    [leaves]
  );

  const visitorSearchEnabled =
    open && visitorPopoverOpen && debouncedVisitorQ.length >= 2;

  const {
    data: visitorHits = [],
    isFetching: visitorsFetching,
    isError: visitorsSearchError,
    error: visitorsSearchErr
  } = useQuery({
    queryKey: ['unitClientSearch', unitId, debouncedVisitorQ],
    queryFn: () => unitsApi.searchClients(unitId, debouncedVisitorQ),
    enabled: visitorSearchEnabled
  });

  const handleSubmit = () => {
    if (!serviceId) return;
    onCreate({
      serviceId,
      clientId: selectedVisitor?.id
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-md sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{t('create_ticket.title')}</DialogTitle>
          <DialogDescription>
            {t('create_ticket.description')}
          </DialogDescription>
        </DialogHeader>

        <div className='grid gap-4 py-2'>
          <div className='grid gap-2'>
            <Label htmlFor='create-ticket-service'>
              {t('create_ticket.service_label')}
            </Label>
            <Combobox
              options={serviceOptions}
              value={serviceId}
              onChange={(v) => setServiceId(v)}
              placeholder={t('create_ticket.service_placeholder')}
              searchPlaceholder={t('create_ticket.service_search')}
              emptyText={t('create_ticket.service_empty')}
              allowClear={false}
            />
          </div>

          <div className='grid gap-2'>
            <div>
              <Label>{t('create_ticket.visitor_label')}</Label>
              <p className='text-muted-foreground mt-0.5 text-[11px] leading-snug'>
                {t('create_ticket.visitor_hint')}
              </p>
            </div>
            {selectedVisitor ? (
              <div className='border-border/60 bg-muted/20 flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-sm'>
                <span className='min-w-0 truncate'>
                  {formatVisitorChip(selectedVisitor)}
                </span>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  className='h-8 w-8 shrink-0'
                  onClick={() => setSelectedVisitor(null)}
                  aria-label={t('create_ticket.visitor_clear')}
                >
                  <X className='h-4 w-4' />
                </Button>
              </div>
            ) : (
              <Popover
                open={visitorPopoverOpen}
                onOpenChange={setVisitorPopoverOpen}
              >
                <PopoverTrigger asChild>
                  <Button
                    type='button'
                    variant='outline'
                    className='h-10 w-full justify-start font-normal'
                  >
                    {t('create_ticket.visitor_placeholder')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className='w-[var(--radix-popover-trigger-width)] p-2'
                  align='start'
                >
                  <Input
                    value={visitorQuery}
                    onChange={(e) => setVisitorQuery(e.target.value)}
                    placeholder={t('create_ticket.visitor_search_ph')}
                    autoComplete='off'
                  />
                  <div className='border-border/50 mt-2 max-h-48 overflow-y-auto rounded-md border'>
                    {debouncedVisitorQ.length > 0 &&
                      debouncedVisitorQ.length < 2 && (
                        <p className='text-muted-foreground p-2 text-xs'>
                          {t('create_ticket.visitor_min_chars')}
                        </p>
                      )}
                    {visitorSearchEnabled && visitorsFetching && (
                      <div className='text-muted-foreground flex items-center gap-2 p-2 text-xs'>
                        <Loader2 className='h-3.5 w-3.5 animate-spin' />
                        {t('create_ticket.visitor_loading')}
                      </div>
                    )}
                    {visitorSearchEnabled &&
                      !visitorsFetching &&
                      visitorsSearchError && (
                        <p className='text-destructive p-2 text-xs'>
                          {t('create_ticket.visitor_search_error', {
                            message:
                              visitorsSearchErr instanceof Error
                                ? visitorsSearchErr.message
                                : ''
                          })}
                        </p>
                      )}
                    {visitorSearchEnabled &&
                      !visitorsFetching &&
                      !visitorsSearchError &&
                      visitorHits.length === 0 &&
                      debouncedVisitorQ.length >= 2 && (
                        <p className='text-muted-foreground p-2 text-xs'>
                          {t('create_ticket.visitor_empty')}
                        </p>
                      )}
                    <ul className='divide-border/40 divide-y'>
                      {visitorSearchEnabled &&
                        !visitorsSearchError &&
                        visitorHits.map((c) => (
                          <li key={c.id}>
                            <button
                              type='button'
                              className={cn(
                                'hover:bg-muted/50 w-full px-2 py-2 text-left text-sm',
                                'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none'
                              )}
                              onClick={() => {
                                setSelectedVisitor(c);
                                setVisitorPopoverOpen(false);
                                setVisitorQuery('');
                              }}
                            >
                              <span className='block truncate font-medium'>
                                {[c.firstName ?? '', c.lastName ?? '']
                                  .map((s) => s.trim())
                                  .filter(Boolean)
                                  .join(' ') || '—'}
                              </span>
                              {c.phoneE164 && (
                                <span className='text-muted-foreground font-mono text-xs'>
                                  {c.phoneE164}
                                </span>
                              )}
                            </button>
                          </li>
                        ))}
                    </ul>
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>
        </div>

        <DialogFooter className='gap-3 sm:flex-row sm:justify-end'>
          <Button
            type='button'
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            {t('cancel')}
          </Button>
          <Button
            type='button'
            onClick={handleSubmit}
            disabled={!serviceId || isPending}
          >
            {isPending
              ? t('create_ticket.submitting')
              : t('create_ticket.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
