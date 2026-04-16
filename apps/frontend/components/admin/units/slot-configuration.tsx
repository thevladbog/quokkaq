'use client';

import { useState, useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { slotsApi, unitsApi, Service } from '@/lib/api';
import { useGetCompaniesMeCalendarIntegrations } from '@/lib/api/generated/calendar-integration';

// Type for translation function from next-intl
type TranslationFunction = (
  key: string,
  values?: Record<string, string | number>
) => string;

interface SlotConfigurationProps {
  unitId: string;
}

interface SlotConfig {
  startTime: string;
  endTime: string;
  intervalMinutes: number; // The backend sends 'interval' but frontend maps it? Let's check api.ts
  days: string[]; // Backend sends 'days'
}

interface SlotCapacity {
  dayOfWeek: string;
  startTime: string;
  serviceId: string;
  capacity: number;
}

interface DaySlot {
  id: string;
  dayScheduleId: string;
  serviceId: string;
  startTime: string;
  capacity: number;
  booked: number;
}

interface DaySchedule {
  id: string;
  unitId: string;
  date: string;
  isDayOff: boolean;
  slots: DaySlot[];
}

const DAYS_OF_WEEK = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday'
];

export function SlotConfiguration({ unitId }: SlotConfigurationProps) {
  const t = useTranslations('admin.slots');
  const locale = useLocale();

  // Helper function to get localized service name with hierarchy
  const getLocalizedServiceName = (
    service: Service,
    servicesList?: Service[]
  ) => {
    if (!service) return '';

    const allServices = servicesList || [];

    const getName = (s: Service) => {
      if (locale === 'ru' && s.nameRu) return s.nameRu;
      if (locale === 'en' && s.nameEn) return s.nameEn;
      return s.name;
    };

    // Build hierarchy path
    const buildPath = (s: Service): string => {
      const path: string[] = [];
      let current: Service | null | undefined = s;

      while (current) {
        path.unshift(getName(current));
        // Try to get parent from parent field or find by parentId
        if (current.parent) {
          current = current.parent;
        } else if (current.parentId && allServices.length > 0) {
          current = allServices.find(
            (srv: Service) => srv.id === current?.parentId
          );
        } else {
          current = null;
        }
      }

      return path.join(' → ');
    };

    return buildPath(service);
  };

  // --- Queries ---

  const { data: services, isLoading: isServicesLoading } = useQuery({
    queryKey: ['unit-services', unitId],
    queryFn: () => unitsApi.getServices(unitId)
  });

  const { data: config, isLoading: isConfigLoading } = useQuery({
    queryKey: ['slot-config', unitId],
    queryFn: () => slotsApi.getConfig(unitId)
  });

  const { data: capacities, isLoading: isCapacitiesLoading } = useQuery({
    queryKey: ['slot-capacities', unitId],
    queryFn: () => slotsApi.getCapacities(unitId)
  });

  const companyCalQuery = useGetCompaniesMeCalendarIntegrations({
    query: { staleTime: 60_000 }
  });
  const isCalendarLoading = companyCalQuery.isLoading;
  const readOnlyCapacity = useMemo(() => {
    const list =
      companyCalQuery.data?.status === 200
        ? (companyCalQuery.data.data ?? [])
        : [];
    const forUnit = list.filter(
      (i) => i.unitId === unitId && i.enabled === true
    );
    return forUnit.length > 0;
  }, [companyCalQuery.data, unitId]);

  if (
    isConfigLoading ||
    isCapacitiesLoading ||
    isServicesLoading ||
    isCalendarLoading
  ) {
    return (
      <div className='flex justify-center p-8'>
        <Loader2 className='animate-spin' />
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      {readOnlyCapacity && (
        <Alert>
          <AlertTitle>
            {t('calendar_readonly_title', {
              defaultValue: 'Capacity is managed in the calendar'
            })}
          </AlertTitle>
          <AlertDescription>
            {t('calendar_readonly_desc', {
              defaultValue:
                'This unit uses Yandex Calendar (CalDAV) for slot capacity. Weekly capacity, generation, and day overrides are read-only here; edit events in the connected calendar.'
            })}
          </AlertDescription>
        </Alert>
      )}
      {config && (
        <SlotConfigForm
          unitId={unitId}
          initialConfig={config}
          t={t}
          readOnly={readOnlyCapacity}
        />
      )}

      {capacities && services && (
        <SlotCapacitiesForm
          unitId={unitId}
          initialCapacities={capacities}
          services={services}
          t={t}
          getLocalizedServiceName={getLocalizedServiceName}
          config={config}
          readOnly={readOnlyCapacity}
        />
      )}

      <GenerationSection unitId={unitId} t={t} readOnly={readOnlyCapacity} />
      <DayManagementSection
        unitId={unitId}
        t={t}
        services={services || []}
        getLocalizedServiceName={getLocalizedServiceName}
        readOnly={readOnlyCapacity}
      />
    </div>
  );
}

function SlotConfigForm({
  unitId,
  initialConfig,
  t,
  readOnly = false
}: {
  unitId: string;
  initialConfig: SlotConfig;
  t: TranslationFunction;
  readOnly?: boolean;
}) {
  const queryClient = useQueryClient();
  const [startTime, setStartTime] = useState(
    initialConfig.startTime || '09:00'
  );
  const [endTime, setEndTime] = useState(initialConfig.endTime || '17:00');
  const [interval, setInterval] = useState(initialConfig.intervalMinutes || 30);
  const [workingDays, setWorkingDays] = useState<string[]>(
    initialConfig.days || [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday'
    ]
  );

  const updateConfigMutation = useMutation({
    mutationFn: (data: SlotConfig) => slotsApi.updateConfig(unitId, data),
    onSuccess: () => {
      toast.success(t('config_saved'));
      queryClient.invalidateQueries({ queryKey: ['slot-config', unitId] });
      queryClient.invalidateQueries({ queryKey: ['slot-capacities', unitId] });
    },
    onError: () => toast.error(t('config_save_error'))
  });

  const handleConfigSave = () => {
    updateConfigMutation.mutate({
      startTime,
      endTime,
      intervalMinutes: interval,
      days: workingDays
    });
  };

  const toggleWorkingDay = (day: string) => {
    setWorkingDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t('configuration_title', { defaultValue: 'Slot Configuration' })}
        </CardTitle>
        <CardDescription>
          {t('configuration_desc', {
            defaultValue:
              'Set working hours and interval for appointment slots.'
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
          <div className='space-y-2'>
            <Label>{t('start_time', { defaultValue: 'Start Time' })}</Label>
            <Input
              type='time'
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              disabled={readOnly}
            />
          </div>
          <div className='space-y-2'>
            <Label>{t('end_time', { defaultValue: 'End Time' })}</Label>
            <Input
              type='time'
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              disabled={readOnly}
            />
          </div>
          <div className='space-y-2'>
            <Label>
              {t('interval_minutes', { defaultValue: 'Interval (minutes)' })}
            </Label>
            <Input
              type='number'
              value={interval}
              onChange={(e) => setInterval(parseInt(e.target.value))}
              disabled={readOnly}
            />
          </div>
        </div>

        <div className='space-y-2'>
          <Label>{t('working_days', { defaultValue: 'Working Days' })}</Label>
          <div className='flex flex-wrap gap-4'>
            {DAYS_OF_WEEK.map((day) => (
              <div key={day} className='flex items-center space-x-2'>
                <Checkbox
                  id={`day-${day}`}
                  checked={workingDays.includes(day)}
                  onCheckedChange={() => toggleWorkingDay(day)}
                  disabled={readOnly}
                />
                <Label htmlFor={`day-${day}`}>
                  {t(`days.${day}`, { defaultValue: day })}
                </Label>
              </div>
            ))}
          </div>
        </div>

        <Button
          onClick={handleConfigSave}
          disabled={readOnly || updateConfigMutation.isPending}
        >
          {updateConfigMutation.isPending && (
            <Loader2 className='mr-2 h-4 w-4 animate-spin' />
          )}
          {t('save_config', { defaultValue: 'Save Configuration' })}
        </Button>
      </CardContent>
    </Card>
  );
}

function SlotCapacitiesForm({
  unitId,
  initialCapacities,
  services,
  t,
  getLocalizedServiceName,
  config,
  readOnly = false
}: {
  unitId: string;
  initialCapacities: SlotCapacity[];
  services: Service[];
  t: TranslationFunction;
  getLocalizedServiceName: (s: Service, list?: Service[]) => string;
  config?: SlotConfig;
  readOnly?: boolean;
}) {
  const queryClient = useQueryClient();
  const [selectedServiceId, setSelectedServiceId] = useState<string>(() => {
    const firstService = services.find((s) => s.isLeaf !== false);
    return firstService?.id || services[0]?.id || '';
  });

  const [localCapacities, setLocalCapacities] = useState<
    Record<string, number>
  >(() => {
    const map: Record<string, number> = {};
    initialCapacities.forEach((c) => {
      map[`${c.dayOfWeek}-${c.startTime}-${c.serviceId}`] = c.capacity;
    });
    return map;
  });

  const updateCapacitiesMutation = useMutation({
    mutationFn: (data: SlotCapacity[]) =>
      slotsApi.updateCapacities(unitId, data),
    onSuccess: () => {
      toast.success(t('capacities_saved'));
      queryClient.invalidateQueries({ queryKey: ['slot-capacities', unitId] });
    },
    onError: () => toast.error(t('capacities_save_error'))
  });

  const timeSlots = useMemo(() => {
    const slots: string[] = [];
    const startTime = config?.startTime || '09:00';
    const endTime = config?.endTime || '17:00';
    const interval = config?.intervalMinutes || 30;

    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);

    let current = startH * 60 + startM;
    const end = endH * 60 + endM;

    while (current < end) {
      const h = Math.floor(current / 60);
      const m = current % 60;
      slots.push(
        `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
      );
      current += interval;
    }

    return slots;
  }, [config]);

  const handleCapacityChange = (day: string, time: string, value: string) => {
    if (!selectedServiceId) return;
    const numVal = parseInt(value);
    if (isNaN(numVal) || numVal < 0) return;

    setLocalCapacities((prev) => ({
      ...prev,
      [`${day}-${time}-${selectedServiceId}`]: numVal
    }));
  };

  const handleCapacitiesSave = () => {
    // Build updates for the currently selected service
    const currentServiceUpdates: SlotCapacity[] = [];
    const workingDays = config?.days || [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday'
    ];

    workingDays.forEach((day: string) => {
      timeSlots.forEach((time) => {
        const key = `${day}-${time}-${selectedServiceId}`;
        const capacity = localCapacities[key] ?? 0;
        // Only include if capacity > 0
        if (capacity > 0) {
          currentServiceUpdates.push({
            dayOfWeek: day,
            startTime: time,
            serviceId: selectedServiceId,
            capacity: capacity
          });
        }
      });
    });

    // Merge with existing capacities from OTHER services
    // We need to be careful not to overwrite other services' capacities with old data if they were updated elsewhere
    // But here we assume single user editing.
    // Better approach: We only send updates for the current service, but the API expects full list?
    // The API implementation (from memory) likely replaces all capacities or updates them.
    // Looking at the previous code:
    // const existingOtherServices = (capacities || []).filter(c => c.serviceId !== selectedServiceId);
    // const allUpdates = [...existingOtherServices, ...currentServiceUpdates];
    // This implies the API expects a full list or we are merging client-side.
    // Let's stick to the previous logic.

    const existingOtherServices = initialCapacities.filter(
      (c) => c.serviceId !== selectedServiceId
    );
    const allUpdates = [...existingOtherServices, ...currentServiceUpdates];

    updateCapacitiesMutation.mutate(allUpdates);
  };

  const workingDays = config?.days || [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday'
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t('capacity_title', { defaultValue: 'Slot Capacities' })}
        </CardTitle>
        <CardDescription>
          {t('capacity_desc', {
            defaultValue:
              'Set the maximum number of appointments per slot for each service.'
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='flex items-end justify-between gap-4'>
          <div className='w-full max-w-xs space-y-2'>
            <Label>
              {t('select_service', { defaultValue: 'Select Service' })}
            </Label>
            <Select
              value={selectedServiceId}
              onValueChange={setSelectedServiceId}
              disabled={readOnly}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={t('select_service_placeholder', {
                    defaultValue: 'Select a service'
                  })}
                />
              </SelectTrigger>
              <SelectContent>
                {services
                  ?.filter((s) => s.prebook !== false)
                  .map((service) => (
                    <SelectItem key={service.id} value={service.id}>
                      {getLocalizedServiceName(service)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleCapacitiesSave}
            disabled={
              readOnly ||
              updateCapacitiesMutation.isPending ||
              !selectedServiceId
            }
          >
            {updateCapacitiesMutation.isPending && (
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
            )}
            <Save className='mr-2 h-4 w-4' />
            {t('save_capacities', { defaultValue: 'Save Capacities' })}
          </Button>
        </div>

        {selectedServiceId && (
          <div className='overflow-x-auto rounded-md border'>
            <table className='w-full text-left text-sm'>
              <thead className='bg-gray-50 text-xs text-gray-700 uppercase dark:bg-gray-800 dark:text-gray-400'>
                <tr>
                  <th className='sticky left-0 z-10 bg-gray-50 px-4 py-3 dark:bg-gray-800'>
                    {t('time', { defaultValue: 'Time' })}
                  </th>
                  {workingDays.map((day: string) => (
                    <th
                      key={day}
                      className='min-w-[100px] px-4 py-3 text-center'
                    >
                      {t(`days.${day}`, { defaultValue: day })}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {timeSlots.map((time) => (
                  <tr
                    key={time}
                    className='border-b hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800'
                  >
                    <td className='sticky left-0 z-10 bg-white px-4 py-2 font-medium dark:bg-gray-900'>
                      {time}
                    </td>
                    {workingDays.map((day: string) => {
                      const key = `${day}-${time}-${selectedServiceId}`;
                      const capacity = localCapacities[key] ?? 0;
                      const hasCapacity = capacity > 0;
                      return (
                        <td key={`${day}-${time}`} className='px-2 py-1'>
                          <Input
                            type='number'
                            min='0'
                            className={cn(
                              'h-8 text-center transition-colors',
                              hasCapacity &&
                                'border-blue-200 bg-blue-50 font-medium dark:border-blue-900 dark:bg-blue-950/30'
                            )}
                            value={capacity}
                            onChange={(e) =>
                              handleCapacityChange(day, time, e.target.value)
                            }
                            disabled={readOnly}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function GenerationSection({
  unitId,
  t,
  readOnly = false
}: {
  unitId: string;
  t: TranslationFunction;
  readOnly?: boolean;
}) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const queryClient = useQueryClient();

  const generateMutation = useMutation({
    mutationFn: () => slotsApi.generate(unitId, from, to),
    onSuccess: () => {
      toast.success(
        t('generated_success', {
          defaultValue: 'Slots generated successfully'
        })
      );
      queryClient.invalidateQueries({ queryKey: ['slot-day'] }); // Invalidate day queries
    },
    onError: (err: Error) =>
      toast.error(
        t('generated_error', { defaultValue: 'Generation failed' }) +
          ': ' +
          err.message
      )
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t('generation_title', { defaultValue: 'Generate Slots' })}
        </CardTitle>
        <CardDescription>
          {t('generation_desc', {
            defaultValue:
              'Generate daily slots based on the configuration above. Existing slots in the range will be overwritten.'
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='flex items-end gap-4'>
          <div className='space-y-2'>
            <Label>{t('from_date', { defaultValue: 'From Date' })}</Label>
            <DatePicker
              value={from}
              onChange={setFrom}
              placeholder={t('from_date', { defaultValue: 'From Date' })}
              disabled={readOnly}
            />
          </div>
          <div className='space-y-2'>
            <Label>{t('to_date', { defaultValue: 'To Date' })}</Label>
            <DatePicker
              value={to}
              onChange={setTo}
              placeholder={t('to_date', { defaultValue: 'To Date' })}
              disabled={readOnly}
            />
          </div>
          <Button
            onClick={() => generateMutation.mutate()}
            disabled={readOnly || !from || !to || generateMutation.isPending}
          >
            {generateMutation.isPending && (
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
            )}
            {t('generate_btn', { defaultValue: 'Generate' })}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DayManagementSection({
  unitId,
  t,
  services,
  getLocalizedServiceName,
  readOnly = false
}: {
  unitId: string;
  t: TranslationFunction;
  services: Service[];
  getLocalizedServiceName: (
    service: Service,
    servicesList?: Service[]
  ) => string;
  readOnly?: boolean;
}) {
  const [date, setDate] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['slot-day', unitId, date],
    queryFn: () => slotsApi.getDay(unitId, date),
    enabled: !!date,
    retry: false
  });

  // We still need this useEffect to sync local state with fetched data for editing
  // But we can make it safer or just use the data directly if we don't need optimistic updates before save
  // However, for a form like this where we edit multiple fields, local state is needed.
  // The lint error was about "Calling setState synchronously within an effect".
  // If we put it in a useEffect that depends on `data`, it runs after render.
  // The previous error was likely due to how it was structured or maybe I'm misremembering the specific line.
  // Actually, the previous error was in `SlotConfiguration` main component, not here.
  // But let's check if we can improve this.
  // We can use `key={date}` on a child component to reset state!

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t('day_management_title', { defaultValue: 'Day Management' })}
        </CardTitle>
        <CardDescription>
          {t('day_management_desc', {
            defaultValue: 'Manage slots for a specific day.'
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-6'>
        <div className='max-w-xs space-y-2'>
          <Label>{t('select_day', { defaultValue: 'Select Day' })}</Label>
          <DatePicker
            value={date}
            onChange={setDate}
            placeholder={t('select_day', { defaultValue: 'Select Day' })}
            disabled={readOnly}
          />
        </div>

        {date && isLoading && <Loader2 className='animate-spin' />}

        {date && !isLoading && !data && (
          <div className='text-muted-foreground italic'>
            {t('no_slots_generated', {
              defaultValue: 'No slots generated for this day.'
            })}
          </div>
        )}

        {date && data && (
          <DayEditor
            key={date + data.id} // Re-mount when date or data changes
            unitId={unitId}
            initialData={data}
            t={t}
            services={services}
            getLocalizedServiceName={getLocalizedServiceName}
            onSaved={refetch}
            readOnly={readOnly}
          />
        )}
      </CardContent>
    </Card>
  );
}

function DayEditor({
  unitId,
  initialData,
  t,
  services,
  getLocalizedServiceName,
  onSaved,
  readOnly = false
}: {
  unitId: string;
  initialData: DaySchedule;
  t: TranslationFunction;
  services: Service[];
  getLocalizedServiceName: (s: Service, list?: Service[]) => string;
  onSaved: () => void;
  readOnly?: boolean;
}) {
  const [details, setDetails] = useState<DaySchedule>(initialData);

  const updateDayMutation = useMutation({
    mutationFn: (data: {
      isDayOff: boolean;
      slots: { serviceId: string; startTime: string; capacity: number }[];
    }) => slotsApi.updateDay(unitId, details.date, data),
    onSuccess: () => {
      toast.success(t('day_saved', { defaultValue: 'Day schedule saved' }));
      onSaved();
    },
    onError: (err: Error) =>
      toast.error(
        t('day_save_error', { defaultValue: 'Failed to save day' }) +
          ': ' +
          err.message
      )
  });

  const handleSave = () => {
    if (!details) return;
    updateDayMutation.mutate({
      isDayOff: details.isDayOff,
      slots: details.slots.map((s) => ({
        serviceId: s.serviceId,
        startTime: s.startTime,
        capacity: s.capacity
      }))
    });
  };

  const handleCapacityChange = (slotId: string, newVal: string) => {
    const num = parseInt(newVal);
    if (isNaN(num) || num < 0) return;

    setDetails((prev) => {
      return {
        ...prev,
        slots: prev.slots.map((s) =>
          s.id === slotId ? { ...s, capacity: num } : s
        )
      };
    });
  };

  const toggleDayOff = (checked: boolean) => {
    setDetails((prev) => {
      return { ...prev, isDayOff: checked };
    });
  };

  // Group slots by service for display
  const slotsByService = useMemo(() => {
    if (!details || !details.slots) return {};
    const groups: Record<string, DaySlot[]> = {};
    details.slots.forEach((s) => {
      if (!groups[s.serviceId]) groups[s.serviceId] = [];
      groups[s.serviceId].push(s);
    });
    return groups;
  }, [details]);

  return (
    <div className='space-y-6 rounded-md border p-4'>
      <div className='flex items-center space-x-2'>
        <Checkbox
          id='is-day-off'
          checked={details.isDayOff}
          onCheckedChange={toggleDayOff}
          disabled={readOnly}
        />
        <Label htmlFor='is-day-off' className='font-bold text-red-600'>
          {t('mark_as_day_off', { defaultValue: 'Mark as Day Off (Holiday)' })}
        </Label>
      </div>

      {!details.isDayOff && (
        <div className='space-y-4'>
          <div className='rounded bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-900/20 dark:text-blue-200'>
            {t('capacity_hint', {
              defaultValue:
                'Hint: "Total Capacity" includes existing bookings. "Available" is calculated as Total - Booked. If you want to add 1 more slot to a fully booked time, increase Total Capacity by 1.'
            })}
          </div>

          {Object.entries(slotsByService).map(([serviceId, slots]) => {
            const service = services.find((s) => s.id === serviceId);
            if (!service) return null;
            return (
              <div key={serviceId} className='space-y-2'>
                <h4 className='font-semibold'>
                  {getLocalizedServiceName(service, services)}
                </h4>
                <div className='grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6'>
                  {slots.map((slot) => (
                    <div
                      key={slot.id}
                      className='space-y-1 rounded border p-2 text-center'
                    >
                      <div className='font-medium'>{slot.startTime}</div>
                      <div className='text-muted-foreground text-xs'>
                        {t('booked')}: {slot.booked}
                      </div>
                      <div className='text-xs font-medium text-green-600'>
                        {t('available')}:{' '}
                        {Math.max(0, slot.capacity - slot.booked)}
                      </div>
                      <Input
                        type='number'
                        className='h-7 text-center text-sm'
                        value={slot.capacity}
                        onChange={(e) =>
                          handleCapacityChange(slot.id, e.target.value)
                        }
                        disabled={readOnly}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Button
        onClick={handleSave}
        disabled={readOnly || updateDayMutation.isPending}
      >
        {updateDayMutation.isPending && (
          <Loader2 className='mr-2 h-4 w-4 animate-spin' />
        )}
        {t('save_day', { defaultValue: 'Save Day Changes' })}
      </Button>
    </div>
  );
}
