'use client';

import { Ticket } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { useTranslations } from 'next-intl';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';

interface CalledTicketsTableProps {
  tickets: Ticket[];
  backgroundColor?: string;
  /** Max rows in the unified list; 0 or unset = show all */
  historyLimit?: number;
}

const layoutTransition = { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const };

function CalledTicketLiveAnnouncer({
  ticket,
  rowStatusLabel,
  rowCounterLabel,
  statusText
}: {
  ticket: Ticket;
  rowStatusLabel: string;
  rowCounterLabel: string;
  statusText: string;
}) {
  const counter = ticket.counter?.name?.trim() || '';
  const text = `${ticket.queueNumber}. ${rowStatusLabel}: ${statusText}${counter ? `. ${rowCounterLabel}: ${counter}` : ''}`;
  return (
    <div className='sr-only' aria-live='polite' aria-atomic='true'>
      {text}
    </div>
  );
}

function ticketStatusKey(
  status: string
): 'waiting' | 'called' | 'in_service' | 'served' | 'completed' | 'skipped' {
  if (status === 'waiting') return 'waiting';
  if (status === 'called') return 'called';
  if (status === 'in_service') return 'in_service';
  if (status === 'served' || status === 'completed') return 'served';
  if (status === 'no_show' || status === 'skipped') return 'skipped';
  return 'waiting';
}

