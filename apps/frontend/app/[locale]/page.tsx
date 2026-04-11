'use client';

import { useTranslations } from 'next-intl';
import { Link } from '../../src/i18n/navigation';
import { Card, CardContent } from '@/components/ui/card';
import {
  LayoutDashboard,
  Users,
  Monitor,
  MonitorSpeaker,
  Loader2,
  ClipboardList
} from 'lucide-react';
import Image from 'next/image';
import { useAuthContext } from '@/contexts/AuthContext';
import { useRouter } from '../../src/i18n/navigation';
import { useEffect, useState } from 'react';

export default function Home() {
  const t = useTranslations('home');
  const { isAuthenticated, isLoading, user } = useAuthContext();
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
    if (systemChecked && !isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router, systemChecked]);

  if (isLoading) {
    return (
      <div className='flex h-screen w-full items-center justify-center'>
        <Loader2 className='text-primary h-8 w-8 animate-spin' />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Don't render anything while redirecting
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
      href: '/admin',
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
    }
  ];

  return (
    <div className='bg-background flex flex-col' style={{ height: '100%' }}>
      <div className='flex flex-shrink-0 flex-col items-center justify-center py-3'>
        <div className='mb-3 text-center'>
          <div className='relative mb-4 h-20 w-64'>
            <Image
              src='/logo-text.svg'
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
            const CardComponent = (
              <Card
                className={`flex h-48 transform flex-col items-center justify-center p-4 transition-all duration-200 sm:h-48 ${item.disabled ? 'cursor-not-allowed bg-gray-100 opacity-50' : `cursor-pointer hover:scale-[1.02] hover:shadow-lg ${item.hoverColor}`} touch-manipulation`}
              >
                <CardContent className='flex h-full w-full flex-col items-center justify-center p-4 py-6 text-center'>
                  <div
                    className={`${item.disabled ? 'bg-gray-400' : item.color} mb-2 rounded-full p-4`}
                  >
                    <Icon className='text-primary-foreground h-8 w-8' />
                  </div>
                  <h3 className='mb-1 text-sm font-semibold sm:text-base md:text-lg'>
                    {item.title}
                  </h3>
                  <p className='text-muted-foreground text-center text-xs sm:text-sm'>
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
