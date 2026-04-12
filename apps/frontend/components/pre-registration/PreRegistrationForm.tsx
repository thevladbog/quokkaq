'use client';

import { useState } from 'react';
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

  // Helper function to get localized service name with hierarchy
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

    // Build hierarchy path
    const buildPath = (s: Service): string[] => {
      const path: string[] = [];
      let current: Service | null = s;

      while (current) {
        path.unshift(getName(current));
        // Try to get parent from parent field or find by parentId
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

  // Fetch services
  const { data: services } = useQuery({
    queryKey: ['unit-services', unitId],
    queryFn: () => unitsApi.getServices(unitId)
  });

  // Fetch available slots when service and date are selected
  const { data: availableSlots, isLoading: isSlotsLoading } = useQuery({
    queryKey: ['available-slots', unitId, serviceId, date],
    queryFn: () =>
      preRegistrationsApi.getAvailableSlots(unitId, serviceId, date),
    enabled: !!serviceId && !!date
  });

  // Clear time when date changes (unless it's the initial load with data)
  const handleDateChange = (newDate: string) => {
    setDate(newDate);
    if (newDate && newDate !== initialData?.date) {
      setTime('');
    }
  };

  const createMutation = useMutation({
    mutationFn: (data: {
      serviceId: string;
      date: string;
      time: string;
      customerFirstName: string;
      customerLastName: string;
      customerPhone: string;
      comment?: string;
    }) => preRegistrationsApi.create(unitId, data),
    onSuccess: () => {
      toast.success(t('create_success'));
      queryClient.invalidateQueries({
        queryKey: ['pre-registrations', unitId]
      });
      onSuccess();
    },
    onError: () => toast.error(t('create_error'))
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
      toast.error(
        t('name_required', { defaultValue: 'Enter first or last name' })
      );
      return;
    }
    setCustomerFirstName(trimmedFirstName);
    setCustomerLastName(trimmedLastName);
    const data = {
      serviceId,
      date,
      time,
      customerFirstName: trimmedFirstName,
      customerLastName: trimmedLastName,
      customerPhone,
      comment
    };

    if (initialData) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <form onSubmit={handleSubmit} className='space-y-4'>
      <div className='space-y-2'>
        <Label htmlFor='service'>{t('service')}</Label>
        <Select
          value={serviceId}
          onValueChange={setServiceId}
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
            value={time}
            onValueChange={setTime}
            disabled={!date || (!availableSlots?.length && !initialData)}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('select_time')} />
            </SelectTrigger>
            <SelectContent>
              {isSlotsLoading ? (
                <div className='flex justify-center p-2'>
                  <Loader2 className='h-4 w-4 animate-spin' />
                </div>
              ) : availableSlots?.length === 0 &&
                (!initialData || !availableSlots.includes(initialData.time)) ? (
                <div className='text-muted-foreground p-2 text-sm'>
                  {t('no_slots')}
                </div>
              ) : (
                <>
                  {availableSlots?.map((slot) => (
                    <SelectItem key={slot} value={slot}>
                      {slot}
                    </SelectItem>
                  ))}
                  {/* If editing and current time is not in available slots (e.g. fully booked but this one is ours), add it */}
                  {initialData &&
                    date === initialData.date &&
                    !availableSlots?.includes(initialData.time) && (
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
