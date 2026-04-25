'use client';

import type { ComponentProps } from 'react';
import { DialogContent } from '@/components/ui/dialog';
import { useKioskChrome } from '@/contexts/kiosk-chrome-context';
import { cn } from '@/lib/utils';

/**
 * Same as `Dialog` / `DialogContent` from the UI package, but when the kiosk is dark or a11y
 * high-contrast, applies the `dark` class so shadcn tokens (bg-background, outline buttons, inputs)
 * match — Radix portals to `body`, so parent page classes do not apply otherwise.
 */
export function KioskDialogContent({
  className,
  overlayClassName,
  ...props
}: ComponentProps<typeof DialogContent>) {
  const { modalsDark } = useKioskChrome();
  return (
    <DialogContent
      className={cn(
        modalsDark &&
          'dark text-foreground border-zinc-600/45 [&_[data-slot=dialog-close]]:text-zinc-300 [&_[data-slot=dialog-close]]:ring-offset-zinc-950',
        className
      )}
      overlayClassName={cn(modalsDark && 'bg-black/75', overlayClassName)}
      {...props}
    />
  );
}
