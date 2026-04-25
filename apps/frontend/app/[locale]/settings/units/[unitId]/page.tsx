'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
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
import { buildIanaTimezoneComboboxOptions } from '@/lib/iana-timezone-combobox-options';
import { getGetUnitByIDQueryKey } from '@/lib/api/generated/units';
import { unitsApi } from '@/lib/api';
import { useUpdateUnit } from '@/lib/hooks';
import { CountersList } from '@/components/admin/units/counters-list';
import { ServiceZoneWorkplacesPanel } from '@/components/admin/units/service-zone-workplaces-panel';
import { SubdivisionStationsAndZonesPanel } from '@/components/admin/units/subdivision-stations-and-zones-panel';
import { WorkplaceParentBanner } from '@/components/admin/units/workplace-parent-banner';
import { UnitDisplaySettings } from '@/components/admin/units/unit-display-settings';
import { UnitServicesManager } from '@/components/admin/units/unit-services-manager';
import { KioskSettings } from '@/components/admin/units/kiosk-settings';
import { UnitEmployeeIdpSettings } from '@/components/admin/units/unit-employee-idp-settings';
import { Link } from '@/src/i18n/navigation';
import { SlotConfiguration } from '@/components/admin/units/slot-configuration';
import { UnitVisitorTagsSettings } from '@/components/admin/units/unit-visitor-tags-settings';
import { UnitGuestSurveySettings } from '@/components/admin/units/unit-guest-survey-settings';
import { VirtualQueueSettings } from '@/components/admin/units/virtual-queue-settings';
import { OperatorSkillMatrix } from '@/components/settings/OperatorSkillMatrix';

import ServiceGridEditor from '@/components/ServiceGridEditor';

