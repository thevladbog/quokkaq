import type { HomeMessages } from '@/src/messages';

type Props = {
  copy: HomeMessages;
};

type IndustryIcon = HomeMessages['stats']['industries'][number]['icon'];

function TrustIcon({ icon }: { icon: IndustryIcon }) {
  const common =
    'h-full w-full text-[color:var(--color-text-muted)]';

  switch (icon) {
    case 'healthcare':
      return (
        <svg className={common} fill='none' viewBox='0 0 24 24' aria-hidden>
          <path
            stroke='currentColor'
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth={1.75}
            d='M3 12h4l1.5-4L12 16l2.5-10L17 12h4'
          />
        </svg>
      );
    case 'publicSector':
      return (
        <svg className={common} fill='none' viewBox='0 0 24 24' aria-hidden>
          <path
            stroke='currentColor'
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth={1.75}
            d='M12 3l7 4v11c0 .5-.5 1-1 1H6c-.5 0-1-.5-1-1V7l7-4z'
          />
          <path
            stroke='currentColor'
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth={1.75}
            d='M9 12l2 2 4-4'
          />
        </svg>
      );
    case 'retail':
      return (
        <svg className={common} fill='none' viewBox='0 0 24 24' aria-hidden>
          <path
            stroke='currentColor'
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth={1.75}
            d='M5 7h14v10H5V7z'
          />
          <path
            stroke='currentColor'
            strokeLinecap='round'
            strokeDasharray='2 3'
            strokeWidth={1.5}
            d='M12 7v10'
          />
          <path
            stroke='currentColor'
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth={1.75}
            d='M8 11h3M8 14h6'
          />
        </svg>
      );
    case 'services':
      return (
        <svg className={common} fill='none' viewBox='0 0 24 24' aria-hidden>
          <path
            stroke='currentColor'
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth={1.75}
            d='M9 11a3 3 0 106 0 3 3 0 00-6 0zM5 21v-.5a5.5 5.5 0 0111 0V21'
          />
          <path
            stroke='currentColor'
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth={1.75}
            d='M16.5 8.5l2 2 3.5-3.5'
          />
        </svg>
      );
    default:
      return null;
  }
}

export function LandingStats({ copy }: Props) {
  const { heading, industries } = copy.stats;

  return (
    <section
      className='relative z-10 border-y border-[color:var(--color-border)] bg-[color:var(--color-surface-elevated)] py-6 sm:py-8'
      aria-labelledby='stats-scenarios-heading'
    >
      <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'>
        <div className='mx-auto max-w-3xl sm:max-w-4xl'>
          <h2
            id='stats-scenarios-heading'
            className='font-landing-label mb-8 text-center text-xs leading-snug font-bold tracking-[0.16em] text-[color:var(--color-text-muted)] uppercase sm:mb-10 sm:text-[13px] sm:leading-relaxed sm:tracking-[0.18em] md:text-sm'
          >
            {heading}
          </h2>
          <ul className='flex flex-col items-center gap-5 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-x-6 sm:gap-y-4 md:gap-x-8'>
            {industries.map((item) => (
              <li
                key={item.label}
                className='inline-flex h-8 items-center justify-center gap-2.5 text-[color:var(--color-text-muted)] sm:h-9 sm:gap-3'
              >
                <span
                  className='inline-flex h-8 w-8 shrink-0 items-center justify-center sm:h-9 sm:w-9'
                  aria-hidden
                >
                  <TrustIcon icon={item.icon} />
                </span>
                <span className='font-display text-base font-medium leading-8 tracking-tight text-[color:var(--color-text-muted)] sm:text-lg sm:leading-9'>
                  {item.label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
