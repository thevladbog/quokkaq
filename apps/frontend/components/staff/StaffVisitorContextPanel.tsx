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
import { Textarea } from '@/components/ui/textarea';
import { VisitTransferTrail } from '@/components/visitors/VisitTransferTrail';
import { Ticket, unitsApi } from '@/lib/api';
import {
  useClientVisits,
  useUpdateOperatorComment,
  useUpdateTicketVisitor
} from '@/lib/hooks';
import { ticketServiceDisplayName } from '@/lib/ticket-display';
import { cn } from '@/lib/utils';
import { Loader2, UserRoundSearch } from 'lucide-react';
import { toast } from 'sonner';
import PermissionGuard from '@/components/auth/permission-guard';
import { StaffVisitorSurveyResponses } from '@/components/staff/staff-visitor-survey-responses';

type TFn = (
  key: string,
  values?: Record<string, string | number | Date>
) => string;

export interface StaffVisitorContextPanelProps {
  unitId: string;
  ticket: Ticket;
  locale: string;
  t: TFn;
  className?: string;
}

function formatClientLine(
  client: NonNullable<Ticket['client']>,
  t: TFn
): string {
  if (client.isAnonymous) return t('current.anonymous_visitor');
  const name = [client.firstName, client.lastName]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ');
  const phone = client.phoneE164?.trim();
  if (name && phone) return `${name} · ${phone}`;
  return name || phone || t('current.unknown_visitor');
}

