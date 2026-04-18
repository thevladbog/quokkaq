import type { HomeMessages } from '@/src/messages';

import { getUseCaseSegmentVisual } from './use-case-segment-visuals';

type Props = {
  copy: HomeMessages;
};

export function LandingUseCases({ copy }: Props) {
  return (
    <section className='relative z-10 border-t border-[color:var(--color-border)] bg-[color:var(--color-surface-elevated)] py-20 sm:py-28'>
      <div className='mx-auto max-w-6xl px-4 sm:px-6 lg:px-8'>
        <div className='mb-16 text-center'>
          <h2 className='font-display mb-4 text-3xl font-bold tracking-tight text-[color:var(--color-text)] sm:text-4xl lg:text-5xl'>
            {copy.useCases.heading}
          </h2>
          <p className='mx-auto max-w-2xl text-lg text-[color:var(--color-text-muted)]'>
            {copy.useCases.subheading}
          </p>
        </div>

        <div className='grid gap-6 sm:gap-8 md:grid-cols-2 lg:grid-cols-3'>
          {copy.useCases.items.map((useCase, index) => {
            const { tagClass, iconWrapClass, Icon } = getUseCaseSegmentVisual(
              useCase.segment
            );
            return (
              <article
                key={useCase.title}
                className='landing-reveal group flex flex-col rounded-3xl border border-[color:var(--color-border)]/80 bg-[color:var(--color-surface)] p-7 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:border-[color:var(--color-primary)]/25 hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.12)] sm:p-8 dark:shadow-[0_1px_2px_rgba(0,0,0,0.2)] dark:hover:border-[color:var(--color-border)] dark:hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.45)]'
                style={{
                  animationDelay: `${0.08 * index}s`
                }}
              >
                <div className='mb-6 flex flex-wrap items-center gap-3'>
                  <div
                    className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${iconWrapClass}`}
                    aria-hidden
                  >
                    <Icon className='h-7 w-7' />
                  </div>
                  <span
                    className={`font-landing-label inline-flex rounded-full px-3.5 py-1.5 text-[11px] font-semibold tracking-[0.08em] uppercase ${tagClass}`}
                  >
                    {useCase.industry}
                  </span>
                </div>

                <h3 className='font-display text-xl font-semibold tracking-tight text-[color:var(--color-text)]'>
                  {useCase.title}
                </h3>
                <p className='mt-3 text-[15px] leading-relaxed text-[color:var(--color-text-muted)]'>
                  {useCase.body}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
