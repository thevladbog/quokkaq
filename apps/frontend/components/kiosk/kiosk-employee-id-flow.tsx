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
      <div className='flex min-h-[320px] flex-col gap-4 p-2'>
        <p className='text-muted-foreground text-center text-sm'>
          {t('login_hint')}
        </p>
        <div className='border-foreground/20 min-h-14 w-full max-w-2xl rounded border-2 p-3 text-2xl'>
          {login}
        </div>
        <KioskTouchKeyboard
          onKey={(ch) => setLogin((x) => x + ch)}
          onBackspace={() => setLogin((x) => x.slice(0, -1))}
        />
        <div className='mt-auto flex flex-wrap justify-center gap-2'>
          <Button
            type='button'
            variant='outline'
            onClick={onBack}
            disabled={busy}
          >
            {t('back')}
          </Button>
          <Button
            type='button'
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
  const row1 = '1234567890-'.split('');
  const row2 = 'QWERTYUIOP'.split('');
  const row3 = 'ASDFGHJKL'.split('');
  const row4 = 'ZXCVBNM'.split('');
  const Key = (ch: string) => (
    <Button
      key={ch}
      type='button'
      className='min-h-14 min-w-12 text-xl'
      variant='outline'
      onClick={() => onKey(ch)}
    >
      {ch}
    </Button>
  );
  return (
    <div className='mx-auto flex max-w-3xl flex-col gap-2 p-1'>
      <div className='flex flex-wrap justify-center gap-1.5'>
        {row1.map((c) => Key(c))}
        <Button
          type='button'
          className='min-h-14 min-w-20'
          variant='secondary'
          onClick={onBackspace}
        >
          ⌫
        </Button>
      </div>
      <div className='flex flex-wrap justify-center gap-1.5'>
        {row2.map((c) => Key(c))}
      </div>
      <div className='flex flex-wrap justify-center gap-1.5 pl-4'>
        {row3.map((c) => Key(c))}
      </div>
      <div className='flex flex-wrap justify-center gap-1.5 pl-8'>
        {row4.map((c) => Key(c))}
        <Button
          type='button'
          className='min-h-14 min-w-12 text-xl'
          variant='outline'
          onClick={() => onKey(' ')}
        >
          __
        </Button>
      </div>
    </div>
  );
}
