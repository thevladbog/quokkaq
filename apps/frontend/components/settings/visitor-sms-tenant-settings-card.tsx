'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { companiesApiExt } from '@/lib/api';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

const providerOptions = [
  { value: 'smsru', label: 'SMS.ru' },
  { value: 'smsc', label: 'SMSC' },
  { value: 'smsaero', label: 'SMSAero' },
  { value: 'twilio', label: 'Twilio' }
] as const;

export function VisitorSmsTenantSettingsCard() {
  const t = useTranslations('admin.integrations.visitor_sms');
  const qc = useQueryClient();
  const meQ = useQuery({
    queryKey: ['company-me'],
    queryFn: () => companiesApiExt.getMe()
  });
  const planAllowsVisitor =
    meQ.data?.planCapabilities?.visitorNotifications === true;
  const q = useQuery({
    queryKey: ['companies-me-visitor-sms'],
    queryFn: () => companiesApiExt.getVisitorSMS(),
    enabled: meQ.isSuccess && planAllowsVisitor
  });
  const statQ = useQuery({
    queryKey: ['companies-me-visitor-sms-stats'],
    queryFn: () => companiesApiExt.getVisitorNotificationStats(),
    enabled: meQ.isSuccess && planAllowsVisitor
  });
  const [saving, setSaving] = useState(false);
  const [testPhone, setTestPhone] = useState('');

  const d = q.data;
  const [form, setForm] = useState<{
    smsProvider: string;
    smsApiKey: string;
    smsApiSecret: string;
    smsFromName: string;
    smsEnabled: boolean;
  } | null>(null);

  const f = form ?? {
    smsProvider: d?.smsProvider ?? 'smsru',
    smsApiKey: '',
    smsApiSecret: '',
    smsFromName: d?.smsFromName ?? '',
    smsEnabled: d?.smsEnabled ?? false
  };

  if (meQ.isError) {
    return null;
  }
  if (q.isError) {
    return null;
  }
  if (meQ.isPending) {
    return (
      <Card>
        <CardContent className='pt-6'>
          <div className='text-muted-foreground flex items-center gap-2 text-sm'>
            <Loader2 className='h-4 w-4 animate-spin' />
            {t('loading')}
          </div>
        </CardContent>
      </Card>
    );
  }
  if (!planAllowsVisitor) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertDescription>{t('plan_required')}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
        {d?.resolvedSource ? (
          <p className='text-muted-foreground text-sm'>
            {t('resolved', { source: d.resolvedSource })}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className='space-y-4'>
        {q.isPending || !d ? (
          <div className='text-muted-foreground flex items-center gap-2 text-sm'>
            <Loader2 className='h-4 w-4 animate-spin' />
            {t('loading')}
          </div>
        ) : (
          <>
            {statQ.data && (
              <p className='text-muted-foreground text-sm'>
                {t('stats_7d', {
                  p: String(statQ.data.smsPending),
                  s: String(statQ.data.smsSent),
                  f: String(statQ.data.smsFailed)
                })}
              </p>
            )}
            <div className='space-y-2'>
              <Label htmlFor='vsms-prov'>{t('provider')}</Label>
              <Select
                value={f.smsProvider}
                onValueChange={(v) => setForm({ ...f, smsProvider: v })}
              >
                <SelectTrigger id='vsms-prov'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {providerOptions.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-2'>
              <Label htmlFor='vsms-key'>{t('api_key')}</Label>
              <p className='text-muted-foreground text-xs'>
                {d.smsApiKeyMasked}
              </p>
              <Input
                id='vsms-key'
                name='apiKey'
                type='password'
                autoComplete='off'
                placeholder={t('api_key_placeholder')}
                value={f.smsApiKey}
                onChange={(e) => setForm({ ...f, smsApiKey: e.target.value })}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='vsms-sec'>{t('api_secret')}</Label>
              <Input
                id='vsms-sec'
                name='apiSecret'
                type='password'
                autoComplete='off'
                value={f.smsApiSecret}
                onChange={(e) =>
                  setForm({ ...f, smsApiSecret: e.target.value })
                }
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='vsms-from'>{t('from_name')}</Label>
              <Input
                id='vsms-from'
                value={f.smsFromName}
                onChange={(e) => setForm({ ...f, smsFromName: e.target.value })}
              />
            </div>
            <div className='flex items-center justify-between gap-2'>
              <div>
                <Label htmlFor='vsms-on'>{t('enabled')}</Label>
                <p className='text-muted-foreground text-xs'>
                  {t('enabled_hint')}
                </p>
              </div>
              <Switch
                id='vsms-on'
                checked={f.smsEnabled}
                onCheckedChange={(c) => setForm({ ...f, smsEnabled: c })}
              />
            </div>
            <div className='flex flex-col gap-2 sm:flex-row'>
              <Button
                type='button'
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    const payload = {
                      smsProvider: f.smsProvider,
                      smsApiKey: f.smsApiKey,
                      smsApiSecret: f.smsApiSecret,
                      smsFromName: f.smsFromName,
                      smsEnabled: f.smsEnabled
                    };
                    await companiesApiExt.putVisitorSMS(payload);
                    setForm(null);
                    await qc.invalidateQueries({
                      queryKey: ['companies-me-visitor-sms']
                    });
                    toast.success(t('save_ok'));
                  } catch (e) {
                    toast.error(
                      e instanceof Error ? e.message : t('save_error')
                    );
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving ? t('saving') : t('save')}
              </Button>
            </div>
            <div className='space-y-2 border-t pt-3'>
              <Label htmlFor='vsms-test'>{t('test_phone')}</Label>
              <div className='flex max-w-md flex-col gap-2 sm:flex-row'>
                <Input
                  id='vsms-test'
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder='+79001234567'
                />
                <Button
                  type='button'
                  variant='secondary'
                  onClick={async () => {
                    try {
                      const r = await companiesApiExt.postVisitorSMSTest(
                        testPhone.trim()
                      );
                      toast.success(
                        t('test_ok', {
                          p: r.provider ?? '',
                          s: r.source ?? ''
                        })
                      );
                    } catch (e) {
                      toast.error(
                        e instanceof Error ? e.message : t('test_error')
                      );
                    }
                  }}
                >
                  {t('test_send')}
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
