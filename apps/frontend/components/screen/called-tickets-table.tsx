import { Ticket } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { useTranslations } from 'next-intl';

interface CalledTicketsTableProps {
  tickets: Ticket[];
  backgroundColor?: string;
}

export function CalledTicketsTable({
  tickets,
  backgroundColor
}: CalledTicketsTableProps) {
  const t = useTranslations('screen');
  // Find the most recent ticket that is actually in 'called' status
  const latest = tickets.find((t) => t.status === 'called');
  // All other tickets (including in_service and older called ones) go to the list
  const others = tickets.filter((t) => t.id !== latest?.id);

  // Determine grid columns based on count
  let gridCols = 'grid-cols-1';
  if (others.length > 12) gridCols = 'grid-cols-3';
  else if (others.length > 6) gridCols = 'grid-cols-2';

  return (
    <div
      className='bg-background flex h-full flex-col gap-4 p-4'
      style={{ backgroundColor: backgroundColor || undefined }}
    >
      {/* Latest called ticket - Big and highlighted */}
      <div className='flex-none'>
        <div className='text-muted-foreground mb-2 text-center text-lg tracking-widest uppercase md:text-2xl'>
          {t('nowCalling')}
        </div>
        {latest ? (
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
        ) : (
          <Card className='bg-muted flex h-[150px] items-center justify-center border-none shadow-inner md:h-[250px]'>
            <span className='text-muted-foreground text-4xl opacity-50'>
              ---
            </span>
          </Card>
        )}
      </div>

      {/* Previous tickets list */}
      <div className='flex flex-1 flex-col overflow-hidden'>
        <div className='text-muted-foreground mt-8 mb-4 text-center text-xl tracking-widest uppercase'>
          {t('lastCalled')}
        </div>
        <div
          className={`grid ${gridCols} content-start gap-3 overflow-y-auto pr-2`}
        >
          {others.map((ticket) => {
            let bgClass = 'bg-card/50 border-border/50';
            if (ticket.status === 'called')
              bgClass =
                'bg-primary/10 border-primary border-2 animate-pulse shadow-lg';
            else if (ticket.status === 'in_service')
              bgClass =
                'bg-green-100 dark:bg-green-900/20 border-green-200 dark:border-green-800';
            else if (ticket.status === 'served')
              bgClass =
                'bg-gray-100 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 opacity-75';

            return (
              <Card key={ticket.id} className={`p-4 ${bgClass}`}>
                <div className='grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-2xl font-semibold'>
                  <span className='text-foreground text-right'>
                    {ticket.queueNumber}
                  </span>
                  <span className='text-muted-foreground opacity-50'>→</span>
                  <span className='text-foreground text-left'>
                    {ticket.counter?.name}
                  </span>
                </div>
              </Card>
            );
          })}
          {others.length === 0 && (
            <div className='text-muted-foreground col-span-full py-8 text-center opacity-50'>
              {t('noHistory')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