export function StaffVisitorContextPanel({
  unitId,
  ticket,
  locale,
  t,
  className
}: StaffVisitorContextPanelProps) {
  const client = ticket.client;
  const clientId = client?.isAnonymous ? undefined : client?.id;
  const [draft, setDraft] = useState(() => ticket.operatorComment ?? '');
  const [visitorModalOpen, setVisitorModalOpen] = useState(false);
  const [visitorQuery, setVisitorQuery] = useState('');
  const [debouncedVisitorQ, setDebouncedVisitorQ] = useState('');
  const [linkFirstName, setLinkFirstName] = useState('');
  const [linkLastName, setLinkLastName] = useState('');
  const [linkPhone, setLinkPhone] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const updateComment = useUpdateOperatorComment();
  const updateVisitor = useUpdateTicketVisitor();

  useEffect(() => {
    const timerId = window.setTimeout(
      () => setDebouncedVisitorQ(visitorQuery.trim()),
      400
    );
    return () => window.clearTimeout(timerId);
  }, [visitorQuery]);

  const resetVisitorLinkForm = () => {
    setVisitorQuery('');
    setDebouncedVisitorQ('');
    setLinkFirstName('');
    setLinkLastName('');
    setLinkPhone('');
    setSelectedClientId(null);
  };

  const onVisitorModalOpenChange = (open: boolean) => {
    setVisitorModalOpen(open);
    if (!open) {
      resetVisitorLinkForm();
    }
  };

  const openVisitorModal = () => {
    setVisitorQuery('');
    setDebouncedVisitorQ('');
    if (client && !client.isAnonymous) {
      setLinkFirstName(client.firstName ?? '');
      setLinkLastName(client.lastName ?? '');
      setLinkPhone(client.phoneE164 ?? '');
      setSelectedClientId(client.id);
    } else {
      setLinkFirstName('');
      setLinkLastName('');
      setLinkPhone('');
      setSelectedClientId(null);
    }
    setVisitorModalOpen(true);
  };

  const { data: visitsData, isLoading: visitsLoading } = useClientVisits(
    unitId,
    clientId,
    { enabled: !!clientId }
  );

  const visitorSearchEnabled =
    visitorModalOpen && debouncedVisitorQ.length >= 2;

  const { data: visitorHits = [], isFetching: visitorsFetching } = useQuery({
    queryKey: ['unitClientSearch', unitId, debouncedVisitorQ],
    queryFn: () => unitsApi.searchClients(unitId, debouncedVisitorQ),
    enabled: visitorSearchEnabled
  });

  const historyItems = useMemo(() => {
    const items = visitsData?.items ?? [];
    return items
      .filter((v) => v.id !== ticket.id)
      .slice()
      .sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      })
      .slice(0, 20);
  }, [visitsData?.items, ticket.id]);

  const trimmedDraft = draft.trim();
  const savedTrimmed = (ticket.operatorComment ?? '').trim();
  const dirty = trimmedDraft !== savedTrimmed;

  const handleSave = () => {
    updateComment.mutate(
      {
        id: ticket.id,
        operatorComment: trimmedDraft.length ? trimmedDraft : null
      },
      {
        onSuccess: () => toast.success(t('visitor_context.saved')),
        onError: () => toast.error(t('visitor_context.save_error'))
      }
    );
  };

  const onVisitorLinkSuccess = () => {
    toast.success(t('visitor_context.visitor_updated'));
    setVisitorModalOpen(false);
    resetVisitorLinkForm();
  };

  const onVisitorLinkError = (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    toast.error(t('visitor_context.visitor_update_failed'), {
      description: msg
    });
  };

  const handleSaveLinkedVisitor = () => {
    const fn = linkFirstName.trim();
    const ln = linkLastName.trim();
    const ph = linkPhone.trim();

    if (selectedClientId) {
      if (!fn && !ln) {
        toast.error(t('visitor_context.visitor_name_required'));
        return;
      }
      if (selectedClientId === clientId) {
        const sameFn =
          (client?.firstName ?? '').trim() === fn &&
          (client?.lastName ?? '').trim() === ln;
        if (sameFn) {
          onVisitorModalOpenChange(false);
          return;
        }
        updateVisitor.mutate(
          {
            ticketId: ticket.id,
            clientId: selectedClientId,
            firstName: fn,
            lastName: ln
          },
          {
            onSuccess: onVisitorLinkSuccess,
            onError: onVisitorLinkError
          }
        );
        return;
      }
      updateVisitor.mutate(
        {
          ticketId: ticket.id,
          clientId: selectedClientId,
          firstName: fn,
          lastName: ln
        },
        {
          onSuccess: onVisitorLinkSuccess,
          onError: onVisitorLinkError
        }
      );
      return;
    }

    if (!fn && !ln) {
      toast.error(t('visitor_context.visitor_name_required'));
      return;
    }
    if (!ph) {
      toast.error(t('visitor_context.visitor_phone_required'));
      return;
    }

    updateVisitor.mutate(
      { ticketId: ticket.id, firstName: fn, lastName: ln, phone: ph },
      {
        onSuccess: onVisitorLinkSuccess,
        onError: onVisitorLinkError
      }
    );
  };

  const formatWhen = (iso: string | null | undefined) => {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-GB', {
        dateStyle: 'short',
        timeStyle: 'short'
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  const canChangeVisitor =
    ticket.status === 'called' || ticket.status === 'in_service';

  return (
    <div
      className={cn(
        'border-border/60 bg-card rounded-xl border p-3 shadow-sm sm:p-4',
        className
      )}
    >
      <h3 className='text-foreground mb-3 text-sm font-semibold'>
        {t('visitor_context.title')}
      </h3>

      <div className='space-y-4'>
        {canChangeVisitor && (
          <div className='border-border/50 bg-muted/10 rounded-lg border p-2.5'>
            <div className='mb-2 flex items-start gap-2'>
              <UserRoundSearch className='text-muted-foreground mt-0.5 h-4 w-4 shrink-0' />
              <div className='min-w-0 flex-1'>
                <p className='text-foreground text-xs font-semibold'>
                  {t('visitor_context.visitor_on_ticket')}
                </p>
                <p className='text-muted-foreground mt-0.5 text-[11px] leading-snug'>
                  {t('visitor_context.change_visitor_hint')}
                </p>
              </div>
            </div>
            <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
              <p className='text-foreground min-w-0 text-sm'>
                {client ? (
                  <span className='block truncate'>
                    <span className='text-muted-foreground text-[10px] font-semibold tracking-wide uppercase'>
                      {t('visitor_context.current_visitor')}{' '}
                    </span>
                    {formatClientLine(client, t)}
                  </span>
                ) : (
                  <span className='text-muted-foreground text-sm'>
                    {t('visitor_context.no_client')}
                  </span>
                )}
              </p>
              <Dialog
                open={visitorModalOpen}
                onOpenChange={onVisitorModalOpenChange}
              >
                <Button
                  type='button'
                  variant='secondary'
                  size='sm'
                  className='h-8 shrink-0 gap-1.5'
                  disabled={updateVisitor.isPending}
                  onClick={openVisitorModal}
                >
                  {updateVisitor.isPending ? (
                    <Loader2 className='h-3.5 w-3.5 animate-spin' />
                  ) : (
                    <UserRoundSearch className='h-3.5 w-3.5' />
                  )}
                  {client && !client.isAnonymous
                    ? t('visitor_context.change_visitor')
                    : t('visitor_context.attach_visitor')}
                </Button>
                <DialogContent className='max-h-[min(90vh,40rem)] gap-0 overflow-hidden p-0 sm:max-w-md'>
                  <DialogHeader className='border-border/50 space-y-1 border-b px-4 py-3 text-left'>
                    <DialogTitle className='text-base'>
                      {t('visitor_context.link_modal_title')}
                    </DialogTitle>
                    <DialogDescription className='text-xs'>
                      {t('visitor_context.link_modal_description')}
                    </DialogDescription>
                  </DialogHeader>
                  <div className='max-h-[min(70vh,32rem)] space-y-3 overflow-y-auto px-4 py-3'>
                    <div>
                      <Label className='text-muted-foreground mb-1.5 block text-[10px] font-semibold tracking-wide uppercase'>
                        {t('visitor_context.search_directory')}
                      </Label>
                      <Input
                        value={visitorQuery}
                        onChange={(e) => setVisitorQuery(e.target.value)}
                        placeholder={t('visitor_context.search_visitor_ph')}
                        autoComplete='off'
                      />
                    </div>
                    <div className='border-border/50 max-h-40 overflow-y-auto rounded-md border'>
                      {debouncedVisitorQ.length > 0 &&
                        debouncedVisitorQ.length < 2 && (
                          <p className='text-muted-foreground p-2 text-xs'>
                            {t('visitor_context.visitor_min_chars')}
                          </p>
                        )}
                      {visitorSearchEnabled && visitorsFetching && (
                        <div className='text-muted-foreground flex items-center gap-2 p-2 text-xs'>
                          <Loader2 className='h-3.5 w-3.5 animate-spin' />
                          {t('visitor_context.visitor_loading')}
                        </div>
                      )}
                      {visitorSearchEnabled &&
                        !visitorsFetching &&
                        visitorHits.length === 0 &&
                        debouncedVisitorQ.length >= 2 && (
                          <p className='text-muted-foreground p-2 text-xs'>
                            {t('visitor_context.visitor_empty')}
                          </p>
                        )}
                      <ul className='divide-border/40 divide-y'>
                        {visitorHits.map((c) => (
                          <li key={c.id}>
                            <button
                              type='button'
                              disabled={updateVisitor.isPending}
                              className={cn(
                                'hover:bg-muted/50 w-full px-2 py-2 text-left text-sm',
                                'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
                                'disabled:pointer-events-none disabled:opacity-50',
                                selectedClientId === c.id &&
                                  'bg-muted/60 ring-ring ring-1 ring-inset'
                              )}
                              onClick={() => {
                                setSelectedClientId(c.id);
                                setLinkFirstName(c.firstName ?? '');
                                setLinkLastName(c.lastName ?? '');
                                setLinkPhone(c.phoneE164 ?? '');
                              }}
                            >
                              <span className='block truncate font-medium'>
                                {[c.firstName, c.lastName]
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
                    <p className='text-muted-foreground text-[11px] leading-snug'>
                      {t('visitor_context.pick_from_results')}
                    </p>
                    <div className='space-y-2'>
                      <div>
                        <Label
                          htmlFor='staff-link-first-name'
                          className='text-muted-foreground mb-1 block text-[10px] font-semibold tracking-wide uppercase'
                        >
                          {t('visitor_context.first_name')}
                        </Label>
                        <Input
                          id='staff-link-first-name'
                          value={linkFirstName}
                          onChange={(e) => setLinkFirstName(e.target.value)}
                          autoComplete='given-name'
                        />
                      </div>
                      <div>
                        <Label
                          htmlFor='staff-link-last-name'
                          className='text-muted-foreground mb-1 block text-[10px] font-semibold tracking-wide uppercase'
                        >
                          {t('visitor_context.last_name')}
                        </Label>
                        <Input
                          id='staff-link-last-name'
                          value={linkLastName}
                          onChange={(e) => setLinkLastName(e.target.value)}
                          autoComplete='family-name'
                        />
                      </div>
                      <div>
                        <Label
                          htmlFor='staff-link-phone'
                          className='text-muted-foreground mb-1 block text-[10px] font-semibold tracking-wide uppercase'
                        >
                          {t('visitor_context.phone')}
                        </Label>
                        <Input
                          id='staff-link-phone'
                          value={linkPhone}
                          onChange={(e) => {
                            setLinkPhone(e.target.value);
                            setSelectedClientId(null);
                          }}
                          type='tel'
                          autoComplete='tel'
                        />
                      </div>
                    </div>
                  </div>
                  <DialogFooter className='border-border/50 gap-2 border-t px-4 py-3 sm:justify-end'>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      onClick={() => onVisitorModalOpenChange(false)}
                      disabled={updateVisitor.isPending}
                    >
                      {t('visitor_context.cancel_modal')}
                    </Button>
                    <Button
                      type='button'
                      size='sm'
                      disabled={updateVisitor.isPending}
                      onClick={handleSaveLinkedVisitor}
                    >
                      {updateVisitor.isPending
                        ? t('visitor_context.saving_visitor')
                        : t('visitor_context.save_visitor')}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        )}

        {clientId ? (
          <PermissionGuard
            unitId={unitId}
            permissions={['ACCESS_SURVEY_RESPONSES']}
          >
            <StaffVisitorSurveyResponses unitId={unitId} clientId={clientId} />
          </PermissionGuard>
        ) : null}

        <div>
          <label
            htmlFor='staff-operator-comment'
            className='text-muted-foreground mb-1.5 block text-[10px] font-semibold tracking-wide uppercase'
          >
            {t('visitor_context.comment_label')}
          </label>
          <Textarea
            id='staff-operator-comment'
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            className='text-sm'
            placeholder={t('visitor_context.comment_placeholder')}
          />
          <div className='mt-2 flex justify-end'>
            <Button
              type='button'
              size='sm'
              className='h-8'
              disabled={!dirty || updateComment.isPending}
              onClick={handleSave}
            >
              {updateComment.isPending
                ? t('visitor_context.saving')
                : t('visitor_context.save')}
            </Button>
          </div>
        </div>

        <div className='border-border/50 border-t pt-3'>
          <p className='text-muted-foreground mb-2 text-[10px] font-semibold tracking-wide uppercase'>
            {t('visitor_context.history_title')}
          </p>
          {!client ? (
            <p className='text-muted-foreground text-sm'>
              {t('visitor_context.history_needs_visitor')}
            </p>
          ) : client.isAnonymous ? (
            <p className='text-muted-foreground text-sm'>
              {t('visitor_context.anonymous_hint')}
            </p>
          ) : visitsLoading ? (
            <p className='text-muted-foreground text-sm'>
              {t('visitor_context.history_loading')}
            </p>
          ) : historyItems.length === 0 ? (
            <p className='text-muted-foreground text-sm'>
              {t('visitor_context.no_history')}
            </p>
          ) : (
            <ul className='max-h-56 space-y-2 overflow-y-auto pr-1 text-sm'>
              {historyItems.map((v) => {
                const servedBy = (v.servedByName ?? '').trim();
                const visitComment = (v.operatorComment ?? '').trim();
                const serviceLabel = ticketServiceDisplayName(v, locale);
                return (
                  <li
                    key={v.id}
                    className='border-border/40 bg-muted/20 flex flex-col gap-1 rounded-md border px-2 py-1.5'
                  >
                    <div className='flex flex-wrap items-baseline justify-between gap-2'>
                      <span className='font-mono font-semibold tabular-nums'>
                        {v.queueNumber}
                      </span>
                      <span className='text-muted-foreground text-xs'>
                        {formatWhen(v.createdAt)}
                      </span>
                    </div>
                    <div className='text-muted-foreground flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-xs'>
                      <span className='text-foreground/90 shrink-0'>
                        {t(`statuses.${v.status}`)}
                      </span>
                      <span
                        className='text-muted-foreground/45 shrink-0'
                        aria-hidden
                      >
                        ·
                      </span>
                      <span className='min-w-0'>
                        <span className='text-muted-foreground/80'>
                          {t('visitor_context.history_service')}
                        </span>
                        : <span className='break-words'>{serviceLabel}</span>
                      </span>
                      {servedBy ? (
                        <>
                          <span
                            className='text-muted-foreground/45 shrink-0'
                            aria-hidden
                          >
                            ·
                          </span>
                          <span className='min-w-0'>
                            <span className='text-muted-foreground/80'>
                              {t('visitor_context.history_served_by')}
                            </span>
                            : {servedBy}
                          </span>
                        </>
                      ) : null}
                    </div>
                    <VisitTransferTrail
                      trail={v.transferTrail}
                      locale={locale}
                    />
                    {visitComment ? (
                      <div className='border-border/30 border-t pt-1'>
                        <p className='text-muted-foreground mb-0.5 text-[10px] font-semibold tracking-wide uppercase'>
                          {t('visitor_context.history_operator_note')}
                        </p>
                        <p className='text-muted-foreground text-xs break-words whitespace-pre-wrap'>
                          {visitComment}
                        </p>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
