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
  Building2,
  CreditCard,
  FileText,
  Home,
  Layers,
  LogOut,
  Package
} from 'lucide-react';
import Image from 'next/image';
import { useAuthContext } from '@/contexts/AuthContext';
import { Link, usePathname } from '@/src/i18n/navigation';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';

export default function PlatformSidebar() {
  const pathname = usePathname();
  const { logout } = useAuthContext();
  const t = useTranslations('platform.nav');

  const items = [
    {
      href: '/platform',
      label: t('overview', { defaultValue: 'Overview' }),
      icon: Home,
      match: (p: string) => {
        const parts = p.split('/').filter(Boolean);
        return parts.length === 2 && parts[1] === 'platform';
      }
    },
    {
      href: '/platform/companies',
      label: t('companies', { defaultValue: 'Companies' }),
      icon: Building2,
      match: (p: string) => p.includes('/platform/companies')
    },
    {
      href: '/platform/subscriptions',
      label: t('subscriptions', { defaultValue: 'Subscriptions' }),
      icon: CreditCard,
      match: (p: string) => p.includes('/platform/subscriptions')
    },
    {
      href: '/platform/plans',
      label: t('plans', { defaultValue: 'Plans' }),
      icon: Layers,
      match: (p: string) => p.includes('/platform/plans')
    },
    {
      href: '/platform/catalog-items',
      label: t('catalog', { defaultValue: 'Catalog' }),
      icon: Package,
      match: (p: string) => p.includes('/platform/catalog-items')
    },
    {
      href: '/platform/invoices',
      label: t('invoices', { defaultValue: 'Invoices' }),
      icon: FileText,
      match: (p: string) => p.includes('/platform/invoices')
    }
  ];

  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size='lg' asChild>
              <Link href='/platform'>
                <div className='flex flex-col gap-0.5 group-data-[collapsible=icon]:hidden'>
                  <span className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
                    {t('badge', { defaultValue: 'SaaS operator' })}
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
                const active = item.match(pathname);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={active}>
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
                <SidebarMenuButton asChild>
                  <Link href='/'>
                    <Home />
                    <span>{t('backToApp', { defaultValue: 'Main app' })}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <Button
                  variant='ghost'
                  className='h-9 w-full justify-start gap-2 px-2'
                  onClick={() => logout()}
                >
                  <LogOut className='h-4 w-4' />
                  {t('logout', { defaultValue: 'Log out' })}
                </Button>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarFooter>
    </Sidebar>
  );
}
