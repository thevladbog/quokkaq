import { Ticket } from '@/lib/api';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';

interface QueueTickerProps {
  tickets: Ticket[];
}

export function QueueTicker({ tickets }: QueueTickerProps) {
  const t = useTranslations('screen');

  // Calculate duration: base 8s + 0.8s per ticket for moderate speed
  // We use a fixed base because we are now traversing the full viewport width
  const duration = 15 + tickets.length * 0.8;

  return (
    <div className='bg-foreground text-background relative flex h-16 items-center overflow-hidden whitespace-nowrap'>
      <div className='bg-foreground absolute top-0 bottom-0 left-0 z-10 flex items-center px-4 text-xl font-bold tracking-wider uppercase shadow-[10px_0_20px_rgba(0,0,0,0.5)]'>
        {t('waiting')}:
      </div>

      <div className='flex w-full items-center overflow-hidden'>
        {tickets.length > 0 ? (
          <motion.div
            className='flex items-center gap-16'
            initial={{ x: '100vw' }}
            animate={{ x: '-100%' }}
            transition={{
              repeat: Infinity,
              ease: 'linear',
              duration: duration,
              repeatType: 'loop'
            }}
          >
            {tickets.map((ticket) => (
              <span key={ticket.id} className='font-mono text-2xl font-bold'>
                {ticket.queueNumber}
              </span>
            ))}
          </motion.div>
        ) : (
          <span className='pl-4 text-xl opacity-70'>{t('queueEmpty')}</span>
        )}
      </div>
    </div>
  );
}
