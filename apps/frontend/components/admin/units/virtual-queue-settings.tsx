'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import QRCode from 'react-qr-code';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, ExternalLink } from 'lucide-react';
import { getGetUnitByIDQueryKey } from '@/lib/api/generated/units';
import { unitsApi } from '@/lib/api';
import type { Unit } from '@/lib/api';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

interface VirtualQueueSettingsProps {
  unitId: string;
  currentConfig: Unit['config'];
}

export function VirtualQueueSettings({
  unitId,
  currentConfig
}: VirtualQueueSettingsProps) {
  const t = useTranslations('admin.virtual_queue_settings');
  const locale = useLocale();
  const queryClient = useQueryClient();

  const configExtra = currentConfig as
    | (typeof currentConfig & {
        virtualQueue?: { enabled?: boolean };
      })
    | null;
  const isEnabled: boolean = configExtra?.virtualQueue?.enabled ?? false;

  const [enabled, setEnabled] = useState(isEnabled);
  const [dirty, setDirty] = useState(false);

  const queueUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/${locale}/queue/${unitId}`
      : `/${locale}/queue/${unitId}`;

  const mutation = useMutation({
    mutationFn: () =>
      unitsApi.update(unitId, {
        config: {
          ...(currentConfig ?? {}),
          virtualQueue: { enabled }
        } as Unit['config']
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: getGetUnitByIDQueryKey(unitId)
      });
      toast.success(t('save_success'));
      setDirty(false);
    },
    onError: () => {
      toast.error(t('save_error'));
    }
  });

  const handleToggle = (v: boolean) => {
    setEnabled(v);
    setDirty(true);
  };

  const handleCopy = () => {
    void navigator.clipboard.writeText(queueUrl).then(() => {
      toast.success(t('link_copied'));
    });
  };

  return (
    <div className='space-y-6'>
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='flex items-center gap-3'>
            <Switch
              id='vq-enabled'
              checked={enabled}
              onCheckedChange={handleToggle}
            />
            <Label htmlFor='vq-enabled' className='cursor-pointer'>
              {enabled ? t('enabled') : t('disabled')}
            </Label>
          </div>

          {dirty && (
            <Button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              size='sm'
            >
              {mutation.isPending ? <Spinner className='mr-2 size-4' /> : null}
              {t('save')}
            </Button>
          )}
        </CardContent>
      </Card>

      {enabled && (
        <Card>
          <CardHeader>
            <CardTitle>{t('qr_title')}</CardTitle>
            <CardDescription>{t('qr_description')}</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='inline-block rounded-lg border bg-white p-4'>
              <QRCode value={queueUrl} size={192} />
            </div>

            <div className='flex flex-wrap items-center gap-2'>
              <code className='bg-muted rounded px-2 py-1 text-xs break-all'>
                {queueUrl}
              </code>
              <Button
                type='button'
                variant='ghost'
                size='icon'
                onClick={handleCopy}
                title={t('copy_link')}
              >
                <Copy className='h-4 w-4' />
              </Button>
              <Button
                type='button'
                variant='ghost'
                size='icon'
                asChild
                title={t('open_link')}
              >
                <a href={queueUrl} target='_blank' rel='noopener noreferrer'>
                  <ExternalLink className='h-4 w-4' />
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
