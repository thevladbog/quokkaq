export type LandingTestimonial = {
  quote: string;
  name: string;
  role: string;
  organization?: string;
};

type Props = {
  items: readonly LandingTestimonial[];
  heading: string;
};

/**
 * Renders only when there is verified content — no placeholder logos or fake quotes.
 */
export function LandingTestimonials({ items, heading }: Props) {
  if (!items.length) {
    return null;
  }

  return (
    <section
      id='testimonials'
      aria-labelledby='testimonials-heading'
      className='border-t border-[color:var(--color-border)] bg-[color:var(--color-surface-elevated)] py-20 sm:py-24 dark:bg-[color:var(--color-surface)]'
    >
      <div className='mx-auto max-w-6xl px-4 sm:px-6 lg:px-8'>
        <h2
          id='testimonials-heading'
          className='font-display mb-12 text-center text-3xl font-bold tracking-tight text-[color:var(--color-text)] sm:text-4xl'
        >
          {heading}
        </h2>
        <ul className='grid gap-8 md:grid-cols-2 lg:grid-cols-3'>
          {items.map((item) => (
            <li key={`${item.name}-${item.quote.slice(0, 24)}`}>
              <blockquote className='flex h-full flex-col rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-6 shadow-sm dark:bg-[color:var(--color-surface-elevated)]'>
                <p className='flex-1 text-base leading-relaxed text-[color:var(--color-text-muted)]'>
                  &ldquo;{item.quote}&rdquo;
                </p>
                <footer className='mt-6 border-t border-[color:var(--color-border)] pt-4'>
                  <p className='font-semibold text-[color:var(--color-text)]'>
                    {item.name}
                  </p>
                  <p className='text-sm text-[color:var(--color-text-muted)]'>
                    {item.role}
                    {item.organization ? ` · ${item.organization}` : null}
                  </p>
                </footer>
              </blockquote>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
