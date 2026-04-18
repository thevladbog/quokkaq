'use client';

import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  calendarIntegrationGooglePickComplete,
  calendarIntegrationGooglePickListCalendars,
  getCalendarIntegrationListMineQueryKey
} from '@/lib/api/generated/calendar-integration';
import { ApiHttpError } from '@/lib/api-errors';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { ServicesGoogleCalendarPickOption } from '@/lib/api/generated/calendar-integration';

function pickDefaultCalendarId(
  list: ServicesGoogleCalendarPickOption[]
): string {
  const primary = list.find((c) => c.primary)?.id;
  const first = list[0]?.id;
  const raw = (primary ?? first ?? '').trim();
  if (raw) return raw;
  const fallback = list.find((c) => (c.id ?? '').trim() !== '')?.id;
  return (fallback ?? '').trim();
}

export function GoogleCalendarPickDialog({
  open,
  pickToken,
  onOpenChange
}: {
  open: boolean;
  pickToken: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('admin.calendar_integration');
  const queryClient = useQueryClient();
  const [calendars, setCalendars] = useState<
    ServicesGoogleCalendarPickOption[]
  >([]);
  const [selectedId, setSelectedId] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const resetLocal = useCallback(() => {
    setCalendars([]);
    setSelectedId('');
    setLoadError(null);
    setLoading(false);
    setSubmitting(false);
  }, []);

  useEffect(() => {
    if (!open) {
      resetLocal();
      return;
    }
    if (!pickToken) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setCalendars([]);
    setSelectedId('');
    void (async () => {
      try {
        const res = await calendarIntegrationGooglePickListCalendars({
          pickToken
        });
        if (cancelled) return;
        const body = res.data;
        const rawCalendars =
          body &&
          typeof body === 'object' &&
          'calendars' in body &&
          Array.isArray((body as { calendars: unknown }).calendars)
            ? (body as { calendars: ServicesGoogleCalendarPickOption[] })
                .calendars
            : [];
        const list = rawCalendars.filter((c) => (c.id ?? '').trim() !== '');
        setCalendars(list);
        setSelectedId(list.length > 0 ? pickDefaultCalendarId(list) : '');
        if (list.length === 0) {
          setLoadError(t('google_pick_empty'));
        }
      } catch (e) {
        if (cancelled) return;
        const msg = pickErrorMessage(e, t);
        setLoadError(msg);
        toast.error(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, pickToken, resetLocal, t]);

  useEffect(() => {
    if (calendars.length === 0) return;
    if (!calendars.some((c) => c.id === selectedId)) {
      setSelectedId(pickDefaultCalendarId(calendars));
    }
  }, [calendars, selectedId]);

  const handleConnect = async () => {
    if (!pickToken || !selectedId) {
      toast.error(t('google_pick_select_calendar'));
      return;
    }
    setSubmitting(true);
    try {
      await calendarIntegrationGooglePickComplete({
        pickToken,
        calendarId: selectedId
      });
      toast.success(t('google_pick_success'));
      void queryClient.invalidateQueries({
        queryKey: getCalendarIntegrationListMineQueryKey()
      });
      onOpenChange(false);
    } catch (e) {
      toast.error(pickErrorMessage(e, t));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) resetLocal();
        onOpenChange(o);
      }}
    >
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{t('google_pick_dialog_title')}</DialogTitle>
          <DialogDescription>{t('google_pick_dialog_desc')}</DialogDescription>
        </DialogHeader>
        <div className='space-y-4 py-2'>
          {loading ? (
            <div className='text-muted-foreground flex items-center gap-2 text-sm'>
              <Loader2 className='h-4 w-4 animate-spin' />
              {t('google_pick_loading')}
            </div>
          ) : loadError ? (
            <Alert variant='destructive'>
              <AlertDescription>{loadError}</AlertDescription>
            </Alert>
          ) : (
            <div className='space-y-2'>
              <Label htmlFor='google-pick-calendar'>
                {t('google_pick_label')}
              </Label>
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger id='google-pick-calendar'>
                  <SelectValue placeholder={t('google_pick_placeholder')} />
                </SelectTrigger>
                <SelectContent>
                  {calendars.map((c) => (
                    <SelectItem key={c.id} value={c.id as string}>
                      {formatCalendarOptionLabel(c, t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t('cancel')}
          </Button>
          <Button
            onClick={() => void handleConnect()}
            disabled={
              submitting || loading || !!loadError || calendars.length === 0
            }
          >
            {submitting && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            {t('google_pick_connect')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatCalendarOptionLabel(
  c: ServicesGoogleCalendarPickOption,
  t: (key: string) => string
) {
  const sum = (c.summary ?? c.id ?? '').trim();
  if (c.primary) {
    return `${sum} (${t('google_pick_primary_badge')})`;
  }
  return sum;
}

function pickErrorMessage(e: unknown, t: (key: string) => string): string {
  if (e instanceof ApiHttpError) {
    if (e.status === 400) {
      return t('google_pick_session_expired');
    }
    if (e.status === 403) {
      return t('google_oauth_err_forbidden');
    }
    if (e.status === 409) {
      return t('google_oauth_err_limit');
    }
    if (e.status === 503) {
      return t('google_oauth_err_not_configured');
    }
    const m = e.message.trim();
    if (m) return m;
  }
  return t('google_pick_error');
}
