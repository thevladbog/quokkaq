'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ApiHttpError, subscriptionsApi } from '@/lib/api';
import { formatApiToastErrorMessage } from '@/lib/format-api-toast-error';
import { cn } from '@/lib/utils';
import { FileText, ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

export function PricingCustomTermsBanner({
  className,
  billingPeriod = 'month'
}: {
  className?: string;
  /** Billing context for the Tracker ticket (month vs annual prepay). */
  billingPeriod?: 'month' | 'annual';
}) {
  const t = useTranslations('organization.pricing');
  const tCommon = useTranslations('common');
  const tGeneral = useTranslations('general');
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState('');

  const mutation = useMutation({
    mutationFn: (c: string) =>
      subscriptionsApi.requestCustomTermsLead(c, billingPeriod),
    onSuccess: () => {
      toast.success(t('customTermsToastSuccess'));
      setComment('');
      setOpen(false);
    },
    onError: (err: unknown) => {
      if (err instanceof ApiHttpError && err.status === 503) {
        toast.error(t('customTermsToastTrackerUnavailable'));
        return;
      }
      if (err instanceof ApiHttpError && err.status === 403) {
        toast.error(t('customTermsToastForbidden'));
        return;
      }
      toast.error(
        t('customTermsToastError', {
          message: formatApiToastErrorMessage(err, tCommon('error'))
        })
      );
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const c = comment.trim();
    if (!c) {
      toast.error(t('customTermsCommentRequired'));
      return;
    }
    mutation.mutate(c);
  };

  return (
    <>
      <div
        className={cn(
          'bg-card/50 rounded-xl border p-5 shadow-sm backdrop-blur-sm md:p-6',
          className
        )}
      >
        <div className='flex flex-col gap-5 md:flex-row md:items-center md:justify-between md:gap-8'>
          <div className='flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:gap-4'>
            <div
              className='bg-primary/10 text-primary mx-auto flex h-12 w-12 shrink-0 items-center justify-center rounded-xl sm:mx-0'
              aria-hidden
            >
              <FileText className='h-6 w-6' />
            </div>
            <div className='min-w-0 flex-1 text-center sm:text-left'>
              <p className='text-primary mb-1 text-xs font-semibold tracking-wide uppercase'>
                {t('customTermsEyebrow')}
              </p>
              <h3 className='text-foreground text-lg font-semibold tracking-tight md:text-xl'>
                {t('customTermsTitle')}
              </h3>
              <p className='text-muted-foreground mt-2 max-w-2xl text-sm leading-relaxed'>
                {t('customTermsBody')}
              </p>
            </div>
          </div>
          <Button
            type='button'
            className='h-11 shrink-0 gap-2 md:self-center'
            onClick={() => setOpen(true)}
          >
            {t('customTermsCta')}
            <ArrowRight className='h-4 w-4' />
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className='sm:max-w-md' showCloseButton>
          <form onSubmit={(e) => void handleSubmit(e)}>
            <DialogHeader>
              <DialogTitle>{t('customTermsDialogTitle')}</DialogTitle>
              <DialogDescription>
                {t('customTermsDialogDescription')}
              </DialogDescription>
            </DialogHeader>
            <div className='grid gap-2 py-2'>
              <Label htmlFor='custom-terms-comment'>
                {t('customTermsCommentLabel')}
              </Label>
              <Textarea
                id='custom-terms-comment'
                rows={5}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className='resize-y'
                autoComplete='off'
                disabled={mutation.isPending}
              />
            </div>
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => setOpen(false)}
                disabled={mutation.isPending}
              >
                {tGeneral('cancel')}
              </Button>
              <Button type='submit' disabled={mutation.isPending}>
                {mutation.isPending
                  ? t('customTermsSubmitting')
                  : t('customTermsSubmit')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
