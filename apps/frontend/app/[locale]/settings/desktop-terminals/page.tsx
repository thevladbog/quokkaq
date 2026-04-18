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

function filterCountersForContext(unit: Unit, counters: Counter[]): Counter[] {
  if (unit.kind === 'subdivision') {
    return counters.filter((c) => c.unitId === unit.id);
  }
  if (unit.kind === 'service_zone') {
    return counters.filter(
      (c) =>
        !c.serviceZoneId ||
        String(c.serviceZoneId).trim() === '' ||
        c.serviceZoneId === unit.id
    );
  }
  return [];
}

/** Radix Select requires `value` to match a `SelectItem`; empty string is not a valid item value here. */
const SELECT_UNSET = '__unset__';

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
    'kiosk' | 'counter_display'
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
    if (!(createOpen || editOpen)) return;
    if (formDeviceKind !== 'counter_display' || !formContextUnitId) {
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
      setFormDeviceKind('counter_display');
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
    try {
      if (formDeviceKind === 'counter_display') {
        if (!formContextUnitId || !formCounterId) {
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
          contextUnitId: formContextUnitId,
          counterId: formCounterId,
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

      if (!formUnitId) {
        toast.error(t('select_unit'));
        return;
      }
      const res = await desktopTerminalsApi.create({
        unitId: formUnitId,
        defaultLocale: formLocale,
        kioskFullscreen: formKioskFullscreen,
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
        toast.error(t('feature_locked_create'));
        return;
      }
      toast.error(t('error_save'));
    }
  };

  const submitEdit = async () => {
    if (!editing) return;
    const nameTrim = formName.trim();
    try {
      if (formDeviceKind === 'counter_display') {
        if (!formContextUnitId || !formCounterId) {
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
          contextUnitId: formContextUnitId,
          counterId: formCounterId,
          ...(nameTrim ? { name: nameTrim } : {})
        });
      } else {
        if (!formUnitId) {
          toast.error(t('select_unit'));
          return;
        }
        await desktopTerminalsApi.update(editing.id, {
          unitId: formUnitId,
          defaultLocale: formLocale,
          kioskFullscreen: formKioskFullscreen,
          counterId: '',
          ...(nameTrim ? { name: nameTrim } : {})
        });
      }
      setEditOpen(false);
      setEditing(null);
      toast.success(t('updated'));
      load();
    } catch (e) {
      if (e instanceof ApiHttpError && e.status === 403) {
        toast.error(t('feature_locked_create'));
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

  const terminalFormFields = (idPrefix: string) => (
    <>
      <div className='grid gap-2'>
        <Label htmlFor={`${idPrefix}-kind`}>{t('device_kind')}</Label>
        <Select
          value={formDeviceKind}
          onValueChange={(v) => {
            setFormDeviceKind(v as 'kiosk' | 'counter_display');
            setFormContextUnitId('');
            setFormCounterId('');
            if (v === 'kiosk') setAvailableCounters([]);
          }}
        >
          <SelectTrigger id={`${idPrefix}-kind`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='kiosk'>{t('device_kiosk')}</SelectItem>
            <SelectItem value='counter_display'>
              {t('device_counter_display')}
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
            <SelectTrigger>
              <SelectValue placeholder={t('select_unit')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SELECT_UNSET}>{t('select_unit')}</SelectItem>
              {units.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
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
              <SelectTrigger>
                <SelectValue placeholder={t('select_context')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SELECT_UNSET}>
                  {t('select_context')}
                </SelectItem>
                {contextUnits.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
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
              <SelectTrigger>
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
          <SelectTrigger>
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('table.name')}</TableHead>
                  <TableHead>{t('table.unit')}</TableHead>
                  <TableHead>{t('table.counter')}</TableHead>
                  <TableHead>{t('table.locale')}</TableHead>
                  <TableHead>{t('table.kiosk_fullscreen')}</TableHead>
                  <TableHead>{t('table.status')}</TableHead>
                  <TableHead>{t('table.last_seen')}</TableHead>
                  <TableHead className='text-right'>
                    {t('table.actions')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className='font-medium'>
                      {row.name?.trim() || '—'}
                    </TableCell>
                    <TableCell>{row.unitName ?? row.unitId}</TableCell>
                    <TableCell>
                      {row.counterId
                        ? row.counterName?.trim() || row.counterId
                        : '—'}
                    </TableCell>
                    <TableCell>{row.defaultLocale}</TableCell>
                    <TableCell>
                      {row.kioskFullscreen ? (
                        <Badge variant='default'>{t('fullscreen_on')}</Badge>
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
                        <Badge variant='secondary'>{t('status_active')}</Badge>
                      )}
                    </TableCell>
                    <TableCell className='text-muted-foreground text-sm'>
                      {formatAppDateTime(row.lastSeenAt, intlLocale)}
                    </TableCell>
                    <TableCell className='text-right'>
                      <Button
                        variant='ghost'
                        size='icon'
                        disabled={!!row.revokedAt}
                        onClick={() => openEdit(row)}
                        aria-label='Edit'
                      >
                        <Pencil className='h-4 w-4' />
                      </Button>
                      <Button
                        variant='ghost'
                        size='icon'
                        disabled={!!row.revokedAt}
                        onClick={() => setRevokeTarget(row)}
                        aria-label='Revoke'
                      >
                        <Trash2 className='h-4 w-4' />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
