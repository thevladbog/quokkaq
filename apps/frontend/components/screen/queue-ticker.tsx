import { Ticket } from '@/lib/api';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import {
  parseQueueTickerDirection,
  parseQueueTickerDurationSeconds,
  resolveQueueTickerLabel,
  type QueueTickerDirection
} from '@/lib/queue-ticker-config';
import { cn } from '@/lib/utils';

export type QueueTickerProps = {
  tickets: Ticket[];
  /** BCP 47 / app locale (e.g. `ru`, `en-US`). */
  locale?: string;
  labelRu?: string;
  labelEn?: string;
  direction?: QueueTickerDirection;
  /** Base loop duration in seconds (clamped 8–120); a small per-ticket add keeps long lists readable. */
  durationSeconds?: number;
};

export function QueueTicker({
  tickets,
  locale = 'en',
  labelRu,
  labelEn,
  direction: directionProp,
  durationSeconds: durationProp
}: QueueTickerProps) {
  const t = useTranslations('screen');
  const direction = parseQueueTickerDirection(directionProp);
  const baseDuration = parseQueueTickerDurationSeconds(durationProp);
  const duration = baseDuration + tickets.length * 0.25;

  const fallback = `${t('waiting')}:`;
  const { text: labelText, isCustom } = resolveQueueTickerLabel(
    locale,
    labelRu,
    labelEn,
    fallback
  );

  const motionInitial = direction === 'left' ? { x: '100%' } : { x: '-100%' };
  const motionAnimate = direction === 'left' ? { x: '-100%' } : { x: '100%' };

  return (
    <div className='bg-foreground text-background relative flex h-full min-h-12 w-full min-w-0 flex-1 items-stretch overflow-hidden whitespace-nowrap'>
      <div
        className={cn(
          'bg-foreground z-10 flex shrink-0 items-center self-stretch px-[clamp(0.5rem,2vmin,1rem)] text-[clamp(0.65rem,1.9vmin,1.15rem)] font-bold tracking-wider shadow-[10px_0_20px_rgba(0,0,0,0.5)]',
          isCustom ? 'normal-case' : 'uppercase'
        )}
      >
        {labelText}
      </div>

      <div className='flex min-h-0 min-w-0 flex-1 items-center overflow-hidden'>
        {tickets.length > 0 ? (
          <motion.div
            key={direction}
            className='flex items-center gap-[clamp(1.5rem,6vmin,4rem)]'
            initial={motionInitial}
            animate={motionAnimate}
            transition={{
              repeat: Infinity,
              ease: 'linear',
              duration,
              repeatType: 'loop'
            }}
          >
            {tickets.map((ticket) => (
              <span
                key={ticket.id}
                className='font-mono text-[clamp(0.85rem,2.8vmin,1.75rem)] font-bold'
              >
                {ticket.queueNumber}
              </span>
            ))}
          </motion.div>
        ) : (
          <span className='text-[clamp(0.65rem,1.9vmin,1.15rem)] opacity-70'>
            {t('queueEmpty')}
          </span>
        )}
      </div>
    </div>
  );
}
