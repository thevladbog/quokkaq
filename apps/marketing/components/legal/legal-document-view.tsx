import Link from 'next/link';

import type { AppLocale } from '@/src/messages';
import type { LegalPageDefinition, LegalPagesCopy } from '@/src/legal-pages';

type Props = {
  locale: AppLocale;
  copy: LegalPagesCopy;
  page: LegalPageDefinition;
};

export function LegalDocumentView({ locale, copy, page }: Props) {
  return (
    <div className='min-h-dvh bg-[color:var(--color-surface)] text-[color:var(--color-text)]'>
      <header className='border-b border-[color:var(--color-border)] bg-[color:var(--color-surface-elevated)]'>
        <div className='mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6'>
          <Link
            href={`/${locale}`}
            prefetch={false}
            className='focus-ring text-sm font-medium text-[color:var(--color-primary)] transition hover:text-[color:var(--color-primary-hover)]'
          >
            ← {copy.backToHome}
          </Link>
        </div>
      </header>

      <article className='mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14'>
        <h1 className='font-display mb-2 text-3xl font-bold tracking-tight sm:text-4xl'>
          {page.title}
        </h1>
        <p className='mb-8 text-sm text-[color:var(--color-text-muted)] sm:text-base'>
          {page.description}
        </p>
        <p className='mb-10 text-sm text-[color:var(--color-text-muted)]'>
          {copy.lastUpdatedLabel}: {copy.lastUpdatedDisplay}
        </p>

        <div className='flex flex-col gap-10'>
          {page.sections.map((section, sectionIndex) => (
            <section key={`${sectionIndex}-${section.heading}`}>
              <h2 className='font-display mb-3 text-lg font-semibold text-[color:var(--color-text)]'>
                {section.heading}
              </h2>
              <div className='space-y-3 text-sm leading-relaxed text-[color:var(--color-text-muted)] sm:text-base'>
                {section.paragraphs.map((p, paragraphIndex) => (
                  <p key={`${sectionIndex}-${paragraphIndex}`}>{p}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <p className='mt-14 border-t border-[color:var(--color-border)] pt-8 text-xs leading-relaxed text-[color:var(--color-text-muted)] sm:text-sm'>
          {copy.footerNote}
        </p>
      </article>
    </div>
  );
}
