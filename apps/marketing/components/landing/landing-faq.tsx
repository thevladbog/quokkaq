'use client';

import { useState } from 'react';

import type { HomeMessages } from '@/src/messages';

type Props = {
  copy: HomeMessages;
};

export function LandingFaq({ copy }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section
      id='faq'
      className='relative z-10 border-t border-[color:var(--color-border)] bg-[color:var(--color-surface-elevated)] py-20 sm:py-28'
    >
      <div className='mx-auto max-w-3xl px-4 sm:px-6 lg:px-8'>
        <h2 className='font-display mb-12 text-center text-3xl font-bold tracking-tight text-[color:var(--color-text)] sm:mb-16 sm:text-4xl lg:text-5xl'>
          {copy.faq.heading}
        </h2>

        <div className='flex flex-col gap-4'>
          {copy.faq.items.map((item, index) => {
            const isOpen = openIndex === index;
            const panelId = `faq-panel-${index}`;
            return (
              <div
                key={item.question}
                className='landing-reveal overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] transition hover:border-[color:var(--color-primary)]/50'
                style={{
                  animationDelay: `${0.05 * index}s`
                }}
              >
                <button
                  type='button'
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  className='focus-ring flex w-full items-start gap-4 p-6 text-left transition hover:bg-[color:var(--color-surface-elevated)]'
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                >
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition ${
                      isOpen
                        ? 'bg-[color:var(--color-primary)] text-white'
                        : 'bg-[color:var(--color-primary)]/10 text-[color:var(--color-primary)]'
                    }`}
                  >
                    <svg
                      className={`h-4 w-4 transition-transform ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                      fill='none'
                      viewBox='0 0 24 24'
                      stroke='currentColor'
                    >
                      <path
                        strokeLinecap='round'
                        strokeLinejoin='round'
                        strokeWidth={2}
                        d='M19 9l-7 7-7-7'
                      />
                    </svg>
                  </span>
                  <span className='font-display text-lg font-semibold text-[color:var(--color-text)]'>
                    {item.question}
                  </span>
                </button>

                <div
                  id={panelId}
                  className={`grid transition-all ${
                    isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                  }`}
                >
                  <div className='overflow-hidden'>
                    <div className='border-t border-[color:var(--color-border)] px-6 pt-4 pb-6 pl-16'>
                      <p className='text-sm leading-relaxed text-[color:var(--color-text-muted)]'>
                        {item.answer}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
