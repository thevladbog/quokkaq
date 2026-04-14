'use client';

import { useListResponsesForClient } from '@/lib/api/generated/surveys';
import { useLocale, useTranslations } from 'next-intl';

export function StaffVisitorSurveyResponses({
  unitId,
  clientId
}: {
  unitId: string;
  clientId: string;
}) {
  const t = useTranslations('admin.guest_survey');
  const locale = useLocale();

  const { data: responses = [], isLoading } = useListResponsesForClient(
    unitId,
    clientId,
    {
      query: {
        select: (r) => r.data ?? []
      }
    }
  );

  const formatWhen = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-GB', {
        dateStyle: 'short',
        timeStyle: 'short'
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  return (
    <div className='border-border/50 bg-muted/5 rounded-lg border p-3'>
      <p className='text-muted-foreground mb-2 text-[10px] font-semibold tracking-wide uppercase'>
        {t('staff_panel_heading')}
      </p>
      {isLoading ? (
        <p className='text-muted-foreground text-sm'>…</p>
      ) : responses.length === 0 ? (
        <p className='text-muted-foreground text-sm'>{t('no_responses')}</p>
      ) : (
        <ul className='max-h-40 space-y-2 overflow-y-auto text-sm'>
          {responses.map((r) => (
            <li
              key={r.id ?? `${r.submittedAt}-${r.ticketId}`}
              className='border-border/40 bg-background rounded-md border px-2 py-1.5 font-mono text-xs'
            >
              <div className='text-muted-foreground mb-1 text-[10px]'>
                {t('response_at', {
                  date: r.submittedAt ? formatWhen(r.submittedAt) : '—'
                })}
              </div>
              <pre className='text-foreground break-all whitespace-pre-wrap'>
                {typeof r.answers === 'string'
                  ? r.answers
                  : JSON.stringify(r.answers, null, 2)}
              </pre>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
