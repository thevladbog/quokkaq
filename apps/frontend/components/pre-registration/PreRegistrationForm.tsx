'use client';

import { useMemo, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import {
  preRegistrationsApi,
  unitsApi,
  PreRegistration,
  Service
} from '@/lib/api';
import { useGetUnitsUnitIdCalendarIntegration } from '@/lib/api/generated/calendar-integration';
import {
  useGetUnitsUnitIdPreRegistrationsCalendarSlots,
  usePostUnitsUnitIdPreRegistrations
} from '@/lib/api/generated/pre-registrations';

interface PreRegistrationFormProps {
  unitId: string;
  initialData?: PreRegistration | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export function PreRegistrationForm({
  unitId,
  initialData,
  onSuccess,
  onCancel
}: PreRegistrationFormProps) {
  const t = useTranslations('admin.pre_registrations');
  const tCommon = useTranslations('common');
  const queryClient = useQueryClient();
  const locale = useLocale();

  const [serviceId, setServiceId] = useState(initialData?.serviceId || '');
  const [date, setDate] = useState(initialData?.date || '');
  const [time, setTime] = useState(initialData?.time || '');
  /** CalDAV resource when booking against imported calendar slots */
  const [externalHref, setExternalHref] = useState<string | undefined>(
    initialData?.externalEventHref
  );
  const [externalEtag, setExternalEtag] = useState<string | undefined>(
    initialData?.externalEventEtag
  );
  const [customerFirstName, setCustomerFirstName] = useState(
    initialData?.customerFirstName || ''
  );
  const [customerLastName, setCustomerLastName] = useState(
    initialData?.customerLastName || ''
  );
  const [customerPhone, setCustomerPhone] = useState(
    initialData?.customerPhone || ''
  );
  const [comment, setComment] = useState(initialData?.comment || '');

  const getLocalizedServiceName = (
    service: Service,
    servicesList?: Service[]
  ) => {
    if (!service) return '';

    const allServices = servicesList || services || [];

    const getName = (s: Service) => {
      if (locale === 'ru' && s.nameRu) return s.nameRu;
      if (locale === 'en' && s.nameEn) return s.nameEn;
      return s.name;
    };

    const buildPath = (s: Service): string[] => {
      const path: string[] = [];
      let current: Service | null = s;

      while (current) {
        path.unshift(getName(current));
        if (current.parent) {
          current = current.parent ?? null;
        } else if (current.parentId && allServices.length > 0) {
          current =
            allServices.find((srv: Service) => srv.id === current?.parentId) ??
            null;
        } else {
          current = null;
        }
      }

      return path;
    };

    const path = buildPath(service);
    return path.join(' → ');
  };

  const { data: services } = useQuery({
    queryKey: ['unit-services', unitId],
    queryFn: () => unitsApi.getServices(unitId)
  });

  const calendarIntegrationQuery = useGetUnitsUnitIdCalendarIntegration(
    unitId,
    { query: { staleTime: 60_000 } }
  );

  const calendarEnabled =
    calendarIntegrationQuery.data?.status === 200 &&
    calendarIntegrationQuery.data.data?.enabled === true;

  const hadExternalSlot = Boolean(
    initialData?.externalEventHref &&
    initialData.externalEventHref.trim() !== ''
  );

  const calSlotsEnabled = Boolean(serviceId && date && calendarEnabled);

  const calSlotsQuery = useGetUnitsUnitIdPreRegistrationsCalendarSlots(
    unitId,
    { serviceId, date },
    {
      query: {
        enabled: calSlotsEnabled
      }
    }
  );

  const calItems = useMemo(() => {
    if (calSlotsQuery.data?.status !== 200) return [];
    return calSlotsQuery.data.data ?? [];
  }, [calSlotsQuery.data]);

  const calFailedOrEmpty =
    calendarEnabled &&
    !!serviceId &&
    !!date &&
    (calSlotsQuery.isError ||
      (calSlotsQuery.data?.status === 200 && calItems.length === 0));

  const waitingForCalendarSlots =
    calendarEnabled &&
    calSlotsQuery.isPending &&
    !calFailedOrEmpty &&
    (!initialData || hadExternalSlot);

  const useCalendarUi =
    calendarEnabled &&
    !!serviceId &&
    !!date &&
    calItems.length > 0 &&
    !calFailedOrEmpty &&
    (!initialData || hadExternalSlot);

  const legacySlotsEnabled =
    !!serviceId &&
    !!date &&
    !useCalendarUi &&
    (!calendarEnabled || calFailedOrEmpty || !hadExternalSlot) &&
    !waitingForCalendarSlots;

  const legacySlotsQuery = useQuery({
    queryKey: ['available-slots', unitId, serviceId, date],
    queryFn: () =>
      preRegistrationsApi.getAvailableSlots(unitId, serviceId, date),
    enabled: legacySlotsEnabled
  });

  const calPending =
    calendarEnabled &&
    !!serviceId &&
    !!date &&
    calSlotsQuery.isPending &&
    (!initialData || hadExternalSlot);

  const availableSlots = legacySlotsQuery.data;

  const handleDateChange = (newDate: string) => {
    setDate(newDate);
    setExternalHref(undefined);
    setExternalEtag(undefined);
    if (!newDate) {
      setTime('');
      return;
    }
    if (newDate !== initialData?.date) {
      setTime('');
    }
  };

  const createPostMutation = usePostUnitsUnitIdPreRegistrations({
    mutation: {
      onSuccess: (res) => {
        if (res.status === 200) {
          toast.success(t('create_success'));
          queryClient.invalidateQueries({
            queryKey: ['pre-registrations', unitId]
          });
          onSuccess();
        }
      },
      onError: () => toast.error(t('create_error'))
    }
  });

  const updateMutation = useMutation({
    mutationFn: (data: {
      serviceId: string;
      date: string;
      time: string;
      customerFirstName: string;
      customerLastName: string;
      customerPhone: string;
      comment?: string;
      externalEventHref?: string;
      externalEventEtag?: string;
    }) => preRegistrationsApi.update(unitId, initialData!.id, data),
    onSuccess: () => {
      toast.success(t('update_success'));
      queryClient.invalidateQueries({
        queryKey: ['pre-registrations', unitId]
      });
      onSuccess();
    },
    onError: () => toast.error(t('update_error'))
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedFirstName = customerFirstName.trim();
    const trimmedLastName = customerLastName.trim();
    if (!trimmedFirstName && !trimmedLastName) {
      toast.error(t('name_required'));
      return;
    }
    setCustomerFirstName(trimmedFirstName);
    setCustomerLastName(trimmedLastName);

    const resolvedTime = time;
    if (!resolvedTime) {
      toast.error(t('select_time'));
      return;
    }

    if (initialData) {
      const slotChanged =
        date !== initialData.date ||
        time !== initialData.time ||
        serviceId !== initialData.serviceId;
      const hadCalendarBinding = Boolean(
        initialData.externalEventHref &&
        initialData.externalEventHref.trim() !== ''
      );

      if (
        slotChanged &&
        hadCalendarBinding &&
        calendarEnabled &&
        useCalendarUi &&
        !externalHref?.trim()
      ) {
        toast.error(t('reschedule_pick_calendar_slot'));
        return;
      }
      if (
        slotChanged &&
        hadCalendarBinding &&
        calendarEnabled &&
        !useCalendarUi &&
        !legacySlotsQuery.isLoading &&
        (!availableSlots || availableSlots.length === 0)
      ) {
        toast.error(t('reschedule_calendar_unavailable'));
        return;
      }

      const payload: Parameters<typeof updateMutation.mutate>[0] = {
        serviceId,
        date,
        time: resolvedTime,
        customerFirstName: trimmedFirstName,
        customerLastName: trimmedLastName,
        customerPhone,
        comment
      };
      if (useCalendarUi && externalHref?.trim()) {
        payload.externalEventHref = externalHref;
        if (externalEtag) {
          payload.externalEventEtag = externalEtag;
        }
      }
      updateMutation.mutate(payload);
      return;
    }

    if (useCalendarUi && !externalHref) {
      toast.error(t('pick_calendar_slot'));
      return;
    }

    createPostMutation.mutate({
      unitId,
      data: {
        serviceId,
        date,
        time: resolvedTime,
        customerFirstName: trimmedFirstName,
        customerLastName: trimmedLastName,
        customerPhone,
        comment,
        externalEventHref: externalHref,
        externalEventEtag: externalEtag
      }
    });
  };

  const isSlotsLoading =
    calPending || (legacySlotsEnabled && legacySlotsQuery.isLoading);

  const slotOptionsForUi = useCalendarUi
    ? calItems.map((item, idx) => ({
        key: `${item.externalEventHref}-${idx}`,
        value: item.externalEventHref ?? '',
        label: item.time ?? '',
        time: item.time ?? '',
        eTag: item.eTag
      }))
    : (availableSlots ?? []).map((slot) => ({
        key: slot,
        value: slot,
        label: slot,
        time: slot,
        eTag: undefined as string | undefined
      }));

  const isPending = createPostMutation.isPending || updateMutation.isPending;

  return (
    <form onSubmit={handleSubmit} className='space-y-4'>
      <div className='space-y-2'>
        <Label htmlFor='service'>{t('service')}</Label>
        <Select
          value={serviceId}
          onValueChange={(v) => {
            setServiceId(v);
            setTime('');
            setExternalHref(undefined);
            setExternalEtag(undefined);
          }}
          disabled={!!initialData}
        >
          <SelectTrigger>
            <SelectValue placeholder={t('select_service')} />
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

      <div className='grid grid-cols-2 gap-4'>
        <div className='space-y-2'>
          <Label htmlFor='date'>{t('date')}</Label>
          <DatePicker
            value={date}
            onChange={handleDateChange}
            placeholder={t('date')}
            disabled={!serviceId}
          />
        </div>
        <div className='space-y-2'>
          <Label htmlFor='time'>{t('time')}</Label>
          <Select
            value={useCalendarUi ? (externalHref ?? '') : time}
            onValueChange={(v) => {
              if (useCalendarUi) {
                const row = calItems.find((i) => i.externalEventHref === v);
                setExternalHref(row?.externalEventHref);
                setExternalEtag(row?.eTag);
                setTime(row?.time ?? '');
              } else {
                setTime(v);
                setExternalHref(undefined);
                setExternalEtag(undefined);
              }
            }}
            disabled={
              !date ||
              isSlotsLoading ||
              (!useCalendarUi && !availableSlots?.length && !calPending)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder={t('select_time')} />
            </SelectTrigger>
            <SelectContent>
              {isSlotsLoading ? (
                <div className='flex justify-center p-2'>
                  <Loader2 className='h-4 w-4 animate-spin' />
                </div>
              ) : slotOptionsForUi.length === 0 &&
                (!initialData ||
                  (initialData &&
                    !slotOptionsForUi.some(
                      (o) => o.time === initialData.time
                    ))) ? (
                <div className='text-muted-foreground p-2 text-sm'>
                  {t('no_slots')}
                </div>
              ) : (
                <>
                  {slotOptionsForUi.map((opt) => (
                    <SelectItem key={opt.key} value={opt.value}>
                      {useCalendarUi &&
                      calItems.filter((c) => c.time === opt.time).length > 1
                        ? `${opt.label} (${opt.value.slice(-12)})`
                        : opt.label}
                    </SelectItem>
                  ))}
                  {initialData &&
                    useCalendarUi &&
                    externalHref &&
                    !slotOptionsForUi.some((o) => o.value === externalHref) && (
                      <SelectItem value={externalHref}>
                        {initialData.time}
                      </SelectItem>
                    )}
                  {initialData &&
                    !useCalendarUi &&
                    date === initialData.date &&
                    !slotOptionsForUi.some(
                      (o) => o.time === initialData.time
                    ) && (
                      <SelectItem value={initialData.time}>
                        {initialData.time}
                      </SelectItem>
                    )}
                </>
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className='grid gap-4 sm:grid-cols-2'>
        <div className='space-y-2'>
          <Label htmlFor='firstName'>{t('customer_first_name')}</Label>
          <Input
            id='firstName'
            value={customerFirstName}
            onChange={(e) => setCustomerFirstName(e.target.value)}
          />
        </div>
        <div className='space-y-2'>
          <Label htmlFor='lastName'>{t('customer_last_name')}</Label>
          <Input
            id='lastName'
            value={customerLastName}
            onChange={(e) => setCustomerLastName(e.target.value)}
          />
        </div>
      </div>

      <div className='space-y-2'>
        <Label htmlFor='phone'>{t('customer_phone')}</Label>
        <Input
          id='phone'
          value={customerPhone}
          onChange={(e) => setCustomerPhone(e.target.value)}
          required
        />
      </div>

      <div className='space-y-2'>
        <Label htmlFor='comment'>{t('comment')}</Label>
        <Textarea
          id='comment'
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </div>

      <div className='flex justify-end gap-2 pt-4'>
        <Button type='button' variant='outline' onClick={onCancel}>
          {tCommon('cancel')}
        </Button>
        <Button type='submit' disabled={isPending}>
          {isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
          {initialData ? tCommon('save') : tCommon('create')}
        </Button>
      </div>
    </form>
  );
}
