'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
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
  desktopTerminalsApi,
  unitsApi,
  type DesktopTerminal,
  type Unit
} from '@/lib/api';

export default function DesktopTerminalsPage() {
  const t = useTranslations('admin.desktop_terminals');
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

  const [formUnitId, setFormUnitId] = useState('');
  const [formLocale, setFormLocale] = useState('en');
  const [formName, setFormName] = useState('');
  const [formKioskFullscreen, setFormKioskFullscreen] = useState(false);

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

  const resetForm = () => {
    setFormUnitId('');
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
    setFormUnitId(row.unitId);
    setFormLocale(row.defaultLocale);
    setFormName(row.name ?? '');
    setFormKioskFullscreen(row.kioskFullscreen === true);
    setEditOpen(true);
  };

  const submitCreate = async () => {
    if (!formUnitId) {
      toast.error(t('select_unit'));
      return;
    }
    try {
      const nameTrim = formName.trim();
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
    } catch {
      toast.error(t('error_save'));
    }
  };

  const submitEdit = async () => {
    if (!editing || !formUnitId) return;
    try {
      const nameTrim = formName.trim();
      await desktopTerminalsApi.update(editing.id, {
        unitId: formUnitId,
        defaultLocale: formLocale,
        kioskFullscreen: formKioskFullscreen,
        ...(nameTrim ? { name: nameTrim } : {})
      });
      setEditOpen(false);
      setEditing(null);
      toast.success(t('updated'));
      load();
    } catch {
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
                      {row.lastSeenAt
                        ? new Date(row.lastSeenAt).toLocaleString()
                        : '—'}
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
          <div className='grid gap-4 py-2'>
            <div className='grid gap-2'>
              <Label htmlFor='dt-name'>{t('name_optional')}</Label>
              <Input
                id='dt-name'
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={t('name_placeholder')}
              />
            </div>
            <div className='grid gap-2'>
              <Label>{t('unit')}</Label>
              <Select value={formUnitId} onValueChange={setFormUnitId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('select_unit')} />
                </SelectTrigger>
                <SelectContent>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
                <Label htmlFor='dt-kiosk-fs'>{t('kiosk_fullscreen')}</Label>
                <p className='text-muted-foreground text-xs'>
                  {t('kiosk_fullscreen_hint')}
                </p>
              </div>
              <Switch
                id='dt-kiosk-fs'
                checked={formKioskFullscreen}
                onCheckedChange={setFormKioskFullscreen}
              />
            </div>
          </div>
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
          <div className='grid gap-4 py-2'>
            <div className='grid gap-2'>
              <Label htmlFor='dt-edit-name'>{t('name_optional')}</Label>
              <Input
                id='dt-edit-name'
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={t('name_placeholder')}
              />
            </div>
            <div className='grid gap-2'>
              <Label>{t('unit')}</Label>
              <Select value={formUnitId} onValueChange={setFormUnitId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('select_unit')} />
                </SelectTrigger>
                <SelectContent>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
                <Label htmlFor='dt-edit-kiosk-fs'>
                  {t('kiosk_fullscreen')}
                </Label>
                <p className='text-muted-foreground text-xs'>
                  {t('kiosk_fullscreen_hint')}
                </p>
              </div>
              <Switch
                id='dt-edit-kiosk-fs'
                checked={formKioskFullscreen}
                onCheckedChange={setFormKioskFullscreen}
              />
            </div>
          </div>
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
          <DialogFooter className='gap-2 sm:gap-0'>
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
