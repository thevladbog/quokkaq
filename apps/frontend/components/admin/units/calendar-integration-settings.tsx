'use client';

import { useMemo, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Globe, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { getUnitDisplayName } from '@/lib/unit-display';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import PermissionGuard from '@/components/auth/permission-guard';
import { buildIanaTimezoneComboboxOptions } from '@/lib/iana-timezone-combobox-options';
import {
  getCalendarIntegrationListMineQueryKey,
  useCalendarIntegrationCreateMine,
  useCalendarIntegrationDeleteMine,
  useCalendarIntegrationListMine,
  useCalendarIntegrationPutMine,
  type calendarIntegrationCreateMineResponse,
  type calendarIntegrationDeleteMineResponse,
  type calendarIntegrationPutMineResponse,
  type ServicesCalendarIntegrationPublic,
  type ServicesCreateCalendarIntegrationRequest,
  type ServicesUpdateCalendarIntegrationRequest
} from '@/lib/api/generated/calendar-integration';
import { authenticatedApiFetch } from '@/lib/authenticated-api-fetch';

export const CALENDAR_KIND_YANDEX_CALDAV = 'yandex_caldav';
export const CALENDAR_KIND_GOOGLE_CALDAV = 'google_caldav';

const DEFAULT_CALDAV = 'https://caldav.yandex.ru';

function integrationFormSyncKey(
  pub: ServicesCalendarIntegrationPublic
): string {
  return [
    pub.id ?? '',
    pub.enabled ?? false,
    pub.caldavBaseUrl ?? '',
    pub.calendarPath ?? '',
    pub.username ?? '',
    pub.timezone ?? '',
    pub.adminNotifyEmails ?? '',
    pub.displayName ?? ''
  ].join('|');
}

function CalendarIntegrationCardForm({
  pub
}: {
  pub: ServicesCalendarIntegrationPublic;
}) {
  const t = useTranslations('admin.calendar_integration');
  const tUnits = useTranslations('admin.units');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const isGoogle = pub.kind === CALENDAR_KIND_GOOGLE_CALDAV;

  const [enabled, setEnabled] = useState(pub.enabled ?? false);
  const [displayName, setDisplayName] = useState(() => pub.displayName ?? '');
  const [caldavBaseUrl, setCaldavBaseUrl] = useState(
    pub.caldavBaseUrl?.trim() || DEFAULT_CALDAV
  );
  const [calendarPath, setCalendarPath] = useState(pub.calendarPath ?? '');
  const [username, setUsername] = useState(pub.username ?? '');
  const [appPassword, setAppPassword] = useState('');
  const [timezone, setTimezone] = useState(pub.timezone ?? '');
  const [adminNotifyEmails, setAdminNotifyEmails] = useState(
    pub.adminNotifyEmails ?? ''
  );

  const putMutation = useCalendarIntegrationPutMine({
    mutation: {
      onSuccess: (res: calendarIntegrationPutMineResponse) => {
        if (res.status === 200) {
          toast.success(t('save_success'));
          queryClient.invalidateQueries({
            queryKey: getCalendarIntegrationListMineQueryKey()
          });
          setAppPassword('');
        }
      },
      onError: () => toast.error(t('save_error'))
    }
  });

  const delMutation = useCalendarIntegrationDeleteMine({
    mutation: {
      onSuccess: (res: calendarIntegrationDeleteMineResponse) => {
        if (res.status === 204) {
          toast.success(t('delete_success'));
          queryClient.invalidateQueries({
            queryKey: getCalendarIntegrationListMineQueryKey()
          });
        }
      },
      onError: () => toast.error(t('delete_error'))
    }
  });

  const payload = useMemo((): ServicesUpdateCalendarIntegrationRequest => {
    if (isGoogle) {
      const body: ServicesUpdateCalendarIntegrationRequest = {
        enabled,
        displayName: displayName.trim() || undefined,
        caldavBaseUrl: pub.caldavBaseUrl?.trim() || '',
        calendarPath: pub.calendarPath?.trim() || '',
        username: pub.username?.trim() || '',
        timezone: timezone.trim(),
        adminNotifyEmails: adminNotifyEmails.trim()
      };
      return body;
    }
    const body: ServicesUpdateCalendarIntegrationRequest = {
      enabled,
      displayName: displayName.trim() || undefined,
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
    isGoogle,
    pub.caldavBaseUrl,
    pub.calendarPath,
    pub.username,
    enabled,
    displayName,
    caldavBaseUrl,
    calendarPath,
    username,
    timezone,
    adminNotifyEmails,
    appPassword
  ]);

  const handleSave = () => {
    if (!isGoogle && enabled) {
      if (!calendarPath.trim() || !username.trim()) {
        toast.error(t('required_fields'));
        return;
      }
    }
    if (!pub.id) return;
    putMutation.mutate({ integrationId: pub.id, data: payload });
  };

  const timezoneOptions = useMemo(
    () => buildIanaTimezoneComboboxOptions(timezone),
    [timezone]
  );

  const kindLabel =
    pub.kind === CALENDAR_KIND_YANDEX_CALDAV
      ? t('kind_yandex')
      : pub.kind === CALENDAR_KIND_GOOGLE_CALDAV
        ? t('kind_google')
        : (pub.kind ?? '');

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <Badge variant='secondary'>{kindLabel}</Badge>
        {pub.unitName ? (
          <span className='text-muted-foreground text-sm'>
            {t('unit_label')}:{' '}
            {getUnitDisplayName(
              { name: pub.unitName ?? '', nameEn: pub.unitNameEn },
              locale
            )}
          </span>
        ) : null}
      </div>

      <p className='text-muted-foreground text-xs'>{t('unit_readonly_hint')}</p>

      {isGoogle ? (
        <p className='text-muted-foreground text-xs'>
          {t('google_readonly_hint')}
        </p>
      ) : null}

      <div className='space-y-2'>
        <Label htmlFor={`dn-${pub.id}`}>{t('display_name')}</Label>
        <Input
          id={`dn-${pub.id}`}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={t('display_name_placeholder')}
        />
      </div>

      <div className='flex items-center space-x-2'>
        <Checkbox
          id={`cal-enabled-${pub.id}`}
          checked={enabled}
          onCheckedChange={(v) => setEnabled(v === true)}
        />
        <Label htmlFor={`cal-enabled-${pub.id}`}>{t('enabled')}</Label>
      </div>

      <div className='grid gap-4 sm:grid-cols-2'>
        {!isGoogle ? (
          <>
            <div className='space-y-2 sm:col-span-2'>
              <Label htmlFor={`caldav-url-${pub.id}`}>
                {t('caldav_base_url')}
              </Label>
              <Input
                id={`caldav-url-${pub.id}`}
                value={caldavBaseUrl}
                onChange={(e) => setCaldavBaseUrl(e.target.value)}
                placeholder={DEFAULT_CALDAV}
              />
            </div>
            <div className='space-y-2 sm:col-span-2'>
              <Label htmlFor={`cal-path-${pub.id}`}>{t('calendar_path')}</Label>
              <Input
                id={`cal-path-${pub.id}`}
                value={calendarPath}
                onChange={(e) => setCalendarPath(e.target.value)}
                placeholder='/calendars/username/events/'
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor={`cal-user-${pub.id}`}>{t('username')}</Label>
              <Input
                id={`cal-user-${pub.id}`}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete='off'
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor={`cal-pass-${pub.id}`}>{t('app_password')}</Label>
              <Input
                id={`cal-pass-${pub.id}`}
                type='password'
                value={appPassword}
                onChange={(e) => setAppPassword(e.target.value)}
                autoComplete='new-password'
                placeholder='••••••••'
              />
            </div>
          </>
        ) : (
          <div className='text-muted-foreground space-y-1 text-sm sm:col-span-2'>
            <p>
              <span className='text-foreground font-medium'>
                {t('google_account_label')}
              </span>{' '}
              {pub.username || '—'}
            </p>
          </div>
        )}
        <div className='space-y-2 sm:col-span-2'>
          <Label htmlFor={`cal-tz-${pub.id}`}>{t('timezone')}</Label>
          <Combobox
            id={`cal-tz-${pub.id}`}
            options={timezoneOptions}
            value={timezone}
            onChange={setTimezone}
            placeholder={tUnits('select_timezone')}
            searchPlaceholder={tUnits('search_timezone')}
            emptyText={t('timezone_no_match')}
            className='w-full'
          />
          <p className='text-muted-foreground text-xs'>{t('timezone_hint')}</p>
        </div>
        <div className='space-y-2 sm:col-span-2'>
          <Label htmlFor={`cal-admin-emails-${pub.id}`}>
            {t('admin_emails')}
          </Label>
          <Input
            id={`cal-admin-emails-${pub.id}`}
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

      <div className='flex flex-wrap gap-2'>
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
        <Button
          type='button'
          variant='outline'
          className='text-destructive'
          onClick={() => setDeleteOpen(true)}
          disabled={delMutation.isPending}
        >
          <Trash2 className='mr-2 h-4 w-4' />
          {t('delete')}
        </Button>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete_confirm_title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('delete_confirm_desc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                pub.id && delMutation.mutate({ integrationId: pub.id })
              }
            >
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

type UnitOption = { id: string; name: string; nameEn?: string | null };

function CreateCalendarIntegrationDialog({
  open,
  onOpenChange,
  units,
  integrations,
  defaultUnitId
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  units: UnitOption[];
  integrations: ServicesCalendarIntegrationPublic[];
  defaultUnitId?: string;
}) {
  const t = useTranslations('admin.calendar_integration');
  const tInt = useTranslations('admin.integrations');
  const tUnits = useTranslations('admin.units');
  const locale = useLocale();
  const queryClient = useQueryClient();

  const [unitId, setUnitId] = useState(
    () => defaultUnitId ?? units[0]?.id ?? ''
  );
  const [displayName, setDisplayName] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [caldavBaseUrl, setCaldavBaseUrl] = useState(DEFAULT_CALDAV);
  const [calendarPath, setCalendarPath] = useState('');
  const [username, setUsername] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [timezone, setTimezone] = useState('');
  const [adminNotifyEmails, setAdminNotifyEmails] = useState('');

  const countForUnit = useMemo(() => {
    if (!unitId) return 0;
    return integrations.filter(
      (i: ServicesCalendarIntegrationPublic) => i.unitId === unitId
    ).length;
  }, [integrations, unitId]);

  const atLimit = countForUnit >= 4;

  const postMutation = useCalendarIntegrationCreateMine({
    mutation: {
      onSuccess: (res: calendarIntegrationCreateMineResponse) => {
        if (res.status === 200) {
          toast.success(t('create_success'));
          queryClient.invalidateQueries({
            queryKey: getCalendarIntegrationListMineQueryKey()
          });
          onOpenChange(false);
        }
      },
      onError: (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('limit') || msg.includes('409')) {
          toast.error(t('limit_error'));
        } else {
          toast.error(t('create_error'));
        }
      }
    }
  });

  const timezoneOptions = useMemo(
    () => buildIanaTimezoneComboboxOptions(timezone),
    [timezone]
  );

  const handleCreate = () => {
    if (!unitId) {
      toast.error(tInt('select_unit_error'));
      return;
    }
    if (atLimit) {
      toast.error(t('limit_error'));
      return;
    }
    if (enabled) {
      if (!calendarPath.trim() || !username.trim() || !appPassword.trim()) {
        toast.error(t('required_fields_create'));
        return;
      }
    }
    const body: ServicesCreateCalendarIntegrationRequest = {
      unitId,
      kind: CALENDAR_KIND_YANDEX_CALDAV,
      enabled,
      displayName: displayName.trim() || undefined,
      caldavBaseUrl: caldavBaseUrl.trim() || DEFAULT_CALDAV,
      calendarPath: calendarPath.trim(),
      username: username.trim(),
      appPassword: appPassword.trim(),
      timezone: timezone.trim(),
      adminNotifyEmails: adminNotifyEmails.trim()
    };
    postMutation.mutate({ data: body });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{tInt('add_calendar')}</DialogTitle>
          <DialogDescription>
            <span className='block'>{t('create_dialog_description')}</span>
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4 py-2'>
          <div className='space-y-2'>
            <Label>{tInt('unit_label')}</Label>
            <Select value={unitId} onValueChange={setUnitId}>
              <SelectTrigger>
                <SelectValue placeholder={tInt('unit_placeholder')} />
              </SelectTrigger>
              <SelectContent>
                {units.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {getUnitDisplayName(u, locale)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {atLimit ? (
              <p className='text-destructive text-sm'>{t('limit_error')}</p>
            ) : null}
          </div>

          <div className='space-y-2'>
            <Label>{t('kind_label')}</Label>
            <Input value={t('kind_yandex')} readOnly disabled />
          </div>

          <div className='space-y-2'>
            <Label htmlFor='create-dn'>{t('display_name')}</Label>
            <Input
              id='create-dn'
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t('display_name_placeholder')}
            />
          </div>

          <div className='flex items-center space-x-2'>
            <Checkbox
              id='create-enabled'
              checked={enabled}
              onCheckedChange={(v) => setEnabled(v === true)}
            />
            <Label htmlFor='create-enabled'>{t('enabled')}</Label>
          </div>

          <div className='grid gap-3'>
            <div className='space-y-2'>
              <Label htmlFor='create-caldav'>{t('caldav_base_url')}</Label>
              <Input
                id='create-caldav'
                value={caldavBaseUrl}
                onChange={(e) => setCaldavBaseUrl(e.target.value)}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='create-path'>{t('calendar_path')}</Label>
              <Input
                id='create-path'
                value={calendarPath}
                onChange={(e) => setCalendarPath(e.target.value)}
              />
            </div>
            <div className='grid grid-cols-2 gap-2'>
              <div className='space-y-2'>
                <Label htmlFor='create-user'>{t('username')}</Label>
                <Input
                  id='create-user'
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='create-pass'>{t('app_password_new')}</Label>
                <Input
                  id='create-pass'
                  type='password'
                  value={appPassword}
                  onChange={(e) => setAppPassword(e.target.value)}
                />
              </div>
            </div>
            <div className='space-y-2'>
              <Label htmlFor='create-tz'>{t('timezone')}</Label>
              <Combobox
                id='create-tz'
                options={timezoneOptions}
                value={timezone}
                onChange={setTimezone}
                placeholder={tUnits('select_timezone')}
                searchPlaceholder={tUnits('search_timezone')}
                emptyText={t('timezone_no_match')}
                className='w-full'
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='create-emails'>{t('admin_emails')}</Label>
              <Input
                id='create-emails'
                value={adminNotifyEmails}
                onChange={(e) => setAdminNotifyEmails(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            onClick={handleCreate}
            disabled={postMutation.isPending || atLimit || units.length === 0}
          >
            {postMutation.isPending && (
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
            )}
            {t('create_submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GoogleConnectCalendarDialog({
  open,
  onOpenChange,
  units,
  integrations,
  defaultUnitId,
  returnPath
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  units: UnitOption[];
  integrations: ServicesCalendarIntegrationPublic[];
  defaultUnitId?: string;
  returnPath: string;
}) {
  const t = useTranslations('admin.calendar_integration');
  const tInt = useTranslations('admin.integrations');
  const locale = useLocale();
  const [unitId, setUnitId] = useState(
    () => defaultUnitId ?? units[0]?.id ?? ''
  );
  const [busy, setBusy] = useState(false);

  const countForUnit = useMemo(() => {
    if (!unitId) return 0;
    return integrations.filter(
      (i: ServicesCalendarIntegrationPublic) => i.unitId === unitId
    ).length;
  }, [integrations, unitId]);

  const atLimit = countForUnit >= 4;

  const startGoogle = async () => {
    if (!unitId) {
      toast.error(tInt('select_unit_error'));
      return;
    }
    if (atLimit) {
      toast.error(t('limit_error'));
      return;
    }
    setBusy(true);
    try {
      const res = await authenticatedApiFetch(
        '/companies/me/calendar-integrations/google/oauth/start',
        {
          method: 'POST',
          body: JSON.stringify({ unitId, returnPath })
        }
      );
      if (res.status === 503) {
        toast.error(t('google_connect_unavailable'));
        return;
      }
      if (!res.ok) {
        toast.error(t('google_connect_error'));
        return;
      }
      const data = (await res.json()) as { url?: string };
      if (!data.url) {
        toast.error(t('google_connect_error'));
        return;
      }
      window.location.href = data.url;
    } catch (e) {
      console.error('startGoogle', e);
      toast.error(t('google_connect_error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{t('google_connect_dialog_title')}</DialogTitle>
          <DialogDescription className='space-y-2'>
            <span className='block'>{t('google_connect_dialog_desc')}</span>
            <span className='block'>{t('create_dialog_google_note')}</span>
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-4 py-2'>
          <div className='space-y-2'>
            <Label>{t('google_select_unit')}</Label>
            <Select value={unitId} onValueChange={setUnitId}>
              <SelectTrigger>
                <SelectValue placeholder={tInt('unit_placeholder')} />
              </SelectTrigger>
              <SelectContent>
                {units.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {getUnitDisplayName(u, locale)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {atLimit ? (
              <p className='text-destructive text-sm'>{t('limit_error')}</p>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            onClick={() => void startGoogle()}
            disabled={busy || atLimit || units.length === 0}
          >
            {busy && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            {t('google_connect_submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface CalendarIntegrationsPanelProps {
  /** When set, only show integrations for this unit (e.g. URL filter). */
  filterUnitId?: string | null;
  unitOptions: UnitOption[];
}

export function CalendarIntegrationsPanel({
  filterUnitId,
  unitOptions
}: CalendarIntegrationsPanelProps) {
  const t = useTranslations('admin.integrations');
  const tCal = useTranslations('admin.calendar_integration');
  const locale = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const listQuery = useCalendarIntegrationListMine({
    query: { staleTime: 30_000 }
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [createDialogKey, setCreateDialogKey] = useState(0);
  const [googleOpen, setGoogleOpen] = useState(false);
  const [googleDialogKey, setGoogleDialogKey] = useState(0);

  const oauthReturnPath = useMemo(() => {
    const s = searchParams.toString();
    return s ? `${pathname}?${s}` : pathname;
  }, [pathname, searchParams]);

  const rawList = useMemo(() => {
    return listQuery.data?.status === 200 ? (listQuery.data.data ?? []) : [];
  }, [listQuery.data]);

  const filtered = useMemo(() => {
    if (!filterUnitId) return rawList;
    return rawList.filter(
      (i: ServicesCalendarIntegrationPublic) => i.unitId === filterUnitId
    );
  }, [rawList, filterUnitId]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const na = getUnitDisplayName(
        { name: a.unitName ?? '', nameEn: a.unitNameEn },
        locale
      );
      const nb = getUnitDisplayName(
        { name: b.unitName ?? '', nameEn: b.unitNameEn },
        locale
      );
      const c = na.localeCompare(nb);
      if (c !== 0) return c;
      const da = a.displayName ?? '';
      const db = b.displayName ?? '';
      return da.localeCompare(db);
    });
  }, [filtered, locale]);

  const triggerTitle = (row: ServicesCalendarIntegrationPublic) => {
    const unitLabel = getUnitDisplayName(
      { name: row.unitName ?? '', nameEn: row.unitNameEn },
      locale
    ).trim();
    const unit = unitLabel || row.unitId || '';
    const kindFallback =
      row.kind === CALENDAR_KIND_GOOGLE_CALDAV
        ? tCal('kind_google')
        : tCal('kind_yandex');
    const label = row.displayName?.trim() || kindFallback;
    return `${unit} — ${label}`;
  };

  if (listQuery.isLoading) {
    return (
      <div className='flex justify-center py-8'>
        <Loader2 className='h-8 w-8 animate-spin' />
      </div>
    );
  }

  if (listQuery.isError) {
    return (
      <p className='text-muted-foreground text-sm'>{tCal('load_error')}</p>
    );
  }

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <p className='text-muted-foreground text-sm'>
          {t('calendars_list_hint')}
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type='button'
              size='sm'
              disabled={unitOptions.length === 0}
              aria-label={tCal('add_menu_aria')}
              aria-haspopup='menu'
            >
              <Plus className='mr-2 h-4 w-4' />
              {t('add_calendar')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' className='min-w-[14rem]'>
            <DropdownMenuItem
              className='cursor-pointer gap-2'
              onSelect={() => {
                setGoogleDialogKey((k) => k + 1);
                setGoogleOpen(true);
              }}
            >
              <Globe
                className='text-muted-foreground size-4 shrink-0'
                aria-hidden
              />
              <span className='flex flex-col gap-0.5'>
                <span>{tCal('add_menu_google')}</span>
                <span className='text-muted-foreground text-xs font-normal'>
                  {tCal('add_menu_google_hint')}
                </span>
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem
              className='cursor-pointer gap-2'
              onSelect={() => {
                setCreateDialogKey((k) => k + 1);
                setCreateOpen(true);
              }}
            >
              <CalendarDays
                className='text-muted-foreground size-4 shrink-0'
                aria-hidden
              />
              <span className='flex flex-col gap-0.5'>
                <span>{tCal('add_menu_yandex')}</span>
                <span className='text-muted-foreground text-xs font-normal'>
                  {tCal('add_menu_yandex_hint')}
                </span>
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {sorted.length === 0 ? (
        <p className='text-muted-foreground text-sm'>
          {t('calendar_list_empty')}
        </p>
      ) : (
        <Accordion type='multiple' className='w-full border-t'>
          {sorted.map((row) => {
            if (!row.id || !row.unitId) return null;
            return (
              <AccordionItem key={row.id} value={row.id}>
                <AccordionTrigger className='text-left'>
                  {triggerTitle(row)}
                </AccordionTrigger>
                <AccordionContent>
                  <PermissionGuard
                    permissions={['UNIT_SETTINGS_MANAGE']}
                    unitId={row.unitId}
                    fallback={
                      <p className='text-muted-foreground text-sm'>
                        {t('calendar_no_access')}
                      </p>
                    }
                  >
                    <CalendarIntegrationCardForm
                      key={`${row.id}-${integrationFormSyncKey(row)}`}
                      pub={row}
                    />
                  </PermissionGuard>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

      <CreateCalendarIntegrationDialog
        key={`cal-yandex-${createDialogKey}`}
        open={createOpen}
        onOpenChange={setCreateOpen}
        units={unitOptions}
        integrations={rawList}
        defaultUnitId={filterUnitId ?? undefined}
      />

      <GoogleConnectCalendarDialog
        key={`cal-google-${googleDialogKey}`}
        open={googleOpen}
        onOpenChange={setGoogleOpen}
        units={unitOptions}
        integrations={rawList}
        defaultUnitId={filterUnitId ?? undefined}
        returnPath={oauthReturnPath}
      />
    </div>
  );
}
