import type { HomeMessages } from '@/src/messages';

type Props = {
  copy: HomeMessages;
};

export function LandingInterfaceShowcase({ copy }: Props) {
  return (
    <section className='relative z-10 border-t border-[color:var(--color-border)] bg-white py-20 sm:py-28 dark:bg-[color:var(--color-surface)]'>
      <div className='mx-auto max-w-6xl px-4 sm:px-6 lg:px-8'>
        <div className='mb-16 text-center'>
          <h2 className='font-display mb-4 text-3xl font-bold tracking-tight text-[color:var(--color-text)] sm:text-4xl lg:text-5xl'>
            {copy.interfaceShowcase.heading}
          </h2>
          <p className='mx-auto max-w-2xl text-lg text-[color:var(--color-text-muted)]'>
            {copy.interfaceShowcase.subheading}
          </p>
        </div>

        <div className='grid gap-6 md:grid-cols-2 lg:gap-8'>
          {copy.interfaceShowcase.items.map((item, index) => (
            <div
              key={item.title}
              className='landing-reveal group relative overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-8 shadow-lg transition hover:shadow-2xl'
              style={{
                animationDelay: `${0.1 * index}s`
              }}
            >
              <div className='absolute right-0 top-0 h-32 w-32 translate-x-8 -translate-y-8 rounded-full bg-gradient-to-br from-[color:var(--color-primary)]/20 to-[color:var(--color-secondary)]/10 blur-2xl transition group-hover:scale-150' />
              
              <div className='relative z-10'>
                <div className='mb-6 flex aspect-[16/10] items-center justify-center rounded-xl border border-[color:var(--color-border)] bg-gradient-to-br from-[color:var(--color-surface-elevated)] to-[color:var(--color-surface)] p-8'>
                  <div className='flex h-full w-full flex-col items-center justify-center gap-3'>
                    <div className='h-16 w-16 rounded-2xl bg-gradient-to-br from-[color:var(--color-primary)]/20 to-[color:var(--color-secondary)]/20' />
                    <div className='h-3 w-32 rounded-full bg-[color:var(--color-border)]' />
                    <div className='h-3 w-24 rounded-full bg-[color:var(--color-border)]' />
                  </div>
                </div>

                <h3 className='font-display mb-2 text-xl font-semibold text-[color:var(--color-text)]'>
                  {item.title}
                </h3>
                <p className='text-sm text-[color:var(--color-text-muted)]'>
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
