import Link from 'next/link';

import type { AppLocale, HomeMessages } from '@/src/messages';

type Props = {
  locale: AppLocale;
  copy: HomeMessages;
};

export function LandingPricing({ locale, copy }: Props) {
  return (
    <section
      id='pricing'
      className='relative z-10 border-t border-[color:var(--color-border)] bg-[color:var(--color-surface)] py-20 sm:py-28'
    >
      <div className='mx-auto max-w-6xl px-4 sm:px-6 lg:px-8'>
        <div className='mb-16 text-center'>
          <h2 className='font-display mb-4 text-3xl font-bold tracking-tight text-[color:var(--color-text)] sm:text-4xl lg:text-5xl'>
            {copy.pricing.heading}
          </h2>
          <p className='mx-auto max-w-2xl text-lg text-[color:var(--color-text-muted)]'>
            {copy.pricing.subheading}
          </p>
        </div>

        <div className='grid gap-8 lg:grid-cols-3'>
          {copy.pricing.plans.map((plan, index) => (
            <div
              key={plan.name}
              className={`landing-reveal relative flex flex-col rounded-2xl border-2 p-8 ${
                plan.recommended
                  ? 'border-[color:var(--color-primary)] bg-gradient-to-br from-[color:var(--color-primary)]/5 to-[color:var(--color-secondary)]/5 shadow-xl shadow-[color:var(--color-primary)]/20'
                  : 'border-[color:var(--color-border)] bg-[color:var(--color-surface-elevated)]'
              }`}
              style={{
                animationDelay: `${0.1 * index}s`
              }}
            >
              {plan.recommended && (
                <div className='absolute -top-4 left-1/2 -translate-x-1/2'>
                  <span className='font-landing-label rounded-full bg-gradient-to-r from-[color:var(--color-primary)] to-[color:var(--color-primary-hover)] px-4 py-1 text-xs font-semibold text-white shadow-lg'>
                    Recommended
                  </span>
                </div>
              )}

              <div className='mb-6'>
                <h3 className='font-display mb-2 text-2xl font-bold text-[color:var(--color-text)]'>
                  {plan.name}
                </h3>
                <div className='mb-2 flex items-baseline gap-1'>
                  <span className='font-display text-5xl font-bold text-[color:var(--color-text)]'>
                    {plan.price}
                  </span>
                  {plan.price !== 'Custom' && (
                    <span className='text-sm text-[color:var(--color-text-muted)]'>
                      /{plan.period}
                    </span>
                  )}
                </div>
                {plan.price === 'Custom' && (
                  <p className='text-sm text-[color:var(--color-text-muted)]'>
                    {plan.period}
                  </p>
                )}
                <p className='mt-2 text-sm text-[color:var(--color-text-muted)]'>
                  {plan.description}
                </p>
              </div>

              <ul className='mb-8 flex flex-col gap-3'>
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className='flex items-start gap-3 text-sm text-[color:var(--color-text)]'
                  >
                    <svg
                      className='mt-0.5 h-5 w-5 shrink-0 text-[color:var(--color-primary)]'
                      fill='none'
                      viewBox='0 0 24 24'
                      stroke='currentColor'
                    >
                      <path
                        strokeLinecap='round'
                        strokeLinejoin='round'
                        strokeWidth={2}
                        d='M5 13l4 4L19 7'
                      />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>

              <Link
                href={`/${locale}/docs`}
                prefetch={false}
                className={`focus-ring mt-auto inline-flex min-h-11 items-center justify-center rounded-xl px-6 py-3 text-sm font-semibold transition ${
                  plan.recommended
                    ? 'bg-[color:var(--color-primary)] text-white shadow-lg shadow-[color:var(--color-primary)]/30 hover:bg-[color:var(--color-primary-hover)]'
                    : 'border-2 border-[color:var(--color-border)] bg-[color:var(--color-surface)] text-[color:var(--color-text)] hover:border-[color:var(--color-primary)] hover:text-[color:var(--color-primary)]'
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
