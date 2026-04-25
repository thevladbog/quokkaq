'use client';

import { useState, useCallback } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { KioskTouchKeyboard } from '@/components/kiosk/kiosk-touch-keyboard';
import { unitsApi, type Service } from '@/lib/api';
import { useKioskBarcodeWedge } from '@/hooks/use-kiosk-barcode-wedge';

type Props = {
  unitId: string;
  service: Service;
  mode: 'badge' | 'login';
  onBack: () => void;
  onIdentified: (userId: string) => void;
  onUseKeyboard?: () => void;
};

/**
 * Employee identification: badge (wedge) or on-screen login, both via POST …/employee-idp/resolve.
 */
export function KioskEmployeeIdFlow({
  unitId,
  onBack,
  onIdentified,
  mode,
  onUseKeyboard
}: Props) {
  const t = useTranslations('kiosk.employee_id');
  const locale = useLocale();
  const [login, setLogin] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const resolve = useCallback(
    async (kind: 'badge' | 'login', raw: string) => {
      setErr(null);
      setBusy(true);
      try {
        const res = await unitsApi.resolveEmployeeIdp(unitId, { kind, raw });
        if (res.matchStatus === 'matched' && res.userId) {
          onIdentified(res.userId);
          return;
        }
        if (res.matchStatus === 'ambiguous') {
          setErr(t('ambiguous'));
          return;
        }
        setErr(t('no_user'));
      } catch (e) {
        setErr(e instanceof Error ? e.message : t('error'));
      } finally {
        setBusy(false);
      }
    },
    [onIdentified, t, unitId]
  );

  useKioskBarcodeWedge(mode === 'badge', (line) => {
    const s = line.trim();
    if (s) {
      void resolve('badge', s);
    }
  });

  if (mode === 'login') {
    return (
      <div className='flex min-h-[320px] w-full min-w-0 flex-col gap-4 overflow-x-hidden p-1 sm:p-2'>
        <p className='text-muted-foreground text-center text-sm sm:text-base'>
          {t('login_hint')}
        </p>
        <div className='border-foreground/20 min-h-16 w-full min-w-0 rounded border-2 p-3 text-2xl leading-snug break-words'>
          {login || '\u00a0'}
        </div>
        <KioskTouchKeyboard
          layoutToggle
          initialLayout={locale.toLowerCase().startsWith('ru') ? 'ru' : 'en'}
          onKey={(ch) => setLogin((x) => x + ch)}
          onBackspace={() => setLogin((x) => x.slice(0, -1))}
        />
        <div className='border-border/60 bg-muted/40 mt-auto w-full min-w-0 border-t pt-3 sm:pt-4'>
          <div className='flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:gap-3'>
            <Button
              type='button'
              variant='outline'
              className='kiosk-touch-min h-12 min-h-12 flex-1 text-base sm:h-14 sm:text-base'
              onClick={onBack}
              disabled={busy}
            >
              {t('back')}
            </Button>
            <Button
              type='button'
              className='kiosk-touch-min h-12 min-h-12 flex-1 text-base sm:h-14 sm:text-base'
              onClick={() => {
                if (!login.trim()) {
                  return;
                }
                void resolve('login', login.trim());
              }}
              disabled={busy || !login.trim()}
            >
              {t('continue')}
            </Button>
          </div>
        </div>
        {err ? (
          <p className='text-destructive text-center text-sm'>{err}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className='flex min-h-[200px] flex-col items-center gap-4 p-2'>
      <p className='text-muted-foreground text-center text-sm'>
        {t('badge_hint')}
      </p>
      {err ? <p className='text-destructive text-sm'>{err}</p> : null}
      {onUseKeyboard ? (
        <Button
          type='button'
          variant='link'
          onClick={onUseKeyboard}
          disabled={busy}
        >
          {t('use_login_instead')}
        </Button>
      ) : null}
      <Button type='button' variant='outline' onClick={onBack} disabled={busy}>
        {t('back')}
      </Button>
    </div>
  );
}
