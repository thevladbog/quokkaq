'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
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
  getGetUnitsUnitIdCalendarIntegrationQueryKey,
  useGetUnitsUnitIdCalendarIntegration,
  usePutUnitsUnitIdCalendarIntegration,
  type ServicesCalendarIntegrationPublic,
  type ServicesUpsertIntegrationRequest
} from '@/lib/api/generated/calendar-integration';

const DEFAULT_CALDAV = 'https://caldav.yandex.ru';

interface CalendarIntegrationSettingsProps {
  unitId: string;
}

function integrationFormSyncKey(
  pub: ServicesCalendarIntegrationPublic
): string {
  return [
    pub.enabled ?? false,
    pub.caldavBaseUrl ?? '',
    pub.calendarPath ?? '',
    pub.username ?? '',
    pub.timezone ?? '',
    pub.adminNotifyEmails ?? ''
  ].join('|');
}

function CalendarIntegrationSettingsForm({
  unitId,
  pub
}: {
  unitId: string;
  pub: ServicesCalendarIntegrationPublic;
}) {
  const t = useTranslations('admin.calendar_integration');
  const queryClient = useQueryClient();

  const [enabled, setEnabled] = useState(() => pub.enabled ?? false);
  const [caldavBaseUrl, setCaldavBaseUrl] = useState(
    () => pub.caldavBaseUrl?.trim() || DEFAULT_CALDAV
  );
  const [calendarPath, setCalendarPath] = useState(
    () => pub.calendarPath ?? ''
  );
  const [username, setUsername] = useState(() => pub.username ?? '');
  const [appPassword, setAppPassword] = useState('');
  const [timezone, setTimezone] = useState(() => pub.timezone ?? '');
  const [adminNotifyEmails, setAdminNotifyEmails] = useState(
    () => pub.adminNotifyEmails ?? ''
  );

  const putMutation = usePutUnitsUnitIdCalendarIntegration({
    mutation: {
      onSuccess: (res) => {
        if (res.status === 200) {
          toast.success(t('save_success'));
          queryClient.invalidateQueries({
            queryKey: getGetUnitsUnitIdCalendarIntegrationQueryKey(unitId)
          });
          setAppPassword('');
        }
      },
      onError: () => toast.error(t('save_error'))
    }
  });

  const payload = useMemo((): ServicesUpsertIntegrationRequest => {
    const body: ServicesUpsertIntegrationRequest = {
      enabled,
      caldavBaseUrl: caldavBaseUrl.trim() || DEFAULT_CALDAV,
      calendarPath: calendarPath.trim(),
      username: username.trim(),
      timezone: timezone.trim(),
      adminNotifyEmails: adminNotifyEmails.trim()
    };
    if (appPassword.trim()) {
      body.appPassword = appPassword.trim();
    }
    return body;
  }, [
    enabled,
    caldavBaseUrl,
    calendarPath,
    username,
    timezone,
    adminNotifyEmails,
    appPassword
  ]);

  const handleSave = () => {
    if (enabled) {
      if (!calendarPath.trim() || !username.trim()) {
        toast.error(t('required_fields'));
        return;
      }
    }
    putMutation.mutate({ unitId, data: payload });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='flex items-center space-x-2'>
          <Checkbox
            id='cal-enabled'
            checked={enabled}
            onCheckedChange={(v) => setEnabled(v === true)}
          />
          <Label htmlFor='cal-enabled'>{t('enabled')}</Label>
        </div>

        <div className='grid gap-4 sm:grid-cols-2'>
          <div className='space-y-2 sm:col-span-2'>
            <Label htmlFor='caldav-url'>{t('caldav_base_url')}</Label>
            <Input
              id='caldav-url'
              value={caldavBaseUrl}
              onChange={(e) => setCaldavBaseUrl(e.target.value)}
              placeholder={DEFAULT_CALDAV}
            />
          </div>
          <div className='space-y-2 sm:col-span-2'>
            <Label htmlFor='cal-path'>{t('calendar_path')}</Label>
            <Input
              id='cal-path'
              value={calendarPath}
              onChange={(e) => setCalendarPath(e.target.value)}
              placeholder='/calendars/username/events/'
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='cal-user'>{t('username')}</Label>
            <Input
              id='cal-user'
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete='off'
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='cal-pass'>{t('app_password')}</Label>
            <Input
              id='cal-pass'
              type='password'
              value={appPassword}
              onChange={(e) => setAppPassword(e.target.value)}
              autoComplete='new-password'
              placeholder='••••••••'
            />
          </div>
          <div className='space-y-2 sm:col-span-2'>
            <Label htmlFor='cal-tz'>{t('timezone')}</Label>
            <Input
              id='cal-tz'
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder='Europe/Moscow'
            />
          </div>
          <div className='space-y-2 sm:col-span-2'>
            <Label htmlFor='cal-admin-emails'>{t('admin_emails')}</Label>
            <Input
              id='cal-admin-emails'
              value={adminNotifyEmails}
              onChange={(e) => setAdminNotifyEmails(e.target.value)}
              placeholder='ops@example.com'
            />
          </div>
        </div>

        {(pub?.lastSyncAt || pub?.lastSyncError) && (
          <div className='text-muted-foreground space-y-1 text-sm'>
            {pub.lastSyncAt && (
              <p>
                {t('last_sync')}: {new Date(pub.lastSyncAt).toLocaleString()}
              </p>
            )}
            {pub.lastSyncError ? (
              <p className='text-destructive'>
                {t('last_error')}: {pub.lastSyncError}
              </p>
            ) : null}
          </div>
        )}

        <Button
          type='button'
          onClick={handleSave}
          disabled={putMutation.isPending}
        >
          {putMutation.isPending && (
            <Loader2 className='mr-2 h-4 w-4 animate-spin' />
          )}
          <Save className='mr-2 h-4 w-4' />
          {t('save')}
        </Button>
      </CardContent>
    </Card>
  );
}

export function CalendarIntegrationSettings({
  unitId
}: CalendarIntegrationSettingsProps) {
  const t = useTranslations('admin.calendar_integration');
  const integrationQuery = useGetUnitsUnitIdCalendarIntegration(unitId, {
    query: { staleTime: 30_000 }
  });

  const pub =
    integrationQuery.data?.status === 200
      ? integrationQuery.data.data
      : undefined;

  if (integrationQuery.isLoading) {
    return (
      <div className='flex justify-center py-8'>
        <Loader2 className='h-8 w-8 animate-spin' />
      </div>
    );
  }

  if (!pub) {
    return (
      <Card>
        <CardContent className='text-muted-foreground py-8 text-center text-sm'>
          {integrationQuery.isError ? t('load_error') : t('no_data')}
        </CardContent>
      </Card>
    );
  }

  return (
    <CalendarIntegrationSettingsForm
      key={integrationFormSyncKey(pub)}
      unitId={unitId}
      pub={pub}
    />
  );
}
