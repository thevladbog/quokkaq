import type { ComponentProps, HTMLAttributes } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * @see https://www.kibo-ui.com/components/status
 * Vendored from the Kibo UI registry; `loading` added for kiosk “checking unit” state.
 */
export type KiboStatusVariant =
  | 'online'
  | 'offline'
  | 'maintenance'
  | 'degraded'
  | 'loading'
  /** Queue / kiosk frozen (QuokkaQ; rose tones, distinct from offline) */
  | 'frozen';

export type StatusProps = ComponentProps<typeof Badge> & {
  status: KiboStatusVariant;
};

export const Status = ({ className, status, ...props }: StatusProps) => (
  <Badge
    className={cn(
      'group flex w-fit max-w-full items-center gap-2',
      status,
      className
    )}
    variant='secondary'
    {...props}
  />
);

export type StatusIndicatorProps = HTMLAttributes<HTMLSpanElement>;

export const StatusIndicator = ({
  className,
  ...props
}: StatusIndicatorProps) => (
  <span className={cn('relative flex h-2 w-2 shrink-0', className)} {...props}>
    <span
      className={cn(
        'absolute inline-flex h-full w-full rounded-full opacity-75',
        'group-[.online]:animate-ping group-[.online]:bg-emerald-500',
        'group-[.offline]:animate-ping group-[.offline]:bg-red-500',
        'group-[.maintenance]:animate-ping group-[.maintenance]:bg-blue-500',
        'group-[.degraded]:animate-ping group-[.degraded]:bg-amber-500',
        'group-[.frozen]:animate-ping group-[.frozen]:bg-rose-500',
        'group-[.loading]:animate-pulse group-[.loading]:bg-zinc-400'
      )}
    />
    <span
      className={cn(
        'relative inline-flex h-2 w-2 rounded-full',
        'group-[.online]:bg-emerald-500',
        'group-[.offline]:bg-red-500',
        'group-[.maintenance]:bg-blue-500',
        'group-[.degraded]:bg-amber-500',
        'group-[.frozen]:bg-rose-500',
        'group-[.loading]:bg-zinc-500'
      )}
    />
  </span>
);

export type StatusLabelProps = HTMLAttributes<HTMLSpanElement>;

export const StatusLabel = ({
  className,
  children,
  ...props
}: StatusLabelProps) => (
  <span className={cn('text-muted-foreground min-w-0', className)} {...props}>
    {children ?? (
      <>
        <span className='hidden group-[.online]:block'>Online</span>
        <span className='hidden group-[.offline]:block'>Offline</span>
        <span className='hidden group-[.maintenance]:block'>Maintenance</span>
        <span className='hidden group-[.degraded]:block'>Degraded</span>
        <span className='hidden group-[.frozen]:block'>Frozen</span>
        <span className='hidden group-[.loading]:block'>Loading</span>
      </>
    )}
  </span>
);
