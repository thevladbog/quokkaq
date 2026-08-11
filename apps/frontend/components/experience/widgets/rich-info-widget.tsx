'use client';

import { sanitizeHtml } from '@/lib/sanitize-html';

function localized(value: Record<string, string>, locale: string) {
  return (
    value[locale] ??
    value[locale.split('-')[0] ?? ''] ??
    value.en ??
    Object.values(value)[0] ??
    ''
  );
}

export function RichInfoWidget({
  body,
  locale,
  requireAcknowledgement = false,
  onContinue
}: {
  body: Record<string, string>;
  locale: string;
  requireAcknowledgement?: boolean;
  onContinue?: () => void;
}) {
  return (
    <section
      className='flex h-full min-h-0 flex-col overflow-hidden'
      data-testid='rich-info-widget'
    >
      <div
        className='min-h-0 flex-1 overflow-auto rounded-xl border p-5 text-lg'
        dangerouslySetInnerHTML={{
          __html: sanitizeHtml(localized(body, locale))
        }}
      />
      {requireAcknowledgement ? (
        <button
          type='button'
          className='bg-primary text-primary-foreground mt-3 min-h-14 shrink-0 rounded-lg px-5 font-semibold'
          onClick={onContinue}
        >
          Continue
        </button>
      ) : null}
    </section>
  );
}
