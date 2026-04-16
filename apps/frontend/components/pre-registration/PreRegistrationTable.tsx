'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatFullName } from '@/lib/format';
import { formatAppDate, intlLocaleFromAppLocale } from '@/lib/format-datetime';
import { Edit, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import {
  preRegistrationsApi,
  unitsApi,
  PreRegistration,
  Service
} from '@/lib/api';

interface PreRegistrationTableProps {
  unitId: string;
  onEdit: (preReg: PreRegistration) => void;
}

export function PreRegistrationTable({
  unitId,
  onEdit
}: PreRegistrationTableProps) {
  const t = useTranslations('admin.pre_registrations');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const intlLocale = intlLocaleFromAppLocale(locale);
  const queryClient = useQueryClient();
  const [cancelTarget, setCancelTarget] = useState<PreRegistration | null>(
    null
  );

  const { data: preRegistrations, isLoading } = useQuery({
    queryKey: ['pre-registrations', unitId],
    queryFn: () => preRegistrationsApi.getByUnitId(unitId)
  });

  // Fetch services for building hierarchy
  const { data: services } = useQuery({
    queryKey: ['unit-services', unitId],
    queryFn: () => unitsApi.getServices(unitId)
  });

  const cancelMutation = useMutation({
    mutationFn: (preReg: PreRegistration) =>
      preRegistrationsApi.update(unitId, preReg.id, {
        serviceId: preReg.serviceId,
        date: preReg.date,
        time: preReg.time,
        customerFirstName: preReg.customerFirstName,
        customerLastName: preReg.customerLastName,
        customerPhone: preReg.customerPhone,
        comment: preReg.comment ?? '',
        status: 'canceled'
      }),
    onSuccess: () => {
      toast.success(t('cancel_success'));
      queryClient.invalidateQueries({
        queryKey: ['pre-registrations', unitId]
      });
      setCancelTarget(null);
    },
    onError: () => {
      toast.error(t('cancel_error'));
    }
  });

  // Helper function to get localized service name with hierarchy
  const getLocalizedServiceName = (service: Service | null | undefined) => {
    if (!service) return '';

    const allServices = services || [];

    const getName = (s: Service) => {
      if (locale === 'ru' && s.nameRu) return s.nameRu;
      if (locale === 'en' && s.nameEn) return s.nameEn;
      return s.name;
    };

    // Build hierarchy path
    const buildPath = (s: Service): string[] => {
      const path: string[] = [];
      let current: Service | null | undefined = s;

      while (current) {
        path.unshift(getName(current));
        // Try to get parent from parent field or find by parentId
        if (current.parent) {
          current = current.parent;
        } else if (current?.parentId && allServices.length > 0) {
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

  if (isLoading) {
    return (
      <div className='flex justify-center p-8'>
        <Loader2 className='animate-spin' />
      </div>
    );
  }

  if (!preRegistrations || preRegistrations.length === 0) {
    return (
      <div className='text-muted-foreground p-8 text-center'>
        {t('no_records')}
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'created':
        return (
          <Badge
            variant='outline'
            className='border-blue-200 bg-blue-50 text-blue-700'
          >
            {t('status.created')}
          </Badge>
        );
      case 'ticket_issued':
        return (
          <Badge
            variant='outline'
            className='border-green-200 bg-green-50 text-green-700'
          >
            {t('status.ticket_issued')}
          </Badge>
        );
      case 'canceled':
        return (
          <Badge
            variant='outline'
            className='border-red-200 bg-red-50 text-red-700'
          >
            {t('status.canceled')}
          </Badge>
        );
      default:
        return <Badge variant='outline'>{status}</Badge>;
    }
  };

  return (
    <>
      <AlertDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => {
          if (!open && !cancelMutation.isPending) setCancelTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('cancel_confirm_title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('cancel_confirm_desc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelMutation.isPending}>
              {tCommon('cancel')}
            </AlertDialogCancel>
            <Button
              type='button'
              variant='destructive'
              disabled={cancelMutation.isPending}
              onClick={() => {
                if (cancelTarget) cancelMutation.mutate(cancelTarget);
              }}
            >
              {cancelMutation.isPending ? (
                <Loader2 className='h-4 w-4 animate-spin' />
              ) : (
                t('cancel_dialog_confirm')
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('date_time')}</TableHead>
              <TableHead>{t('code')}</TableHead>
              <TableHead>{t('client')}</TableHead>
              <TableHead>{t('service')}</TableHead>
              <TableHead>{t('status.title')}</TableHead>
              <TableHead className='text-right'>{tCommon('actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {preRegistrations.map((preReg) => (
              <TableRow key={preReg.id}>
                <TableCell>
                  <div className='flex flex-col'>
                    <span className='font-medium'>
                      {formatAppDate(preReg.date, intlLocale, 'long')}
                    </span>
                    <span className='text-muted-foreground text-xs'>
                      {preReg.time}
                    </span>
                  </div>
                </TableCell>
                <TableCell className='font-mono'>{preReg.code}</TableCell>
                <TableCell>
                  <div className='flex flex-col'>
                    <span>
                      {formatFullName(
                        preReg.customerFirstName,
                        preReg.customerLastName
                      )}
                    </span>
                    <span className='text-muted-foreground text-xs'>
                      {preReg.customerPhone}
                    </span>
                  </div>
                </TableCell>
                <TableCell>{getLocalizedServiceName(preReg.service)}</TableCell>
                <TableCell>{getStatusBadge(preReg.status)}</TableCell>
                <TableCell className='text-right'>
                  <div className='flex justify-end gap-1'>
                    {preReg.status === 'created' ? (
                      <Button
                        type='button'
                        variant='ghost'
                        size='sm'
                        className='text-destructive hover:text-destructive'
                        onClick={() => setCancelTarget(preReg)}
                      >
                        {t('cancel')}
                      </Button>
                    ) : null}
                    <Button
                      variant='ghost'
                      size='icon'
                      onClick={() => onEdit(preReg)}
                      disabled={preReg.status !== 'created'}
                    >
                      <Edit className='h-4 w-4' />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
