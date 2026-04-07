'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard,
  Building,
  Users,
  Settings,
  Grid3X3,
  Menu,
  Mail,
  MessageSquare,
  Monitor
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/src/i18n/navigation';

interface AdminSidebarProps {
  className?: string;
}

export default function AdminSidebar({ className }: AdminSidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const t = useTranslations('admin');
  const pathname = usePathname();

  const toggleSidebar = () => setIsOpen(!isOpen);

  const isActive = (path: string) => pathname.includes(path);

  const navItems = [
    {
      icon: LayoutDashboard,
      label: t('navigation.dashboard', { defaultValue: 'Dashboard' }),
      href: '/admin',
      active:
        isActive('/admin') &&
        !isActive('/units') &&
        !isActive('/grid-configuration')
    },
    {
      icon: Building,
      label: t('navigation.units', { defaultValue: 'Units' }),
      href: '/admin/units',
      active: isActive('/units')
    },
    {
      icon: Users,
      label: t('navigation.users', { defaultValue: 'Users' }),
      href: '/admin/users',
      active: isActive('/users')
    },
    {
      icon: Grid3X3,
      label: t('navigation.grid_configuration', {
        defaultValue: 'Grid Configuration'
      }),
      href: '/admin/grid-configuration',
      active: isActive('/grid-configuration')
    },
    {
      icon: Mail,
      label: t('navigation.invitations', { defaultValue: 'Invitations' }),
      href: '/admin/invitations',
      active: isActive('/invitations')
    },
    {
      icon: MessageSquare,
      label: t('navigation.templates', { defaultValue: 'Templates' }),
      href: '/admin/templates',
      active: isActive('/templates')
    },
    {
      icon: Monitor,
      label: t('navigation.desktop_terminals', {
        defaultValue: 'Desktop terminals'
      }),
      href: '/admin/desktop-terminals',
      active: isActive('/desktop-terminals')
    },
    {
      icon: Settings,
      label: t('navigation.settings', { defaultValue: 'Settings' }),
      href: '/admin/settings',
      active: isActive('/settings')
    }
  ];

  return (
    <>
      {/* Mobile menu button */}
      <Button
        variant='outline'
        size='icon'
        className='fixed top-4 left-4 z-50 md:hidden'
        onClick={toggleSidebar}
      >
        <Menu className='h-4 w-4' />
      </Button>

      {/* Sidebar */}
      <div
        className={`bg-background fixed inset-y-0 left-0 z-40 w-64 transform border-r ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } transition-transform duration-300 ease-in-out md:translate-x-0 ${className}`}
      >
        <div className='flex h-16 items-center justify-center border-b'>
          <span className='text-xl font-semibold'>Admin Panel</span>
        </div>
        <nav className='flex-1 space-y-1 px-2 py-4'>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} passHref>
                <Button
                  variant={item.active ? 'secondary' : 'ghost'}
                  className={`w-full justify-start ${
                    item.active ? 'bg-accent border-primary border-r-2' : ''
                  }`}
                  onClick={() => setIsOpen(false)}
                >
                  <Icon className='mr-3 h-4 w-4' />
                  {item.label}
                </Button>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className='fixed inset-0 z-30 bg-black/50 md:hidden'
          onClick={toggleSidebar}
        />
      )}
    </>
  );
}
