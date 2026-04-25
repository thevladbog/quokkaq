'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { KioskDialogContent } from '@/components/kiosk/kiosk-dialog-content';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog';

type KioskIdent = {
  operatorLabel?: { ru?: string; en?: string };
  apiFieldKey?: string;
  capture?: { kind?: string };
  sensitive?: boolean;
  showInQueuePreview?: boolean;
  retentionDays?: number;
};

export function KioskCustomIdentificationDialog({
  open,
  onOpenChange,
  config,
  locale,
  onConfirm
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Raw `kiosk_identification_config` from service. */
  config: unknown;
  locale: 'en' | 'ru';
  onConfirm: (data: Record<string, unknown>) => void;
}) {
  const t = useTranslations('kiosk');
  const [value, setValue] = useState('');

  const ident = (
    typeof config === 'object' && config ? (config as KioskIdent) : {}
  ) as KioskIdent;
  const field = (ident.apiFieldKey ?? 'value').trim() || 'value';
  const label =
    (locale === 'ru' ? ident.operatorLabel?.ru : ident.operatorLabel?.en) ??
    ident.operatorLabel?.ru ??
    t('custom_ident_value_label', { defaultValue: 'Value' });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) {
          setValue('');
        }
      }}
    >
      <KioskDialogContent className='max-w-md'>
        <DialogHeader>
          <DialogTitle>
            {t('custom_ident_title', {
              defaultValue: 'Additional information'
            })}
          </DialogTitle>
        </DialogHeader>
        <div className='space-y-2'>
          <Label htmlFor='kioskCustomIdentValue'>{label}</Label>
          <Input
            id='kioskCustomIdentValue'
            name='kioskCustomIdentValue'
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className='h-12 text-base'
            autoComplete='off'
            inputMode={
              ident.capture?.kind === 'digits' ||
              ident.capture?.kind === 'barcode'
                ? 'numeric'
                : 'text'
            }
          />
        </div>
        <DialogFooter className='mt-2 sm:justify-end'>
          <Button
            type='button'
            variant='outline'
            onClick={() => onOpenChange(false)}
          >
            {t('custom_ident_cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            type='button'
            onClick={() => {
              onConfirm({ [field]: value.trim() });
            }}
            disabled={value.trim() === ''}
          >
            {t('custom_ident_continue', { defaultValue: 'Continue' })}
          </Button>
        </DialogFooter>
      </KioskDialogContent>
    </Dialog>
  );
}
