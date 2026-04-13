'use client';

import { use, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Combobox } from '@/components/ui/combobox';
import { getGetUnitsIdQueryKey } from '@/lib/api/generated/units';
import { unitsApi } from '@/lib/api';
import { useUpdateUnit } from '@/lib/hooks';
import { CountersList } from '@/components/admin/units/counters-list';
import { ServiceZoneWorkplacesPanel } from '@/components/admin/units/service-zone-workplaces-panel';
import { SubdivisionStationsAndZonesPanel } from '@/components/admin/units/subdivision-stations-and-zones-panel';
import { WorkplaceParentBanner } from '@/components/admin/units/workplace-parent-banner';
import { AdScreenSettings } from '@/components/admin/units/ad-screen-settings';
import { UnitServicesManager } from '@/components/admin/units/unit-services-manager';
import { KioskSettings } from '@/components/admin/units/kiosk-settings';
import { SlotConfiguration } from '@/components/admin/units/slot-configuration';
import { UnitVisitorTagsSettings } from '@/components/admin/units/unit-visitor-tags-settings';

import ServiceGridEditor from '@/components/ServiceGridEditor';

import { useRouter } from '@/src/i18n/navigation';
import PermissionGuard from '@/components/auth/permission-guard';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface UnitPageProps {
  params: Promise<{
    unitId: string;
    locale: string;
  }>;
}

