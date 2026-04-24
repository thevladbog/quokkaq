import type { HomeMessages } from '@/src/messages';

type Props = {
  copy: HomeMessages;
};

function StepConnector() {
  return (
    <div
      className='flex shrink-0 items-center justify-center py-1 lg:w-9 lg:py-0 xl:w-11'
      aria-hidden
    >
      <div className='h-px w-full max-w-[5rem] bg-[color:var(--color-border)] lg:max-w-none' />
    </div>
  );
}

export function LandingHowItWorks({ copy }: Props) {
  const { heading, subheading, steps } = copy.howItWorks;

  return (
    <section
      id='how-it-works'
      className='relative z-10 border-t border-[color:var(--color-border)] bg-[color:var(--color-surface-elevated)] py-14 sm:py-16'
      aria-labelledby='how-it-works-heading'
    >
      <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'>
        <p className='sr-only'>{subheading}</p>
        <h2
          id='how-it-works-heading'
          className='font-display mb-10 text-center text-3xl font-bold tracking-tight text-[color:var(--color-text)] sm:mb-12 sm:text-4xl'
        >
          {heading}
        </h2>

        <div className='flex flex-col items-stretch gap-1 sm:gap-2 lg:flex-row lg:items-stretch lg:justify-center lg:gap-0'>
          {steps.flatMap((step, index) => {
            const card = (
              <article
                key={step.title}
                className='landing-reveal flex min-h-0 flex-1 flex-col items-center rounded-2xl border-2 border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-6 py-8 text-center shadow-md shadow-black/[0.07] ring-1 ring-black/[0.04] dark:shadow-[0_12px_40px_-12px_rgb(0_0_0/0.65)] dark:ring-white/[0.06] lg:max-w-none lg:min-w-0 lg:px-5 lg:py-8 xl:px-7'
                style={{ animationDelay: `${0.08 * index}s` }}
              >
                <div className='mb-5 flex h-11 w-11 items-center justify-center rounded-full bg-[color:var(--color-primary)]/12 sm:h-12 sm:w-12'>
                  <span className='font-display text-lg font-bold text-[color:var(--color-primary)] sm:text-xl'>
                    {index + 1}
                  </span>
                </div>
                <h3 className='font-display mb-3 text-lg font-semibold tracking-tight text-[color:var(--color-text)] sm:text-xl'>
                  {step.title}
                </h3>
                <p className='text-sm leading-relaxed text-[color:var(--color-text-muted)] sm:text-[15px]'>
                  {step.body}
                </p>
              </article>
            );

            if (index < steps.length - 1) {
              return [card, <StepConnector key={`${step.title}-connector`} />];
            }
            return [card];
          })}
        </div>
      </div>
    </section>
  );
}
