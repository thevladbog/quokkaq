'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ThemeToggleProps = {
  /** Tighter control for menus / dense toolbars (e.g. account dropdown). */
  compact?: boolean;
};

export default function ThemeToggle({ compact = false }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();

  const icon = compact ? 'h-4 w-4' : 'h-5 w-5';

  return (
    <Button
      variant='ghost'
      size='icon'
      className={cn('relative shrink-0', compact ? 'h-8 w-8' : undefined)}
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      aria-label='Toggle theme'
    >
      <Sun
        className={cn(
          icon,
          'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90'
        )}
      />
      <Moon
        className={cn(
          icon,
          'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0'
        )}
      />
    </Button>
  );
}
