'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link } from '../../src/i18n/navigation';
import { Card, CardContent } from '@/components/ui/card';
import {
  LayoutDashboard,
  Users,
  Monitor,
  MonitorSpeaker,
  Loader2,
  ClipboardList,
  Tablet
} from 'lucide-react';
import Image from 'next/image';
import { useAuthContext } from '@/contexts/AuthContext';
import { useRouter } from '../../src/i18n/navigation';
import { useEffect, useState } from 'react';
import { getWordmarkSrc } from '@/lib/wordmark-src';
import { cn } from '@/lib/utils';

export default function Home() {
  const locale = useLocale();
  const wordmarkSrc = getWordmarkSrc(locale);
  const t = useTranslations('home');
  const { isAuthenticated, isLoading, user, token } = useAuthContext();
  const router = useRouter();
  const [systemChecked, setSystemChecked] = useState(false);

  // Check system initialization status first
  useEffect(() => {
    const checkSystemStatus = async () => {
      try {
        const res = await fetch('/api/system/status');
        if (res.ok) {
          const data = await res.json();
          if (!data.initialized) {
            // System not initialized, redirect handled by SystemStatusGuard
            return;
          }
        }
      } catch (error) {
        console.error('Failed to check system status:', error);
      }
      setSystemChecked(true);
    };

    checkSystemStatus();
  }, []);

  useEffect(() => {
    // Do not send to login while a token exists but /auth/me is still resolving (avoids flash after sign-in).
    if (systemChecked && !isLoading && !isAuthenticated && token == null) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router, systemChecked, token]);

  // Operators without admin/staff/supervisor: land on staff panel.
  useEffect(() => {
    if (!systemChecked || isLoading || !user) return;
    const roles = user.roles ?? [];
    if (!roles.includes('operator')) return;
    if (
      roles.includes('admin') ||
      roles.includes('platform_admin') ||
      roles.includes('staff') ||
      roles.includes('supervisor')
    ) {
      return;
    }
    router.replace('/staff');
  }, [systemChecked, isLoading, user, router]);

  const sessionResolving = Boolean(token && !user);

  if (isLoading || sessionResolving) {
    return (
      <div className='flex h-screen w-full items-center justify-center'>
        <Loader2 className='text-primary h-8 w-8 animate-spin' />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Redirecting to login (guest with no token)
  }

  // Helper to check if user has specific permission in ANY unit
  const hasPermissionInAnyUnit = (permission: string) => {
    if (!user?.permissions) return false;
    return (Object.values(user.permissions) as string[][]).some(
      (perms: string[]) => perms.includes(permission)
    );
  };

  const hasRole = (role: string) => user?.roles?.includes(role);
  const isAdmin = hasRole('admin');

  const menuItems = [
    {
      href: '/settings/organization',
      title: t('admin'),
      description: t('admin_description', {
        defaultValue: 'Manage system settings and services'
      }),
      icon: LayoutDashboard,
      color: 'bg-blue-500',
      hoverColor: 'hover:bg-blue-600',
      disabled: !isAdmin
    },
    {
      href: '/staff',
      title: t('staff'),
      description: t('staff_description', {
        defaultValue: 'Access staff panel and controls'
      }),
      icon: Users,
      color: 'bg-green-500',
      hoverColor: 'hover:bg-green-600',
      disabled:
        !isAdmin &&
        !hasRole('staff') &&
        !hasPermissionInAnyUnit('ACCESS_STAFF_PANEL')
    },
    {
      href: '/supervisor',
      title: t('supervisor', { defaultValue: 'Supervisor' }),
      description: t('supervisor_description', {
        defaultValue: 'Monitor unit performance and queues'
      }),
      icon: ClipboardList,
      color: 'bg-indigo-500',
      hoverColor: 'hover:bg-indigo-600',
      disabled:
        !isAdmin &&
        !hasRole('supervisor') &&
        !hasPermissionInAnyUnit('ACCESS_SUPERVISOR_PANEL')
    },
    {
      href: '/kiosk',
      title: t('kiosk'),
      description: t('kiosk_description', {
        defaultValue: 'Customer kiosk and ticketing'
      }),
      icon: Monitor,
      color: 'bg-orange-500',
      hoverColor: 'hover:bg-orange-600',
      disabled: !isAdmin && !hasPermissionInAnyUnit('ACCESS_KIOSK')
    },
    {
      href: '/screen',
      title: t('screen'),
      description: t('screen_description', {
        defaultValue: 'Public queue display screen'
      }),
      icon: MonitorSpeaker,
      color: 'bg-purple-500',
      hoverColor: 'hover:bg-purple-600',
      disabled: !isAdmin && !hasPermissionInAnyUnit('ACCESS_TICKET_SCREEN')
    },
    {
      href: '/counter-display',
      title: t('counter_display'),
      description: t('counter_display_description', {
        defaultValue: 'Guest survey screen at the service counter (pairing)'
      }),
      icon: Tablet,
      color: 'bg-teal-500',
      hoverColor: 'hover:bg-teal-600',
      disabled: !isAdmin && !hasPermissionInAnyUnit('ACCESS_KIOSK')
    }
  ];

  return (
    <div className='bg-background flex flex-col' style={{ height: '100%' }}>
      <div className='flex flex-shrink-0 flex-col items-center justify-center py-3'>
        <div className='mb-3 text-center'>
          <div className='relative mb-4 h-20 w-64'>
            <Image
              src={wordmarkSrc}
              alt={t('title')}
              fill
              className='object-contain'
              priority
            />
          </div>
          <p className='text-muted-foreground text-sm md:text-base'>
            {t('subtitle')}
          </p>
        </div>
      </div>

      <div className='flex flex-grow items-center justify-center px-4 pb-4'>
        <div className='grid w-full max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3'>
          {menuItems.map((item, index) => {
            const Icon = item.icon;
            const interactive = !item.disabled;
            const CardComponent = (
              <Card
                className={cn(
                  'flex h-48 transform touch-manipulation flex-col items-center justify-center p-4 transition-all duration-200 sm:h-48',
                  item.disabled
                    ? 'bg-muted/30 cursor-not-allowed opacity-50'
                    : [
                        'group cursor-pointer hover:scale-[1.02] hover:shadow-lg',
                        item.hoverColor
                      ]
                )}
              >
                <CardContent className='flex h-full w-full flex-col items-center justify-center p-4 py-6 text-center'>
                  <div
                    className={cn(
                      'mb-2 rounded-full p-4',
                      item.disabled ? 'bg-muted' : item.color
                    )}
                  >
                    <Icon className='text-primary-foreground h-8 w-8' />
                  </div>
                  <h3
                    className={cn(
                      'mb-1 text-sm font-semibold transition-colors duration-200 sm:text-base md:text-lg',
                      interactive && 'text-foreground group-hover:text-white'
                    )}
                  >
                    {item.title}
                  </h3>
                  <p
                    className={cn(
                      'text-center text-xs transition-colors duration-200 sm:text-sm',
                      interactive
                        ? 'text-muted-foreground group-hover:text-white/95'
                        : 'text-muted-foreground'
                    )}
                  >
                    {item.description}
                  </p>
                </CardContent>
              </Card>
            );

            return item.disabled ? (
              <div key={index} className='block'>
                {CardComponent}
              </div>
            ) : (
              <Link key={index} href={item.href} className='block'>
                {CardComponent}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
