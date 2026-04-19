import Link from 'next/link';

import { LeadRequestCta } from '@/components/landing/lead-request-cta';
import { TextLogoImg } from '@/components/landing/text-logo-img';
import type { AppLocale, HomeMessages } from '@/src/messages';

type Props = {
  locale: AppLocale;
  copy: HomeMessages;
  appBaseUrl: string | null;
};

/** Full width on small screens; side-by-side only from `md` so long RU labels never clip at `sm`. */
const pillPrimaryClass =
  'focus-ring inline-flex min-h-12 w-full max-w-full min-w-0 items-center justify-center rounded-full bg-white px-5 py-3.5 text-center text-sm font-semibold leading-snug whitespace-normal text-balance text-neutral-900 shadow-lg shadow-black/15 transition hover:bg-neutral-50 md:w-auto md:min-w-[10rem] md:max-w-md md:px-8';

const pillSecondaryClass =
  'focus-ring inline-flex min-h-12 w-full max-w-full min-w-0 items-center justify-center rounded-full border-2 border-white bg-transparent px-5 py-3.5 text-center text-sm font-semibold leading-snug whitespace-normal text-balance text-white transition hover:bg-white/10 md:w-auto md:min-w-[10rem] md:max-w-md md:px-8';

export function LandingFooterCta({ locale, copy, appBaseUrl }: Props) {
  const year = new Date().getFullYear();
  const salesHref = 'mailto:sales@quokkaq.com';
  /** Without app URL, keep the primary trial CTA (`copy.footer.cta`) on a conversion path — not docs. */
  const trialHref = appBaseUrl
    ? `${appBaseUrl}/${locale}/signup`
    : `/${locale}#book-demo`;
  const privacyHref = `/${locale}/privacy`;
  const termsHref = `/${locale}/terms`;

  return (
    <footer className='relative z-10'>
      <div
        id='book-demo'
        className='scroll-mt-24 overflow-x-hidden bg-gradient-to-br from-[color:var(--color-primary)] to-[color:var(--color-primary-hover)] px-4 py-16 text-center sm:px-6 sm:py-20'
      >
        <div className='mx-auto max-w-3xl min-w-0'>
          <h2 className='font-display mb-4 text-3xl font-bold tracking-tight text-white sm:mb-5 sm:text-4xl'>
            {copy.footer.title}
          </h2>
          <p className='mx-auto mb-10 max-w-2xl text-base leading-relaxed text-white/90 sm:text-lg'>
            {copy.footer.body}
          </p>
          <div className='mx-auto flex w-full max-w-xl min-w-0 flex-col items-stretch justify-center gap-3 md:flex-row md:justify-center md:gap-5'>
            {appBaseUrl ? (
              <a
                href={trialHref}
                target='_blank'
                rel='noopener noreferrer'
                className={pillPrimaryClass}
              >
                {copy.footer.cta}
              </a>
            ) : (
              <Link
                href={trialHref}
                prefetch={false}
                className={pillPrimaryClass}
              >
                {copy.footer.cta}
              </Link>
            )}
            {appBaseUrl ? (
              <LeadRequestCta
                locale={locale}
                source='footer_secondary'
                lead={copy.leadForm}
                appBaseUrl={appBaseUrl}
                className={pillSecondaryClass}
              >
                {copy.footer.ctaSecondary}
              </LeadRequestCta>
            ) : (
              <a href={salesHref} className={pillSecondaryClass}>
                {copy.footer.ctaSecondary}
              </a>
            )}
          </div>
        </div>
      </div>

      <div className='border-t border-[color:var(--color-border)] bg-[#f4f1eb] px-4 py-6 sm:px-6 dark:border-[color:var(--color-border)] dark:bg-[color:var(--color-surface)]'>
        <div className='mx-auto grid max-w-6xl grid-cols-1 items-center gap-4 text-sm text-neutral-500 sm:grid-cols-3 sm:gap-6 dark:text-[color:var(--color-text-muted)]'>
          <div className='flex justify-center sm:justify-start'>
            <Link
              href={`/${locale}`}
              prefetch={false}
              className='focus-ring inline-flex rounded-md opacity-90 grayscale transition-[filter,opacity] duration-200 ease-out hover:opacity-100 hover:grayscale-0 focus-visible:opacity-100 focus-visible:grayscale-0 dark:opacity-85 dark:hover:opacity-100'
              aria-label={copy.logoAlt}
            >
              <TextLogoImg locale={locale} className='h-7 w-auto' />
            </Link>
          </div>
          <p className='text-center tabular-nums'>
            © {year} {copy.footer.copyrightBrand}.{' '}
            {copy.footer.copyrightReserved}
          </p>
          <nav
            className='flex flex-wrap items-center justify-center gap-x-6 gap-y-2 sm:justify-end'
            aria-label='Legal'
          >
            <Link
              href={privacyHref}
              prefetch={false}
              className='focus-ring rounded-sm transition hover:text-[color:var(--color-primary)] dark:hover:text-[color:var(--color-primary)]'
            >
              {copy.footer.privacy}
            </Link>
            <Link
              href={termsHref}
              prefetch={false}
              className='focus-ring rounded-sm transition hover:text-[color:var(--color-primary)] dark:hover:text-[color:var(--color-primary)]'
            >
              {copy.footer.terms}
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
