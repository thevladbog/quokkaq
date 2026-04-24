import Image from 'next/image';

import { InterfaceWalkthroughTrigger } from '@/components/landing/interface-walkthrough-trigger';
import type { HomeMessages } from '@/src/messages';

type Props = {
  copy: HomeMessages;
  walkthroughVideoEmbedSrc?: string | null;
};

export function LandingInterfaceShowcase({
  copy,
  walkthroughVideoEmbedSrc
}: Props) {
  return (
    <section
      id='interface-showcase'
      className='relative z-10 border-t border-[color:var(--color-border)] bg-white py-20 sm:py-28 dark:bg-[color:var(--color-surface)]'
    >
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
            <article
              key={item.title}
              className='landing-reveal group relative overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] shadow-lg transition hover:shadow-2xl'
              style={{
                animationDelay: `${0.1 * index}s`
              }}
            >
              <div className='absolute top-0 right-0 h-32 w-32 translate-x-8 -translate-y-8 rounded-full bg-gradient-to-br from-[color:var(--color-primary)]/20 to-[color:var(--color-secondary)]/10 blur-2xl transition group-hover:scale-150' />

              <div className='relative z-10'>
                {index === 0 &&
                walkthroughVideoEmbedSrc &&
                walkthroughVideoEmbedSrc.trim() !== '' ? (
                  <InterfaceWalkthroughTrigger
                    item={item}
                    walkthroughCopy={copy.interfaceWalkthrough}
                    videoEmbedSrc={walkthroughVideoEmbedSrc.trim()}
                  />
                ) : (
                  <div className='relative aspect-[16/10] overflow-hidden rounded-t-2xl border-b border-[color:var(--color-border)] bg-[color:var(--color-surface-elevated)]'>
                    <Image
                      src={item.image}
                      alt={item.imageAlt}
                      fill
                      className='object-cover object-top transition duration-300 group-hover:scale-105'
                      sizes='(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 600px'
                    />
                  </div>
                )}

                <div className='p-6'>
                  <h3 className='font-display mb-3 text-xl font-semibold text-[color:var(--color-text)]'>
                    {item.title}
                  </h3>
                  <p className='text-sm leading-relaxed text-[color:var(--color-text-muted)]'>
                    {item.description}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