export default function UnitPage({ params }: UnitPageProps) {
  const { unitId } = use(params);
  const router = useRouter();
  const t = useTranslations('admin'); // Using admin namespace
  const [activeTab, setActiveTab] = useState('general');

  const { data: unit } = useQuery({
    queryKey: getGetUnitsIdQueryKey(unitId),
    queryFn: () => unitsApi.getById(unitId)
  });

  const [unitName, setUnitName] = useState('');
  const [unitCode, setUnitCode] = useState('');
  const [unitTimezone, setUnitTimezone] = useState('');

  // Initialize state when unit loads
  if (unit && unitName === '' && unitCode === '') {
    setUnitName(unit.name);
    setUnitCode(unit.code);
    setUnitTimezone(unit.timezone);
  }

  const updateUnitMutation = useUpdateUnit();

  const handleSaveGeneral = () => {
    updateUnitMutation.mutate(
      { id: unitId, name: unitName, timezone: unitTimezone },
      {
        onSuccess: () => {
          toast.success(t('units.update_success'));
        },
        onError: () => {
          toast.error(t('units.update_error'));
        }
      }
    );
  };

  if (!unit) {
    return <div className='container mx-auto p-4'>{t('units.not_found')}</div>;
  }

  const isServiceZone = unit.kind === 'service_zone';
  const isBranchUnit =
    unit.kind === 'service_zone' || unit.kind === 'subdivision';

  const handleSaveServiceZoneName = () => {
    updateUnitMutation.mutate(
      { id: unitId, name: unitName },
      {
        onSuccess: () => {
          toast.success(t('units.update_success'));
        },
        onError: () => {
          toast.error(t('units.update_error'));
        }
      }
    );
  };

  const stationsAndStructure = (
    <PermissionGuard
      permissions={['UNIT_SETTINGS_MANAGE']}
      unitId={unitId}
      fallback={<div>{t('access_denied')}</div>}
    >
      {unit.kind === 'subdivision' ? (
        <SubdivisionStationsAndZonesPanel
          subdivisionId={unitId}
          companyId={unit.companyId}
          parentTimezone={unit.timezone}
        />
      ) : isBranchUnit ? (
        <div className='space-y-8'>
          <div>
            <p className='text-muted-foreground mb-4 text-sm'>
              {t('units.stations_on_zone_hint')}
            </p>
            <CountersList
              unitId={unit.parentId ?? unitId}
              restrictToServiceZoneId={unit.parentId ? unitId : undefined}
            />
          </div>
          <ServiceZoneWorkplacesPanel
            parentUnitId={unit.parentId ?? unitId}
            companyId={unit.companyId}
            parentTimezone={unit.timezone}
          />
        </div>
      ) : (
        <>
          {unit.parentId ? (
            <WorkplaceParentBanner parentId={unit.parentId} />
          ) : null}
          <CountersList unitId={unitId} />
        </>
      )}
    </PermissionGuard>
  );

  if (isServiceZone) {
    const serviceZoneCountersContent = (
      <PermissionGuard
        permissions={['UNIT_SETTINGS_MANAGE']}
        unitId={unitId}
        fallback={<div>{t('access_denied')}</div>}
      >
        <div className='space-y-8'>
          <div>
            <p className='text-muted-foreground mb-4 text-sm'>
              {t('units.stations_on_zone_hint')}
            </p>
            <CountersList
              unitId={unit.parentId ?? unitId}
              restrictToServiceZoneId={unit.parentId ? unitId : undefined}
            />
          </div>
          <ServiceZoneWorkplacesPanel
            parentUnitId={unit.parentId ?? unitId}
            companyId={unit.companyId}
            parentTimezone={unit.timezone}
          />
        </div>
      </PermissionGuard>
    );

    return (
      <div className='container mx-auto flex-1 p-4'>
        <div className='mb-6 flex items-center gap-4'>
          <Button variant='ghost' size='icon' onClick={() => router.back()}>
            <ArrowLeft className='h-4 w-4' />
          </Button>
          <h1 className='text-3xl font-bold'>{unit.name}</h1>
        </div>

        <p className='text-muted-foreground mb-6 max-w-3xl text-sm'>
          {t('units.service_zone_folder_description')}
        </p>

        <Tabs value={activeTab} onValueChange={setActiveTab} className='w-full'>
          <TabsList>
            <PermissionGuard
              permissions={['UNIT_SETTINGS_MANAGE']}
              unitId={unitId}
            >
              <TabsTrigger value='general'>
                {t('units.general_settings')}
              </TabsTrigger>
            </PermissionGuard>
            <PermissionGuard permissions={['UNIT_GRID_MANAGE']} unitId={unitId}>
              <TabsTrigger value='grid-configuration'>
                {t('grid_configuration.title', {
                  defaultValue: 'Grid Configuration'
                })}
              </TabsTrigger>
            </PermissionGuard>
            <PermissionGuard
              permissions={['UNIT_SETTINGS_MANAGE']}
              unitId={unitId}
            >
              <TabsTrigger value='counters'>
                {t('units.tab_stations_and_structure')}
              </TabsTrigger>
            </PermissionGuard>
            <PermissionGuard
              permissions={['UNIT_SETTINGS_MANAGE']}
              unitId={unitId}
            >
              <TabsTrigger value='kiosk'>
                {t('kiosk_settings.title')}
              </TabsTrigger>
            </PermissionGuard>
            <PermissionGuard
              permissions={['UNIT_TICKET_SCREEN_MANAGE']}
              unitId={unitId}
            >
              <TabsTrigger value='ad-screen'>
                {t('ad_screen.title')}
              </TabsTrigger>
            </PermissionGuard>
          </TabsList>

          <TabsContent value='general' className='mt-6'>
            <PermissionGuard
              permissions={['UNIT_SETTINGS_MANAGE']}
              unitId={unitId}
              fallback={<div>{t('access_denied')}</div>}
            >
              <div className='space-y-6'>
                {unit.parentId ? (
                  <WorkplaceParentBanner parentId={unit.parentId} />
                ) : null}
                <Card className='max-w-md'>
                  <CardHeader>
                    <CardTitle>
                      {t('units.service_zone_folder_title')}
                    </CardTitle>
                    <CardDescription>
                      {t('units.service_zone_general_hint')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className='space-y-4'>
                    <div className='space-y-2'>
                      <Label htmlFor='zone-name'>{t('units.unit_name')}</Label>
                      <Input
                        id='zone-name'
                        value={unitName}
                        onChange={(e) => setUnitName(e.target.value)}
                      />
                    </div>
                    <div className='space-y-2'>
                      <Label htmlFor='zone-code'>{t('units.unit_code')}</Label>
                      <Input
                        id='zone-code'
                        value={unitCode}
                        disabled
                        className='bg-muted'
                      />
                      <p className='text-muted-foreground text-xs'>
                        {t('units.unit_code_immutable')}
                      </p>
                    </div>
                    <Button
                      onClick={handleSaveServiceZoneName}
                      disabled={updateUnitMutation.isPending}
                    >
                      {updateUnitMutation.isPending
                        ? t('units.saving')
                        : t('units.save_changes')}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </PermissionGuard>
          </TabsContent>

          <TabsContent value='grid-configuration' className='mt-6'>
            <PermissionGuard
              permissions={['UNIT_GRID_MANAGE']}
              unitId={unitId}
              fallback={<div>{t('access_denied')}</div>}
            >
              {unit.parentId ? (
                <ServiceGridEditor
                  unitId={unitId}
                  servicesTreeUnitId={unit.parentId}
                  lockedServiceZoneId={unitId}
                />
              ) : (
                <Alert>
                  <AlertTitle>
                    {t('units.service_zone_grid_parent_required_title')}
                  </AlertTitle>
                  <AlertDescription>
                    {t('units.service_zone_grid_parent_required_body')}
                  </AlertDescription>
                </Alert>
              )}
            </PermissionGuard>
          </TabsContent>

          <TabsContent value='counters' className='mt-6'>
            {serviceZoneCountersContent}
          </TabsContent>

          <TabsContent value='kiosk' className='mt-6'>
            <PermissionGuard
              permissions={['UNIT_SETTINGS_MANAGE']}
              unitId={unitId}
              fallback={<div>{t('access_denied')}</div>}
            >
              <KioskSettings
                key={JSON.stringify(unit.config?.kiosk)}
                unitId={unitId}
                unitName={unit.name}
                currentConfig={unit.config || {}}
              />
            </PermissionGuard>
          </TabsContent>

          <TabsContent value='ad-screen' className='mt-6'>
            <PermissionGuard
              permissions={['UNIT_TICKET_SCREEN_MANAGE']}
              unitId={unitId}
              fallback={<div>{t('access_denied')}</div>}
            >
              <AdScreenSettings
                key={JSON.stringify(unit.config?.adScreen)}
                unitId={unitId}
                currentConfig={unit.config || {}}
              />
            </PermissionGuard>
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  return (
    <div className='container mx-auto flex-1 p-4'>
      <div className='mb-6 flex items-center gap-4'>
        <Button variant='ghost' size='icon' onClick={() => router.back()}>
          <ArrowLeft className='h-4 w-4' />
        </Button>
        <h1 className='text-3xl font-bold'>{unit.name}</h1>
      </div>

      {unit.kind === 'subdivision' ? (
        <Alert className='mb-6'>
          <AlertTitle>{t('units.hierarchy_help_subdivision_title')}</AlertTitle>
          <AlertDescription className='space-y-3'>
            <p className='text-muted-foreground text-sm'>
              {t('units.hierarchy_help_subdivision_body')}
            </p>
            <Button
              variant='outline'
              size='sm'
              type='button'
              onClick={() => setActiveTab('counters')}
            >
              {t('units.go_to_stations_tab')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <Tabs value={activeTab} onValueChange={setActiveTab} className='w-full'>
        <TabsList>
          <PermissionGuard
            permissions={['UNIT_SETTINGS_MANAGE']}
            unitId={unitId}
          >
            <TabsTrigger value='general'>
              {t('units.general_settings')}
            </TabsTrigger>
          </PermissionGuard>
          <PermissionGuard
            permissions={['UNIT_SETTINGS_MANAGE']}
            unitId={unitId}
          >
            <TabsTrigger value='slots'>
              {t('slots.title', { defaultValue: 'Slot Configuration' })}
            </TabsTrigger>
          </PermissionGuard>
          <PermissionGuard
            permissions={['UNIT_SERVICES_MANAGE']}
            unitId={unitId}
          >
            <TabsTrigger value='services'>{t('services.title')}</TabsTrigger>
          </PermissionGuard>
          <PermissionGuard permissions={['UNIT_GRID_MANAGE']} unitId={unitId}>
            <TabsTrigger value='grid-configuration'>
              {t('grid_configuration.title', {
                defaultValue: 'Grid Configuration'
              })}
            </TabsTrigger>
          </PermissionGuard>
          <PermissionGuard
            permissions={['UNIT_SETTINGS_MANAGE']}
            unitId={unitId}
          >
            <TabsTrigger value='counters'>
              {isBranchUnit
                ? t('units.tab_stations_and_structure')
                : t('counters.title')}
            </TabsTrigger>
          </PermissionGuard>
          <PermissionGuard
            permissions={['UNIT_TICKET_SCREEN_MANAGE']}
            unitId={unitId}
          >
            <TabsTrigger value='ad-screen'>{t('ad_screen.title')}</TabsTrigger>
          </PermissionGuard>
          <PermissionGuard
            permissions={['UNIT_SETTINGS_MANAGE']}
            unitId={unitId}
          >
            <TabsTrigger value='kiosk'>{t('kiosk_settings.title')}</TabsTrigger>
          </PermissionGuard>
          <PermissionGuard
            permissions={['UNIT_SETTINGS_MANAGE']}
            unitId={unitId}
          >
            <TabsTrigger value='visitor-tags'>
              {t('units.visitor_tags.tab')}
            </TabsTrigger>
          </PermissionGuard>
        </TabsList>

        <TabsContent value='general' className='mt-6'>
          <PermissionGuard
            permissions={['UNIT_SETTINGS_MANAGE']}
            unitId={unitId}
            fallback={<div>{t('access_denied')}</div>}
          >
            <Card>
              <CardHeader>
                <CardTitle>{t('units.general_settings')}</CardTitle>
                <CardDescription>
                  {t('units.general_settings_description', {
                    defaultValue: 'Manage general settings for this unit.'
                  })}
                </CardDescription>
              </CardHeader>
              <CardContent className='max-w-md space-y-4'>
                {unit.kind === 'subdivision' ? (
                  <p className='text-muted-foreground text-sm'>
                    {t('units.subdivision_general_hint')}
                  </p>
                ) : null}
                <div className='space-y-2'>
                  <Label htmlFor='name'>{t('units.unit_name')}</Label>
                  <Input
                    id='name'
                    value={unitName}
                    onChange={(e) => setUnitName(e.target.value)}
                  />
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='code'>{t('units.unit_code')}</Label>
                  <Input
                    id='code'
                    value={unitCode}
                    disabled
                    className='bg-muted'
                  />
                  <p className='text-muted-foreground text-xs'>
                    {t('units.unit_code_immutable')}
                  </p>
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='timezone'>{t('units.timezone')}</Label>
                  <Combobox
                    options={Intl.supportedValuesOf('timeZone').map((tz) => ({
                      value: tz,
                      label: tz
                    }))}
                    value={unitTimezone}
                    onChange={setUnitTimezone}
                    placeholder={t('units.select_timezone', {
                      defaultValue: 'Select timezone...'
                    })}
                    searchPlaceholder={t('units.search_timezone', {
                      defaultValue: 'Search timezone...'
                    })}
                    className='w-full'
                  />
                </div>
                <Button
                  onClick={handleSaveGeneral}
                  disabled={updateUnitMutation.isPending}
                >
                  {updateUnitMutation.isPending
                    ? t('units.saving')
                    : t('units.save_changes')}
                </Button>
              </CardContent>
            </Card>
          </PermissionGuard>
        </TabsContent>

        <TabsContent value='slots' className='mt-6'>
          <PermissionGuard
            permissions={['UNIT_SETTINGS_MANAGE']}
            unitId={unitId}
            fallback={<div>{t('access_denied')}</div>}
          >
            <SlotConfiguration unitId={unitId} />
          </PermissionGuard>
        </TabsContent>

        <TabsContent value='services' className='mt-6'>
          <PermissionGuard
            permissions={['UNIT_SERVICES_MANAGE']}
            unitId={unitId}
            fallback={<div>{t('access_denied')}</div>}
          >
            <UnitServicesManager unitId={unitId} />
          </PermissionGuard>
        </TabsContent>
        <TabsContent value='grid-configuration' className='mt-6'>
          <PermissionGuard
            permissions={['UNIT_GRID_MANAGE']}
            unitId={unitId}
            fallback={<div>{t('access_denied')}</div>}
          >
            <ServiceGridEditor unitId={unitId} />
          </PermissionGuard>
        </TabsContent>
        <TabsContent value='counters' className='mt-6'>
          {stationsAndStructure}
        </TabsContent>
        <TabsContent value='ad-screen' className='mt-6'>
          <PermissionGuard
            permissions={['UNIT_TICKET_SCREEN_MANAGE']}
            unitId={unitId}
            fallback={<div>{t('access_denied')}</div>}
          >
            <AdScreenSettings
              key={JSON.stringify(unit.config?.adScreen)}
              unitId={unitId}
              currentConfig={unit.config || {}}
            />
          </PermissionGuard>
        </TabsContent>
        <TabsContent value='kiosk' className='mt-6'>
          <PermissionGuard
            permissions={['UNIT_SETTINGS_MANAGE']}
            unitId={unitId}
            fallback={<div>{t('access_denied')}</div>}
          >
            <KioskSettings
              key={JSON.stringify(unit.config?.kiosk)}
              unitId={unitId}
              unitName={unit.name}
              currentConfig={unit.config || {}}
            />
          </PermissionGuard>
        </TabsContent>
        <TabsContent value='visitor-tags' className='mt-6'>
          <PermissionGuard
            permissions={['UNIT_SETTINGS_MANAGE']}
            unitId={unitId}
            fallback={<div>{t('access_denied')}</div>}
          >
            <UnitVisitorTagsSettings unitId={unitId} />
          </PermissionGuard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
