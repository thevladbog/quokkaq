import { cn } from '@/lib/utils';

/** Distinct badge colors: subdivision vs service zone (trees, lists). */
export function unitKindBadgeClassName(
  kind: string | null | undefined
): string {
  switch (kind) {
    case 'subdivision':
      return cn(
        'border-transparent shadow-none',
        'bg-sky-100 text-sky-950',
        'dark:bg-sky-950/55 dark:text-sky-100'
      );
    case 'service_zone':
      return cn(
        'border-transparent shadow-none',
        'bg-violet-100 text-violet-950',
        'dark:bg-violet-950/55 dark:text-violet-100'
      );
    default:
      return cn(
        'border-transparent shadow-none',
        'bg-muted text-muted-foreground'
      );
  }
}
