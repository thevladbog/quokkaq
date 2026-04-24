import {
  Building2,
  CalendarDays,
  Clock,
  Globe,
  Plug
} from 'lucide-react';

import type { HandlersPublicMarketingStatsResponse } from '@/lib/api/generated/subscriptions';
import type { HomeMessages } from '@/src/messages';

type FactIcon = HomeMessages['stats']['facts'][number]['icon'];
type DisplayIcon = FactIcon | 'building';

type Props = {
  copy: HomeMessages;
  statsFromApi: HandlersPublicMarketingStatsResponse | null;
};

function StatIcon({ icon }: { icon: DisplayIcon }) {
  const common =
    'h-full w-full text-[color:var(--color-text-muted)] sm:h-[1.125rem] sm:w-[1.125rem]';

  switch (icon) {
    case 'clock':
      return <Clock className={common} strokeWidth={1.75} aria-hidden />;
    case 'plug':
      return <Plug className={common} strokeWidth={1.75} aria-hidden />;
    case 'globe':
      return <Globe className={common} strokeWidth={1.75} aria-hidden />;
    case 'calendarDays':
      return <CalendarDays className={common} strokeWidth={1.75} aria-hidden />;
    case 'building':
      return <Building2 className={common} strokeWidth={1.75} aria-hidden />;
    default:
      return null;
  }
}

function marketingStatsMinCompanies(): number {
  const raw = process.env.NEXT_PUBLIC_MARKETING_STATS_MIN_COMPANIES?.trim();
  if (raw === undefined || raw === '') {
    return 10;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 10;
}

export function LandingStats({ copy, statsFromApi }: Props) {
  const { heading, facts, liveOrganizationsLabel } = copy.stats;
  const minCompanies = marketingStatsMinCompanies();
  const n = statsFromApi?.activeCompanies ?? 0;
  const useLiveOrgs = minCompanies === 0 ? n > 0 : n >= minCompanies;

  const items: Array<{ label: string; icon: DisplayIcon }> = useLiveOrgs
    ? [
        {
          label: liveOrganizationsLabel.replace(
            '{count}',
            String(Math.floor(n))
          ),
          icon: 'building'
        },
        ...facts.slice(1, 4).map((f) => ({ label: f.label, icon: f.icon }))
      ]
    : facts.slice(0, 4).map((f) => ({ label: f.label, icon: f.icon }));

  return (
    <section
      className='relative z-10 border-y border-[color:var(--color-border)] bg-[color:var(--color-surface-elevated)] py-6 sm:py-8'
      aria-labelledby='stats-heading'
    >
      <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'>
        <div className='mx-auto w-full max-w-6xl'>
          <h2
            id='stats-heading'
            className='font-landing-label mb-6 text-center text-xs leading-snug font-bold tracking-[0.16em] text-[color:var(--color-text-muted)] uppercase sm:mb-7 sm:text-[13px] sm:leading-relaxed sm:tracking-[0.18em] md:text-sm'
          >
            {heading}
          </h2>
          <ul
            className='-mx-1 flex w-full flex-nowrap items-stretch justify-center gap-x-2 gap-y-2 overflow-x-auto px-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-x-3 sm:gap-y-0 md:gap-x-4 [&::-webkit-scrollbar]:hidden'
          >
            {items.map((item) => (
              <li
                key={item.label}
                className='flex shrink-0 flex-row items-center justify-center gap-1.5 text-[color:var(--color-text-muted)] sm:min-h-9 sm:gap-2'
              >
                <span
                  className='inline-flex h-7 w-7 shrink-0 items-center justify-center sm:h-8 sm:w-8 md:h-9 md:w-9'
                  aria-hidden
                >
                  <StatIcon icon={item.icon} />
                </span>
                <span className='font-display whitespace-nowrap text-left text-[0.6875rem] leading-snug font-medium tracking-tight text-[color:var(--color-text-muted)] sm:text-xs sm:leading-snug md:text-sm'>
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
