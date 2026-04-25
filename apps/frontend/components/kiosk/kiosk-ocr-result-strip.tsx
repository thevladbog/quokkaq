'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

type KioskOcrResultStripProps = {
  text: string;
  onClear: () => void;
  className?: string;
};

/**
 * Kiosks are often without keyboard: OCR cannot rely on "paste" (Ctrl+V / long-press).
 * The last "Use text" from document scan is shown read-only so staff/guests can re-type or use
 * the linked flows in phone / pre-reg modals.
 */
export function KioskOcrResultStrip({
  text,
  onClear,
  className
}: KioskOcrResultStripProps) {
  const t = useTranslations('kiosk.id_ocr');
  if (!text.trim()) {
    return null;
  }
  return (
    <div
      className={cn(
        'border-border/80 bg-card/98 supports-[backdrop-filter]:bg-card/90 fixed right-0 bottom-0 left-0 z-[35] max-h-[min(32vh,22rem)] border-t shadow-lg backdrop-blur-sm',
        className
      )}
      role='region'
      aria-label={t('result_strip_aria', {
        defaultValue: 'Last document scan (read-only)'
      })}
    >
      <div className='flex min-h-0 max-w-4xl flex-col gap-1.5 p-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:mx-auto sm:p-3 sm:pt-2'>
        <div className='text-muted-foreground flex shrink-0 items-center justify-between gap-2 text-xs font-medium tracking-wide sm:text-sm'>
          <span>
            {t('result_strip_title', {
              defaultValue: 'Last camera scan (not sent to the server)'
            })}
          </span>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            className='text-muted-foreground hover:text-foreground h-8 w-8 shrink-0'
            onClick={onClear}
            aria-label={t('result_strip_clear_aria', {
              defaultValue: 'Clear last scan'
            })}
          >
            <X className='size-4' />
          </Button>
        </div>
        <p className='text-foreground max-h-[min(22vh,12rem)] overflow-y-auto rounded-md border border-dotted px-2 py-1.5 text-sm leading-relaxed break-words whitespace-pre-wrap sm:max-h-[18vh] sm:text-base'>
          {text}
        </p>
        <p className='text-muted-foreground text-[0.7rem] leading-tight sm:text-xs'>
          {t('result_strip_help', {
            defaultValue:
              'Use this to copy numbers or words into the next step by hand, or use “Insert from scan” where a button is offered.'
          })}
        </p>
      </div>
    </div>
  );
}