export function CalledTicketsTable({
  tickets,
  backgroundColor,
  historyLimit = 0
}: CalledTicketsTableProps) {
  const t = useTranslations('screen');
  const tStatus = useTranslations('staff.statuses');

  const displayed = historyLimit > 0 ? tickets.slice(0, historyLimit) : tickets;

  const statusLabel = (ticket: Ticket) =>
    tStatus(ticketStatusKey(ticket.status));

  const calledTicket = displayed.find((x) => x.status === 'called');

  const RowDivider = ({
    toneClass,
    orientation
  }: {
    toneClass: string;
    orientation: 'horizontal' | 'vertical';
  }) => {
    if (orientation === 'horizontal') {
      return (
        <div
          className={`my-1 h-px w-full shrink-0 sm:hidden ${toneClass}`}
          aria-hidden
        />
      );
    }
    return (
      <div
        className={`hidden w-px shrink-0 self-stretch sm:my-4 sm:block ${toneClass}`}
        aria-hidden
      />
    );
  };

  return (
    <div
      className='bg-background flex h-full flex-col gap-3 p-4'
      style={{ backgroundColor: backgroundColor || undefined }}
    >
      <div className='text-muted-foreground shrink-0 text-center text-lg tracking-widest uppercase md:text-2xl'>
        {t('nowServing')}
      </div>

      {calledTicket ? (
        <CalledTicketLiveAnnouncer
          key={calledTicket.id}
          ticket={calledTicket}
          rowStatusLabel={t('row_status_label')}
          rowCounterLabel={t('row_counter_label')}
          statusText={tStatus(ticketStatusKey(calledTicket.status))}
        />
      ) : null}

      <LayoutGroup>
        <div className='flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1'>
          <AnimatePresence initial={false} mode='popLayout'>
            {displayed.map((ticket) => {
              const isCalled = ticket.status === 'called';
              const isInService = ticket.status === 'in_service';
              const isServed =
                ticket.status === 'served' || ticket.status === 'completed';

              let rowShell =
                'rounded-xl border bg-card/50 text-card-foreground border-border/50';
              if (isCalled) {
                rowShell =
                  'rounded-xl border-none bg-primary text-primary-foreground shadow-lg';
              } else if (isInService) {
                rowShell =
                  'rounded-xl border bg-green-100 text-green-950 border-green-200 dark:bg-green-900/25 dark:text-green-50 dark:border-green-800';
              } else if (isServed) {
                rowShell =
                  'rounded-xl border bg-muted/60 text-muted-foreground border-border/60 opacity-90';
              }

              const labelTone = isCalled
                ? 'text-primary-foreground/75'
                : 'text-muted-foreground';
              const ticketCounterSize = isCalled
                ? 'text-4xl leading-none font-black tracking-tighter md:text-5xl lg:text-6xl'
                : 'text-2xl font-black tracking-tight md:text-3xl lg:text-4xl';
              const statusSize = isCalled
                ? 'text-base font-semibold leading-snug md:text-lg'
                : 'text-sm font-semibold md:text-base';

              const dividerTone = isCalled
                ? 'bg-primary-foreground/25'
                : isInService
                  ? 'bg-green-800/20 dark:bg-green-300/30'
                  : 'bg-border/80';

              const statusAnimKey = `${ticket.id}:${ticket.status}`;

              const inner = (
                <div
                  className={`flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-6 md:gap-10 ${isCalled ? 'px-4 py-5 md:px-6 md:py-6' : 'px-4 py-3 md:px-5 md:py-4'}`}
                >
                  {/* Слева: фиксированная зона талона | черта | статус (без flex-1 — иначе «центрируется» в строке) */}
                  <div className='flex min-w-0 shrink-0 flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-0'>
                    <div className='min-w-0 sm:w-[14rem] md:w-[16rem] lg:w-[18rem]'>
                      <div
                        className={`mb-1 text-[10px] font-semibold tracking-wider uppercase md:text-xs ${labelTone}`}
                      >
                        {t('row_ticket_label')}
                      </div>
                      <div className={`truncate ${ticketCounterSize}`}>
                        {ticket.queueNumber}
                      </div>
                    </div>

                    <RowDivider
                      toneClass={dividerTone}
                      orientation='vertical'
                    />

                    <div className='flex min-w-0 shrink-0 flex-col justify-center text-left sm:max-w-[20rem] sm:pl-2 md:max-w-[24rem] md:pl-3'>
                      <div
                        className={`mb-1 text-[10px] font-semibold tracking-wider uppercase md:text-xs ${labelTone}`}
                      >
                        {t('row_status_label')}
                      </div>
                      {isCalled ? (
                        <div className={`${statusSize} max-w-full`}>
                          <div
                            className='screen-called-status-reel-clip'
                            aria-hidden
                          >
                            <div
                              key={statusAnimKey}
                              className='screen-called-status-reel-track screen-called-status-reel-track-once'
                            >
                              <div>{statusLabel(ticket)}</div>
                              <div>{statusLabel(ticket)}</div>
                              <div>{statusLabel(ticket)}</div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div
                          key={statusAnimKey}
                          className={`${statusSize} screen-status-change-snap-once max-w-full`}
                        >
                          {statusLabel(ticket)}
                        </div>
                      )}
                    </div>
                  </div>

                  <RowDivider
                    toneClass={dividerTone}
                    orientation='horizontal'
                  />

                  <div className='flex min-w-0 flex-col sm:ml-auto sm:max-w-[min(52%,28rem)] sm:items-end sm:text-right'>
                    <div
                      className={`mb-1 text-[10px] font-semibold tracking-wider uppercase md:text-xs ${labelTone} sm:text-right`}
                    >
                      {t('row_counter_label')}
                    </div>
                    <div
                      className={`w-full truncate sm:text-right ${ticketCounterSize}`}
                    >
                      {ticket.counter?.name ?? '---'}
                    </div>
                  </div>
                </div>
              );

              return (
                <motion.div
                  key={ticket.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{
                    layout: layoutTransition,
                    opacity: { duration: 0.22 },
                    y: { duration: 0.22 }
                  }}
                >
                  {isCalled ? (
                    <Card
                      className={`relative overflow-hidden border-none p-0 ${rowShell}`}
                    >
                      <div
                        className='screen-called-row-shine-underlay'
                        aria-hidden
                      />
                      <div className='relative z-[1]'>{inner}</div>
                    </Card>
                  ) : (
                    <Card className={`overflow-hidden p-0 ${rowShell}`}>
                      <motion.div
                        initial={false}
                        animate={{ opacity: isServed ? 0.88 : 1 }}
                        transition={{ duration: 0.35 }}
                      >
                        {inner}
                      </motion.div>
                    </Card>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </LayoutGroup>

      {displayed.length === 0 ? (
        <div className='text-muted-foreground py-10 text-center text-lg opacity-60'>
          {t('noHistory')}
        </div>
      ) : null}
    </div>
  );
}
