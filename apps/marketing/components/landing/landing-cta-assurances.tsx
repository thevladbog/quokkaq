import { Calendar, CreditCard, X } from 'lucide-react';

import type { HomeMessages } from '@/src/messages';

type Variant = 'hero' | 'footer';

const iconClass = {
  hero: 'text-[color:var(--color-primary)]',
  footer: 'text-white'
} as const;

const textClass = {
  hero: 'text-[color:var(--color-text-muted)]',
  footer: 'text-white/90'
} as const;

type Props = {
  copy: HomeMessages;
  variant: Variant;
};

export function LandingCtaAssurances({ copy, variant }: Props) {
  const { freeTrial, noCreditCard, cancelAnytime } = copy.ctaAssurances;
  const items = [
    { label: freeTrial, Icon: Calendar },
    { label: noCreditCard, Icon: CreditCard },
    { label: cancelAnytime, Icon: X }
  ] as const;

  return (
    <ul
      className={`mt-4 flex flex-wrap items-center justify-start gap-x-4 gap-y-2 sm:mt-5 sm:gap-x-6 ${
        variant === 'footer' ? 'justify-center md:justify-center' : ''
      }`}
      aria-label={copy.ctaAssurancesAriaLabel}
    >
      {items.map(({ label, Icon }) => (
        <li
          key={label}
          className={`inline-flex max-w-full items-center gap-2 text-xs font-medium sm:text-sm ${textClass[variant]}`}
        >
          <span
            className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full sm:h-8 sm:w-8 ${
              variant === 'footer' ? 'bg-white/15' : 'bg-black/5'
            }`}
            aria-hidden
          >
            <Icon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${iconClass[variant]}`} />
          </span>
          <span className='leading-snug'>{label}</span>
        </li>
      ))}
    </ul>
  );
}
