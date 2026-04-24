import { FileCheck, Globe, Lock, Server, Shield } from 'lucide-react';

import type { HomeMessages } from '@/src/messages';

const icons = [Shield, Server, FileCheck, Globe, Lock] as const;

type Props = {
  copy: HomeMessages['trust'];
};

export function LandingTrustBadges({ copy }: Props) {
  return (
    <section
      className='relative z-10 border-y border-[color:var(--color-border)] bg-[color:var(--color-surface-elevated)] py-12 sm:py-16'
      aria-labelledby='trust-heading'
    >
      <div className='mx-auto max-w-6xl px-4 sm:px-6 lg:px-8'>
        <h2
          id='trust-heading'
          className='font-display mb-8 text-center text-2xl font-bold tracking-tight text-[color:var(--color-text)] sm:mb-10 sm:text-3xl'
        >
          {copy.heading}
        </h2>
        <ul className='mx-auto grid max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 lg:gap-6'>
          {copy.items.map((item, i) => {
            const Icon = icons[i % icons.length];
            return (
              <li
                key={item.title}
                className='flex flex-col gap-3 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5 shadow-sm sm:p-6'
              >
                <span
                  className='inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[color:var(--color-primary)]/10 text-[color:var(--color-primary)]'
                  aria-hidden
                >
                  <Icon className='h-5 w-5' strokeWidth={1.75} />
                </span>
                <span className='text-pretty text-left text-sm leading-relaxed font-medium text-[color:var(--color-text)] sm:text-base'>
                  {item.title}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
