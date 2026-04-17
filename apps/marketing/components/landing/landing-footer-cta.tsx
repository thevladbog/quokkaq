import Link from 'next/link';

import type { AppLocale, HomeMessages } from '@/src/messages';

type Props = {
  locale: AppLocale;
  copy: HomeMessages;
};

export function LandingFooterCta({ locale, copy }: Props) {
  const currentYear = new Date().getFullYear();

  return (
    <footer
      id='book-demo'
      className='relative z-10 scroll-mt-24 border-t border-[color:var(--color-border)] bg-gradient-to-b from-[color:var(--color-surface)] to-[color:var(--color-surface-elevated)]'
    >
      <div className='mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8'>
        <div className='mb-12 flex flex-col items-start justify-between gap-8 rounded-2xl border border-[color:var(--color-border)] bg-gradient-to-br from-[color:var(--color-primary)]/5 to-[color:var(--color-secondary)]/5 p-8 sm:flex-row sm:items-center lg:p-12'>
          <div>
            <h2 className='font-display mb-3 text-2xl font-bold text-[color:var(--color-text)] sm:text-3xl'>
              {copy.footer.title}
            </h2>
            <p className='max-w-xl text-base text-[color:var(--color-text-muted)]'>
              {copy.footer.body}
            </p>
          </div>
          <Link
            href={`/${locale}/docs`}
            prefetch={false}
            className='focus-ring inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl bg-[color:var(--color-primary)] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[color:var(--color-primary)]/30 transition hover:bg-[color:var(--color-primary-hover)]'
          >
            {copy.footer.cta}
          </Link>
        </div>

        <div className='grid gap-8 border-t border-[color:var(--color-border)] pt-12 sm:grid-cols-2 lg:grid-cols-4'>
          <div>
            <h3 className='font-display mb-4 text-sm font-semibold text-[color:var(--color-text)]'>
              Product
            </h3>
            <ul className='space-y-3'>
              <li>
                <a
                  href='#how-it-works'
                  className='focus-ring text-sm text-[color:var(--color-text-muted)] transition hover:text-[color:var(--color-primary)]'
                >
                  How it works
                </a>
              </li>
              <li>
                <a
                  href='#pricing'
                  className='focus-ring text-sm text-[color:var(--color-text-muted)] transition hover:text-[color:var(--color-primary)]'
                >
                  Pricing
                </a>
              </li>
              <li>
                <Link
                  href={`/${locale}/docs`}
                  className='focus-ring text-sm text-[color:var(--color-text-muted)] transition hover:text-[color:var(--color-primary)]'
                >
                  Documentation
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className='font-display mb-4 text-sm font-semibold text-[color:var(--color-text)]'>
              Resources
            </h3>
            <ul className='space-y-3'>
              <li>
                <a
                  href='#faq'
                  className='focus-ring text-sm text-[color:var(--color-text-muted)] transition hover:text-[color:var(--color-primary)]'
                >
                  FAQ
                </a>
              </li>
              <li>
                <Link
                  href={`/${locale}/docs`}
                  className='focus-ring text-sm text-[color:var(--color-text-muted)] transition hover:text-[color:var(--color-primary)]'
                >
                  Guides
                </Link>
              </li>
              <li>
                <Link
                  href={`/${locale}/docs`}
                  className='focus-ring text-sm text-[color:var(--color-text-muted)] transition hover:text-[color:var(--color-primary)]'
                >
                  API Reference
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className='font-display mb-4 text-sm font-semibold text-[color:var(--color-text)]'>
              Company
            </h3>
            <ul className='space-y-3'>
              <li>
                <Link
                  href={`/${locale}/docs`}
                  className='focus-ring text-sm text-[color:var(--color-text-muted)] transition hover:text-[color:var(--color-primary)]'
                >
                  About
                </Link>
              </li>
              <li>
                <Link
                  href={`/${locale}/docs`}
                  className='focus-ring text-sm text-[color:var(--color-text-muted)] transition hover:text-[color:var(--color-primary)]'
                >
                  Contact
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className='font-display mb-4 text-sm font-semibold text-[color:var(--color-text)]'>
              Legal
            </h3>
            <ul className='space-y-3'>
              <li>
                <Link
                  href={`/${locale}/docs`}
                  className='focus-ring text-sm text-[color:var(--color-text-muted)] transition hover:text-[color:var(--color-primary)]'
                >
                  Privacy
                </Link>
              </li>
              <li>
                <Link
                  href={`/${locale}/docs`}
                  className='focus-ring text-sm text-[color:var(--color-text-muted)] transition hover:text-[color:var(--color-primary)]'
                >
                  Terms
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className='mt-12 flex flex-col items-center justify-between gap-4 border-t border-[color:var(--color-border)] pt-8 text-center sm:flex-row sm:text-left'>
          <p className='text-sm text-[color:var(--color-text-muted)]'>
            © {currentYear} QuokkaQ. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
