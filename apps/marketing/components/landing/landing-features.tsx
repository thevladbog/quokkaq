import type { HomeMessages } from '@/src/messages';

type Props = {
  copy: HomeMessages;
};

/** Per-card icon tint (box + stroke via currentColor) */
const FEATURE_ICON_STYLES = [
  'bg-[color:var(--color-primary)]/12 text-[color:var(--color-primary)]',
  'bg-teal-500/12 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300',
  'bg-sky-500/12 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  'bg-violet-500/12 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  'bg-amber-500/15 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200',
  'bg-rose-500/12 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
] as const;

const FeatureIcons = [
  <svg
    key='icon-1'
    className='h-8 w-8'
    fill='none'
    viewBox='0 0 24 24'
    stroke='currentColor'
    aria-hidden='true'
    focusable='false'
  >
    <path
      strokeLinecap='round'
      strokeLinejoin='round'
      strokeWidth={2}
      d='M4 6h16M4 12h16M4 18h16'
    />
  </svg>,
  <svg
    key='icon-2'
    className='h-8 w-8'
    fill='none'
    viewBox='0 0 24 24'
    stroke='currentColor'
    aria-hidden='true'
    focusable='false'
  >
    <path
      strokeLinecap='round'
      strokeLinejoin='round'
      strokeWidth={2}
      d='M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z'
    />
  </svg>,
  <svg
    key='icon-3'
    className='h-8 w-8'
    fill='none'
    viewBox='0 0 24 24'
    stroke='currentColor'
    aria-hidden='true'
    focusable='false'
  >
    <path
      strokeLinecap='round'
      strokeLinejoin='round'
      strokeWidth={2}
      d='M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z'
    />
  </svg>,
  <svg
    key='icon-4'
    className='h-8 w-8'
    fill='none'
    viewBox='0 0 24 24'
    stroke='currentColor'
    aria-hidden='true'
    focusable='false'
  >
    <path
      strokeLinecap='round'
      strokeLinejoin='round'
      strokeWidth={2}
      d='M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z'
    />
  </svg>,
  <svg
    key='icon-5'
    className='h-8 w-8'
    fill='none'
    viewBox='0 0 24 24'
    stroke='currentColor'
    aria-hidden='true'
    focusable='false'
  >
    <path
      strokeLinecap='round'
      strokeLinejoin='round'
      strokeWidth={2}
      d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15'
    />
  </svg>,
  <svg
    key='icon-6'
    className='h-8 w-8'
    fill='none'
    viewBox='0 0 24 24'
    stroke='currentColor'
    aria-hidden='true'
    focusable='false'
  >
    <path
      strokeLinecap='round'
      strokeLinejoin='round'
      strokeWidth={2}
      d='M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z'
    />
  </svg>
];

export function LandingFeatures({ copy }: Props) {
  return (
    <section
      id='features'
      className='relative z-10 border-t border-[color:var(--color-border)] bg-[color:var(--color-surface-elevated)] py-20 sm:py-28'
    >
      <div className='mx-auto max-w-6xl px-4 sm:px-6 lg:px-8'>
        <div className='mb-16 text-center'>
          <h2 className='font-display mb-4 text-3xl font-bold tracking-tight text-[color:var(--color-text)] sm:text-4xl lg:text-5xl'>
            {copy.features.heading}
          </h2>
          <p className='mx-auto max-w-2xl text-lg text-[color:var(--color-text-muted)]'>
            {copy.features.subheading}
          </p>
        </div>

        <div className='grid gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8'>
          {copy.features.items.map((feature, index) => (
            <div
              key={feature.title}
              className='landing-reveal group relative rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-6 shadow-sm transition hover:border-[color:var(--color-primary)]/50 hover:shadow-lg hover:shadow-[color:var(--color-primary)]/10 sm:p-8 dark:bg-[color:var(--color-surface)]'
              style={{
                animationDelay: `${0.08 * index}s`
              }}
            >
              <div
                className={`mb-4 inline-flex rounded-xl p-3 transition group-hover:scale-110 ${FEATURE_ICON_STYLES[index % FEATURE_ICON_STYLES.length]}`}
              >
                {FeatureIcons[index % FeatureIcons.length]}
              </div>
              <h3 className='font-display mb-3 text-xl font-semibold text-[color:var(--color-text)]'>
                {feature.title}
              </h3>
              <p className='text-sm leading-relaxed text-[color:var(--color-text-muted)]'>
                {feature.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
