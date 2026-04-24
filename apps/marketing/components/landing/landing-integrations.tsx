import { LandingIntegrationBrandIcon } from '@/components/landing/landing-integration-brand-icon';
import type { HomeMessages, LandingIntegrationId } from '@/src/messages';

type Props = {
  copy: HomeMessages['integrations'];
};

function IntegrationPill({ id, label }: { id: LandingIntegrationId; label: string }) {
  return (
    <li className='flex shrink-0 items-center gap-2.5 rounded-full border border-[color:var(--color-border)]/90 bg-[color:var(--color-surface-elevated)] px-4 py-2.5 shadow-sm'>
      <LandingIntegrationBrandIcon id={id} />
      <span className='text-sm font-semibold whitespace-nowrap text-[color:var(--color-text)]'>
        {label}
      </span>
    </li>
  );
}

export function LandingIntegrations({ copy }: Props) {
  const { items } = copy;
  const srSummary = items.map((i) => i.label).join(', ');

  return (
    <section
      className='relative z-10 border-b border-[color:var(--color-border)] bg-[color:var(--color-surface)] py-6 sm:py-7'
      aria-labelledby='integrations-heading'
    >
      <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'>
        <h2
          id='integrations-heading'
          className='font-landing-label mb-3 text-center text-xs leading-snug font-bold tracking-[0.16em] text-[color:var(--color-text-muted)] uppercase sm:mb-3 sm:text-[13px] sm:tracking-[0.18em]'
        >
          {copy.heading}
        </h2>
        <p className='mx-auto mb-5 max-w-2xl text-center text-sm leading-relaxed text-pretty text-[color:var(--color-text-muted)] sm:mb-6 sm:text-[0.9375rem]'>
          {copy.subheading}
        </p>

        <p className='sr-only'>{srSummary}</p>

        <div className='hidden motion-reduce:block'>
          <ul className='flex max-w-full flex-wrap justify-center gap-3' role='list'>
            {items.map((item) => (
              <IntegrationPill key={item.id} id={item.id} label={item.label} />
            ))}
          </ul>
        </div>

        <div className='relative -mx-4 motion-reduce:hidden sm:mx-0'>
          <div
            className='pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-[color:var(--color-surface)] to-transparent sm:w-14'
            aria-hidden
          />
          <div
            className='pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-[color:var(--color-surface)] to-transparent sm:w-14'
            aria-hidden
          />
          <div className='overflow-hidden px-4 sm:px-0'>
            <div className='landing-integrations-marquee-track' aria-hidden>
              <ul className='flex items-center gap-5 pr-5'>
                {items.map((item) => (
                  <IntegrationPill key={`a-${item.id}`} id={item.id} label={item.label} />
                ))}
              </ul>
              <ul className='flex items-center gap-5 pr-5'>
                {items.map((item) => (
                  <IntegrationPill key={`b-${item.id}`} id={item.id} label={item.label} />
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
