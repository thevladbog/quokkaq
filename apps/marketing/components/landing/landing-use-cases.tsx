import type { HomeMessages } from '@/src/messages';

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

        <div className='grid gap-8 md:grid-cols-2 lg:grid-cols-3'>
          {copy.useCases.items.map((useCase, index) => (
            <div
              key={useCase.title}
              className='landing-reveal group flex flex-col gap-4 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-6 shadow-sm transition hover:border-[color:var(--color-primary)]/50 hover:shadow-lg hover:shadow-[color:var(--color-primary)]/10 dark:bg-[color:var(--color-surface)]'
              style={{
                animationDelay: `${0.08 * index}s`
              }}
            >
              <div className='inline-flex items-center gap-2'>
                <span className='font-landing-label rounded-full bg-[color:var(--color-primary)]/10 px-3 py-1 text-xs font-medium text-[color:var(--color-primary)]'>
                  {useCase.industry}
                </span>
              </div>
              <h3 className='font-display text-xl font-semibold text-[color:var(--color-text)]'>
                {useCase.title}
              </h3>
              <p className='text-sm leading-relaxed text-[color:var(--color-text-muted)]'>
                {useCase.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
