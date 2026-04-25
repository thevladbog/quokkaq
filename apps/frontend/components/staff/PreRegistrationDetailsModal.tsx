import { useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Ticket } from '@/lib/api';
import { formatFullName } from '@/lib/format';
import { useTranslations, useLocale } from 'next-intl';
import {
  KIOSK_ID_CUSTOM_DATA_SKIPPED_KEY,
  KIOSK_ID_DOCUMENT_OCR_FAILED_KEY,
  KIOSK_ID_DOCUMENT_OCR_KEY
} from '@quokkaq/shared-types';
import {
  Calendar,
  Clock,
  Phone,
  User,
  FileText,
  Hash,
  FileKey
} from 'lucide-react';
import { ticketHasDocumentsData } from '@/lib/ticket-user-data-visibility';

interface PreRegistrationDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticket: Ticket | null;
}

export function PreRegistrationDetailsModal({
  isOpen,
  onClose,
  ticket
}: PreRegistrationDetailsModalProps) {
  const t = useTranslations('staff.pre_registration');
  const tUser = useTranslations('staff.ticket_user_data');
  const locale = useLocale();

  const hasPre = Boolean(ticket?.preRegistration);
  const hasDoc = Boolean(ticket) && ticketHasDocumentsData(ticket as Ticket);

  useEffect(() => {
    if (!isOpen || !ticket) {
      return;
    }
    if (!hasPre && !hasDoc) {
      onClose();
    }
  }, [isOpen, ticket, hasPre, hasDoc, onClose]);

  if (!ticket) {
    return null;
  }
  if (!hasPre && !hasDoc) {
    return null;
  }

  const { preRegistration } = ticket;
  const docs = ticket.documentsData as Record<string, unknown> | undefined;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent className='w-full sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>
            {t('details_title', { defaultValue: 'Ticket details' })}
          </DialogTitle>
          <DialogDescription>
            {t('details_unified_description', {
              defaultValue:
                'Pre-registration, kiosk, or document data for this visit.'
            })}
          </DialogDescription>
        </DialogHeader>
        <div className='max-h-[min(70vh,28rem)] space-y-6 overflow-y-auto pr-0.5'>
          {hasPre && preRegistration && (
            <div className='border-border/60 space-y-4 border-b pb-4'>
              <p className='text-foreground/90 text-sm font-medium'>
                {t('pr_section_title', { defaultValue: 'Pre-registration' })}
              </p>
              <div className='grid grid-cols-4 items-center gap-4'>
                <User className='text-muted-foreground h-4 w-4 justify-self-end' />
                <div className='col-span-3'>
                  <div className='text-sm font-medium'>
                    {t('customer_name', { defaultValue: 'Customer Name' })}
                  </div>
                  <div className='text-muted-foreground text-sm'>
                    {formatFullName(
                      preRegistration.customerFirstName,
                      preRegistration.customerLastName
                    )}
                  </div>
                </div>
              </div>
              <div className='grid grid-cols-4 items-center gap-4'>
                <Phone className='text-muted-foreground h-4 w-4 justify-self-end' />
                <div className='col-span-3'>
                  <div className='text-sm font-medium'>
                    {t('customer_phone', { defaultValue: 'Phone' })}
                  </div>
                  <div className='text-muted-foreground text-sm'>
                    {preRegistration.customerPhone}
                  </div>
                </div>
              </div>
              <div className='grid grid-cols-4 items-center gap-4'>
                <Hash className='text-muted-foreground h-4 w-4 justify-self-end' />
                <div className='col-span-3'>
                  <div className='text-sm font-medium'>
                    {t('code', { defaultValue: 'Code' })}
                  </div>
                  <div className='text-muted-foreground font-mono text-sm'>
                    {preRegistration.code}
                  </div>
                </div>
              </div>
              <div className='grid grid-cols-4 items-center gap-4'>
                <Calendar className='text-muted-foreground h-4 w-4 justify-self-end' />
                <div className='col-span-3'>
                  <div className='text-sm font-medium'>
                    {t('date', { defaultValue: 'Date' })}
                  </div>
                  <div className='text-muted-foreground text-sm'>
                    {preRegistration.date}
                  </div>
                </div>
              </div>
              <div className='grid grid-cols-4 items-center gap-4'>
                <Clock className='text-muted-foreground h-4 w-4 justify-self-end' />
                <div className='col-span-3'>
                  <div className='text-sm font-medium'>
                    {t('time', { defaultValue: 'Time' })}
                  </div>
                  <div className='text-muted-foreground text-sm'>
                    {preRegistration.time}
                  </div>
                </div>
              </div>
              {preRegistration.comment && (
                <div className='grid grid-cols-4 items-start gap-4'>
                  <FileText className='text-muted-foreground mt-1 h-4 w-4 justify-self-end' />
                  <div className='col-span-3'>
                    <div className='text-sm font-medium'>
                      {t('comment', { defaultValue: 'Comment' })}
                    </div>
                    <div className='text-muted-foreground text-sm italic'>
                      &ldquo;{preRegistration.comment}&rdquo;
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {hasDoc && docs && (
            <div className='space-y-3'>
              <p className='text-foreground/90 flex items-center gap-1.5 text-sm font-medium'>
                <FileKey
                  className='text-muted-foreground size-3.5 shrink-0'
                  aria-hidden
                />
                {tUser('section_title', { defaultValue: 'Document data' })}
              </p>
              {Object.entries(docs).map(([key, value]) => {
                const isOcr = key === KIOSK_ID_DOCUMENT_OCR_KEY;
                const isOcrFailed = key === KIOSK_ID_DOCUMENT_OCR_FAILED_KEY;
                const isCustomSkipped =
                  key === KIOSK_ID_CUSTOM_DATA_SKIPPED_KEY;
                const label = isOcr
                  ? tUser('id_document_ocr', {
                      defaultValue: 'Document (OCR line)'
                    })
                  : isOcrFailed
                    ? tUser('id_ocr_failed_label', {
                        defaultValue: 'Document (camera) not read'
                      })
                    : isCustomSkipped
                      ? tUser('id_custom_skipped_label', {
                          defaultValue: 'Custom check-in fields skipped'
                        })
                      : key;
                const display =
                  isOcrFailed && value === true
                    ? tUser('id_ocr_failed_value', {
                        defaultValue:
                          'Yes — verify identity; the visitor could not complete document scan on the kiosk.'
                      })
                    : isCustomSkipped && value === true
                      ? tUser('id_custom_skipped_value', {
                          defaultValue:
                            'Yes — the visitor did not provide the requested data. Confirm at the counter if needed.'
                        })
                      : value === null || value === undefined
                        ? '—'
                        : typeof value === 'string'
                          ? value
                          : JSON.stringify(value);
                return (
                  <div
                    key={key}
                    className='border-border/60 flex flex-col gap-1.5 rounded-md border p-3 sm:flex-row sm:items-start sm:gap-4'
                  >
                    <div className='text-muted-foreground w-full max-w-full min-w-0 shrink-0 text-left text-sm leading-snug font-medium break-words sm:w-48 sm:pr-1'>
                      {label}
                    </div>
                    <div className='text-foreground/95 min-w-0 flex-1 text-sm leading-relaxed break-words whitespace-pre-wrap'>
                      {isOcr && (locale === 'ru' || locale === 'en') ? (
                        <span lang={locale}>{display}</span>
                      ) : (
                        display
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type='button' onClick={onClose}>
            {t('close', { defaultValue: 'Close' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
