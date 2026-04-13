'use client';

import { Ticket } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { useTranslations } from 'next-intl';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';

interface CalledTicketsTableProps {
  tickets: Ticket[];
  backgroundColor?: string;
  /** Max rows in "last called"; 0 or unset = show all */
  historyLimit?: number;
}

const layoutTransition = { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const };

export function CalledTicketsTable({
  tickets,
  backgroundColor,
  historyLimit = 0
}: CalledTicketsTableProps) {
  const t = useTranslations('screen');
  const calledOnly = tickets.filter((ticket) => ticket.status === 'called');
  const latest =
    calledOnly.length === 0
      ? undefined
      : calledOnly.reduce((best, ticket) => {
          const tMs = new Date(ticket.calledAt || 0).getTime();
          const bMs = new Date(best.calledAt || 0).getTime();
          return tMs > bMs ? ticket : best;
        });
  const others = tickets.filter((ticket) => ticket.id !== latest?.id);
  const displayedOthers =
    historyLimit > 0 ? others.slice(0, historyLimit) : others;

  let gridCols = 'grid-cols-1';
  if (displayedOthers.length > 12) gridCols = 'grid-cols-3';
  else if (displayedOthers.length > 6) gridCols = 'grid-cols-2';

  return (
    <div
      className='bg-background flex h-full flex-col gap-4 p-4'
      style={{ backgroundColor: backgroundColor || undefined }}
    >
      <div className='flex-none'>
        <div className='text-muted-foreground mb-2 text-center text-lg tracking-widest uppercase md:text-2xl'>
          {t('nowCalling')}
        </div>
        {latest ? (
          <motion.div
            animate={{ opacity: [1, 0.88, 1] }}
            transition={{
              duration: 2.4,
              repeat: Infinity,
              ease: 'easeInOut'
            }}
          >
            <Card className='bg-primary text-primary-foreground overflow-hidden border-none shadow-xl'>
              <div className='grid grid-cols-[1fr_auto_1fr] items-center gap-2 p-4 md:gap-8 md:p-8'>
                <div className='text-right text-[3em] leading-none font-black tracking-tighter md:text-[5em]'>
                  {latest.queueNumber}
                </div>
                <div className='flex justify-center text-center text-4xl opacity-50 md:text-6xl'>
                  →
                </div>
                <div className='flex w-full flex-col items-start'>
                  <div className='w-full text-[3em] leading-tight font-bold md:text-[5em]'>
                    {latest.counter?.name || '---'}
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        ) : (
          <Card className='bg-muted flex h-[150px] items-center justify-center border-none shadow-inner md:h-[250px]'>
            <span className='text-muted-foreground text-4xl opacity-50'>
              ---
            </span>
          </Card>
        )}
      </div>

      <div className='flex flex-1 flex-col overflow-hidden'>
        <div className='text-muted-foreground mt-8 mb-4 text-center text-xl tracking-widest uppercase'>
          {t('lastCalled')}
        </div>
        <LayoutGroup>
          <div
            className={`grid ${gridCols} content-start gap-3 overflow-y-auto pr-2`}
          >
            <AnimatePresence initial={false} mode='popLayout'>
              {displayedOthers.map((ticket) => {
                let bgClass = 'bg-card/50 border-border/50';
                if (ticket.status === 'called')
                  bgClass =
                    'bg-primary/10 border-primary border-2 shadow-md ring-2 ring-primary/25';
                else if (ticket.status === 'in_service')
                  bgClass =
                    'bg-green-100 dark:bg-green-900/20 border-green-200 dark:border-green-800';
                else if (ticket.status === 'served')
                  bgClass =
                    'bg-gray-100 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 opacity-75';

                return (
                  <motion.div
                    key={ticket.id}
                    layout
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{
                      layout: layoutTransition,
                      opacity: { duration: 0.22 },
                      y: { duration: 0.22 }
                    }}
                  >
                    <Card className={`p-4 ${bgClass}`}>
                      <motion.div
                        className='grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-2xl font-semibold'
                        initial={false}
                        animate={{
                          opacity: ticket.status === 'served' ? 0.85 : 1
                        }}
                        transition={{ duration: 0.35 }}
                      >
                        <span className='text-foreground text-right'>
                          {ticket.queueNumber}
                        </span>
                        <span className='text-muted-foreground opacity-50'>
                          →
                        </span>
                        <span className='text-foreground text-left'>
                          {ticket.counter?.name ?? '---'}
                        </span>
                      </motion.div>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </LayoutGroup>
        {displayedOthers.length === 0 && (
          <div className='text-muted-foreground py-8 text-center opacity-50'>
            {t('noHistory')}
          </div>
        )}
      </div>
    </div>
  );
}
