'use client';

import { useMemo } from 'react';

import { LeadRequestCta } from '@/components/landing/lead-request-cta';
import type { AppLocale, HomeMessages } from '@/src/messages';

type Props = {
  locale: AppLocale;
  copy: HomeMessages;
  appBaseUrl: string | null;
};

function calEmbedSrc(): string | null {
  const u = process.env.NEXT_PUBLIC_CALCOM_EMBED_SRC?.trim();
  return u ? u : null;
}

export function LandingBookDemo({ locale, copy, appBaseUrl }: Props) {
  const embedSrc = useMemo(() => calEmbedSrc(), []);
  const bd = copy.bookDemo;

  return (
    <section
      id='book-demo'
      className='scroll-mt-24 relative z-20 border-t border-[color:var(--color-border)] bg-gradient-to-b from-[color:var(--color-surface-elevated)] via-[color:var(--color-surface)] to-[color:var(--color-primary)]/10 py-16 sm:py-24 dark:to-[color:var(--color-primary)]/15'
      aria-labelledby='book-demo-heading'
    >
      <div className='relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8'>
        <h2
          id='book-demo-heading'
          className='font-display mb-3 text-center text-3xl font-bold tracking-tight text-[color:var(--color-text)] sm:text-4xl'
        >
          {bd.heading}
        </h2>
        <p className='mx-auto mb-10 max-w-2xl text-center text-lg text-[color:var(--color-text-muted)]'>
          {bd.body}
        </p>

        {embedSrc ? (
          <div className='space-y-4'>
            <div className='relative overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-1 shadow-[0_20px_50px_-12px_rgb(0_0_0/0.18)] ring-1 ring-black/5 dark:bg-[color:var(--color-surface-elevated)] dark:shadow-[0_24px_60px_-12px_rgb(0_0_0/0.45)] dark:ring-white/10 sm:p-2'>
              <iframe
                title={bd.embedTitle}
                src={embedSrc}
                className='block min-h-[38rem] w-full rounded-xl bg-white sm:min-h-[40rem]'
                allow='camera; microphone; fullscreen; payment'
              />
            </div>
            <p className='text-center'>
              <a
                href={embedSrc}
                target='_blank'
                rel='noopener noreferrer'
                className='focus-ring text-sm font-semibold text-[color:var(--color-primary)] underline-offset-2 hover:underline'
              >
                {bd.openInNewTab}
              </a>
            </p>
          </div>
        ) : (
          <div className='rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-6 text-center shadow-sm sm:p-8'>
            <p className='mb-6 text-sm leading-relaxed text-[color:var(--color-text-muted)]'>
              {bd.embedFallback}
            </p>
            {appBaseUrl ? (
              <LeadRequestCta
                locale={locale}
                source='book_demo_fallback'
                lead={copy.leadForm}
                appBaseUrl={appBaseUrl}
                className='focus-ring inline-flex min-h-12 items-center justify-center rounded-xl bg-[color:var(--color-primary)] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[color:var(--color-primary)]/25'
              >
                {copy.secondaryCta}
              </LeadRequestCta>
            ) : (
              <a
                href='mailto:sales@quokkaq.com'
                className='focus-ring inline-flex min-h-12 items-center justify-center rounded-xl bg-[color:var(--color-primary)] px-6 py-3 text-sm font-semibold text-white shadow-lg'
              >
                {copy.secondaryCta}
              </a>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