import { useRouter } from '@/src/i18n/navigation';
import PermissionGuard from '@/components/auth/permission-guard';
import {
  PermUnitGridManage,
  PermUnitServicesManage,
  PermUnitSettingsManage,
  PermUnitSignageManage,
  PermUnitTicketScreenManage
} from '@/lib/permission-variants';
import { toast } from 'sonner';
import { getUnitDisplayName } from '@/lib/unit-display';
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
  const locale = useLocale();
  const [activeTab, setActiveTab] = useState('general');
  const searchParams = useSearchParams();

  useEffect(() => {
    const d = searchParams.get('display');
    if (d === 'materials' || d === 'look' || d === 'content') {
      setActiveTab('display');
    }
  }, [searchParams]);

  const { data: unit } = useQuery({
    queryKey: getGetUnitByIDQueryKey(unitId),
    queryFn: () => unitsApi.getById(unitId)
  });

  const [unitName, setUnitName] = useState('');
  const [unitNameEn, setUnitNameEn] = useState('');
  const [unitCode, setUnitCode] = useState('');
  const [unitTimezone, setUnitTimezone] = useState('');

  useEffect(() => {
    if (!unit) return;
    // Sync local form state when the loaded unit payload changes (e.g. refetch).

    setUnitName(unit.name);
    setUnitNameEn(unit.nameEn ?? '');
    setUnitCode(unit.code);
    setUnitTimezone(unit.timezone);
  }, [unit]);

  const updateUnitMutation = useUpdateUnit();

  const handleToggleSkillRouting = (enabled: boolean) => {
    updateUnitMutation.mutate(
      { id: unitId, skillBasedRoutingEnabled: enabled },
      {
        onSuccess: () => {
          toast.success(t('operator_skills.routing_saved'));
        },
        onError: () => {
          toast.error(t('units.update_error'));
        }
      }
    );
  };

  const timezoneOptions = useMemo(
    () => buildIanaTimezoneComboboxOptions(unitTimezone),
    [unitTimezone]
  );

  const handleSaveGeneral = () => {
    updateUnitMutation.mutate(
      {
        id: unitId,
        name: unitName,
        timezone: unitTimezone,
        nameEn: unitNameEn.trim() === '' ? null : unitNameEn.trim()
      },
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
      {
        id: unitId,
        name: unitName,
        nameEn: unitNameEn.trim() === '' ? null : unitNameEn.trim()
      },
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
      permissions={[PermUnitSettingsManage]}
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
        permissions={[PermUnitSettingsManage]}
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
      <div className='container mx-auto min-w-0 p-4'>
        <div className='mb-6 flex min-w-0 items-center gap-3'>
          <Button variant='ghost' size='icon' onClick={() => router.back()}>
            <ArrowLeft className='h-4 w-4' />
          </Button>
          <h1 className='min-w-0 flex-1 text-2xl font-bold tracking-tight break-words md:text-3xl'>
            {getUnitDisplayName(unit, locale)}
          </h1>
        </div>

        <p className='text-muted-foreground mb-6 max-w-3xl text-sm'>
          {t('units.service_zone_folder_description')}
        </p>

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className='w-full min-w-0'
        >
          <TabsList>
            <PermissionGuard
              permissions={[PermUnitSettingsManage]}
              unitId={unitId}
            >
              <TabsTrigger value='general'>
                {t('units.general_settings')}
              </TabsTrigger>
            </PermissionGuard>
            <PermissionGuard permissions={[PermUnitGridManage]} unitId={unitId}>
              <TabsTrigger value='grid-configuration'>
                {t('grid_configuration.title', {
                  defaultValue: 'Grid Configuration'
                })}
              </TabsTrigger>
            </PermissionGuard>
            <PermissionGuard
              permissions={[PermUnitSettingsManage]}
              unitId={unitId}
            >
              <TabsTrigger value='counters'>
                {t('units.tab_stations_and_structure')}
              </TabsTrigger>
            </PermissionGuard>
            <PermissionGuard
              permissions={[PermUnitSettingsManage]}
              unitId={unitId}
            >
              <TabsTrigger value='kiosk'>
                {t('kiosk_settings.title')}
              </TabsTrigger>
            </PermissionGuard>
            <PermissionGuard
              permissions={[PermUnitSettingsManage]}
              unitId={unitId}
            >
              <TabsTrigger value='guest-survey'>
                {t('guest_survey.tab')}
              </TabsTrigger>
            </PermissionGuard>
            <PermissionGuard
              permissions={[PermUnitSettingsManage]}
              unitId={unitId}
            >
              <TabsTrigger value='virtual-queue'>
                {t('virtual_queue_settings.tab')}
              </TabsTrigger>
            </PermissionGuard>
            <PermissionGuard
              permissions={[PermUnitSettingsManage]}
              unitId={unitId}
            >
              <TabsTrigger value='operator-skills'>
                {t('operator_skills.tab')}
              </TabsTrigger>
            </PermissionGuard>
            <PermissionGuard
              permissions={[PermUnitTicketScreenManage, PermUnitSignageManage]}
              unitId={unitId}
            >
              <TabsTrigger value='display'>
                {t('display.tab', { default: 'Display' })}
              </TabsTrigger>
            </PermissionGuard>
          </TabsList>

          <TabsContent value='general' className='mt-6'>
            <PermissionGuard
              permissions={[PermUnitSettingsManage]}
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
                      <Label htmlFor='zone-name-en'>
                        {t('forms.fields.name_en')}
                      </Label>
                      <Input
                        id='zone-name-en'
                        value={unitNameEn}
                        onChange={(e) => setUnitNameEn(e.target.value)}
                        placeholder={t('forms.fields.name_en')}
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
              permissions={[PermUnitGridManage]}
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
              permissions={[PermUnitSettingsManage]}
              unitId={unitId}
              fallback={<div>{t('access_denied')}</div>}
            >
              <KioskSettings
                key={JSON.stringify(unit.config?.kiosk)}
                unitId={unitId}
                unitName={getUnitDisplayName(unit, locale)}
                currentConfig={unit.config || {}}
                branchUnitIdForSignage={unit.parentId ?? unitId}
                kioskIdOcrInPlan={unit.operations?.kioskIdOcr}
              />
            </PermissionGuard>
          </TabsContent>

          <TabsContent value='guest-survey' className='mt-6'>
            <PermissionGuard
              permissions={[PermUnitSettingsManage]}
              unitId={unitId}
              fallback={<div>{t('access_denied')}</div>}
            >
              <UnitGuestSurveySettings unitId={unitId} />
            </PermissionGuard>
          </TabsContent>

          <TabsContent value='virtual-queue' className='mt-6'>
            <PermissionGuard
              permissions={[PermUnitSettingsManage]}
              unitId={unitId}
              fallback={<div>{t('access_denied')}</div>}
            >
              <VirtualQueueSettings
                unitId={unitId}
                currentConfig={unit.config}
              />
            </PermissionGuard>
          </TabsContent>

          <TabsContent value='display' className='mt-6'>
            <PermissionGuard
              permissions={[PermUnitTicketScreenManage, PermUnitSignageManage]}
              unitId={unitId}
              requireAll={false}
              fallback={<div>{t('access_denied')}</div>}
            >
              <UnitDisplaySettings
                key={unitId}
                unit={unit}
                unitId={unitId}
                currentConfig={unit.config || {}}
              />
            </PermissionGuard>
          </TabsContent>

          <TabsContent value='operator-skills' className='mt-6'>
            <PermissionGuard
              permissions={[PermUnitSettingsManage]}
              unitId={unitId}
              fallback={<div>{t('access_denied')}</div>}
            >
              <Card>
                <CardHeader>
                  <CardTitle>{t('operator_skills.title')}</CardTitle>
                  <CardDescription>
                    {t('operator_skills.description')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <OperatorSkillMatrix
                    unitId={unitId}
                    skillBasedRoutingEnabled={
                      unit.skillBasedRoutingEnabled ?? false
                    }
                    onToggleSkillRouting={handleToggleSkillRouting}
                  />
                </CardContent>
              </Card>
            </PermissionGuard>
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  return (
    <div className='container mx-auto min-w-0 p-4'>
      <div className='mb-6 flex min-w-0 items-center gap-3'>
        <Button variant='ghost' size='icon' onClick={() => router.back()}>
          <ArrowLeft className='h-4 w-4' />
        </Button>
        <h1 className='min-w-0 flex-1 text-2xl font-bold tracking-tight break-words md:text-3xl'>
          {getUnitDisplayName(unit, locale)}
        </h1>
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

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className='w-full min-w-0'
      >
        <TabsList>
          <PermissionGuard
            permissions={[PermUnitSettingsManage]}
            unitId={unitId}
          >
            <TabsTrigger value='general'>
              {t('units.general_settings')}
            </TabsTrigger>
          </PermissionGuard>
          <PermissionGuard
            permissions={[PermUnitSettingsManage]}
            unitId={unitId}
          >
            <TabsTrigger value='slots'>
              {t('slots.title', { defaultValue: 'Slot Configuration' })}
            </TabsTrigger>
          </PermissionGuard>
          <PermissionGuard
            permissions={[PermUnitServicesManage]}
            unitId={unitId}
          >
            <TabsTrigger value='services'>{t('services.title')}</TabsTrigger>
          </PermissionGuard>
          <PermissionGuard permissions={[PermUnitGridManage]} unitId={unitId}>
            <TabsTrigger value='grid-configuration'>
              {t('grid_configuration.title', {
                defaultValue: 'Grid Configuration'
              })}
            </TabsTrigger>
          </PermissionGuard>
          <PermissionGuard
            permissions={[PermUnitSettingsManage]}
            unitId={unitId}
          >
            <TabsTrigger value='counters'>
              {isBranchUnit
                ? t('units.tab_stations_and_structure')
                : t('counters.title')}
            </TabsTrigger>
          </PermissionGuard>
          <PermissionGuard
            permissions={[PermUnitTicketScreenManage, PermUnitSignageManage]}
            unitId={unitId}
          >
            <TabsTrigger value='display'>
              {t('display.tab', { default: 'Display' })}
            </TabsTrigger>
          </PermissionGuard>
          <PermissionGuard
            permissions={[PermUnitSettingsManage]}
            unitId={unitId}
          >
            <TabsTrigger value='kiosk'>{t('kiosk_settings.title')}</TabsTrigger>
          </PermissionGuard>
          <PermissionGuard
            permissions={[PermUnitSettingsManage]}
            unitId={unitId}
          >
            <TabsTrigger value='guest-survey'>
              {t('guest_survey.tab')}
            </TabsTrigger>
          </PermissionGuard>
          <PermissionGuard
            permissions={[PermUnitSettingsManage]}
            unitId={unitId}
          >
            <TabsTrigger value='visitor-tags'>
              {t('units.visitor_tags.tab')}
            </TabsTrigger>
          </PermissionGuard>
          <PermissionGuard
            permissions={[PermUnitSettingsManage]}
            unitId={unitId}
          >
            <TabsTrigger value='virtual-queue'>
              {t('virtual_queue_settings.tab')}
            </TabsTrigger>
          </PermissionGuard>
          <PermissionGuard
            permissions={[PermUnitSettingsManage]}
            unitId={unitId}
          >
            <TabsTrigger value='operator-skills'>
              {t('operator_skills.tab')}
            </TabsTrigger>
          </PermissionGuard>
        </TabsList>

        <TabsContent value='general' className='mt-6'>
          <PermissionGuard
            permissions={[PermUnitSettingsManage]}
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
                  <Label htmlFor='name-en'>{t('forms.fields.name_en')}</Label>
                  <Input
                    id='name-en'
                    value={unitNameEn}
                    onChange={(e) => setUnitNameEn(e.target.value)}
                    placeholder={t('forms.fields.name_en')}
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
                    options={timezoneOptions}
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
            permissions={[PermUnitSettingsManage]}
            unitId={unitId}
            fallback={<div>{t('access_denied')}</div>}
          >
            <div className='space-y-8'>
              <Alert>
                <AlertTitle>
                  {t('integrations.calendar_relocated_title')}
                </AlertTitle>
                <AlertDescription className='space-y-2'>
                  <p>{t('integrations.calendar_relocated_hint')}</p>
                  <p>
                    <Link
                      href={`/settings/integrations?tab=calendars&unit=${unitId}`}
                      className='text-primary font-medium underline'
                    >
                      {t('integrations.calendar_relocated_link')}
                    </Link>
                  </p>
                </AlertDescription>
              </Alert>
              <SlotConfiguration unitId={unitId} />
            </div>
          </PermissionGuard>
        </TabsContent>

        <TabsContent value='services' className='mt-6'>
          <PermissionGuard
            permissions={[PermUnitServicesManage]}
            unitId={unitId}
            fallback={<div>{t('access_denied')}</div>}
          >
            <UnitServicesManager unitId={unitId} />
          </PermissionGuard>
        </TabsContent>
        <TabsContent value='grid-configuration' className='mt-6'>
          <PermissionGuard
            permissions={[PermUnitGridManage]}
            unitId={unitId}
            fallback={<div>{t('access_denied')}</div>}
          >
            <ServiceGridEditor unitId={unitId} />
          </PermissionGuard>
        </TabsContent>
        <TabsContent value='counters' className='mt-6'>
          {stationsAndStructure}
        </TabsContent>
        <TabsContent value='display' className='mt-6'>
          <PermissionGuard
            permissions={[PermUnitTicketScreenManage, PermUnitSignageManage]}
            unitId={unitId}
            requireAll={false}
            fallback={<div>{t('access_denied')}</div>}
          >
            <UnitDisplaySettings
              key={unitId}
              unit={unit}
              unitId={unitId}
              currentConfig={unit.config || {}}
            />
          </PermissionGuard>
        </TabsContent>
        <TabsContent value='kiosk' className='mt-6'>
          <PermissionGuard
            permissions={[PermUnitSettingsManage]}
            unitId={unitId}
            fallback={<div>{t('access_denied')}</div>}
          >
            <KioskSettings
              key={JSON.stringify(unit.config?.kiosk)}
              unitId={unitId}
              unitName={getUnitDisplayName(unit, locale)}
              currentConfig={unit.config || {}}
              branchUnitIdForSignage={unit.parentId ?? unitId}
              kioskIdOcrInPlan={unit.operations?.kioskIdOcr}
            />
            <div className='mt-10'>
              <UnitEmployeeIdpSettings unitId={unitId} />
            </div>
          </PermissionGuard>
        </TabsContent>
        <TabsContent value='guest-survey' className='mt-6'>
          <PermissionGuard
            permissions={[PermUnitSettingsManage]}
            unitId={unitId}
            fallback={<div>{t('access_denied')}</div>}
          >
            <UnitGuestSurveySettings unitId={unitId} />
          </PermissionGuard>
        </TabsContent>
        <TabsContent value='visitor-tags' className='mt-6'>
          <PermissionGuard
            permissions={[PermUnitSettingsManage]}
            unitId={unitId}
            fallback={<div>{t('access_denied')}</div>}
          >
            <UnitVisitorTagsSettings unitId={unitId} />
          </PermissionGuard>
        </TabsContent>
        <TabsContent value='virtual-queue' className='mt-6'>
          <PermissionGuard
            permissions={[PermUnitSettingsManage]}
            unitId={unitId}
            fallback={<div>{t('access_denied')}</div>}
          >
            <VirtualQueueSettings unitId={unitId} currentConfig={unit.config} />
          </PermissionGuard>
        </TabsContent>

        <TabsContent value='operator-skills' className='mt-6'>
          <PermissionGuard
            permissions={[PermUnitSettingsManage]}
            unitId={unitId}
            fallback={<div>{t('access_denied')}</div>}
          >
            <Card>
              <CardHeader>
                <CardTitle>{t('operator_skills.title')}</CardTitle>
                <CardDescription>
                  {t('operator_skills.description')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <OperatorSkillMatrix
                  unitId={unitId}
                  skillBasedRoutingEnabled={
                    unit.skillBasedRoutingEnabled ?? false
                  }
                  onToggleSkillRouting={handleToggleSkillRouting}
                />
              </CardContent>
            </Card>
          </PermissionGuard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
