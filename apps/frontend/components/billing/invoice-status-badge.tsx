import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type InvoiceStatusKey =
  | 'draft'
  | 'open'
  | 'paid'
  | 'void'
  | 'uncollectible';

function normalizeInvoiceStatus(status: string): InvoiceStatusKey {
  if (
    status === 'draft' ||
    status === 'open' ||
    status === 'paid' ||
    status === 'void' ||
    status === 'uncollectible'
  ) {
    return status;
  }
  return 'draft';
}

/** Border / background / text for invoice status chips (light + dark). */
export function invoiceStatusBadgeClassName(status: string): string {
  switch (normalizeInvoiceStatus(status)) {
    case 'paid':
      return 'border-emerald-500/35 bg-emerald-500/12 text-emerald-900 dark:text-emerald-200';
    case 'open':
      return 'border-amber-500/40 bg-amber-500/12 text-amber-950 dark:text-amber-100';
    case 'void':
      return 'border-muted-foreground/30 bg-muted text-muted-foreground';
    case 'uncollectible':
      return 'border-destructive/40 bg-destructive/10 text-destructive';
    case 'draft':
    default:
      return 'border-transparent bg-secondary text-secondary-foreground';
  }
}

type InvoiceStatusBadgeProps = {
  status: string;
  label: string;
  className?: string;
};

export function InvoiceStatusBadge({
  status,
  label,
  className
}: InvoiceStatusBadgeProps) {
  return (
    <Badge
      variant='outline'
      className={cn(
        'rounded-md border px-2.5 py-1 text-xs font-medium',
        invoiceStatusBadgeClassName(status),
        className
      )}
    >
      {label}
    </Badge>
  );
}
