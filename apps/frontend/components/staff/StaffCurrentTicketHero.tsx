'use client';

import { useMemo, useState } from 'react';
import { Info, Tags } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Ticket } from '@/lib/api';
import { useTicketTimer } from '@/lib/ticket-timer';
import { visitorTagPillStyles } from '@/lib/visitor-tag-styles';
import { VisitorPhotoFrame } from '@/components/staff/VisitorPhotoFrame';
import { StaffVisitorTagsEditModal } from '@/components/staff/StaffVisitorTagsEditModal';
import { cn } from '@/lib/utils';

type TFn = (
  key: string,
  values?: Record<string, string | number | Date>
) => string;

export interface StaffCurrentTicketHeroProps {
  unitId: string;
  ticket: Ticket;
  t: TFn;
  onShowDetails: () => void;
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'in_service':
      return 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200';
    case 'called':
      return 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100';
    default:
      return 'border-border bg-muted/80 text-foreground';
  }
}

export function StaffCurrentTicketHero({
  unitId,
  ticket,
  t,
  onShowDetails
}: StaffCurrentTicketHeroProps) {
  const [tagsModalOpen, setTagsModalOpen] = useState(false);
  const [tagsModalSession, setTagsModalSession] = useState(0);

  const openTagsModal = () => {
    setTagsModalSession((s) => s + 1);
    setTagsModalOpen(true);
  };
  const isInService = ticket.status === 'in_service';
  const client = ticket.client;

  const canChangeVisitor =
    ticket.status === 'called' || ticket.status === 'in_service';
  const canEditVisitorTags =
    canChangeVisitor && !!client && !client.isAnonymous;

  const { formatTime: formatServiceTime, elapsed: serviceElapsed } =
    useTicketTimer(isInService ? ticket.calledAt || undefined : undefined);

  const waitingSeconds = useMemo(() => {
    if (!ticket.createdAt || !ticket.calledAt) return 0;
    const start = new Date(ticket.createdAt).getTime();
    const end = new Date(ticket.calledAt).getTime();
    return Math.max(0, Math.floor((end - start) / 1000));
  }, [ticket.createdAt, ticket.calledAt]);

  const formatStaticTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const sortedTags = useMemo(() => {
    const defs = client?.definitions;
    if (!defs?.length) return [];
    return [...defs].sort((a, b) => {
      const ao = a.sortOrder ?? 0;
      const bo = b.sortOrder ?? 0;
      if (ao !== bo) return ao - bo;
      return a.label.localeCompare(b.label);
    });
  }, [client?.definitions]);

  const appliedTagIdsKey = useMemo(
    () =>
      [...(client?.definitions ?? [])]
        .map((d) => d.id)
        .sort()
        .join(','),
    [client?.definitions]
  );

  const displayName = client
    ? client.isAnonymous
      ? t('current.anonymous_visitor')
      : [client.firstName, client.lastName]
          .map((s) => s?.trim())
          .filter(Boolean)
          .join(' ') || t('current.unknown_visitor')
    : t('current.no_visitor_profile');

  return (
    <>
      <div
        className={cn(
          'border-border/60 bg-card rounded-lg border p-2.5 shadow-sm sm:p-3',
          isInService && 'ring-1 ring-emerald-500/30'
        )}
      >
        <div className='flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-4'>
          <div className='flex gap-2.5 sm:gap-3'>
            <div className='flex shrink-0 flex-col items-center sm:items-start'>
              <p className='text-muted-foreground mb-1.5 hidden text-[10px] font-semibold tracking-wide uppercase sm:block'>
                {t('current.visitor_section')}
              </p>
              <VisitorPhotoFrame
                size='md'
                photoUrl={client?.photoUrl}
                firstName={client?.firstName ?? ''}
                lastName={client?.lastName ?? ''}
                isAnonymous={client?.isAnonymous}
                ariaLabel={t('current.visitor_portrait_aria')}
              />
            </div>
            <div className='min-w-0 flex-1 pt-0 sm:pt-6'>
              <p className='text-muted-foreground mb-1 text-[10px] font-semibold tracking-wide uppercase sm:hidden'>
                {t('current.visitor_section')}
              </p>
              <p className='text-base leading-snug font-semibold sm:text-lg'>
                {displayName}
              </p>
              {client && !client.isAnonymous && client.phoneE164 && (
                <p className='text-muted-foreground mt-0.5 font-mono text-xs'>
                  {client.phoneE164}
                </p>
              )}
              {(sortedTags.length > 0 || canEditVisitorTags) && (
                <div className='mt-2 flex flex-wrap items-center gap-1.5'>
                  {sortedTags.map((tag) => (
                    <span
                      key={tag.id}
                      className='inline-flex max-w-[10rem] shrink-0 truncate rounded-full border border-transparent px-2.5 py-0.5 text-[11px] font-medium shadow-sm'
                      style={visitorTagPillStyles(tag.color)}
                      title={tag.label}
                    >
                      {tag.label}
                    </span>
                  ))}
                  {canEditVisitorTags && client && (
                    <Button
                      type='button'
                      variant='outline'
                      size='icon'
                      className='text-muted-foreground hover:text-foreground h-7 w-7 shrink-0 rounded-full'
                      onClick={openTagsModal}
                      aria-label={t('visitor_context.tags_edit_aria')}
                    >
                      <Tags className='h-3.5 w-3.5' />
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className='border-border/50 flex min-w-0 flex-1 flex-col gap-3 border-t pt-3 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-5'>
            <div className='flex flex-wrap items-end justify-between gap-3'>
              <div>
                <div className='mb-1.5 flex flex-wrap items-center gap-2'>
                  <span
                    className={cn(
                      'inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase',
                      statusBadgeClass(ticket.status)
                    )}
                  >
                    {t(`statuses.${ticket.status}`)}
                  </span>
                  <span className='text-muted-foreground text-[10px] font-semibold tracking-wide uppercase'>
                    {t('queue.number')}
                  </span>
                </div>
                <p className='font-mono text-3xl font-bold tracking-tight tabular-nums sm:text-4xl'>
                  {ticket.queueNumber}
                </p>
              </div>
              <div className='flex flex-wrap gap-2'>
                <div className='bg-muted/50 border-border/50 rounded-lg border px-2.5 py-1.5'>
                  <div className='text-muted-foreground text-[9px] font-semibold tracking-wide uppercase'>
                    {t('queue.waiting')}
                  </div>
                  <div className='font-mono text-base font-semibold tabular-nums'>
                    {formatStaticTime(waitingSeconds)}
                  </div>
                </div>
                {ticket.maxWaitingTime != null && ticket.maxWaitingTime > 0 && (
                  <div className='bg-muted/50 border-border/50 rounded-lg border px-2.5 py-1.5'>
                    <div className='text-muted-foreground text-[9px] font-semibold tracking-wide uppercase'>
                      {t('queue.max_label')}
                    </div>
                    <div className='text-muted-foreground font-mono text-sm font-semibold tabular-nums'>
                      {formatStaticTime(ticket.maxWaitingTime)}
                    </div>
                  </div>
                )}
                {isInService && (
                  <div className='rounded-lg border border-emerald-500/30 bg-emerald-50/90 px-2.5 py-1.5 dark:bg-emerald-950/40'>
                    <div className='text-muted-foreground text-[9px] font-semibold tracking-wide uppercase'>
                      {t('queue.service_time')}
                    </div>
                    <div className='font-mono text-lg font-bold text-emerald-700 tabular-nums dark:text-emerald-400'>
                      {formatServiceTime(serviceElapsed)}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {ticket.preRegistration && (
              <div className='border-border/60 bg-muted/20 rounded-lg border p-2.5'>
                <div className='text-muted-foreground mb-1 flex items-center justify-between gap-2 text-[10px] font-semibold tracking-wide uppercase'>
                  <span>{t('pre_registration.title')}</span>
                  <Button
                    variant='ghost'
                    size='icon'
                    className='h-7 w-7 shrink-0'
                    onClick={onShowDetails}
                  >
                    <Info className='h-3.5 w-3.5' />
                    <span className='sr-only'>
                      {t('pre_registration.details_title')}
                    </span>
                  </Button>
                </div>
                <div className='text-sm font-medium'>
                  {[
                    ticket.preRegistration.customerFirstName,
                    ticket.preRegistration.customerLastName
                  ]
                    .map((s) => s?.trim())
                    .filter(Boolean)
                    .join(' ') || '—'}
                </div>
                <div className='text-muted-foreground text-xs'>
                  {ticket.preRegistration.customerPhone}
                </div>
                {ticket.preRegistration.comment && (
                  <div className='text-muted-foreground mt-1 text-xs italic'>
                    &quot;{ticket.preRegistration.comment}&quot;
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      {canEditVisitorTags && client && (
        <StaffVisitorTagsEditModal
          key={`${ticket.id}-${appliedTagIdsKey}-${tagsModalSession}`}
          open={tagsModalOpen}
          onOpenChange={setTagsModalOpen}
          unitId={unitId}
          ticketId={ticket.id}
          client={client}
          t={t}
        />
      )}
    </>
  );
}
