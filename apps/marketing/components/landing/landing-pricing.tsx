import Link from 'next/link';

import type { SubscriptionPlan } from '@quokkaq/shared-types';
import {
  buildPricingRowsFromApiPlan,
  formatPriceMinorUnits,
  formatPriceMinorUnitsAmountOnly,
  subscriptionPlanDisplayName
} from '@quokkaq/subscription-pricing';

import type { AppLocale, HomeMessages } from '@/src/messages';
import { localeHomePath } from '@/lib/locale-paths';
import { formatPricingRowLabel } from '@/lib/format-pricing-row-label';
import { LeadRequestCta } from '@/components/landing/lead-request-cta';

function intlLocaleFromAppLocale(locale: AppLocale): string {
  return locale === 'ru' ? 'ru-RU' : 'en-US';
}

type Props = {
  locale: AppLocale;
  copy: HomeMessages;
  plansFromApi: SubscriptionPlan[] | null;
  appBaseUrl: string | null;
};

export function LandingPricing({
  locale,
  copy,
  plansFromApi,
  appBaseUrl
}: Props) {
  const intlLocale = intlLocaleFromAppLocale(locale);
  const labels = copy.pricingFromApi.rowLabels;
  const apiPlans = (plansFromApi ?? []).filter(
    (p) => p.isPublic !== false && p.isActive !== false
  );
  const useApi = apiPlans.length > 0;

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
          {useApi
            ? apiPlans.map((plan, index) => {
                const planExt = plan as SubscriptionPlan & {
                  isFree?: boolean;
                  pricingModel?: string;
                };
                const isPopular = plan.isPromoted === true;
                const isCustom = plan.code === 'enterprise' && !planExt.isFree;
                const isFree = planExt.isFree === true;
                const isPerUnit = planExt.pricingModel === 'per_unit';
                const rows = buildPricingRowsFromApiPlan(plan);
                const intervalLabel = isFree
                  ? (copy.pricingFromApi.freePlan ?? 'Бесплатно')
                  : isPerUnit
                    ? (copy.pricingFromApi.perUnitPerMonth ?? '/ подр. / мес')
                    : plan.interval === 'year'
                      ? copy.pricingFromApi.perYear
                      : copy.pricingFromApi.perMonth;
                /** Self-service trial / signup; otherwise contact sales. */
                const sellable =
                  !isCustom && plan.allowInstantPurchase !== false;
                const href = (() => {
                  if (appBaseUrl && sellable) {
                    const base = String(appBaseUrl).replace(/\/$/, '');
                    return `${base}/${locale}/signup?plan=${encodeURIComponent(plan.code)}`;
                  }
                  if (!sellable) {
                    return '';
                  }
                  return `${localeHomePath(locale)}#book-demo`;
                })();
                const ctaLabel = isFree
                  ? (copy.pricingFromApi.startFree ?? 'Начать бесплатно')
                  : sellable
                    ? copy.pricingFromApi.startTrial
                    : copy.pricingFromApi.contactSales;
                const planTitle = subscriptionPlanDisplayName(plan, locale);
                /** EN: move ISO currency into the title so the price row fits (e.g. "Optimal, RUB"). */
                const enSplitCurrency =
                  locale === 'en' && !isCustom && plan.price > 0;
                const planHeading = enSplitCurrency
                  ? `${planTitle}, ${(plan.currency ?? 'RUB').toUpperCase()}`
                  : planTitle;
                const priceTypography =
                  locale === 'en'
                    ? 'text-3xl font-bold tabular-nums tracking-tight sm:text-4xl lg:text-[2.05rem] xl:text-5xl'
                    : 'text-4xl font-bold tabular-nums tracking-tight sm:text-5xl';

                return (
                  <div
                    key={plan.id}
                    className={`landing-reveal relative z-[1] flex flex-col overflow-visible rounded-2xl border-2 p-8 ${
                      isPopular
                        ? 'isolate border-[color:var(--color-primary)] bg-gradient-to-br from-[color:var(--color-primary)]/5 to-[color:var(--color-secondary)]/5 pt-10 shadow-xl ring-2 shadow-[color:var(--color-primary)]/20 ring-[color:var(--color-primary)]/30 ring-offset-2 ring-offset-[color:var(--color-surface)]'
                        : 'border-[color:var(--color-border)] bg-[color:var(--color-surface-elevated)]'
                    }`}
                    style={{ animationDelay: `${0.1 * index}s` }}
                  >
                    {isPopular && (
                      <div className='absolute -top-4 left-1/2 z-[3] -translate-x-1/2'>
                        <span className='font-landing-label rounded-full bg-gradient-to-r from-[color:var(--color-primary)] to-[color:var(--color-primary-hover)] px-4 py-1 text-xs font-semibold text-white shadow-lg'>
                          {copy.pricingFromApi.popularBadge}
                        </span>
                      </div>
                    )}

                    <div className='relative z-0 mb-6'>
                      <h3 className='font-display mb-2 text-2xl font-bold text-[color:var(--color-text)]'>
                        {planHeading}
                      </h3>
                      <div className='mb-2 inline-flex max-w-full min-w-0 flex-nowrap items-baseline gap-x-1.5 leading-tight whitespace-nowrap'>
                        {isFree ? (
                          <span className='font-display text-3xl font-bold text-[color:var(--color-text)]'>
                            {copy.pricingFromApi.freePlan ?? 'Бесплатно'}
                          </span>
                        ) : isCustom ? (
                          <span className='font-display text-3xl font-bold text-[color:var(--color-text)]'>
                            {copy.pricingFromApi.customPricing}
                          </span>
                        ) : (
                          <>
                            <span
                              className={`font-display text-[color:var(--color-text)] ${priceTypography}`}
                            >
                              {enSplitCurrency
                                ? formatPriceMinorUnitsAmountOnly(
                                    plan.price,
                                    plan.currency,
                                    intlLocale
                                  )
                                : formatPriceMinorUnits(
                                    plan.price,
                                    plan.currency,
                                    intlLocale
                                  )}
                            </span>
                            <span className='shrink-0 self-baseline text-sm leading-none font-medium whitespace-nowrap text-[color:var(--color-text-muted)]'>
                              {intervalLabel}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <ul className='relative z-0 mb-8 flex flex-col gap-3'>
                      {rows.map((row) => (
                        <li
                          key={row.rowKey}
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
                          {formatPricingRowLabel(
                            locale,
                            row.translationKey,
                            row.count,
                            labels
                          )}
                        </li>
                      ))}
                    </ul>

                    {sellable ? (
                      appBaseUrl ? (
                        <a
                          href={href}
                          target='_blank'
                          rel='noopener noreferrer'
                          className={`focus-ring relative mt-auto inline-flex w-full items-center justify-center rounded-xl px-6 py-3 font-semibold transition ${
                            isPopular
                              ? 'z-[3] min-h-12 bg-gradient-to-r from-[color:var(--color-primary)] to-[color:var(--color-primary-hover)] text-base font-bold text-white shadow-lg shadow-[color:var(--color-primary)]/35 hover:from-[color:var(--color-primary-hover)] hover:to-[color:var(--color-primary-hover)] hover:shadow-xl hover:shadow-[color:var(--color-primary)]/45'
                              : 'z-[1] min-h-11 border-2 border-[color:var(--color-border)] bg-[color:var(--color-surface)] text-sm text-[color:var(--color-text)] hover:border-[color:var(--color-primary)] hover:text-[color:var(--color-primary)]'
                          }`}
                        >
                          {ctaLabel}
                        </a>
                      ) : (
                        <Link
                          href={href}
                          prefetch={false}
                          className={`focus-ring relative mt-auto inline-flex w-full items-center justify-center rounded-xl px-6 py-3 font-semibold transition ${
                            isPopular
                              ? 'z-[3] min-h-12 bg-gradient-to-r from-[color:var(--color-primary)] to-[color:var(--color-primary-hover)] text-base font-bold text-white shadow-lg shadow-[color:var(--color-primary)]/35 hover:from-[color:var(--color-primary-hover)] hover:to-[color:var(--color-primary-hover)] hover:shadow-xl hover:shadow-[color:var(--color-primary)]/45'
                              : 'z-[1] min-h-11 border-2 border-[color:var(--color-border)] bg-[color:var(--color-surface)] text-sm text-[color:var(--color-text)] hover:border-[color:var(--color-primary)] hover:text-[color:var(--color-primary)]'
                          }`}
                        >
                          {ctaLabel}
                        </Link>
                      )
                    ) : (
                      <LeadRequestCta
                        locale={locale}
                        source={`pricing_plan_${plan.code}`}
                        lead={copy.leadForm}
                        appBaseUrl={appBaseUrl}
                        planCode={plan.code}
                        className={`focus-ring relative mt-auto inline-flex w-full items-center justify-center rounded-xl px-6 py-3 font-semibold transition ${
                          isPopular
                            ? 'z-[3] min-h-12 bg-gradient-to-r from-[color:var(--color-primary)] to-[color:var(--color-primary-hover)] text-base font-bold text-white shadow-lg shadow-[color:var(--color-primary)]/35 hover:from-[color:var(--color-primary-hover)] hover:to-[color:var(--color-primary-hover)] hover:shadow-xl hover:shadow-[color:var(--color-primary)]/45'
                            : 'z-[1] min-h-11 border-2 border-[color:var(--color-border)] bg-[color:var(--color-surface)] text-sm text-[color:var(--color-text)] hover:border-[color:var(--color-primary)] hover:text-[color:var(--color-primary)]'
                        }`}
                      >
                        {ctaLabel}
                      </LeadRequestCta>
                    )}

                    {isPopular && (
                      <div
                        className='landing-pricing-popular-glass-edge pointer-events-none absolute inset-0 z-[2] rounded-2xl'
                        aria-hidden
                      >
                        <div className='landing-pricing-popular-shimmer-bar' />
                      </div>
                    )}
                  </div>
                );
              })
            : copy.pricing.plans.map((plan, index) => {
                const isCustomFallback = plan.isCustom === true;
                return (
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
                          {copy.pricingFromApi.popularBadge}
                        </span>
                      </div>
                    )}

                    <div className='mb-6'>
                      <h3 className='font-display mb-2 text-2xl font-bold text-[color:var(--color-text)]'>
                        {plan.name}
                      </h3>
                      <div className='mb-2 flex min-w-0 flex-nowrap items-baseline gap-x-2 gap-y-0'>
                        <span className='font-display text-4xl font-bold tracking-tight text-[color:var(--color-text)] tabular-nums sm:text-5xl'>
                          {plan.price}
                        </span>
                        {!isCustomFallback && (
                          <span className='shrink-0 text-sm leading-none font-medium whitespace-nowrap text-[color:var(--color-text-muted)]'>
                            /{plan.period}
                          </span>
                        )}
                      </div>
                      {isCustomFallback && (
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
                      href={`${localeHomePath(locale)}#book-demo`}
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
                );
              })}
        </div>

        <div className='landing-reveal relative mt-12 overflow-hidden rounded-2xl border-2 border-[color:var(--color-primary)]/35 bg-gradient-to-br from-[color:var(--color-primary)]/14 via-[color:var(--color-surface-elevated)] to-[color:var(--color-secondary)]/12 p-6 shadow-xl shadow-[color:var(--color-primary)]/15 sm:mt-16 sm:p-8'>
          <div
            className='pointer-events-none absolute -top-24 -right-20 h-56 w-56 rounded-full bg-[color:var(--color-primary)]/25 blur-3xl'
            aria-hidden
          />
          <div
            className='pointer-events-none absolute -bottom-28 -left-16 h-48 w-48 rounded-full bg-[color:var(--color-secondary)]/20 blur-3xl'
            aria-hidden
          />
          <div className='relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between lg:gap-10'>
            <div className='flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-5'>
              <div
                className='mx-auto flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[color:var(--color-primary)] to-[color:var(--color-primary-hover)] text-white shadow-lg shadow-[color:var(--color-primary)]/35 sm:mx-0'
                aria-hidden
              >
                <svg
                  className='h-7 w-7'
                  fill='none'
                  viewBox='0 0 24 24'
                  stroke='currentColor'
                  strokeWidth={1.75}
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    d='M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z'
                  />
                </svg>
              </div>
              <div className='min-w-0 flex-1 text-center sm:text-left'>
                <p className='font-landing-label mb-2 text-xs font-semibold tracking-[0.12em] text-[color:var(--color-primary)] uppercase'>
                  {copy.pricingFromApi.customTermsEyebrow}
                </p>
                <h3 className='font-display text-xl leading-tight font-bold tracking-tight text-[color:var(--color-text)] sm:text-2xl'>
                  {copy.pricingFromApi.customTermsTitle}
                </h3>
                <p className='mt-3 max-w-2xl text-sm leading-relaxed text-[color:var(--color-text-muted)] sm:text-base'>
                  {copy.pricingFromApi.customTermsBody}
                </p>
              </div>
            </div>
            <LeadRequestCta
              locale={locale}
              source='pricing_custom_terms'
              lead={copy.leadForm}
              appBaseUrl={appBaseUrl}
              className='focus-ring group inline-flex min-h-12 w-full shrink-0 items-center justify-center gap-2 self-center rounded-xl bg-[color:var(--color-primary)] px-7 py-3.5 text-base font-semibold text-white shadow-lg shadow-[color:var(--color-primary)]/35 transition hover:bg-[color:var(--color-primary-hover)] hover:shadow-xl hover:shadow-[color:var(--color-primary)]/40 sm:w-auto sm:self-stretch sm:px-8 lg:self-center'
            >
              <span>{copy.pricingFromApi.requestQuote}</span>
              <svg
                className='h-5 w-5 transition-transform group-hover:translate-x-0.5 rtl:rotate-180'
                fill='none'
                viewBox='0 0 24 24'
                stroke='currentColor'
                aria-hidden
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M13 7l5 5m0 0l-5 5m5-5H6'
                />
              </svg>
            </LeadRequestCta>
          </div>
        </div>
      </div>
    </section>
  );
}
