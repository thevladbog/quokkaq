'use client';

import { ReactNode, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Bug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  getListSupportReportsQueryKey,
  useCreateSupportReport,
  type HandlersCreateSupportReportRequestDiagnostics
} from '@/lib/api/generated/support';
import { useActiveUnit } from '@/contexts/ActiveUnitContext';
import { isApiHttpError } from '@/lib/api-errors';

export type SupportReportDialogProps = {
  /** Custom trigger (e.g. floating action button). Defaults to secondary “Report issue” button. */
  trigger?: ReactNode;
};

export default function SupportReportDialog({
  trigger
}: SupportReportDialogProps) {
  const t = useTranslations('staff.support');
  const queryClient = useQueryClient();
  const { activeUnitId } = useActiveUnit();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const mutation = useCreateSupportReport({
    mutation: {
      onSuccess: (res) => {
        if (res.status !== 201) {
          toast.error(t('error'));
          return;
        }
        toast.success(t('success'));
        setOpen(false);
        setTitle('');
        setDescription('');
        void queryClient.invalidateQueries({
          queryKey: getListSupportReportsQueryKey()
        });
      },
      onError: (err) => {
        if (isApiHttpError(err) && err.status === 503) {
          toast.error(t('planeUnavailable'));
          return;
        }
        toast.error(t('error'));
      }
    }
  });

  const submit = () => {
    const diagnostics: HandlersCreateSupportReportRequestDiagnostics =
      typeof window !== 'undefined'
        ? {
            origin: window.location.origin,
            pathname: window.location.pathname,
            userAgent: window.navigator.userAgent
          }
        : {};
    const traceId =
      typeof window !== 'undefined' &&
      typeof window.crypto?.randomUUID === 'function'
        ? window.crypto.randomUUID()
        : `support-report-${Date.now()}`;
    mutation.mutate({
      data: {
        title: title.trim(),
        description: description.trim(),
        traceId,
        diagnostics,
        unitId: activeUnitId ?? undefined
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type='button' variant='secondary' size='sm'>
            <Bug className='mr-2 h-4 w-4' aria-hidden />
            {t('reportIssue')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{t('reportIssue')}</DialogTitle>
          <DialogDescription>{t('dialogDescription')}</DialogDescription>
        </DialogHeader>
        <div className='space-y-4 py-2'>
          <div className='space-y-2'>
            <Label htmlFor='sr-title'>{t('titleLabel')}</Label>
            <Input
              id='sr-title'
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('titlePlaceholder')}
              autoComplete='off'
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='sr-desc'>{t('descriptionLabel')}</Label>
            <Textarea
              id='sr-desc'
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('descriptionPlaceholder')}
              rows={5}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            onClick={() => setOpen(false)}
          >
            {t('cancel')}
          </Button>
          <Button
            type='button'
            onClick={submit}
            disabled={
              mutation.isPending || !title.trim() || !description.trim()
            }
          >
            {mutation.isPending ? t('submitting') : t('submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
