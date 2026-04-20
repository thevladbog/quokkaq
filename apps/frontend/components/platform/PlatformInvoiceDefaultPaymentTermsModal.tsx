'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getGetSaaSOperatorCompanyQueryKey,
  getSaaSOperatorCompany,
  patchCompany
} from '@/lib/api/generated/platform';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { PlatformInvoicePaymentTermsMdx } from '@/components/platform/PlatformInvoicePaymentTermsMdx';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function PlatformInvoiceDefaultPaymentTermsModal({
  open,
  onOpenChange
}: Props) {
  const t = useTranslations('platform.invoices');
  const qc = useQueryClient();
  const [markdown, setMarkdown] = useState('');

  const {
    data: op,
    isLoading,
    isError,
    error: loadError
  } = useQuery({
    queryKey: getGetSaaSOperatorCompanyQueryKey(),
    queryFn: async () => (await getSaaSOperatorCompany()).data,
    enabled: open
  });

  useEffect(() => {
    if (!open) return;
    const next = (op?.invoiceDefaultPaymentTerms ?? '').trim();
    queueMicrotask(() => setMarkdown(next));
  }, [open, op?.invoiceDefaultPaymentTerms]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!op?.id?.trim()) throw new Error('noOperator');
      return patchCompany(op.id, { invoiceDefaultPaymentTerms: markdown });
    },
    onSuccess: () => {
      toast.success(
        t('paymentTermsSaved', {
          defaultValue: 'Default payment terms saved.'
        })
      );
      void qc.invalidateQueries({
        queryKey: getGetSaaSOperatorCompanyQueryKey()
      });
      onOpenChange(false);
    },
    onError: (err) => {
      const raw = err instanceof Error ? err.message : String(err);
      toast.error(
        t('paymentTermsSaveError', {
          message: raw,
          defaultValue: `Could not save: ${raw}`
        }),
        { duration: 6000 }
      );
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[90vh] max-w-3xl overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>
            {t('paymentTermsModalTitle', {
              defaultValue: 'Default payment terms'
            })}
          </DialogTitle>
          <DialogDescription>
            {t('paymentTermsModalHint', {
              defaultValue:
                'This text is suggested when creating a new invoice. Each invoice can still override it.'
            })}
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <p className='text-muted-foreground text-sm'>
            {t('paymentTermsLoading', { defaultValue: 'Loading…' })}
          </p>
        ) : isError ? (
          <p className='text-destructive text-sm' role='alert'>
            {t('paymentTermsLoadError', {
              message:
                loadError instanceof Error
                  ? loadError.message
                  : String(loadError),
              defaultValue: 'Could not load SaaS operator company.'
            })}
          </p>
        ) : !op?.id ? (
          <p className='text-destructive text-sm' role='alert'>
            {t('paymentTermsNoOperator', {
              defaultValue: 'No SaaS operator company is configured.'
            })}
          </p>
        ) : (
          <PlatformInvoicePaymentTermsMdx
            markdown={markdown}
            onChange={setMarkdown}
            placeholder={t('paymentTermsPlaceholder', {
              defaultValue: 'Payment terms (markdown)…'
            })}
          />
        )}
        <DialogFooter className='gap-2 sm:gap-0'>
          <Button
            type='button'
            variant='secondary'
            onClick={() => onOpenChange(false)}
          >
            {t('paymentTermsCancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            type='button'
            disabled={!op?.id || saveMut.isPending}
            onClick={() => saveMut.mutate()}
          >
            {t('paymentTermsSave', { defaultValue: 'Save' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
