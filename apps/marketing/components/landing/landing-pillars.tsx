import type { HomeMessages } from '@/src/messages';

type Props = {
  copy: HomeMessages;
};

export function LandingPillars({ copy }: Props) {
  const items = [
    copy.pillars.one,
    copy.pillars.two,
    copy.pillars.three
  ] as const;

  return (
    <section
      id='pillars'
      className='landing-reveal landing-reveal-delay-3 relative z-10 border-t border-[color:var(--color-border)] bg-[color:var(--color-surface-elevated)]/50 py-16 dark:bg-[color:var(--color-surface-elevated)]/30'
      aria-labelledby='pillars-heading'
    >
      <div className='mx-auto max-w-6xl px-4 sm:px-6 lg:px-8'>
        <h2
          id='pillars-heading'
          className='font-landing-label mb-10 text-center text-xs font-medium tracking-[0.25em] text-[color:var(--color-text-muted)] uppercase'
        >
          {copy.pillarsHeading}
        </h2>
        <ul className='grid gap-6 md:grid-cols-3 md:gap-8'>
          {items.map((item) => (
            <li
              key={item.title}
              className='rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-6 shadow-sm dark:bg-[color:var(--color-surface-elevated)]'
            >
              <h3 className='font-display mb-3 text-lg font-semibold text-[color:var(--color-text)]'>
                {item.title}
              </h3>
              <p className='text-sm leading-relaxed text-[color:var(--color-text-muted)]'>
                {item.body}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
