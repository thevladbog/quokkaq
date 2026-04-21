'use client';

import type { Invoice } from '@quokkaq/shared-types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { formatPriceMinorUnits } from '@/lib/format-price';
import { invoiceVatSummaryFromLines } from '@/lib/invoice-vat-summary';
import { invoiceLineCommentForDisplay } from '@/lib/invoice-line-comment-display';
import {
  discountMinorForPersistedLine,
  effectiveUnitPriceInclVatMinor
} from '@/lib/invoice-line-totals';
import { useCallback, useMemo } from 'react';

/** Matches next-intl `useTranslations` value bag (strictFunctionTypes). */
type Translate = (
  key: string,
  values?: Record<string, string | number | Date>
) => string;

type InvoiceDocumentLinesAndTotalsProps = {
  inv: Invoice;
  intlLocale: string;
  /** Column and totals labels (e.g. platform.invoiceDetail or organization.invoiceDetail) */
  t: Translate;
  /** VAT breakdown row labels (platform.invoiceDraft) */
  tDraft: Translate;
};

export function InvoiceDocumentLinesAndTotals({
  inv,
  intlLocale,
  t,
  tDraft
}: InvoiceDocumentLinesAndTotalsProps) {
  const lines = useMemo(() => inv.lines ?? [], [inv.lines]);
  const cur = inv.currency?.trim() || 'RUB';

  const formatRate = useCallback(
    (rate: number) =>
      new Intl.NumberFormat(intlLocale, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 4
      }).format(rate),
    [intlLocale]
  );

  const vatSummaryRows = useMemo(
    () => invoiceVatSummaryFromLines(lines),
    [lines]
  );

  const totalDiscountMinor = useMemo(
    () =>
      lines.reduce((sum, line) => sum + discountMinorForPersistedLine(line), 0),
    [lines]
  );

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>
              {t('description', { defaultValue: 'Description' })}
            </TableHead>
            <TableHead className='text-right'>
              {t('qty', { defaultValue: 'Qty' })}
            </TableHead>
            <TableHead className='text-right'>
              {t('measureUnit', { defaultValue: 'Unit' })}
            </TableHead>
            <TableHead className='text-right'>
              {t('priceInclVatDiscounted', {
                defaultValue: 'Price incl. VAT'
              })}
            </TableHead>
            <TableHead className='text-right'>
              {t('vatRate', { defaultValue: 'VAT rate' })}
            </TableHead>
            <TableHead className='text-right'>
              {t('vatAmount', { defaultValue: 'VAT amount' })}
            </TableHead>
            <TableHead className='text-right'>
              {t('discountLine', { defaultValue: 'Discount' })}
            </TableHead>
            <TableHead className='text-right'>
              {t('lineTotal', { defaultValue: 'Total' })}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line, i) => {
            const disc = discountMinorForPersistedLine(line);
            const unitEff = effectiveUnitPriceInclVatMinor(line);
            const commentParen = invoiceLineCommentForDisplay(line.lineComment);
            return (
              <TableRow key={line.id}>
                <TableCell>{i + 1}</TableCell>
                <TableCell>
                  <div className='space-y-0.5'>
                    <div>{line.descriptionPrint}</div>
                    {commentParen ? (
                      <div className='text-muted-foreground text-sm italic'>
                        {commentParen}
                      </div>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className='text-right'>{line.quantity}</TableCell>
                <TableCell className='text-right text-sm'>
                  {(line.unit ?? '').trim() || '—'}
                </TableCell>
                <TableCell className='text-right font-mono text-xs'>
                  {formatPriceMinorUnits(unitEff, cur, intlLocale)}
                </TableCell>
                <TableCell className='text-right font-mono text-xs'>
                  {line.vatExempt ? (
                    <span className='text-muted-foreground'>
                      {t('vatExemptShort', { defaultValue: 'No VAT' })}
                    </span>
                  ) : (
                    `${formatRate(line.vatRatePercent)}%`
                  )}
                </TableCell>
                <TableCell className='text-right font-mono text-xs'>
                  {line.vatExempt
                    ? '—'
                    : formatPriceMinorUnits(
                        line.vatAmountMinor,
                        cur,
                        intlLocale
                      )}
                </TableCell>
                <TableCell className='text-right font-mono text-xs'>
                  {disc > 0
                    ? formatPriceMinorUnits(disc, cur, intlLocale)
                    : '—'}
                </TableCell>
                <TableCell className='text-right font-mono text-xs'>
                  {formatPriceMinorUnits(line.lineGrossMinor, cur, intlLocale)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <div className='ml-auto w-full max-w-sm space-y-4 text-right'>
        <div>
          <p className='text-muted-foreground text-sm'>
            {t('totalPayable', { defaultValue: 'Total payable' })}
          </p>
          <p className='text-2xl font-bold tabular-nums'>
            {formatPriceMinorUnits(inv.amount, cur, intlLocale)}
          </p>
        </div>

        {totalDiscountMinor > 0 || vatSummaryRows.length > 0 ? (
          <div className='text-muted-foreground space-y-1.5 text-sm'>
            {totalDiscountMinor > 0 ? (
              <div className='flex justify-end gap-4'>
                <span>{t('discountTotal', { defaultValue: 'Discount' })}</span>
                <span className='min-w-[7rem] shrink-0 tabular-nums'>
                  {formatPriceMinorUnits(totalDiscountMinor, cur, intlLocale)}
                </span>
              </div>
            ) : null}
            {vatSummaryRows.map((r) => (
              <div key={r.key} className='flex justify-end gap-4'>
                <span>
                  {r.kind === 'exempt'
                    ? tDraft('vatRowExempt', {
                        defaultValue: 'No VAT (exempt)'
                      })
                    : tDraft('vatRowRate', {
                        rate: formatRate(r.rate),
                        defaultValue: '{rate}%'
                      })}
                </span>
                <span className='min-w-[7rem] shrink-0 tabular-nums'>
                  {r.kind === 'exempt'
                    ? '—'
                    : formatPriceMinorUnits(r.vatMinor, cur, intlLocale)}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        <div className='text-muted-foreground space-y-1.5 border-t pt-3 text-sm'>
          <div className='flex justify-end gap-4'>
            <span>
              {t('subtotalExclVat', { defaultValue: 'Subtotal excl. VAT' })}
            </span>
            <span className='text-foreground min-w-[7rem] shrink-0 font-medium tabular-nums'>
              {formatPriceMinorUnits(
                inv.subtotalExclVatMinor ?? 0,
                cur,
                intlLocale
              )}
            </span>
          </div>
          <div className='flex justify-end gap-4'>
            <span>{t('vatTotal', { defaultValue: 'VAT' })}</span>
            <span className='text-foreground min-w-[7rem] shrink-0 font-medium tabular-nums'>
              {formatPriceMinorUnits(inv.vatTotalMinor ?? 0, cur, intlLocale)}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
