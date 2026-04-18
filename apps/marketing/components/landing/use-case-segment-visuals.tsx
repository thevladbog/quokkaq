import type { ComponentType } from 'react';

import type { UseCaseSegment } from '@/src/messages';

const iconStroke = {
  stroke: 'currentColor',
  fill: 'none',
  strokeWidth: 2.25,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const
};

/** Medical cross — reads clearly at small sizes */
function IconHealthcare({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox='0 0 24 24'
      width='24'
      height='24'
      aria-hidden
    >
      <path {...iconStroke} d='M12 3v18M5 10h14' strokeWidth={2.35} />
    </svg>
  );
}

function IconPublicSector({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox='0 0 24 24'
      width='24'
      height='24'
      aria-hidden
    >
      {/* Крупнее в viewBox — прежний контур визуально казался меньше остальных */}
      <path {...iconStroke} d='M3 21h18M5 21V11l7-6 7 6v10M8 21v-6h8v6' />
      <path {...iconStroke} d='M11 13h2' />
    </svg>
  );
}

function IconRetailFinance({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox='0 0 24 24'
      width='24'
      height='24'
      aria-hidden
    >
      <rect {...iconStroke} x='2' y='5' width='20' height='14' rx='2.5' />
      <path {...iconStroke} d='M2 10h20' />
      <path {...iconStroke} d='M6 15h4M14 15h4' />
    </svg>
  );
}

function IconHospitality({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox='0 0 24 24'
      width='24'
      height='24'
      aria-hidden
    >
      <path {...iconStroke} d='M6 8h12l1 4H5l1-4z' />
      <path {...iconStroke} d='M8 8V6a4 4 0 118 0v2' />
      <path {...iconStroke} d='M5 12v8a1 1 0 001 1h12a1 1 0 001-1v-8' />
    </svg>
  );
}

function IconServices({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox='0 0 24 24'
      width='24'
      height='24'
      aria-hidden
    >
      <path
        {...iconStroke}
        d='M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z'
      />
    </svg>
  );
}

function IconEducation({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox='0 0 24 24'
      width='24'
      height='24'
      aria-hidden
    >
      <path {...iconStroke} d='M22 10l-10-5L2 10l10 5 10-5z' />
      <path {...iconStroke} d='M6 12v5c0 1 3 3 6 3s6-2 6-3v-5' />
    </svg>
  );
}

type Visual = {
  tagClass: string;
  iconWrapClass: string;
  Icon: ComponentType<{ className?: string }>;
};

/** Тег — заливка; плитка иконки — прозрачный фон, контур и линии в том же акценте, что и тег */
const VISUALS: Record<UseCaseSegment, Visual> = {
  healthcare: {
    tagClass:
      'bg-rose-500 text-white shadow-sm dark:bg-rose-500 dark:text-white',
    iconWrapClass:
      'border-2 border-rose-500 bg-transparent text-rose-500 dark:border-rose-500 dark:text-rose-500',
    Icon: IconHealthcare
  },
  publicSector: {
    tagClass:
      'bg-teal-600 text-white shadow-sm dark:bg-teal-600 dark:text-white',
    iconWrapClass:
      'border-2 border-teal-600 bg-transparent text-teal-600 dark:border-teal-600 dark:text-teal-600',
    Icon: IconPublicSector
  },
  retailFinance: {
    tagClass:
      'bg-amber-700 text-white shadow-sm dark:bg-amber-700 dark:text-white',
    iconWrapClass:
      'border-2 border-amber-700 bg-transparent text-amber-700 dark:border-amber-700 dark:text-amber-700',
    Icon: IconRetailFinance
  },
  hospitality: {
    tagClass:
      'bg-orange-500 text-white shadow-sm dark:bg-orange-500 dark:text-white',
    iconWrapClass:
      'border-2 border-orange-500 bg-transparent text-orange-500 dark:border-orange-500 dark:text-orange-500',
    Icon: IconHospitality
  },
  services: {
    tagClass:
      'bg-violet-600 text-white shadow-sm dark:bg-violet-600 dark:text-white',
    iconWrapClass:
      'border-2 border-violet-600 bg-transparent text-violet-600 dark:border-violet-600 dark:text-violet-600',
    Icon: IconServices
  },
  education: {
    tagClass:
      'bg-indigo-600 text-white shadow-sm dark:bg-indigo-600 dark:text-white',
    iconWrapClass:
      'border-2 border-indigo-600 bg-transparent text-indigo-600 dark:border-indigo-600 dark:text-indigo-600',
    Icon: IconEducation
  }
};

export function getUseCaseSegmentVisual(segment: UseCaseSegment): Visual {
  return VISUALS[segment];
}
