'use client';

import { useState } from 'react';
import { Headphones, User } from 'lucide-react';
import { cn } from '@/lib/utils';

function visitorInitials(firstName: string, lastName: string): string {
  const a = firstName.trim().charAt(0);
  const b = lastName.trim().charAt(0);
  const s = `${a}${b}`.toUpperCase();
  return s || '?';
}

const SIZES = {
  /** Idle / dense toolbar */
  sm: {
    outer: 'rounded-xl p-px shadow-md',
    inner: 'h-24 w-[4.5rem] rounded-[0.65rem]',
    idleIcon: 'h-9 w-9',
    userIcon: 'h-8 w-8',
    initials: 'text-2xl font-bold',
    rotate: '-5deg'
  },
  /** Active ticket (still compact for ops) */
  md: {
    outer: 'rounded-2xl p-[2px] shadow-lg',
    inner: 'h-[7.25rem] w-[5.5rem] rounded-[1rem] sm:h-[8rem] sm:w-[6rem]',
    idleIcon: 'h-11 w-11',
    userIcon: 'h-10 w-10 sm:h-11 sm:w-11',
    initials: 'text-3xl font-bold sm:text-4xl',
    rotate: '-6deg'
  }
} as const;

export interface VisitorPhotoFrameProps {
  photoUrl?: string | null;
  firstName: string;
  lastName: string;
  isAnonymous?: boolean;
  variant?: 'default' | 'idle';
  size?: keyof typeof SIZES;
  ariaLabel: string;
  className?: string;
}

export function VisitorPhotoFrame({
  photoUrl,
  firstName,
  lastName,
  isAnonymous,
  variant = 'default',
  size = 'md',
  ariaLabel,
  className
}: VisitorPhotoFrameProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const isIdle = variant === 'idle';
  const sz = SIZES[size];
  const showPhoto =
    !isIdle && Boolean(photoUrl?.trim()) && !imgFailed && !isAnonymous;

  return (
    <div
      className={cn('flex shrink-0 flex-col gap-1.5', className)}
      aria-label={ariaLabel}
    >
      <div
        className='origin-center transition-transform duration-300 ease-out hover:rotate-0'
        style={{ transform: `rotate(${sz.rotate})` }}
      >
        <div
          className={cn(
            'bg-gradient-to-br from-violet-500/85 via-fuchsia-500/75 to-amber-400/80 dark:from-violet-600 dark:via-fuchsia-600 dark:to-amber-500',
            isIdle &&
              'from-violet-400 via-fuchsia-500 to-amber-400 dark:from-violet-600 dark:via-fuchsia-700 dark:to-amber-600',
            sz.outer
          )}
        >
          <div
            className={cn(
              'bg-card relative overflow-hidden ring-1 ring-black/5 dark:ring-white/10',
              sz.inner
            )}
          >
            {showPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl!.trim()}
                alt=''
                className='h-full w-full object-cover'
                onError={() => setImgFailed(true)}
              />
            ) : (
              <div
                className={cn(
                  'flex h-full w-full items-center justify-center',
                  isIdle
                    ? 'bg-gradient-to-br from-violet-50 to-amber-50/80 dark:from-violet-950/60 dark:to-amber-950/30'
                    : 'bg-muted'
                )}
              >
                {isIdle ? (
                  <Headphones
                    className={cn(
                      'text-violet-600 dark:text-violet-400',
                      sz.idleIcon
                    )}
                    strokeWidth={1.2}
                    aria-hidden
                  />
                ) : isAnonymous ? (
                  <User
                    className={cn('text-muted-foreground', sz.userIcon)}
                    strokeWidth={1.2}
                    aria-hidden
                  />
                ) : (
                  <span
                    className={cn(
                      'bg-gradient-to-br from-violet-600 to-fuchsia-600 bg-clip-text text-transparent',
                      sz.initials
                    )}
                  >
                    {visitorInitials(firstName, lastName)}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
