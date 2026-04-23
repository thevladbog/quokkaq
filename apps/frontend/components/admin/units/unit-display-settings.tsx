'use client';

import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/src/i18n/navigation';
import { useAuthContext } from '@/contexts/AuthContext';
import type { Unit } from '@quokkaq/shared-types';
import {
  PermUnitSignageManage,
  PermUnitTicketScreenManage,
  userUnitPermissionMatches
} from '@/lib/permission-variants';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { UnitMediaLibrary } from './unit-media-library';
import { AdScreenSettings } from './ad-screen-settings';
import { SignageSettings } from './signage-settings';

type DisplaySub = 'materials' | 'look' | 'content';

function isDisplaySub(v: string | null): v is DisplaySub {
  return v === 'materials' || v === 'look' || v === 'content';
}

function useUnitDisplayCaps(unitId: string) {
  const { user, isLoading, isAuthenticated } = useAuthContext();
  return useMemo(() => {
    if (isLoading || !isAuthenticated || !user) {
      return {
        ready: false as const,
        canTicket: false,
        canContent: false
      };
    }
    if (user.isPlatformAdmin === true) {
      return { ready: true as const, canTicket: true, canContent: true };
    }
    if (user.isTenantAdmin === true) {
      return { ready: true as const, canTicket: true, canContent: true };
    }
    const perms = user.permissions?.[unitId] ?? [];
    const canTicket = userUnitPermissionMatches(
      perms,
      PermUnitTicketScreenManage
    );
    const canSignage = userUnitPermissionMatches(perms, PermUnitSignageManage);
    return {
      ready: true as const,
      canTicket,
      canContent: canTicket || canSignage
    };
  }, [isLoading, isAuthenticated, user, unitId]);
}

function DisplayPriorityBlock() {
  const t = useTranslations('admin.display');
  return (
    <Alert>
      <AlertTitle>
        {t('priorityTitle', { default: 'What shows on the screen' })}
      </AlertTitle>
      <AlertDescription>
        {t('priorityDescription', {
          default:
            'If a schedule applies a playlist, that content is used. Otherwise, materials you select under Appearance (fallback) are used when the media column is enabled.'
        })}
      </AlertDescription>
    </Alert>
  );
}

function DisplayHeader() {
  const t = useTranslations('admin.display');
  return (
    <div>
      <h2 className='text-2xl font-bold'>
        {t('title', { default: 'Display' })}
      </h2>
      <p className='text-muted-foreground mt-1 text-sm'>
        {t('subtitle', {
          default:
            'Branding, media files, and scheduled content for this unit screen.'
        })}
      </p>
    </div>
  );
}

export function UnitDisplaySettings({
  unit,
  unitId,
  currentConfig
}: {
  unit: Unit;
  unitId: string;
  currentConfig: Record<string, unknown>;
}) {
  const t = useTranslations('admin.display');
  const { ready, canTicket, canContent } = useUnitDisplayCaps(unitId);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const displayParam = searchParams.get('display');
  const sub: DisplaySub = useMemo(() => {
    if (!isDisplaySub(displayParam)) {
      return 'look';
    }
    if (displayParam === 'content' && canContent) {
      return 'content';
    }
    if (displayParam === 'materials' || displayParam === 'look') {
      if (canTicket) {
        return displayParam;
      }
    }
    return 'look';
  }, [displayParam, canTicket, canContent]);

  const setDisplaySub = useCallback(
    (next: DisplaySub) => {
      const p = new URLSearchParams(searchParams.toString());
      p.set('display', next);
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams]
  );

  if (!ready) {
    return null;
  }

  // Only digital signage (no ticket screen / branding) — same as pre-merge: no ad-screen UI.
  if (!canTicket && canContent) {
    return (
      <div className='space-y-4'>
        <DisplayHeader />
        <DisplayPriorityBlock />
        <SignageSettings unit={unit} unitId={unitId} showScreenTitle={false} />
      </div>
    );
  }

  if (!canContent) {
    return (
      <Alert>
        <AlertDescription>
          {t('noAccess', { default: 'No access.' })}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className='space-y-4'>
      <DisplayHeader />
      <DisplayPriorityBlock />

      <Tabs
        value={sub}
        onValueChange={(v) => {
          if (isDisplaySub(v)) {
            if ((v === 'materials' || v === 'look') && !canTicket) {
              return;
            }
            if (v === 'content' && !canContent) {
              return;
            }
            if (v !== sub) {
              setDisplaySub(v);
            }
          }
        }}
        className='w-full min-w-0'
      >
        <TabsList className='h-auto w-full min-w-0 flex-wrap sm:flex-nowrap'>
          <TabsTrigger value='materials' className='min-w-0 shrink'>
            {t('sub.materials', { default: 'Media library' })}
          </TabsTrigger>
          <TabsTrigger value='look' className='min-w-0 shrink'>
            {t('sub.look', { default: 'Appearance' })}
          </TabsTrigger>
          <TabsTrigger value='content' className='min-w-0 shrink'>
            {t('sub.content', { default: 'Playlists & layout' })}
          </TabsTrigger>
        </TabsList>

        <TabsContent value='materials' className='mt-4'>
          <UnitMediaLibrary unitId={unitId} />
        </TabsContent>

        <TabsContent value='look' className='mt-4'>
          <AdScreenSettings
            key={JSON.stringify(currentConfig?.adScreen)}
            unitId={unitId}
            currentConfig={currentConfig}
            onRequestOpenMaterials={() => setDisplaySub('materials')}
          />
        </TabsContent>

        <TabsContent value='content' className='mt-4'>
          <SignageSettings
            unit={unit}
            unitId={unitId}
            showScreenTitle={false}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
