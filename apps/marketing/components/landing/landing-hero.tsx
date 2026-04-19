import Image from 'next/image';
import Link from 'next/link';

import type { AppLocale, HomeMessages } from '@/src/messages';

import { LeadRequestCta } from '@/components/landing/lead-request-cta';
import { FriendlySmileIcon } from './friendly-smile-icon';
import { LandingTicketsAnimation } from './landing-tickets-animation';

const heroPrimaryClass =
  'focus-ring inline-flex min-h-12 items-center justify-center rounded-xl bg-[color:var(--color-primary)] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[color:var(--color-primary)]/25 transition hover:bg-[color:var(--color-primary-hover)] hover:shadow-xl hover:shadow-[color:var(--color-primary)]/30';

const heroSecondaryClass =
  'focus-ring inline-flex min-h-12 items-center justify-center rounded-xl border-2 border-[color:var(--color-border)] bg-white/50 px-6 py-3 text-sm font-semibold text-[color:var(--color-text)] backdrop-blur-sm transition hover:border-[color:var(--color-primary)] hover:bg-white hover:text-[color:var(--color-primary)]';

type Props = {
  locale: AppLocale;
  copy: HomeMessages;
  appBaseUrl: string | null;
};

export function LandingHero({ locale, copy, appBaseUrl }: Props) {
  const signupHref = appBaseUrl
    ? `${appBaseUrl.replace(/\/$/, '')}/${locale}/signup`
    : null;
  return (
    <section className='relative z-10 mx-auto grid max-w-7xl grid-cols-1 content-center gap-8 px-4 py-8 sm:gap-10 sm:px-6 sm:py-10 lg:min-h-[calc(100dvh-5.25rem)] lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:items-center lg:gap-12 lg:px-8 lg:py-6'>
      <LandingTicketsAnimation locale={locale} />

      <div className='landing-reveal landing-reveal-delay-1 relative z-20 -mt-1 w-full max-w-none min-w-0 justify-self-stretch lg:-mt-3 lg:max-w-[38rem] xl:max-w-[42rem]'>
        <div className='rounded-[2rem] border-2 border-[color:var(--color-border)] bg-[color:var(--color-surface-elevated)]/95 p-7 shadow-2xl backdrop-blur-sm sm:p-9 lg:p-11'>
          <p className='mb-5 inline-flex max-w-full items-center gap-2 rounded-full border border-[color:var(--color-primary)]/20 bg-[color:var(--color-primary)]/8 px-4 py-2 text-sm leading-snug font-medium text-[color:var(--color-primary)]'>
            <span
              className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-primary)]/12 text-[color:var(--color-primary)]'
              aria-hidden
            >
              <FriendlySmileIcon className='h-[1.125rem] w-[1.125rem]' />
            </span>
            <span className='inline-flex min-w-0 flex-wrap items-baseline gap-0.5'>
              <span>{copy.heroEyebrowClaim}</span>
              <span className='group relative inline-flex shrink-0'>
                <button
                  type='button'
                  className='focus-ring relative -top-0.5 ml-px cursor-help text-[0.82em] leading-none font-semibold text-[color:var(--color-primary)] underline-offset-2 hover:underline'
                  aria-describedby='hero-claim-desc'
                  aria-label={copy.heroEyebrowNoteAriaLabel}
                >
                  <span aria-hidden>*</span>
                </button>
                <span
                  role='tooltip'
                  aria-hidden='true'
                  className='pointer-events-none absolute top-full left-1/2 z-50 mt-2 w-[min(20rem,calc(100vw-2.5rem))] -translate-x-1/2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-left text-xs leading-snug font-normal text-[color:var(--color-text-muted)] opacity-0 shadow-lg transition-opacity duration-150 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 dark:bg-[color:var(--color-surface-elevated)]'
                >
                  {copy.heroEyebrowDisclaimer}
                </span>
              </span>
            </span>
            <span id='hero-claim-desc' className='sr-only'>
              {copy.heroEyebrowDisclaimer}
            </span>
          </p>
          <h1 className='font-display mb-5 text-[2.35rem] leading-[1.08] font-bold tracking-tight text-[color:var(--color-text)] sm:text-5xl lg:text-[3.15rem]'>
            {copy.titleBefore}
            <br />
            <span className='text-[color:var(--color-primary)]'>
              {copy.titleAccent}
            </span>
          </h1>
          <p className='mb-7 max-w-xl text-base leading-relaxed text-[color:var(--color-text-muted)] sm:mb-8 sm:max-w-2xl sm:text-lg'>
            {copy.description}
          </p>
          <div className='flex flex-wrap items-center gap-3'>
            {signupHref ? (
              <a
                href={signupHref}
                target='_blank'
                rel='noopener noreferrer'
                className={heroPrimaryClass}
              >
                {copy.docsCta}
              </a>
            ) : (
              <Link
                href={`/${locale}#book-demo`}
                prefetch={false}
                className={heroPrimaryClass}
              >
                {copy.docsCta}
              </Link>
            )}
            {appBaseUrl ? (
              <LeadRequestCta
                locale={locale}
                source='hero_demo'
                lead={copy.leadForm}
                appBaseUrl={appBaseUrl}
                className={heroSecondaryClass}
              >
                {copy.secondaryCta}
              </LeadRequestCta>
            ) : (
              <a href='#book-demo' className={heroSecondaryClass}>
                {copy.secondaryCta}
              </a>
            )}
          </div>
        </div>
      </div>

      <div
        className='landing-reveal landing-reveal-delay-2 relative z-10 flex min-h-0 justify-center lg:justify-end'
        aria-hidden
      >
        <div className='relative flex w-full max-w-[min(100%,20rem)] items-center justify-center sm:max-w-[24rem] lg:max-w-[min(100%,28rem)] xl:max-w-[32rem]'>
          <div className='pointer-events-none absolute inset-[-22%] rounded-full bg-gradient-to-br from-[color:var(--color-primary)]/18 via-[color:var(--color-secondary)]/12 to-transparent blur-3xl' />
          <Image
            src='/quokka-logo.svg'
            alt=''
            width={480}
            height={480}
            className='relative h-auto w-full max-w-[min(100%,260px)] object-contain drop-shadow-md sm:max-w-[min(100%,320px)] lg:max-w-[min(100%,400px)] xl:max-w-[min(100%,460px)]'
            unoptimized
            priority
          />
        </div>
      </div>
    </section>
  );
}
