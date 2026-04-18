'use client';

import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { companiesApiExt, unitsApi } from '@/lib/api';
import {
  companiesMeSSOGet,
  getCompaniesMeSSOGetQueryKey
} from '@/lib/api/generated/auth';
import { CalendarIntegrationsPanel } from '@/components/admin/units/calendar-integration-settings';
import { GoogleCalendarPickDialog } from '@/components/settings/google-calendar-pick-dialog';
import { resolveUnitFilterFromQuery } from '@/lib/integrations-unit-filter';
import { OrganizationTenantSlugCard } from '@/components/organization/organization-tenant-slug-card';
import { getUnitDisplayName } from '@/lib/unit-display';
import { OrganizationSsoSettingsCard } from '@/components/organization/organization-sso-settings-card';

export function IntegrationsSettingsContent() {
  const t = useTranslations('admin.integrations');
  const tCal = useTranslations('admin.calendar_integration');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get('tab');
  const activeTab = tabParam === 'auth' ? 'auth' : 'calendars';

  const setTab = (value: string) => {
    const q = new URLSearchParams(searchParams.toString());
    if (value === 'calendars') {
      q.delete('tab');
    } else {
      q.set('tab', value);
    }
    const suffix = q.toString();
    router.replace(suffix ? `${pathname}?${suffix}` : pathname);
  };

  const companyMe = useQuery({
    queryKey: ['company-me'],
    queryFn: () => companiesApiExt.getMe()
  });

  const ssoQ = useQuery({
    queryKey: getCompaniesMeSSOGetQueryKey(),
    queryFn: () => companiesMeSSOGet(),
    enabled: companyMe.isSuccess
  });

  const unitsQuery = useQuery({
    queryKey: ['units'],
    queryFn: () => unitsApi.getAll()
  });

  const company = companyMe.data?.company;

  const unitOptions = useMemo(() => {
    const list = unitsQuery.data ?? [];
    return [...list].sort((a, b) =>
      getUnitDisplayName(a, locale).localeCompare(
        getUnitDisplayName(b, locale),
        undefined,
        { sensitivity: 'base' }
      )
    );
  }, [unitsQuery.data, locale]);

  /** Optional filter: `?unit=` from URL (e.g. deep link from a unit page). */
  const filterUnitId = useMemo(() => {
    return resolveUnitFilterFromQuery(
      searchParams.get('unit'),
      unitOptions.map((u) => u.id)
    );
  }, [searchParams, unitOptions]);

  const googleOAuthToastHandled = useRef(false);
  const googlePickUrlHandled = useRef(false);
  const [googlePickToken, setGooglePickToken] = useState<string | null>(null);

  const setFilterUnitId = (value: string) => {
    const q = new URLSearchParams(searchParams.toString());
    if (value === 'all') {
      q.delete('unit');
    } else {
      q.set('unit', value);
    }
    const qs = q.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  useEffect(() => {
    const raw = searchParams.get('google_calendar_pick');
    const token = raw?.trim() ?? '';
    if (!token) {
      googlePickUrlHandled.current = false;
      return;
    }
    if (googlePickUrlHandled.current) return;
    googlePickUrlHandled.current = true;
    const next = new URLSearchParams(searchParams.toString());
    next.delete('google_calendar_pick');
    const suffix = next.toString();
    router.replace(suffix ? `${pathname}?${suffix}` : pathname);
    startTransition(() => {
      setGooglePickToken(token);
    });
  }, [searchParams, pathname, router]);

  useEffect(() => {
    const g = searchParams.get('google_calendar');
    if (!g) {
      googleOAuthToastHandled.current = false;
      return;
    }
    if (googleOAuthToastHandled.current) return;
    googleOAuthToastHandled.current = true;
    const next = new URLSearchParams(searchParams.toString());
    next.delete('google_calendar');
    next.delete('reason');
    const suffix = next.toString();
    router.replace(suffix ? `${pathname}?${suffix}` : pathname);
    if (g === 'error') {
      const reason = searchParams.get('reason') ?? '';
      let msg = tCal('google_oauth_error_toast');
      switch (reason) {
        case 'no_refresh_token':
          msg = tCal('google_oauth_err_no_refresh');
          break;
        case 'not_configured':
          msg = tCal('google_oauth_err_not_configured');
          break;
        case 'userinfo':
          msg = tCal('google_oauth_err_userinfo');
          break;
        case 'limit':
          msg = tCal('google_oauth_err_limit');
          break;
        case 'forbidden':
          msg = tCal('google_oauth_err_forbidden');
          break;
        case 'create_failed':
          msg = tCal('google_oauth_err_create_failed');
          break;
        case 'pick_save':
          msg = tCal('google_oauth_err_pick_save');
          break;
        default:
          break;
      }
      toast.error(msg);
    }
  }, [searchParams, pathname, router, tCal]);

  if (companyMe.isLoading) {
    return (
      <div className='flex justify-center py-12'>
        <Loader2 className='text-muted-foreground h-8 w-8 animate-spin' />
      </div>
    );
  }

  if (companyMe.isError || !company) {
    return (
      <Alert variant='destructive'>
        <AlertDescription>{t('loadError')}</AlertDescription>
      </Alert>
    );
  }

  const ssoLoadFailed =
    ssoQ.isError || ssoQ.data?.status !== 200 || !ssoQ.data.data;

  return (
    <>
      <GoogleCalendarPickDialog
        open={Boolean(googlePickToken)}
        pickToken={googlePickToken}
        onOpenChange={(o) => {
          if (!o) setGooglePickToken(null);
        }}
      />
      <Tabs value={activeTab} onValueChange={setTab} className='w-full'>
        <TabsList className='mb-6'>
          <TabsTrigger value='calendars'>{t('tab_calendars')}</TabsTrigger>
          <TabsTrigger value='auth'>{t('tab_authentication')}</TabsTrigger>
        </TabsList>

        <TabsContent value='calendars' className='space-y-6'>
          <Card>
            <CardHeader>
              <CardTitle>{t('calendars_title')}</CardTitle>
              <CardDescription>{t('calendars_description')}</CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              {unitsQuery.isLoading ? (
                <div className='flex items-center gap-2 text-sm'>
                  <Loader2 className='h-4 w-4 animate-spin' />
                  {t('units_loading')}
                </div>
              ) : unitOptions.length === 0 ? (
                <p className='text-muted-foreground text-sm'>{t('no_units')}</p>
              ) : (
                <>
                  <div className='max-w-md space-y-2'>
                    <Label htmlFor='integration-unit-filter'>
                      {t('filter_unit_label')}
                    </Label>
                    <Select
                      value={filterUnitId ?? 'all'}
                      onValueChange={setFilterUnitId}
                    >
                      <SelectTrigger id='integration-unit-filter'>
                        <SelectValue
                          placeholder={t('filter_unit_placeholder')}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='all'>
                          {t('filter_all_units')}
                        </SelectItem>
                        {unitOptions.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {getUnitDisplayName(u, locale)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className='text-muted-foreground text-xs'>
                      {t('filter_unit_hint')}
                    </p>
                  </div>
                  <CalendarIntegrationsPanel
                    filterUnitId={filterUnitId}
                    unitOptions={unitOptions.map((u) => ({
                      id: u.id,
                      name: u.name,
                      nameEn: u.nameEn
                    }))}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value='auth' className='space-y-6'>
          {ssoQ.isLoading && (
            <div className='text-muted-foreground flex items-center gap-2 text-sm'>
              <Loader2 className='h-4 w-4 animate-spin' />
              {t('sso_loading')}
            </div>
          )}
          {ssoLoadFailed && (
            <Alert variant='destructive'>
              <AlertDescription>{t('ssoLoadError')}</AlertDescription>
            </Alert>
          )}
          <OrganizationTenantSlugCard company={company} />
          {!ssoLoadFailed &&
            ssoQ.data?.status === 200 &&
            ssoQ.data.data != null && (
              <OrganizationSsoSettingsCard
                company={company}
                sso={ssoQ.data.data}
                publicApiUrl={companyMe.data?.publicApiUrl}
              />
            )}
        </TabsContent>
      </Tabs>
    </>
  );
}
