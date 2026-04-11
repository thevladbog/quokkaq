'use client';

import type { LucideIcon } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'default' | 'accent';

export function SupervisorKpiCard({
  label,
  decorativeIcon: DecorativeIcon,
  variant = 'default',
  loading,
  children,
  footer
}: {
  label: ReactNode;
  decorativeIcon: LucideIcon;
  variant?: Variant;
  loading?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const isAccent = variant === 'accent';

  return (
    <div
      className={cn(
        'relative flex min-h-[152px] flex-col overflow-hidden rounded-3xl border p-5 shadow-sm',
        isAccent
          ? 'border-primary bg-primary text-primary-foreground'
          : 'bg-card border-border'
      )}
    >
      <DecorativeIcon
        className={cn(
          'pointer-events-none absolute -top-1 -right-1 h-28 w-28 shrink-0 stroke-[1.25]',
          isAccent ? 'text-primary-foreground/[0.12]' : 'text-foreground/[0.06]'
        )}
        aria-hidden
      />

      <div
        className={cn(
          'relative z-[1] text-xs font-semibold tracking-wider uppercase',
          isAccent ? 'text-primary-foreground/80' : 'text-muted-foreground'
        )}
      >
        {label}
      </div>

      {loading ? (
        <div className='relative z-[1] flex flex-1 items-center justify-center py-6'>
          <Loader2
            className={cn(
              'h-8 w-8 animate-spin',
              isAccent ? 'text-primary-foreground/80' : 'text-muted-foreground'
            )}
          />
        </div>
      ) : (
        <div className='relative z-[1] mt-auto flex flex-col gap-1 pt-4'>
          {children}
          {footer ? (
            <div
              className={cn(
                'text-xs leading-snug',
                isAccent
                  ? 'text-primary-foreground/70'
                  : 'text-muted-foreground'
              )}
            >
              {footer}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
