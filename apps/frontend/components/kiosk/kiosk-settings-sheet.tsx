'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RefreshCw } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter
} from '@/components/ui/sheet';
import { usePatchKioskConfig } from '@/lib/hooks';
import { toast } from 'sonner';
import { Lock } from 'lucide-react';
import { LogoUpload } from '@/components/ui/logo-upload';
import type { UnitConfig } from '@/lib/api';
import {
  isTauriKiosk,
  listPrintersViaTauri,
  printKioskJob,
  testPrintLines,
  type PrinterInfo
} from '@/lib/kiosk-print';
import { useKioskHeaderFields } from '@/hooks/use-kiosk-header-fields';

interface KioskSettingsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  unitId: string;
  /** Unit display name for placeholder (header label default). */
  unitName?: string;
  currentConfig?: UnitConfig | null;
  onLock: () => void;
  isLocked: boolean;
  onUnlock: () => void;
}

export function KioskSettingsSheet({
  isOpen,
  onClose,
  unitId,
  unitName = '',
  currentConfig,
  onLock,
  isLocked,
  onUnlock
}: KioskSettingsSheetProps) {
  const t = useTranslations('kiosk.settings');

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side='right'
        className='w-full overflow-y-auto sm:w-[600px] sm:max-w-[800px] sm:px-12'
      >
        <SheetHeader>
          <SheetTitle>{t('title')}</SheetTitle>
          <SheetDescription>{t('description')}</SheetDescription>
        </SheetHeader>

        {isOpen && (
          <KioskSettingsForm
            unitId={unitId}
            unitName={unitName}
            currentConfig={currentConfig}
            onClose={onClose}
            onLock={onLock}
            isLocked={isLocked}
            onUnlock={onUnlock}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function KioskSettingsForm({
  unitId,
  unitName,
  currentConfig,
  onClose,
  onLock,
  isLocked,
  onUnlock
}: {
  unitId: string;
  unitName: string;
  currentConfig?: UnitConfig | null;
  onClose: () => void;
  onLock: () => void;
  isLocked: boolean;
  onUnlock: () => void;
}) {
  const t = useTranslations('kiosk.settings');
  const patchKioskMutation = usePatchKioskConfig();

  const [showHeader, setShowHeader] = useState(
    currentConfig?.kiosk?.showHeader !== false
  );
  const [showFooter, setShowFooter] = useState(
    currentConfig?.kiosk?.showFooter !== false
  );
  const inferPrinterConnection = (): 'network' | 'system' => {
    const k = currentConfig?.kiosk;
    if (
      k?.printerConnection === 'system' ||
      k?.printerConnection === 'network'
    ) {
      return k.printerConnection;
    }
    if (k?.systemPrinterName?.trim()) {
      return 'system';
    }
    return 'network';
  };
  const [printerConnection, setPrinterConnection] = useState<
    'network' | 'system'
  >(inferPrinterConnection);
  const [systemPrinterName, setSystemPrinterName] = useState(
    currentConfig?.kiosk?.systemPrinterName || ''
  );
  const [printerIp, setPrinterIp] = useState(
    currentConfig?.kiosk?.printerIp || ''
  );
  const [printerPort, setPrinterPort] = useState(
    currentConfig?.kiosk?.printerPort || '9100'
  );
  const [printerType, setPrinterType] = useState(
    currentConfig?.kiosk?.printerType || 'receipt'
  );
  const [isPrintEnabled, setIsPrintEnabled] = useState(
    currentConfig?.kiosk?.isPrintEnabled !== false
  );
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const [logoUrl, setLogoUrl] = useState(currentConfig?.kiosk?.logoUrl || '');
  const [printerLogoUrl, setPrinterLogoUrl] = useState(
    currentConfig?.kiosk?.printerLogoUrl || ''
  );
  const {
    showUnitInHeader,
    setShowUnitInHeader,
    kioskUnitLabelText,
    setKioskUnitLabelText,
    headerKioskSaveFields
  } = useKioskHeaderFields(currentConfig?.kiosk ?? undefined);

  const handleSave = () => {
    const newConfig = {
      ...currentConfig,
      kiosk: {
        ...(currentConfig?.kiosk || {}),
        showHeader,
        showFooter,
        ...headerKioskSaveFields(),
        printerConnection,
        systemPrinterName:
          printerConnection === 'system'
            ? systemPrinterName.trim() || undefined
            : undefined,
        printerIp,
        printerPort,
        printerType,
        isPrintEnabled,
        logoUrl,
        printerLogoUrl: printerLogoUrl.trim() || undefined
      }
    };

    patchKioskMutation.mutate(
      { id: unitId, config: newConfig as Record<string, unknown> },
      {
        onSuccess: () => {
          toast.success(t('save_success'));
          onClose();
        },
        onError: () => {
          toast.error(t('save_error'));
        }
      }
    );
  };

  const refreshPrinters = async () => {
    if (!isTauriKiosk()) {
      toast.info(
        t('test_print_desktop_only', {
          defaultValue:
            'Hardware print runs only in the QuokkaQ Kiosk desktop application.'
        })
      );
      return;
    }
    setLoadingPrinters(true);
    try {
      const { printers: list, error } = await listPrintersViaTauri();
      if (error) {
        toast.error(t('printerListError', { message: error }));
      }
      setPrinters(list);
      setSystemPrinterName((prev) => {
        if (prev.trim()) {
          return prev;
        }
        const def = list.find((p) => p.isDefault)?.name ?? list[0]?.name;
        return def ?? '';
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(t('printerListError', { message }));
    } finally {
      setLoadingPrinters(false);
    }
  };

  const handleTestPrint = async () => {
    if (!isTauriKiosk() && !isPrintEnabled) {
      return;
    }
    if (printerType === 'label') {
      toast.info(
        t('test_print_desktop_only', {
          defaultValue:
            'Label printer test from the desktop app is not implemented yet.'
        })
      );
      return;
    }
    try {
      let native = false;
      if (printerConnection === 'system') {
        if (!systemPrinterName.trim()) {
          toast.error(t('system_printer_required'));
          return;
        }
        native = await printKioskJob(
          'system',
          systemPrinterName.trim(),
          testPrintLines()
        );
      } else {
        if (!printerIp.trim()) {
          toast.error(t('printer_ip_required'));
          return;
        }
        native = await printKioskJob(
          'tcp',
          `${printerIp.trim()}:${printerPort.trim() || '9100'}`,
          testPrintLines()
        );
      }
      if (native) {
        toast.success(t('test_print_sent'));
      } else if (!isTauriKiosk()) {
        toast.info(
          t('test_print_desktop_only', {
            defaultValue:
              'Hardware print runs only in the QuokkaQ Kiosk desktop application.'
          })
        );
      } else {
        toast.error(
          t('printerTestError', {
            message: t('test_print_target_missing', {
              defaultValue: 'Check printer IP or queue name'
            })
          })
        );
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(t('printerTestError', { message }));
    }
  };

  return (
    <>
      <div className='space-y-6 py-6'>
        <div className='space-y-2'>
          <LogoUpload
            label={t('logo_screen')}
            hint={t('logo_screen_hint')}
            currentLogoUrl={logoUrl}
            onLogoUploaded={setLogoUrl}
            onLogoRemoved={() => setLogoUrl('')}
          />
        </div>

        <div className='space-y-4 border-b pb-4'>
          <div className='flex items-center justify-between gap-4'>
            <div className='space-y-0.5'>
              <Label htmlFor='sheet-show-unit'>
                {t('show_unit_in_header')}
              </Label>
              <p className='text-muted-foreground text-sm'>
                {t('show_unit_in_header_desc')}
              </p>
            </div>
            <Switch
              id='sheet-show-unit'
              checked={showUnitInHeader}
              onCheckedChange={setShowUnitInHeader}
            />
          </div>
          {showUnitInHeader ? (
            <div className='space-y-2'>
              <Label htmlFor='sheet-unit-label'>
                {t('kiosk_unit_label_text')}
              </Label>
              <Input
                id='sheet-unit-label'
                value={kioskUnitLabelText}
                onChange={(e) => setKioskUnitLabelText(e.target.value)}
                placeholder={t('kiosk_unit_label_placeholder', {
                  unitName: unitName || '—'
                })}
              />
              <p className='text-muted-foreground text-xs'>
                {t('kiosk_unit_label_help')}
              </p>
            </div>
          ) : null}
        </div>

        <div className='flex items-center justify-between'>
          <div className='space-y-0.5'>
            <Label>{t('show_header')}</Label>
            <p className='text-muted-foreground text-sm'>
              {t('show_header_desc')}
            </p>
          </div>
          <Switch checked={showHeader} onCheckedChange={setShowHeader} />
        </div>

        <div className='flex items-center justify-between'>
          <div className='space-y-0.5'>
            <Label>{t('show_footer')}</Label>
            <p className='text-muted-foreground text-sm'>
              {t('show_footer_desc')}
            </p>
          </div>
          <Switch checked={showFooter} onCheckedChange={setShowFooter} />
        </div>

        <div className='flex items-center justify-between'>
          <div className='space-y-0.5'>
            <Label>{t('enable_printing')}</Label>
            <p className='text-muted-foreground text-sm'>
              {t('enable_printing_desc')}
            </p>
          </div>
          <Switch
            checked={isPrintEnabled}
            onCheckedChange={setIsPrintEnabled}
          />
        </div>

        {isPrintEnabled && (
          <>
            <div className='space-y-2 border-b pb-4'>
              <LogoUpload
                label={t('printer_logo_upload')}
                hint={t('printer_logo_upload_hint')}
                currentLogoUrl={printerLogoUrl}
                onLogoUploaded={setPrinterLogoUrl}
                onLogoRemoved={() => setPrinterLogoUrl('')}
                uploadTarget='printer'
                allowBmpByExtension
                accept='image/png,image/jpeg,image/jpg,image/webp,image/svg+xml,image/bmp,.bmp,.dib'
              />
            </div>

            <div className='space-y-2'>
              <Label>{t('printer_connection')}</Label>
              <div className='flex gap-4'>
                <Button
                  type='button'
                  variant={
                    printerConnection === 'network' ? 'default' : 'outline'
                  }
                  onClick={() => setPrinterConnection('network')}
                  className='flex-1'
                >
                  {t('printer_connection_network')}
                </Button>
                <Button
                  type='button'
                  variant={
                    printerConnection === 'system' ? 'default' : 'outline'
                  }
                  onClick={() => setPrinterConnection('system')}
                  className='flex-1'
                >
                  {t('printer_connection_system')}
                </Button>
              </div>
              <p className='text-muted-foreground text-sm'>
                {t('printer_connection_hint')}
              </p>
            </div>

            {printerConnection === 'network' ? (
              <div className='grid grid-cols-3 gap-4'>
                <div className='col-span-2 space-y-2'>
                  <Label>{t('printer_ip')}</Label>
                  <Input
                    value={printerIp}
                    onChange={(e) => setPrinterIp(e.target.value)}
                    placeholder='192.168.1.100'
                  />
                </div>
                <div className='space-y-2'>
                  <Label>{t('printer_port')}</Label>
                  <Input
                    value={printerPort}
                    onChange={(e) => setPrinterPort(e.target.value)}
                    placeholder='9100'
                  />
                </div>
              </div>
            ) : (
              <div className='space-y-2'>
                <Label>{t('system_printer')}</Label>
                <div className='flex gap-2'>
                  <Input
                    list='kiosk-system-printer-datalist'
                    value={systemPrinterName}
                    onChange={(e) => setSystemPrinterName(e.target.value)}
                    placeholder={t('system_printer_placeholder')}
                    className='min-w-0 flex-1'
                  />
                  <datalist id='kiosk-system-printer-datalist'>
                    {printers.map((p) => (
                      <option key={p.name} value={p.name} />
                    ))}
                  </datalist>
                  <Button
                    type='button'
                    variant='outline'
                    size='icon'
                    onClick={() => void refreshPrinters()}
                    disabled={loadingPrinters}
                    title={t('refresh_printers')}
                  >
                    <RefreshCw
                      className={`size-4 ${loadingPrinters ? 'animate-spin' : ''}`}
                    />
                  </Button>
                </div>
                <p className='text-muted-foreground text-xs'>
                  {t('system_printer_hint')}
                </p>
              </div>
            )}

            <div className='space-y-2'>
              <Label>{t('printer_type')}</Label>
              <div className='flex gap-4'>
                <Button
                  type='button'
                  variant={printerType === 'receipt' ? 'default' : 'outline'}
                  onClick={() => setPrinterType('receipt')}
                  className='flex-1'
                >
                  {t('printer_type_receipt')}
                </Button>
                <Button
                  type='button'
                  variant={printerType === 'label' ? 'default' : 'outline'}
                  onClick={() => setPrinterType('label')}
                  className='flex-1'
                >
                  {t('printer_type_label')}
                </Button>
              </div>
            </div>
          </>
        )}

        <Button
          type='button'
          variant='outline'
          className='w-full'
          onClick={() => void handleTestPrint()}
          disabled={
            printerType === 'label' || (!isTauriKiosk() && !isPrintEnabled)
          }
        >
          {t('test_print')}
        </Button>

        <div className='border-t pt-4'>
          {isLocked ? (
            <Button
              variant='default'
              className='flex w-full items-center gap-2'
              onClick={onUnlock}
            >
              <Lock className='h-4 w-4' />
              {t('unlock_kiosk', { defaultValue: 'Unlock Kiosk' })}
            </Button>
          ) : (
            <Button
              variant='destructive'
              className='flex w-full items-center gap-2'
              onClick={onLock}
            >
              <Lock className='h-4 w-4' />
              {t('lock_kiosk')}
            </Button>
          )}
        </div>
      </div>

      <SheetFooter>
        <Button onClick={handleSave} disabled={patchKioskMutation.isPending}>
          {patchKioskMutation.isPending ? t('saving') : t('save_changes')}
        </Button>
      </SheetFooter>
    </>
  );
}
