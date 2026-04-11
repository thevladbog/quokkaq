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
  Home,
  Users,
  ClipboardList,
  CalendarClock,
  LogOut,
  Globe,
  Layers,
  Settings
} from 'lucide-react';
import Image from 'next/image';
import { useAuthContext } from '@/contexts/AuthContext';
import { Link, usePathname } from '@/src/i18n/navigation';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import ThemeToggle from '@/components/ThemeToggle';
import { useTranslations } from 'next-intl';
import { getInitials, getAvatarColor } from '@/lib/utils';
import { userCanOpenPlatformOperatorUI } from '@/lib/platform-access';
import { SidebarActiveUnitSelect } from '@/components/SidebarActiveUnitSelect';

const AppSidebar = () => {
  const tAdmin = useTranslations('admin');
  const tNav = useTranslations('nav');
  const tProfile = useTranslations('profile');
  const { user, isAuthenticated, logout } = useAuthContext();
  const pathname = usePathname();

  const isActive = (path: string) => pathname === path;
  const isActiveSub = (path: string) =>
    pathname.startsWith(path) && pathname !== path;

  const hasPermissionInAnyUnit = (permission: string) => {
    if (!user?.permissions) return false;
    return (Object.values(user.permissions) as string[][]).some(
      (perms: string[]) => perms.includes(permission)
    );
  };

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
      active: pathname.startsWith('/staff'),
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
      label: tAdmin('navigation.pre_registrations', {
        defaultValue: 'Pre-registrations'
      }),
      href: '/pre-registrations',
      active: pathname.startsWith('/pre-registrations'),
      roles: ['admin', 'staff', 'supervisor']
    }
  ].filter((item) => {
    if (!isAuthenticated) return false;
    if (user?.roles?.includes('admin')) return true;

    const hasRole =
      !item.roles ||
      user?.roles?.some((role: string) => item.roles?.includes(role));

    const hasPermission = item.requiredPermission
      ? hasPermissionInAnyUnit(item.requiredPermission)
      : false;

    return hasRole || hasPermission;
  });

  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size='lg' asChild>
              <Link href='/'>
                <div className='flex items-center gap-2'>
                  <div className='relative h-10 w-40 group-data-[collapsible=icon]:hidden'>
                    <Image
                      src='/logo-text.svg'
                      alt='QuokkaQ'
                      fill
                      className='object-contain'
                      priority
                    />
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
            <SidebarGroupContent>
              <SidebarActiveUnitSelect />
              <SidebarMenu>
                <SidebarMenuItem>
                  <Popover>
                    <PopoverTrigger asChild>
                      <SidebarMenuButton className='h-12'>
                        <Avatar size='sm'>
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
                        <div className='flex flex-col items-start overflow-hidden'>
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
                    </PopoverTrigger>

                    <PopoverContent
                      className='w-80'
                      align='end'
                      side='top'
                      sideOffset={8}
                    >
                      <div className='flex items-center gap-3 pb-3'>
                        <Avatar size='lg'>
                          <AvatarFallback
                            bgColor={getAvatarColor(
                              user?.name || user?.email || undefined
                            )}
                            className='text-lg text-white'
                          >
                            {getInitials(
                              user?.name || user?.email || undefined
                            )}
                          </AvatarFallback>
                        </Avatar>
                        <div className='flex flex-1 flex-col overflow-hidden'>
                          <p className='truncate font-medium'>
                            {user?.name || 'User'}
                          </p>
                          <p className='text-muted-foreground truncate text-sm'>
                            {user?.email}
                          </p>
                        </div>
                      </div>

                      <Separator />

                      <div className='space-y-3 py-3'>
                        <div className='flex items-center justify-between'>
                          <div className='flex items-center gap-2'>
                            <Globe className='h-4 w-4' />
                            <span className='text-sm'>
                              {tProfile('language')}
                            </span>
                          </div>
                          <LanguageSwitcher />
                        </div>

                        <div className='flex items-center justify-between'>
                          <span className='text-sm'>{tProfile('theme')}</span>
                          <ThemeToggle />
                        </div>
                      </div>

                      {user?.roles?.includes('admin') && (
                        <>
                          <Separator />
                          <Button
                            variant='outline'
                            className='w-full justify-start'
                            asChild
                          >
                            <Link href='/settings'>
                              <Settings className='mr-2 h-4 w-4' />
                              {tProfile('openSystemSettings', {
                                defaultValue: 'System settings'
                              })}
                            </Link>
                          </Button>
                        </>
                      )}

                      {userCanOpenPlatformOperatorUI(user) && (
                        <>
                          <Separator />
                          <Button
                            variant='outline'
                            className='w-full justify-start'
                            asChild
                          >
                            <Link href='/platform'>
                              <Layers className='mr-2 h-4 w-4' />
                              {tProfile('openOperatorConsole', {
                                defaultValue: 'Operator console'
                              })}
                            </Link>
                          </Button>
                        </>
                      )}

                      <Separator />

                      <Button
                        variant='ghost'
                        className='hover:text-destructive text-destructive mt-2 w-full justify-start'
                        onClick={logout}
                      >
                        <LogOut className='mr-2 h-4 w-4' />
                        {tProfile('logout')}
                      </Button>
                    </PopoverContent>
                  </Popover>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <Link href='/login'>
                  <span>Login</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarFooter>
    </Sidebar>
  );
};

export default AppSidebar;
