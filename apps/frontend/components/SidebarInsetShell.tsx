'use client';

import Image from 'next/image';
import { ReactNode, useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname } from '@/src/i18n/navigation';
import { SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

function useMobileLogoHref(): string {
  const pathname = usePathname();
  return useMemo(() => {
    if (pathname.startsWith('/settings')) return '/settings/organization';
    if (pathname.startsWith('/platform')) return '/platform';
    return '/';
  }, [pathname]);
}

/**
 * Wraps main content next to the app sidebar: sticky mobile bar with {@link SidebarTrigger}
 * and wordmark (md and up — hidden; desktop uses the rail / collapse control).
 */
export function SidebarInsetShell({
  children,
  contentClassName
}: {
  children: ReactNode;
  /** Applied to the padded content wrapper below the mobile header. */
  contentClassName?: string;
}) {
  const t = useTranslations('nav');
  const locale = useLocale();
  const logoHref = useMobileLogoHref();
  const wordmarkSrc = locale === 'ru' ? '/logo-text-ru.svg' : '/logo-text.svg';

  return (
    <SidebarInset>
      <header
        className={cn(
          'bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-30 flex items-center gap-2 border-b backdrop-blur md:hidden',
          'pt-[max(0.5rem,env(safe-area-inset-top))]',
          'pr-[max(0.75rem,env(safe-area-inset-right))] pb-2 pl-[max(0.75rem,env(safe-area-inset-left))]'
        )}
      >
        <SidebarTrigger
          className='size-10 shrink-0'
          aria-label={t('open_menu')}
        />
        <Link
          href={logoHref}
          className='relative flex h-8 min-h-8 max-w-[11rem] min-w-0 flex-1'
        >
          <Image
            src={wordmarkSrc}
            alt='QuokkaQ'
            fill
            className='object-contain object-left'
            sizes='176px'
            priority
          />
        </Link>
      </header>
      <div className={cn('min-w-0 p-4 md:p-8', contentClassName)}>
        {children}
      </div>
    </SidebarInset>
  );
}
