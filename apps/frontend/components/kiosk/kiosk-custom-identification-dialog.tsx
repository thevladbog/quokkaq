'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { KioskDialogContent } from '@/components/kiosk/kiosk-dialog-content';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog';
import { Barcode } from 'lucide-react';
import { useKioskSerialScannerStream } from '@/hooks/use-kiosk-serial-scanner';
import {
  KioskTouchKeyboard,
  KioskTouchNumpad
} from '@/components/kiosk/kiosk-touch-keyboard';
import {
  adminClampNumericMaxLength,
  getKioskBarcodeManualInputMode,
  normalizeKioskCustomBarcodeValue,
  type KioskCustomManualInputMode
} from '@/lib/kiosk-custom-ident-input';

type KioskIdent = {
  operatorLabel?: { ru?: string; en?: string };
  userInstruction?: { ru?: string; en?: string };
  apiFieldKey?: string;
  capture?: {
    kind?: string;
    manualInputMode?: KioskCustomManualInputMode;
    numericMaxLength?: number;
    showOnScreenKeyboard?: boolean;
  };
  sensitive?: boolean;
  showInQueuePreview?: boolean;
  retentionDays?: number;
  skippable?: boolean;
};

export function KioskCustomIdentificationDialog({
  open,
  onOpenChange,
  config,
  locale,
  unitId,
  onConfirm,
  onSkip
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Raw `kiosk_identification_config` from service. */
  config: unknown;
  locale: 'en' | 'ru';
  /** Kiosk unit id (for Tauri serial scanner stream). */
  unitId: string;
  onConfirm: (data: Record<string, unknown>) => void;
  /** When set and `skippable` in config, the visitor can skip without entering a value. */
  onSkip?: () => void;
}) {
  const t = useTranslations('kiosk');
  const [value, setValue] = useState('');
  const scanHintId = useId();

  const ident = (
    typeof config === 'object' && config ? (config as KioskIdent) : {}
  ) as KioskIdent;
  const field = (ident.apiFieldKey ?? 'value').trim() || 'value';
  const label =
    (locale === 'ru' ? ident.operatorLabel?.ru : ident.operatorLabel?.en) ??
    ident.operatorLabel?.ru ??
    t('custom_ident_value_label', { defaultValue: 'Value' });
  const instruction =
    (locale === 'ru' ? ident.userInstruction?.ru : ident.userInstruction?.en) ??
    ident.userInstruction?.ru;
  const skippable = !!ident.skippable;
  const needsMultiline = ident.capture?.kind === 'keyboard_ru_en';
  const isBarcode = ident.capture?.kind === 'barcode';
  const showOnScreenKeyboard = ident.capture?.showOnScreenKeyboard !== false;
  const manualMode: KioskCustomManualInputMode =
    getKioskBarcodeManualInputMode(config);
  const numMax = adminClampNumericMaxLength(
    ident.capture?.numericMaxLength,
    20
  );

  const applyNormalized = useCallback(
    (raw: string) => {
      if (!isBarcode) {
        return raw;
      }
      return normalizeKioskCustomBarcodeValue(raw, manualMode, numMax);
    },
    [isBarcode, manualMode, numMax]
  );

  useKioskSerialScannerStream(
    open && isBarcode && (unitId || '').trim() !== '',
    (line) => {
      setValue(applyNormalized(String(line)));
    },
    unitId
  );

  const inputMode: React.HTMLAttributes<HTMLInputElement>['inputMode'] =
    (() => {
      if (ident.capture?.kind === 'digits') return 'numeric';
      if (isBarcode) {
        if (manualMode === 'numeric') return 'numeric';
        return 'text';
      }
      return 'text';
    })();

  const maxLen =
    isBarcode && manualMode === 'numeric'
      ? numMax
      : isBarcode
        ? 256
        : undefined;

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
      <KioskDialogContent className='max-w-2xl min-w-0 sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>
            {t('custom_ident_title', {
              defaultValue: 'Additional information'
            })}
          </DialogTitle>
        </DialogHeader>
        <div className='flex w-full min-w-0 flex-col gap-3'>
          {instruction && instruction.trim() ? (
            <p className='text-foreground/90 text-sm leading-relaxed whitespace-pre-wrap'>
              {instruction.trim()}
            </p>
          ) : null}
          {isBarcode && showOnScreenKeyboard ? (
            <div id={scanHintId} className='w-full min-w-0 self-stretch'>
              <div className='bg-muted/40 border-foreground/25 flex min-h-32 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-5 sm:min-h-36 sm:py-6'>
                <Barcode
                  className='text-foreground/80 h-10 w-10 sm:h-12 sm:w-12'
                  strokeWidth={1.75}
                  aria-hidden
                />
                <span className='text-foreground text-center text-sm font-medium sm:text-base'>
                  {t('custom_ident_barcode_scan_caption', {
                    defaultValue: 'Scan barcode'
                  })}
                </span>
              </div>
            </div>
          ) : isBarcode && !showOnScreenKeyboard ? (
            <p
              id={scanHintId}
              className='text-muted-foreground text-sm leading-relaxed'
            >
              {t('custom_ident_barcode_scanner_only', {
                defaultValue:
                  'This step accepts a connected scanner or serial reader only. On-screen typing is turned off in service settings.'
              })}
            </p>
          ) : null}
          <div className='space-y-2'>
            <Label htmlFor='kioskCustomIdentValue'>{label}</Label>
            {needsMultiline ? (
              <Textarea
                id='kioskCustomIdentValue'
                name='kioskCustomIdentValue'
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className='min-h-24 text-base'
                autoComplete='off'
              />
            ) : (
              <div className='space-y-2'>
                <Input
                  id='kioskCustomIdentValue'
                  name='kioskCustomIdentValue'
                  autoFocus
                  value={value}
                  onChange={(e) => {
                    setValue(applyNormalized(e.target.value));
                  }}
                  className='h-12 text-base'
                  autoComplete='off'
                  maxLength={maxLen}
                  inputMode={inputMode}
                  enterKeyHint='done'
                  readOnly={isBarcode}
                  title={
                    isBarcode
                      ? t('custom_ident_barcode_field_readonly_hint', {
                          defaultValue:
                            'Value is set by scanner, on-screen keys, or serial (not the system keyboard).'
                        })
                      : undefined
                  }
                  aria-describedby={isBarcode ? scanHintId : undefined}
                />
                {isBarcode && showOnScreenKeyboard ? (
                  <div className='w-full max-w-full min-w-0'>
                    {manualMode === 'numeric' ? (
                      <KioskTouchNumpad
                        onDigit={(d) => {
                          setValue((v) => applyNormalized(v + d));
                        }}
                        onBackspace={() => {
                          setValue((v) => applyNormalized(v.slice(0, -1)));
                        }}
                      />
                    ) : (
                      <KioskTouchKeyboard
                        layoutToggle
                        initialLayout={locale === 'ru' ? 'ru' : 'en'}
                        onKey={(c) => {
                          setValue((v) => applyNormalized(v + c));
                        }}
                        onBackspace={() => {
                          setValue((v) => applyNormalized(v.slice(0, -1)));
                        }}
                      />
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
        <DialogFooter className='mt-2 flex flex-wrap items-center justify-end gap-2 sm:justify-end'>
          {skippable && onSkip ? (
            <Button
              type='button'
              variant='secondary'
              onClick={() => {
                onOpenChange(false);
                onSkip();
              }}
            >
              {t('custom_ident_skip', { defaultValue: 'Skip' })}
            </Button>
          ) : null}
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
