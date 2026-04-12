'use client';

import Image from 'next/image';
import logoCircle from '@/src/assets/logo-circle.svg';
import { cn } from '@/lib/utils';

/** Round mark shown in the sidebar header when `collapsible="icon"`. */
export function SidebarCollapsedLogo({ className }: { className?: string }) {
  return (
    <Image
      src={logoCircle}
      alt='QuokkaQ'
      width={32}
      height={32}
      className={cn('object-contain', className)}
      unoptimized
      priority
    />
  );
}
