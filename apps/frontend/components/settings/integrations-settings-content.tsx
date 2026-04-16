'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
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
import { companiesApiExt, unitsApi } from '@/lib/api';
import {
  companiesMeSSOGet,
  getCompaniesMeSSOGetQueryKey
} from '@/lib/api/generated/auth';
import { CalendarIntegrationsPanel } from '@/components/admin/units/calendar-integration-settings';
import { resolveUnitFilterFromQuery } from '@/lib/integrations-unit-filter';
import { OrganizationTenantSlugCard } from '@/components/organization/organization-tenant-slug-card';
import { OrganizationSsoSettingsCard } from '@/components/organization/organization-sso-settings-card';

export function IntegrationsSettingsContent() {
  const t = useTranslations('admin.integrations');
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
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [unitsQuery.data]);

  /** Optional filter: `?unit=` from URL (e.g. deep link from a unit page). */
  const filterUnitId = useMemo(() => {
    return resolveUnitFilterFromQuery(
      searchParams.get('unit'),
      unitOptions.map((u) => u.id)
    );
  }, [searchParams, unitOptions]);

  const setFilterUnitId = (value: string) => {
    const q = new URLSearchParams(searchParams.toString());
    if (value === 'all') {
      q.delete('unit');
    } else {
      q.set('unit', value);
    }
    router.replace(`${pathname}?${q.toString()}`);
  };

  if (companyMe.isLoading || ssoQ.isLoading) {
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

  if (ssoQ.isError || ssoQ.data?.status !== 200 || !ssoQ.data.data) {
    return (
      <Alert variant='destructive'>
        <AlertDescription>{t('ssoLoadError')}</AlertDescription>
      </Alert>
    );
  }

  return (
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
                      <SelectValue placeholder={t('filter_unit_placeholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='all'>
                        {t('filter_all_units')}
                      </SelectItem>
                      {unitOptions.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
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
                    name: u.name
                  }))}
                />
              </>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value='auth' className='space-y-6'>
        <OrganizationTenantSlugCard company={company} />
        <OrganizationSsoSettingsCard
          company={company}
          sso={ssoQ.data.data}
          publicApiUrl={companyMe.data?.publicApiUrl}
        />
      </TabsContent>
    </Tabs>
  );
}
