'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Building,
  Building2,
  Users,
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
  const tOrg = useTranslations('organization');
  const pathname = usePathname();

  const toggleSidebar = () => setIsOpen(!isOpen);

  const isActive = (path: string) => pathname.includes(path);

  const organizationNavActive =
    pathname === '/settings/organization' ||
    (pathname.startsWith('/settings/organization/') &&
      !pathname.startsWith('/settings/organization/billing'));

  const navItems = [
    {
      icon: Building2,
      label: tOrg('title'),
      href: '/settings/organization',
      active: organizationNavActive
    },
    {
      icon: Building,
      label: t('navigation.units', { defaultValue: 'Units' }),
      href: '/settings/units',
      active: isActive('/units')
    },
    {
      icon: Users,
      label: t('navigation.users', { defaultValue: 'Users' }),
      href: '/settings/users',
      active: isActive('/users')
    },
    {
      icon: Mail,
      label: t('navigation.invitations', { defaultValue: 'Invitations' }),
      href: '/settings/invitations',
      active: isActive('/invitations')
    },
    {
      icon: MessageSquare,
      label: t('navigation.templates', { defaultValue: 'Templates' }),
      href: '/settings/templates',
      active: isActive('/templates')
    },
    {
      icon: Monitor,
      label: t('navigation.desktop_terminals', {
        defaultValue: 'Desktop terminals'
      }),
      href: '/settings/desktop-terminals',
      active: isActive('/desktop-terminals')
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
