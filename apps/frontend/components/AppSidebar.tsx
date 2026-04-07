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
  User,
  Building,
  UserRound,
  Grid3X3,
  ClipboardList,
  Mail,
  MessageSquare,
  CalendarClock,
  Monitor
} from 'lucide-react';
import Image from 'next/image';
import { useAuthContext } from '@/contexts/AuthContext';
import { Link, usePathname } from '@/src/i18n/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import ThemeToggle from '@/components/ThemeToggle';
import { useTranslations } from 'next-intl';

const AppSidebar = () => {
  const tAdmin = useTranslations('admin');
  const tNav = useTranslations('nav');
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
      icon: Settings,
      label: tAdmin('navigation.settings', { defaultValue: 'Settings' }),
      href: '/admin/units',
      active: pathname.startsWith('/admin'),
      roles: ['admin'], // Only admins can access admin panel
      hasSubmenu: true
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

  const filteredSettingsSubItems = settingsSubItems.filter(
    (item) =>
      !item.roles || // No role restriction
      (isAuthenticated && user?.roles?.includes('admin')) || // Admin has access to everything
      (isAuthenticated &&
        user?.roles?.some((role: string) => item.roles?.includes(role))) // User has required role
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
                const isSettingsItem =
                  item.href === '/admin/units' && item.hasSubmenu;

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={item.active}>
                      {isSettingsItem ? (
                        <Link href={item.href}>
                          <Icon />
                          <span>{item.label}</span>
                        </Link>
                      ) : (
                        <Link href={item.href}>
                          <Icon />
                          <span>{item.label}</span>
                        </Link>
                      )}
                    </SidebarMenuButton>
                    {isSettingsItem && filteredSettingsSubItems.length > 0 && (
                      <SidebarMenuSub>
                        {filteredSettingsSubItems.map((subItem) => {
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
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuButton>
                        <User />
                        <span>{user?.name || user?.email || 'User'}</span>
                      </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className='ml-2 w-[--radix-dropdown-menu-trigger-width]'>
                      <div className='space-y-2 p-2'>
                        <div className='flex items-center justify-between'>
                          <span className='text-sm'>
                            {tAdmin('settings.language', {
                              defaultValue: 'Language'
                            })}
                          </span>
                          <LanguageSwitcher />
                        </div>
                        <div className='flex items-center justify-between'>
                          <span className='text-sm'>
                            {tAdmin('settings.theme', {
                              defaultValue: 'Theme'
                            })}
                          </span>
                          <ThemeToggle />
                        </div>
                      </div>
                      <DropdownMenuItem className='mt-2' onClick={logout}>
                        Logout
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
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
