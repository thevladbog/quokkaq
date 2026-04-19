'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  formatAppDateTime,
  intlLocaleFromAppLocale
} from '@/lib/format-datetime';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Monitor, Pencil, Plus, Trash2, Copy } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  ApiHttpError,
  countersApi,
  desktopTerminalsApi,
  unitsApi,
  type Counter,
  type DesktopTerminal,
  type Unit
} from '@/lib/api';
import { filterCountersForContext } from '@/lib/desktop-terminal-filters';
import { getUnitDisplayName } from '@/lib/unit-display';

/** Radix Select requires `value` to match a `SelectItem`; empty string is not a valid item value here. */
const SELECT_UNSET = '__unset__';

function isCounterTerminalKind(
  kind: 'kiosk' | 'counter_display' | 'counter_board'
): boolean {
  return kind === 'counter_display' || kind === 'counter_board';
}

function featureLockedToastKey(
  kind: 'kiosk' | 'counter_display' | 'counter_board'
): 'feature_locked_create_board' | 'feature_locked_create' {
  return kind === 'counter_board'
    ? 'feature_locked_create_board'
    : 'feature_locked_create';
}

export default function DesktopTerminalsPage() {
  const t = useTranslations('admin.desktop_terminals');
  const locale = useLocale();
  const intlLocale = useMemo(() => intlLocaleFromAppLocale(locale), [locale]);
  const [rows, setRows] = useState<DesktopTerminal[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [newPairingCode, setNewPairingCode] = useState('');
  const [revokeTarget, setRevokeTarget] = useState<DesktopTerminal | null>(
    null
  );
  const [editing, setEditing] = useState<DesktopTerminal | null>(null);

  const [formDeviceKind, setFormDeviceKind] = useState<
    'kiosk' | 'counter_display' | 'counter_board'
  >('kiosk');
  const [formUnitId, setFormUnitId] = useState('');
  const [formContextUnitId, setFormContextUnitId] = useState('');
  const [formCounterId, setFormCounterId] = useState('');
  const [availableCounters, setAvailableCounters] = useState<Counter[]>([]);
  const [countersLoading, setCountersLoading] = useState(false);
  const [formLocale, setFormLocale] = useState('en');
  const [formName, setFormName] = useState('');
  const [formKioskFullscreen, setFormKioskFullscreen] = useState(false);

  /** Bumps when the edit dialog closes or a new edit preload starts; ignore stale async counter loads. */
  const editPreloadSeq = useRef(0);

  const contextUnits = useMemo(
    () =>
      units.filter(
        (u) => u.kind === 'subdivision' || u.kind === 'service_zone'
      ),
    [units]
  );

  const load = useCallback(async () => {
    try {
      const [list, u] = await Promise.all([
        desktopTerminalsApi.list(),
        unitsApi.getAll()
      ]);
      setRows(list);
      setUnits(u);
    } catch {
      toast.error(t('error_load'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (formUnitId && !units.some((u) => u.id === formUnitId)) {
      setFormUnitId('');
    }
  }, [units, formUnitId]);

  useEffect(() => {
    if (
      formContextUnitId &&
      !contextUnits.some((u) => u.id === formContextUnitId)
    ) {
      setFormContextUnitId('');
      setFormCounterId('');
    }
  }, [contextUnits, formContextUnitId]);

  useEffect(() => {
    if (!(createOpen || editOpen)) return;
    if (!isCounterTerminalKind(formDeviceKind)) {
      setAvailableCounters([]);
      setCountersLoading(false);
      return;
    }
    if (!formContextUnitId) {
      setAvailableCounters([]);
      setCountersLoading(false);
      return;
    }
    const ctx = units.find((u) => u.id === formContextUnitId);
    const queueId =
      ctx?.kind === 'subdivision'
        ? ctx.id
        : ctx?.kind === 'service_zone' && ctx.parentId
          ? ctx.parentId
          : null;
    if (!queueId || !ctx) {
      setAvailableCounters([]);
      return;
    }
    let cancelled = false;
    setCountersLoading(true);
    countersApi
      .getByUnitId(queueId)
      .then((all) => {
        if (cancelled) return;
        setAvailableCounters(filterCountersForContext(ctx, all));
      })
      .catch(() => {
        if (!cancelled) {
          setAvailableCounters([]);
          toast.error(t('load_counters_error'));
        }
      })
      .finally(() => {
        if (!cancelled) setCountersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [createOpen, editOpen, formDeviceKind, formContextUnitId, units, t]);

  useEffect(() => {
    if (!editOpen) {
      editPreloadSeq.current += 1;
    }
  }, [editOpen]);

  const resetForm = () => {
    setFormDeviceKind('kiosk');
    setFormUnitId('');
    setFormContextUnitId('');
    setFormCounterId('');
    setAvailableCounters([]);
    setFormLocale('en');
    setFormName('');
    setFormKioskFullscreen(false);
  };

  const openCreate = () => {
    resetForm();
    setCreateOpen(true);
  };

  const openEdit = (row: DesktopTerminal) => {
    setEditing(row);
    setFormLocale(row.defaultLocale);
    setFormName(row.name ?? '');
    setFormKioskFullscreen(row.kioskFullscreen === true);

    if (row.counterId) {
      const rowKind = row.kind ?? 'counter_guest_survey';
      setFormDeviceKind(
        rowKind === 'counter_board' ? 'counter_board' : 'counter_display'
      );
      setFormUnitId(row.unitId);
      setFormCounterId(row.counterId);
      const seq = ++editPreloadSeq.current;
      const counterId = row.counterId;
      void (async () => {
        try {
          const counter = await countersApi.getById(counterId);
          if (seq !== editPreloadSeq.current) return;
          const ctxId = counter.serviceZoneId?.trim()
            ? counter.serviceZoneId
            : row.unitId;
          setFormContextUnitId(ctxId);
          const all = await countersApi.getByUnitId(counter.unitId);
          if (seq !== editPreloadSeq.current) return;
          const ctxUnit = units.find((u) => u.id === ctxId);
          setAvailableCounters(
            ctxUnit ? filterCountersForContext(ctxUnit, all) : all
          );
        } catch {
          if (seq !== editPreloadSeq.current) return;
          setFormContextUnitId(row.unitId);
          setAvailableCounters([]);
          toast.error(t('load_counters_error'));
        }
      })();
    } else {
      setFormDeviceKind('kiosk');
      setFormUnitId(row.unitId);
      setFormContextUnitId('');
      setFormCounterId('');
      setAvailableCounters([]);
    }
    setEditOpen(true);
  };

  const submitCreate = async () => {
    const nameTrim = formName.trim();
    const safeUnitId = units.some((u) => u.id === formUnitId) ? formUnitId : '';
    const safeContextUnitId = contextUnits.some(
      (u) => u.id === formContextUnitId
    )
      ? formContextUnitId
      : '';
    try {
      if (isCounterTerminalKind(formDeviceKind)) {
        if (!safeContextUnitId || !formCounterId) {
          toast.error(t('select_counter_error'));
          return;
        }
        const counter = availableCounters.find((c) => c.id === formCounterId);
        if (!counter) {
          toast.error(t('select_counter_error'));
          return;
        }
        const res = await desktopTerminalsApi.create({
          unitId: counter.unitId,
          defaultLocale: formLocale,
          kioskFullscreen: formKioskFullscreen,
          contextUnitId: safeContextUnitId,
          counterId: formCounterId,
          kind:
            formDeviceKind === 'counter_board'
              ? 'counter_board'
              : 'counter_guest_survey',
          ...(nameTrim ? { name: nameTrim } : {})
        });
        setCreateOpen(false);
        resetForm();
        setNewPairingCode(res.pairingCode);
        setCodeOpen(true);
        toast.success(t('created'));
        load();
        return;
      }

      if (!safeUnitId) {
        toast.error(t('select_unit'));
        return;
      }
      const res = await desktopTerminalsApi.create({
        unitId: safeUnitId,
        defaultLocale: formLocale,
        kioskFullscreen: formKioskFullscreen,
        kind: 'kiosk',
        ...(nameTrim ? { name: nameTrim } : {})
      });
      setCreateOpen(false);
      resetForm();
      setNewPairingCode(res.pairingCode);
      setCodeOpen(true);
      toast.success(t('created'));
      load();
    } catch (e) {
      if (e instanceof ApiHttpError && e.status === 403) {
        toast.error(t(featureLockedToastKey(formDeviceKind)));
        return;
      }
      toast.error(t('error_save'));
    }
  };

  const submitEdit = async () => {
    if (!editing) return;
    const nameTrim = formName.trim();
    const safeUnitId = units.some((u) => u.id === formUnitId) ? formUnitId : '';
    const safeContextUnitId = contextUnits.some(
      (u) => u.id === formContextUnitId
    )
      ? formContextUnitId
      : '';
    try {
      if (isCounterTerminalKind(formDeviceKind)) {
        if (!safeContextUnitId || !formCounterId) {
          toast.error(t('select_counter_error'));
          return;
        }
        const counter = availableCounters.find((c) => c.id === formCounterId);
        if (!counter) {
          toast.error(t('select_counter_error'));
          return;
        }
        await desktopTerminalsApi.update(editing.id, {
          unitId: counter.unitId,
          defaultLocale: formLocale,
          kioskFullscreen: formKioskFullscreen,
          contextUnitId: safeContextUnitId,
          counterId: formCounterId,
          kind:
            formDeviceKind === 'counter_board'
              ? 'counter_board'
              : 'counter_guest_survey',
          ...(nameTrim ? { name: nameTrim } : {})
        });
      } else {
        if (!safeUnitId) {
          toast.error(t('select_unit'));
          return;
        }
        await desktopTerminalsApi.update(editing.id, {
          unitId: safeUnitId,
          defaultLocale: formLocale,
          kioskFullscreen: formKioskFullscreen,
          counterId: '',
          kind: 'kiosk',
          ...(nameTrim ? { name: nameTrim } : {})
        });
      }
      setEditOpen(false);
      setEditing(null);
      toast.success(t('updated'));
      load();
    } catch (e) {
      if (e instanceof ApiHttpError && e.status === 403) {
        toast.error(t(featureLockedToastKey(formDeviceKind)));
        return;
      }
      toast.error(t('error_save'));
    }
  };

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    try {
      await desktopTerminalsApi.revoke(revokeTarget.id);
      setRevokeTarget(null);
      toast.success(t('revoked'));
      load();
    } catch {
      toast.error(t('error_revoke'));
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(newPairingCode);
      toast.success(t('copied'));
    } catch {
      toast.error(t('copy_code'));
    }
  };

  /** Radix SelectTrigger defaults to `w-fit`; full width matches inputs on narrow screens. */
  const fullWidthSelectTrigger = 'w-full min-w-0';

  const terminalFormFields = (idPrefix: string) => (
    <>
      <div className='grid gap-2'>
        <Label htmlFor={`${idPrefix}-kind`}>{t('device_kind')}</Label>
        <Select
          value={formDeviceKind}
          onValueChange={(v) => {
            setFormDeviceKind(
              v as 'kiosk' | 'counter_display' | 'counter_board'
            );
            setFormContextUnitId('');
            setFormCounterId('');
            if (v === 'kiosk') setAvailableCounters([]);
          }}
        >
          <SelectTrigger
            id={`${idPrefix}-kind`}
            className={fullWidthSelectTrigger}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='kiosk'>{t('device_kiosk')}</SelectItem>
            <SelectItem value='counter_display'>
              {t('device_counter_display')}
            </SelectItem>
            <SelectItem value='counter_board'>
              {t('device_counter_board')}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className='grid gap-2'>
        <Label htmlFor={`${idPrefix}-name`}>{t('name_optional')}</Label>
        <Input
          id={`${idPrefix}-name`}
          value={formName}
          onChange={(e) => setFormName(e.target.value)}
          placeholder={t('name_placeholder')}
        />
      </div>
      {formDeviceKind === 'kiosk' ? (
        <div className='grid gap-2'>
          <Label>{t('unit')}</Label>
          <Select
            value={
              (units.some((u) => u.id === formUnitId) ? formUnitId : '') ||
              SELECT_UNSET
            }
            onValueChange={(v) => setFormUnitId(v === SELECT_UNSET ? '' : v)}
          >
            <SelectTrigger className={fullWidthSelectTrigger}>
              <SelectValue placeholder={t('select_unit')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SELECT_UNSET}>{t('select_unit')}</SelectItem>
              {units.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {getUnitDisplayName(u, locale)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <>
          <div className='grid gap-2'>
            <Label>{t('context_unit')}</Label>
            <Select
              value={
                (contextUnits.some((u) => u.id === formContextUnitId)
                  ? formContextUnitId
                  : '') || SELECT_UNSET
              }
              onValueChange={(v) => {
                setFormContextUnitId(v === SELECT_UNSET ? '' : v);
                setFormCounterId('');
              }}
            >
              <SelectTrigger className={fullWidthSelectTrigger}>
                <SelectValue placeholder={t('select_context')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SELECT_UNSET}>
                  {t('select_context')}
                </SelectItem>
                {contextUnits.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {getUnitDisplayName(u, locale)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='grid gap-2'>
            <Label>{t('select_counter')}</Label>
            <Select
              value={
                (availableCounters.some((c) => c.id === formCounterId)
                  ? formCounterId
                  : '') || SELECT_UNSET
              }
              onValueChange={(v) =>
                setFormCounterId(v === SELECT_UNSET ? '' : v)
              }
              disabled={
                !formContextUnitId ||
                countersLoading ||
                availableCounters.length === 0
              }
            >
              <SelectTrigger className={fullWidthSelectTrigger}>
                <SelectValue
                  placeholder={
                    countersLoading ? t('loading') : t('select_counter')
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SELECT_UNSET}>
                  {t('select_counter')}
                </SelectItem>
                {availableCounters.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      )}
      <div className='grid gap-2'>
        <Label>{t('locale')}</Label>
        <Select value={formLocale} onValueChange={setFormLocale}>
          <SelectTrigger className={fullWidthSelectTrigger}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='en'>English</SelectItem>
            <SelectItem value='ru'>Русский</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className='flex items-center justify-between gap-4 rounded-lg border p-3'>
        <div className='space-y-0.5'>
          <Label htmlFor={`${idPrefix}-kiosk-fs`}>
            {t('kiosk_fullscreen')}
          </Label>
          <p className='text-muted-foreground text-xs'>
            {t('kiosk_fullscreen_hint')}
          </p>
        </div>
        <Switch
          id={`${idPrefix}-kiosk-fs`}
          checked={formKioskFullscreen}
          onCheckedChange={setFormKioskFullscreen}
        />
      </div>
    </>
  );

  return (
    <div className='container mx-auto max-w-6xl space-y-6 p-4 md:p-8'>
      <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <h1 className='flex items-center gap-2 text-2xl font-bold tracking-tight'>
            <Monitor className='h-7 w-7' />
            {t('title')}
          </h1>
          <p className='text-muted-foreground mt-1 max-w-2xl text-sm'>
            {t('description')}
          </p>
        </div>
        <Button onClick={openCreate} className='shrink-0'>
          <Plus className='mr-2 h-4 w-4' />
          {t('add')}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className='text-muted-foreground py-8 text-center'>
              {t('loading')}
            </p>
          ) : rows.length === 0 ? (
            <p className='text-muted-foreground py-8 text-center'>
              {t('empty')}
            </p>
          ) : (
            <>
              <p className='text-muted-foreground mb-3 text-sm'>
                {t('table_scroll_hint')}
              </p>
              <div className='overflow-x-auto'>
                <Table className='min-w-[56rem]'>
                  <TableHeader>
                    <TableRow>
                      <TableHead className='max-w-[14rem]'>
                        {t('table.name')}
                      </TableHead>
                      <TableHead className='max-w-[14rem]'>
                        {t('table.unit')}
                      </TableHead>
                      <TableHead>{t('table.kind')}</TableHead>
                      <TableHead className='max-w-[12rem]'>
                        {t('table.counter')}
                      </TableHead>
                      <TableHead className='h-auto min-h-10 w-[5rem] max-w-[5rem] px-1 py-2 text-center align-middle text-xs leading-tight whitespace-normal'>
                        {t('table.locale')}
                      </TableHead>
                      <TableHead>{t('table.kiosk_fullscreen')}</TableHead>
                      <TableHead>{t('table.status')}</TableHead>
                      <TableHead className='min-w-[10rem]'>
                        {t('table.last_seen')}
                      </TableHead>
                      <TableHead className='bg-card sticky right-0 z-30 border-l text-right shadow-[-6px_0_12px_-4px_rgba(0,0,0,0.08)] dark:shadow-[-6px_0_12px_-4px_rgba(0,0,0,0.3)]'>
                        {t('table.actions')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => {
                      const effectiveKind =
                        row.kind ||
                        (row.counterId ? 'counter_guest_survey' : undefined);
                      return (
                        <TableRow key={row.id} className='group'>
                          <TableCell className='max-w-[14rem] truncate font-medium'>
                            {row.name?.trim() || '—'}
                          </TableCell>
                          <TableCell className='max-w-[14rem] truncate'>
                            {row.unitName ?? row.unitId}
                          </TableCell>
                          <TableCell>
                            {effectiveKind === 'counter_board'
                              ? t('device_counter_board')
                              : effectiveKind === 'counter_guest_survey'
                                ? t('device_counter_display')
                                : t('device_kiosk')}
                          </TableCell>
                          <TableCell className='max-w-[12rem] truncate'>
                            {row.counterId
                              ? row.counterName?.trim() || row.counterId
                              : '—'}
                          </TableCell>
                          <TableCell className='w-[5rem] max-w-[5rem] text-center'>
                            {row.defaultLocale}
                          </TableCell>
                          <TableCell>
                            {row.kioskFullscreen ? (
                              <Badge variant='default'>
                                {t('fullscreen_on')}
                              </Badge>
                            ) : (
                              <span className='text-muted-foreground text-sm'>
                                {t('fullscreen_off')}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {row.revokedAt ? (
                              <Badge variant='destructive'>
                                {t('status_revoked')}
                              </Badge>
                            ) : (
                              <Badge variant='secondary'>
                                {t('status_active')}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className='text-muted-foreground max-w-[13rem] min-w-[10rem] truncate text-sm'>
                            {formatAppDateTime(row.lastSeenAt, intlLocale)}
                          </TableCell>
                          <TableCell className='bg-card group-hover:bg-muted/50 sticky right-0 z-20 border-l text-right shadow-[-6px_0_12px_-4px_rgba(0,0,0,0.08)] dark:shadow-[-6px_0_12px_-4px_rgba(0,0,0,0.3)]'>
                            <div className='flex items-center justify-end gap-0.5'>
                              <Button
                                variant='outline'
                                size='icon'
                                className='size-8 shrink-0'
                                disabled={!!row.revokedAt}
                                onClick={() => openEdit(row)}
                                title={
                                  row.revokedAt
                                    ? t('actions_unavailable_revoked')
                                    : t('action_edit')
                                }
                                aria-label={
                                  row.revokedAt
                                    ? t('actions_unavailable_revoked')
                                    : t('action_edit_aria')
                                }
                              >
                                <Pencil className='h-4 w-4' />
                              </Button>
                              <Button
                                variant='outline'
                                size='icon'
                                className='size-8 shrink-0'
                                disabled={!!row.revokedAt}
                                onClick={() => setRevokeTarget(row)}
                                title={
                                  row.revokedAt
                                    ? t('actions_unavailable_revoked')
                                    : t('action_revoke')
                                }
                                aria-label={
                                  row.revokedAt
                                    ? t('actions_unavailable_revoked')
                                    : t('action_revoke_aria')
                                }
                              >
                                <Trash2 className='h-4 w-4' />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('create_title')}</DialogTitle>
            <DialogDescription>{t('create_desc')}</DialogDescription>
          </DialogHeader>
          <div className='grid gap-4 py-2'>{terminalFormFields('dt')}</div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setCreateOpen(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={submitCreate}>{t('create_submit')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('edit_title')}</DialogTitle>
          </DialogHeader>
          <div className='grid gap-4 py-2'>{terminalFormFields('dt-edit')}</div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setEditOpen(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={submitEdit}>{t('save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={codeOpen} onOpenChange={setCodeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('code_title')}</DialogTitle>
            <DialogDescription>{t('code_desc')}</DialogDescription>
          </DialogHeader>
          <div className='bg-muted rounded-md px-4 py-3 font-mono text-lg font-semibold tracking-wider'>
            {newPairingCode}
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={copyCode}>
              <Copy className='mr-2 h-4 w-4' />
              {t('copy_code')}
            </Button>
            <Button onClick={() => setCodeOpen(false)}>{t('close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!revokeTarget}
        onOpenChange={(o) => !o && setRevokeTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('revoke_confirm_title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('revoke_confirm_desc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRevoke}>
              {t('revoke_confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
