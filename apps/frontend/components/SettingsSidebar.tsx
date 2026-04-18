'use client';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail
} from '@/components/ui/sidebar';
import {
  Building,
  Building2,
  CreditCard,
  DollarSign,
  Home,
  Mail,
  MessageSquare,
  Monitor,
  Plug,
  UserRound,
  Activity
} from 'lucide-react';
import Image from 'next/image';
import { Link, usePathname, useRouter } from '@/src/i18n/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { SidebarCollapsedLogo } from '@/components/SidebarCollapsedLogo';
import { SidebarCollapseToggle } from '@/components/SidebarCollapseToggle';
import { getWordmarkSrc } from '@/lib/wordmark-src';

export default function SettingsSidebar() {
  const locale = useLocale();
  const wordmarkSrc = getWordmarkSrc(locale);
  const pathname = usePathname();
  const router = useRouter();
  const tAdmin = useTranslations('admin');
  const tOrg = useTranslations('organization');
  const tPricing = useTranslations('pricing');
  const tNav = useTranslations('nav');

  const isActive = (path: string) => pathname === path;
  /** True only for real subpaths (e.g. /settings/units/foo), not sibling routes like /settings/units-archive. */
  const isActiveSub = (path: string) => {
    if (path === '/') return false;
    return pathname !== path && pathname.startsWith(`${path}/`);
  };

  const items = [
    {
      icon: Building2,
      label: tOrg('title'),
      href: '/settings/organization',
      active:
        pathname === '/settings/organization' ||
        (pathname.startsWith('/settings/organization/') &&
          !pathname.startsWith('/settings/organization/billing/') &&
          pathname !== '/settings/organization/billing')
    },
    {
      icon: Building,
      label: tAdmin('navigation.units'),
      href: '/settings/units',
      active: isActive('/settings/units') || isActiveSub('/settings/units')
    },
    {
      icon: UserRound,
      label: tAdmin('navigation.users'),
      href: '/settings/users',
      active: isActive('/settings/users')
    },
    {
      icon: Mail,
      label: tAdmin('navigation.invitations'),
      href: '/settings/invitations',
      active: isActive('/settings/invitations')
    },
    {
      icon: CreditCard,
      label: tOrg('billing.title'),
      href: '/settings/organization/billing',
      active:
        isActive('/settings/organization/billing') ||
        isActiveSub('/settings/organization/billing')
    },
    {
      icon: DollarSign,
      label: tPricing('title'),
      href: '/settings/pricing',
      active: isActive('/settings/pricing')
    },
    {
      icon: Plug,
      label: tAdmin('navigation.integrations'),
      href: '/settings/integrations',
      active:
        isActive('/settings/integrations') ||
        isActiveSub('/settings/integrations')
    },
    {
      icon: Monitor,
      label: tAdmin('navigation.desktop_terminals'),
      href: '/settings/desktop-terminals',
      active: isActive('/settings/desktop-terminals')
    },
    {
      icon: MessageSquare,
      label: tAdmin('navigation.templates'),
      href: '/settings/templates',
      active: isActive('/settings/templates')
    },
    {
      icon: Activity,
      label: tAdmin('navigation.operations'),
      href: '/settings/operations',
      active: isActive('/settings/operations')
    }
  ];

  return (
    <Sidebar collapsible='icon'>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size='lg' asChild>
              <Link href='/settings/organization'>
                <div className='flex flex-col gap-0.5 group-data-[collapsible=icon]:hidden'>
                  <span className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
                    {tNav('settingsZone', { defaultValue: 'Settings' })}
                  </span>
                  <div className='relative h-8 w-36'>
                    <Image
                      src={wordmarkSrc}
                      alt='QuokkaQ'
                      fill
                      className='object-contain object-left'
                      priority
                    />
                  </div>
                </div>
                <div className='relative hidden h-8 w-8 shrink-0 group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:justify-center'>
                  <SidebarCollapsedLogo className='size-8' />
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={item.active}>
                      <Link href={item.href}>
                        <Icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  type='button'
                  tooltip={{ children: tNav('home') }}
                  onClick={() => router.push('/')}
                >
                  <Home />
                  <span>{tNav('home')}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarCollapseToggle />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
