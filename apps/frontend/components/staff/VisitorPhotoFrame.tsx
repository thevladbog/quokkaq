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
    outer: 'rounded-xl p-px',
    inner: 'h-24 w-[4.5rem] rounded-[0.65rem]',
    idleIcon: 'h-9 w-9',
    userIcon: 'h-8 w-8',
    initials: 'text-2xl font-bold'
  },
  /** Active ticket (still compact for ops) */
  md: {
    outer: 'rounded-2xl p-[2px]',
    inner: 'h-[7.25rem] w-[5.5rem] rounded-[1rem] sm:h-[8rem] sm:w-[6rem]',
    idleIcon: 'h-11 w-11',
    userIcon: 'h-10 w-10 sm:h-11 sm:w-11',
    initials: 'text-3xl font-bold sm:text-4xl'
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
      role='img'
      aria-label={ariaLabel}
    >
      <div
        data-testid='visitor-photo-frame'
        className={cn('border-border/70 bg-muted/40 border', sz.outer)}
      >
        <div className={cn('bg-card relative overflow-hidden', sz.inner)}>
          {showPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl!.trim()}
              alt=''
              className='h-full w-full object-cover'
              onError={() => setImgFailed(true)}
            />
          ) : (
            <div className='bg-muted/35 flex h-full w-full items-center justify-center'>
              {isIdle ? (
                <Headphones
                  className={cn('text-muted-foreground', sz.idleIcon)}
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
                <span className={cn('text-foreground', sz.initials)}>
                  {visitorInitials(firstName, lastName)}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
