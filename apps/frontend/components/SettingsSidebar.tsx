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
  SidebarMenuItem
} from '@/components/ui/sidebar';
import {
  Building,
  Building2,
  CreditCard,
  DollarSign,
  Grid3X3,
  Home,
  LayoutDashboard,
  LogOut,
  Mail,
  MessageSquare,
  Monitor,
  UserRound
} from 'lucide-react';
import Image from 'next/image';
import { useAuthContext } from '@/contexts/AuthContext';
import { Link, usePathname } from '@/src/i18n/navigation';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';

export default function SettingsSidebar() {
  const pathname = usePathname();
  const { logout } = useAuthContext();
  const tAdmin = useTranslations('admin');
  const tOrg = useTranslations('organization');
  const tPricing = useTranslations('pricing');
  const tNav = useTranslations('nav');
  const tProfile = useTranslations('profile');

  const isActive = (path: string) => pathname === path;
  /** True only for real subpaths (e.g. /settings/units/foo), not sibling routes like /settings/units-archive. */
  const isActiveSub = (path: string) => {
    if (path === '/') return false;
    return pathname !== path && pathname.startsWith(`${path}/`);
  };

  const items = [
    {
      icon: LayoutDashboard,
      label: tAdmin('navigation.dashboard', { defaultValue: 'Dashboard' }),
      href: '/settings',
      active: isActive('/settings')
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
      icon: Grid3X3,
      label: tAdmin('navigation.grid_configuration'),
      href: '/settings/grid-configuration',
      active: isActive('/settings/grid-configuration')
    },
    {
      icon: Mail,
      label: tAdmin('navigation.invitations'),
      href: '/settings/invitations',
      active: isActive('/settings/invitations')
    },
    {
      icon: MessageSquare,
      label: tAdmin('navigation.templates'),
      href: '/settings/templates',
      active: isActive('/settings/templates')
    },
    {
      icon: Monitor,
      label: tAdmin('navigation.desktop_terminals'),
      href: '/settings/desktop-terminals',
      active: isActive('/settings/desktop-terminals')
    },
    {
      icon: DollarSign,
      label: tPricing('title'),
      href: '/settings/pricing',
      active: isActive('/settings/pricing')
    },
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
      icon: CreditCard,
      label: tOrg('billing.title'),
      href: '/settings/organization/billing',
      active:
        isActive('/settings/organization/billing') ||
        isActiveSub('/settings/organization/billing')
    },
    {
      icon: Home,
      label: tNav('home'),
      href: '/',
      active: isActive('/')
    }
  ];

  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size='lg' asChild>
              <Link href='/settings'>
                <div className='flex flex-col gap-0.5 group-data-[collapsible=icon]:hidden'>
                  <span className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
                    {tNav('settingsZone', { defaultValue: 'Settings' })}
                  </span>
                  <div className='relative h-8 w-36'>
                    <Image
                      src='/logo-text.svg'
                      alt='QuokkaQ'
                      fill
                      className='object-contain object-left'
                      priority
                    />
                  </div>
                </div>
                <div className='relative hidden h-8 w-8 group-data-[collapsible=icon]:block'>
                  <Image
                    src='/quokka-logo.svg'
                    alt='QuokkaQ'
                    fill
                    className='object-contain'
                    priority
                  />
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
                <Button
                  variant='ghost'
                  className='hover:text-destructive text-destructive w-full justify-start'
                  onClick={() => logout()}
                >
                  <LogOut className='mr-2 h-4 w-4' />
                  {tProfile('logout')}
                </Button>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarFooter>
    </Sidebar>
  );
}
