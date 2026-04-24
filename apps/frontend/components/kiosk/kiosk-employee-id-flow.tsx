'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
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
        <div className='border-foreground/20 min-h-14 w-full min-w-0 rounded border-2 p-3 text-2xl break-words'>
          {login}
        </div>
        <KioskTouchKeyboard
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

function KioskTouchKeyboard({
  onKey,
  onBackspace
}: {
  onKey: (c: string) => void;
  onBackspace: () => void;
}) {
  /** Digits + common email / login symbols (@ . _ -) */
  const row1 = '1234567890@._-'.split('');
  const row2 = 'QWERTYUIOP'.split('');
  const row3 = 'ASDFGHJKL'.split('');
  const row4 = 'ZXCVBNM'.split('');
  const keyClass =
    'kiosk-touch-min h-14 min-w-11 shrink-0 px-0 text-lg font-semibold sm:min-w-12 sm:text-xl';
  const Key = (ch: string) => (
    <Button
      key={ch}
      type='button'
      className={keyClass}
      variant='outline'
      onClick={() => onKey(ch)}
    >
      {ch}
    </Button>
  );
  return (
    <div className='flex w-full max-w-full min-w-0 flex-col space-y-2 sm:space-y-2.5'>
      <div className='w-full overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
        <div className='mx-auto flex min-w-min flex-nowrap justify-center gap-1.5 sm:gap-2'>
          {row1.map((c) => Key(c))}
          <Button
            type='button'
            className='kiosk-touch-min h-14 min-w-[4.5rem] shrink-0 text-lg sm:min-w-20 sm:text-xl'
            variant='secondary'
            onClick={onBackspace}
          >
            ⌫
          </Button>
        </div>
      </div>
      <div className='w-full overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
        <div className='mx-auto flex min-w-min flex-nowrap justify-center gap-1.5 sm:gap-2'>
          {row2.map((c) => Key(c))}
        </div>
      </div>
      <div className='w-full overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
        <div className='mx-auto flex min-w-min flex-nowrap justify-center gap-1.5 pl-3 sm:gap-2 sm:pl-6 md:pl-10'>
          {row3.map((c) => Key(c))}
        </div>
      </div>
      <div className='w-full overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
        <div className='mx-auto flex min-w-min flex-nowrap justify-center gap-1.5 pl-6 sm:gap-2 sm:pl-12 md:pl-20'>
          {row4.map((c) => Key(c))}
          <Button
            type='button'
            className={keyClass}
            variant='outline'
            onClick={() => onKey(' ')}
          >
            __
          </Button>
        </div>
      </div>
    </div>
  );
}
