import * as React from 'react';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * shadcn-style field wrapper: vertical spacing between label and control.
 */
function Field({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot='field' className={cn('space-y-2', className)} {...props} />
  );
}

function FieldLabel({
  className,
  ...props
}: React.ComponentProps<typeof Label>) {
  return (
    <Label
      data-slot='field-label'
      className={cn('text-foreground', className)}
      {...props}
    />
  );
}

export { Field, FieldLabel };
