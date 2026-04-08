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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem
} from '@/components/ui/sidebar';
import {
  Home,
  Settings,
  Users,
  Building,
  UserRound,
  Grid3X3,
  ClipboardList,
  Mail,
  MessageSquare,
  CalendarClock,
  Monitor,
  LogOut,
  Globe,
  Building2,
  CreditCard,
  DollarSign
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

function filterSubItemsByRole<T extends { roles?: string[] }>(
  items: T[],
  isAuthenticated: boolean,
  user: { roles?: string[] } | null | undefined
): T[] {
  return items.filter(
    (item) =>
      !item.roles ||
      (isAuthenticated && user?.roles?.includes('admin')) ||
      (isAuthenticated &&
        user?.roles?.some((role: string) => item.roles?.includes(role)))
  );
}

const AppSidebar = () => {
  const tAdmin = useTranslations('admin');
  const tNav = useTranslations('nav');
  const tProfile = useTranslations('profile');
  const tOrg = useTranslations('organization');
  const tPricing = useTranslations('pricing');
  const { user, isAuthenticated, logout } = useAuthContext();
  const pathname = usePathname();

  const isActive = (path: string) => pathname === path;
  const isActiveSub = (path: string) =>
    pathname.startsWith(path) && pathname !== path;

  // Define settings submenu items
  const settingsSubItems = [
    {
      icon: Building,
      label: tAdmin('navigation.units', { defaultValue: 'Units' }),
      href: '/admin/units',
      active: isActive('/admin/units') || isActiveSub('/admin/units'),
      roles: ['admin']
    },
    {
      icon: UserRound,
      label: tAdmin('navigation.users', { defaultValue: 'Users' }),
      href: '/admin/users',
      active: isActive('/admin/users'),
      roles: ['admin']
    },
    {
      icon: Grid3X3,
      label: tAdmin('navigation.grid_configuration', {
        defaultValue: 'Grid Configuration'
      }),
      href: '/admin/grid-configuration',
      active: isActive('/admin/grid-configuration'),
      roles: ['admin']
    },
    {
      icon: Mail,
      label: tAdmin('navigation.invitations', { defaultValue: 'Invitations' }),
      href: '/admin/invitations',
      active: isActive('/admin/invitations'),
      roles: ['admin']
    },
    {
      icon: MessageSquare,
      label: tAdmin('navigation.templates', { defaultValue: 'Templates' }),
      href: '/admin/templates',
      active: isActive('/admin/templates'),
      roles: ['admin']
    },
    {
      icon: Monitor,
      label: tAdmin('navigation.desktop_terminals', {
        defaultValue: 'Desktop terminals'
      }),
      href: '/admin/desktop-terminals',
      active: isActive('/admin/desktop-terminals'),
      roles: ['admin']
    }
  ];

  // Define organization submenu items
  const organizationSubItems = [
    {
      icon: Building2,
      label: tOrg('title', { defaultValue: 'Organization' }),
      href: '/organization',
      active: isActive('/organization'),
      roles: ['admin']
    },
    {
      icon: CreditCard,
      label: tOrg('billing.title', { defaultValue: 'Billing' }),
      href: '/organization/billing',
      active:
        isActive('/organization/billing') ||
        isActiveSub('/organization/billing'),
      roles: ['admin']
    }
  ];

  // Helper to check if user has specific permission in ANY unit
  const hasPermissionInAnyUnit = (permission: string) => {
    if (!user?.permissions) return false;
    return (Object.values(user.permissions) as string[][]).some(
      (perms: string[]) => perms.includes(permission)
    );
  };

  // Filter navigation items based on user roles and permissions
  const navItems = [
    {
      icon: Home,
      label: tNav('home', { defaultValue: 'Home' }),
      href: '/',
      active: isActive('/'),
      roles: ['admin', 'staff', 'supervisor', 'user'] // All users can access home
    },
    {
      icon: Building2,
      label: tOrg('title', { defaultValue: 'Organization' }),
      href: '/organization',
      active: pathname.startsWith('/organization'),
      roles: ['admin'], // Only admins can access organization settings
      hasSubmenu: true,
      submenuKey: 'organization'
    },
    {
      icon: DollarSign,
      label: tPricing('title', { defaultValue: 'Pricing' }),
      href: '/pricing',
      active: isActive('/pricing'),
      roles: ['admin', 'staff', 'supervisor', 'user'] // All users can view pricing
    },
    {
      icon: Settings,
      label: tAdmin('navigation.settings', { defaultValue: 'Settings' }),
      href: '/admin/units',
      active: pathname.startsWith('/admin'),
      roles: ['admin'], // Only admins can access admin panel
      hasSubmenu: true,
      submenuKey: 'settings'
    },
    {
      icon: Users,
      label: tNav('staff', { defaultValue: 'Staff' }),
      href: '/staff',
      active: isActive('/staff'),
      roles: ['admin', 'staff'], // Admins and staff can access staff panel
      requiredPermission: 'ACCESS_STAFF_PANEL'
    },
    {
      icon: ClipboardList,
      label: tNav('supervisor', { defaultValue: 'Supervisor' }),
      href: '/supervisor',
      active: isActive('/supervisor') || isActiveSub('/supervisor'),
      roles: ['admin', 'supervisor'], // Admins and supervisors can access supervisor panel
      requiredPermission: 'ACCESS_SUPERVISOR_PANEL'
    },
    {
      icon: CalendarClock,
      label: tAdmin('navigation.pre_registrations', {
        defaultValue: 'Pre-registrations'
      }),
      href: '/admin/pre-registrations',
      active:
        isActive('/admin/pre-registrations') ||
        isActiveSub('/admin/pre-registrations'),
      roles: ['admin', 'staff', 'supervisor']
      // requiredPermission: 'ACCESS_STAFF_PANEL', // Or maybe a specific one? Let's stick to roles for now or reuse staff/supervisor
    }
  ].filter((item) => {
    if (!isAuthenticated) return false;
    if (user?.roles?.includes('admin')) return true; // Admin sees everything

    // Check roles
    const hasRole =
      !item.roles ||
      user?.roles?.some((role: string) => item.roles?.includes(role));

    // Check permissions if defined
    const hasPermission = item.requiredPermission
      ? hasPermissionInAnyUnit(item.requiredPermission)
      : false;

    return hasRole || hasPermission;
  });

  const filteredSettingsSubItems = filterSubItemsByRole(
    settingsSubItems,
    isAuthenticated,
    user
  );

  const filteredOrganizationSubItems = filterSubItemsByRole(
    organizationSubItems,
    isAuthenticated,
    user
  );

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
                const hasSubmenu = item.hasSubmenu;
                const submenuItems =
                  item.submenuKey === 'settings'
                    ? filteredSettingsSubItems
                    : item.submenuKey === 'organization'
                      ? filteredOrganizationSubItems
                      : [];

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={item.active}>
                      <Link href={item.href}>
                        <Icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                    {hasSubmenu && submenuItems.length > 0 && (
                      <SidebarMenuSub>
                        {submenuItems.map((subItem) => {
                          const SubIcon = subItem.icon;
                          return (
                            <SidebarMenuSubItem key={subItem.href}>
                              <SidebarMenuSubButton
                                asChild
                                isActive={subItem.active}
                              >
                                <Link href={subItem.href}>
                                  <SubIcon />
                                  <span>{subItem.label}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          );
                        })}
                      </SidebarMenuSub>
                    )}
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
                      {/* Profile Card */}
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

                      {/* Settings */}
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

                      <Separator />

                      {/* Logout */}
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
