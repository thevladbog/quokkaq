'use client';

import { useState } from 'react';
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
  Home,
  Users,
  ClipboardList,
  CalendarClock,
  ScrollText,
  Contact,
  LogOut,
  LogIn,
  Globe,
  Layers,
  Settings,
  BarChart3,
  Bug,
  UserCircle,
  Palette
} from 'lucide-react';
import Image from 'next/image';
import { useAuthContext } from '@/contexts/AuthContext';
import { Link, usePathname } from '@/src/i18n/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MyProfileSheet } from '@/components/profile/my-profile-sheet';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import { useLocale, useTranslations } from 'next-intl';
import { getInitials, getAvatarColor } from '@/lib/utils';
import { userCanOpenPlatformOperatorUI } from '@/lib/platform-access';
import { SidebarActiveUnitSelect } from '@/components/SidebarActiveUnitSelect';
import { SidebarTenantCompanySelect } from '@/components/SidebarTenantCompanySelect';
import { SidebarCollapsedLogo } from '@/components/SidebarCollapsedLogo';
import { SidebarCollapseToggle } from '@/components/SidebarCollapseToggle';
import { useActiveUnit } from '@/contexts/ActiveUnitContext';
import { getWordmarkSrc } from '@/lib/wordmark-src';

const AppSidebar = () => {
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);
  const locale = useLocale();
  const wordmarkSrc = getWordmarkSrc(locale);
  const tNav = useTranslations('nav');
  const tProfile = useTranslations('profile');
  const { user, isAuthenticated, logout } = useAuthContext();
  const { activeUnitId } = useActiveUnit();
  const pathname = usePathname();
  const loginNavLabel = tNav('login', { defaultValue: 'Login' });

  const isActive = (path: string) => pathname === path;
  const isActiveSub = (path: string) =>
    pathname.startsWith(path) && pathname !== path;
  const isActiveStatistics =
    pathname === '/statistics' || pathname.startsWith('/statistics/');

  const hasPermissionInAnyUnit = (permission: string) => {
    if (!user?.permissions) return false;
    return (Object.values(user.permissions) as string[][]).some(
      (perms: string[]) => perms.includes(permission)
    );
  };

  const auditJournalHref =
    activeUnitId != null && activeUnitId !== ''
      ? `/journal/${activeUnitId}`
      : null;

  const clientsHref =
    activeUnitId != null && activeUnitId !== ''
      ? `/clients/${activeUnitId}`
      : null;

  const statisticsHref =
    activeUnitId != null && activeUnitId !== '' ? `/statistics` : null;

  const navItems = [
    {
      icon: Home,
      label: tNav('home', { defaultValue: 'Home' }),
      href: '/',
      active: isActive('/'),
      roles: ['admin', 'staff', 'supervisor', 'user', 'operator']
    },
    {
      icon: Users,
      label: tNav('staff', { defaultValue: 'Staff' }),
      href: '/staff',
      active:
        (pathname === '/staff' || pathname.startsWith('/staff/')) &&
        !pathname.startsWith('/staff/support'),
      roles: ['admin', 'staff', 'operator'],
      requiredPermission: 'ACCESS_STAFF_PANEL'
    },
    {
      icon: ClipboardList,
      label: tNav('supervisor', { defaultValue: 'Supervisor' }),
      href: '/supervisor',
      active: isActive('/supervisor') || isActiveSub('/supervisor'),
      roles: ['admin', 'supervisor'],
      requiredPermission: 'ACCESS_SUPERVISOR_PANEL'
    },
    {
      icon: CalendarClock,
      label: tNav('pre_registrations', {
        defaultValue: 'Pre-registrations'
      }),
      href: '/pre-registrations',
      active: pathname.startsWith('/pre-registrations'),
      roles: ['admin', 'staff', 'supervisor']
    },
    ...(auditJournalHref
      ? [
          {
            icon: ScrollText,
            label: tNav('audit_journal', { defaultValue: 'Audit log' }),
            href: auditJournalHref,
            active: pathname.startsWith(`/journal/${activeUnitId}`),
            roles: ['admin', 'staff', 'supervisor', 'operator'] as const
          }
        ]
      : []),
    ...(clientsHref
      ? [
          {
            icon: Contact,
            label: tNav('clients', { defaultValue: 'Clients' }),
            href: clientsHref,
            active: pathname.startsWith(`/clients/${activeUnitId}`),
            roles: ['admin', 'staff', 'supervisor', 'operator'] as const
          }
        ]
      : []),
    ...(statisticsHref
      ? [
          {
            icon: BarChart3,
            label: tNav('statistics', { defaultValue: 'Statistics' }),
            href: statisticsHref,
            active: isActiveStatistics,
            roles: ['admin', 'staff', 'supervisor', 'operator'] as const
          }
        ]
      : []),
    {
      icon: Bug,
      label: tNav('support_requests', { defaultValue: 'Support requests' }),
      href: '/staff/support',
      active: pathname.startsWith('/staff/support'),
      roles: ['admin', 'staff', 'supervisor', 'operator']
    }
  ].filter((item) => {
    if (!isAuthenticated) return false;
    if (user?.roles?.includes('admin')) return true;

    const roles = item.roles as readonly string[] | undefined;
    const hasRole = !roles || user?.roles?.some((role) => roles.includes(role));

    const hasPermission = item.requiredPermission
      ? hasPermissionInAnyUnit(item.requiredPermission)
      : false;

    return hasRole || hasPermission;
  });

  return (
    <Sidebar collapsible='icon'>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size='lg' asChild>
              <Link href='/'>
                <div className='flex items-center gap-2'>
                  <div className='relative h-10 w-40 group-data-[collapsible=icon]:hidden'>
                    <Image
                      src={wordmarkSrc}
                      alt='QuokkaQ'
                      fill
                      className='object-contain'
                      priority
                    />
                  </div>
                  <div className='relative hidden h-8 w-8 shrink-0 group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:justify-center'>
                    <SidebarCollapsedLogo className='size-8' />
                  </div>
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
              {navItems.map((item) => {
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
        {isAuthenticated ? (
          <SidebarGroup>
            <SidebarGroupContent className='gap-1'>
              <SidebarTenantCompanySelect />
              <SidebarActiveUnitSelect />
              <SidebarMenu>
                <SidebarMenuItem>
                  <DropdownMenu
                    open={accountMenuOpen}
                    onOpenChange={setAccountMenuOpen}
                  >
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuButton
                        className='h-12 min-h-12 gap-2 py-2 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:min-h-8! group-data-[collapsible=icon]:gap-0!'
                        tooltip={{
                          children:
                            user?.name && user?.email
                              ? `${user.name} · ${user.email}`
                              : (user?.name ??
                                user?.email ??
                                tProfile('account_menu_aria', {
                                  defaultValue: 'Account'
                                }))
                        }}
                      >
                        <Avatar size='sm' className='shrink-0'>
                          {user?.photoUrl ? (
                            <AvatarImage src={user.photoUrl} alt='' />
                          ) : null}
                          <AvatarFallback
                            bgColor={getAvatarColor(
                              user?.name || user?.email || undefined
                            )}
                            className='text-white'
                          >
                            {getInitials(
                              user?.name || user?.email || undefined
                            )}
                          </AvatarFallback>
                        </Avatar>
                        <div className='flex min-w-0 flex-col items-start overflow-hidden group-data-[collapsible=icon]:hidden'>
                          <span className='truncate text-sm font-medium'>
                            {user?.name || user?.email || 'User'}
                          </span>
                          {user?.name && user?.email && (
                            <span className='text-muted-foreground truncate text-xs'>
                              {user?.email}
                            </span>
                          )}
                        </div>
                      </SidebarMenuButton>
                    </DropdownMenuTrigger>

                    <DropdownMenuContent
                      side='top'
                      align='end'
                      sideOffset={12}
                      alignOffset={4}
                      collisionPadding={{ left: 16, right: 12 }}
                      className='border-border/60 max-w-[min(20rem,calc(100vw-2rem))] min-w-[16rem] rounded-xl p-1.5 shadow-md'
                    >
                      <div className='flex items-center gap-2.5 px-2 py-1.5'>
                        <Avatar size='md'>
                          {user?.photoUrl ? (
                            <AvatarImage src={user.photoUrl} alt='' />
                          ) : null}
                          <AvatarFallback
                            bgColor={getAvatarColor(
                              user?.name || user?.email || undefined
                            )}
                            className='text-sm text-white'
                          >
                            {getInitials(
                              user?.name || user?.email || undefined
                            )}
                          </AvatarFallback>
                        </Avatar>
                        <div className='min-w-0 flex-1'>
                          <p className='truncate text-sm font-medium'>
                            {user?.name || 'User'}
                          </p>
                          <p className='text-muted-foreground truncate text-xs'>
                            {user?.email}
                          </p>
                        </div>
                      </div>

                      <DropdownMenuSeparator />

                      <DropdownMenuItem
                        onSelect={() => {
                          setProfileSheetOpen(true);
                        }}
                      >
                        <UserCircle className='text-muted-foreground' />
                        {tProfile('openMyProfile', {
                          defaultValue: 'My profile'
                        })}
                      </DropdownMenuItem>

                      <DropdownMenuSeparator />

                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className='gap-2'>
                          <Globe className='text-muted-foreground size-4 shrink-0' />
                          <span className='text-foreground'>
                            {tProfile('language')}
                          </span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent
                          sideOffset={8}
                          className='min-w-[10rem] p-2'
                          collisionPadding={{ left: 16, right: 12 }}
                        >
                          <LanguageSwitcher />
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>

                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className='gap-2'>
                          <Palette className='text-muted-foreground size-4 shrink-0' />
                          <span className='text-foreground'>
                            {tProfile('theme')}
                          </span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent
                          sideOffset={8}
                          className='min-w-[13.5rem] p-2'
                          collisionPadding={{ left: 16, right: 12 }}
                        >
                          <ThemeSwitcher />
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>

                      {user?.roles?.includes('admin') ? (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem asChild>
                            <Link href='/settings/organization'>
                              <Settings className='text-muted-foreground' />
                              {tProfile('openSystemSettings', {
                                defaultValue: 'System settings'
                              })}
                            </Link>
                          </DropdownMenuItem>
                        </>
                      ) : null}

                      {userCanOpenPlatformOperatorUI(user) ? (
                        <>
                          {user?.roles?.includes('admin') ? null : (
                            <DropdownMenuSeparator />
                          )}
                          <DropdownMenuItem asChild>
                            <Link href='/platform'>
                              <Layers className='text-muted-foreground' />
                              {tProfile('openOperatorConsole', {
                                defaultValue: 'Operator console'
                              })}
                            </Link>
                          </DropdownMenuItem>
                        </>
                      ) : null}

                      <DropdownMenuSeparator />

                      <DropdownMenuItem
                        variant='destructive'
                        onSelect={() => {
                          logout();
                        }}
                      >
                        <LogOut />
                        {tProfile('logout')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <MyProfileSheet
                    open={profileSheetOpen}
                    onOpenChange={setProfileSheetOpen}
                  />
                </SidebarMenuItem>
                <SidebarCollapseToggle />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip={{ children: loginNavLabel }}>
                <Link href='/login'>
                  <LogIn />
                  <span>{loginNavLabel}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
};

export default AppSidebar;
