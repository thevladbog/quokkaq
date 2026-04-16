'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertCircle,
  Building2,
  MapPin,
  CreditCard,
  Users,
  Settings,
  Shield
} from 'lucide-react';
import { Link, useRouter } from '@/src/i18n/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { companiesApiExt } from '@/lib/api';
import {
  CounterpartyForm,
  emptyCounterparty,
  parseCounterpartyFromApi
} from '@/components/organization/CounterpartyForm';
import {
  PaymentAccountsForm,
  parsePaymentAccountsFromApi
} from '@/components/organization/PaymentAccountsForm';
import {
  CounterpartySchema,
  PaymentAccountsSchema,
  type Counterparty,
  type PaymentAccount
} from '@quokkaq/shared-types';

export function OrganizationPageContent() {
  const router = useRouter();
  const t = useTranslations('organization');
  const qc = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState('');
  const [billingEmail, setBillingEmail] = useState('');
  const [billingAddressLine, setBillingAddressLine] = useState('');
  const [counterparty, setCounterparty] = useState<Counterparty>(() =>
    emptyCounterparty()
  );
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccount[]>([]);

  const {
    data: me,
    isLoading,
    isError,
    error,
    refetch
  } = useQuery({
    queryKey: ['company-me'],
    queryFn: () => companiesApiExt.getMe()
  });

  const company = !isError ? me?.company : undefined;
  const features = !isError
    ? (me?.features ?? {
        dadata: false,
        dadataCleaner: false
      })
    : { dadata: false, dadataCleaner: false };

  const showReadOnly = !isLoading && !isError && !isEditing;
  const showEditForm = !isLoading && !isError && isEditing;

  const updateCompanyMutation = useMutation({
    mutationFn: async () => {
      const cpParsed = CounterpartySchema.safeParse(counterparty);
      if (!cpParsed.success) {
        const msg = cpParsed.error.issues.map((i) => i.message).join('; ');
        throw new Error(msg);
      }
      const paParsed = PaymentAccountsSchema.safeParse(paymentAccounts);
      if (!paParsed.success) {
        const msg = paParsed.error.issues.map((i) => i.message).join('; ');
        throw new Error(msg);
      }
      return companiesApiExt.patchMe({
        name: name.trim(),
        billingEmail: billingEmail.trim(),
        ...(billingAddressLine.trim()
          ? { billingAddress: { address: billingAddressLine.trim() } }
          : { clearBillingAddress: true }),
        counterparty: cpParsed.data,
        paymentAccounts: paParsed.data
      });
    },
    onSuccess: () => {
      setIsEditing(false);
      void qc.invalidateQueries({ queryKey: ['company-me'] });
      toast.success(t('toastProfileSaved'));
    },
    onError: (err: Error) => {
      toast.error(t('toastProfileSaveError', { message: err.message }));
    }
  });

  const billingAddrDisplay = company?.billingAddress as
    | { address?: string }
    | undefined
    | null;

  const displayPaymentAccounts = useMemo(
    () => parsePaymentAccountsFromApi(company?.paymentAccounts),
    [company?.paymentAccounts]
  );

  return (
    <div className='space-y-6'>
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Building2 className='h-5 w-5' />
            {t('companyInfo')}
          </CardTitle>
          <CardDescription>{t('companyInfoDesc')}</CardDescription>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <p className='text-muted-foreground text-sm'>{t('loading')}</p>
          ) : isError ? (
            <Alert variant='destructive'>
              <AlertCircle />
              <AlertTitle>{t('loadErrorTitle')}</AlertTitle>
              <AlertDescription className='mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
                <span className='space-y-1'>
                  <span className='block'>{t('loadError')}</span>
                  {error instanceof Error && error.message ? (
                    <span className='text-destructive/80 block text-xs'>
                      {error.message}
                    </span>
                  ) : null}
                </span>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={() => void refetch()}
                >
                  {t('retry')}
                </Button>
              </AlertDescription>
            </Alert>
          ) : showReadOnly ? (
            <div className='space-y-4'>
              <div>
                <Label className='text-gray-500'>{t('companyName')}</Label>
                <p className='mt-1 font-medium'>{company?.name}</p>
              </div>

              <div>
                <Label className='text-gray-500'>{t('billingEmail')}</Label>
                <p className='mt-1 font-medium'>
                  {company?.billingEmail || t('notSet')}
                </p>
              </div>

              <div>
                <Label className='text-gray-500'>{t('address')}</Label>
                <p className='mt-1 font-medium'>
                  {billingAddrDisplay &&
                  typeof billingAddrDisplay.address === 'string'
                    ? billingAddrDisplay.address
                    : t('notSet')}
                </p>
              </div>

              <div className='border-t pt-4'>
                <h3 className='mb-3 text-lg font-medium'>
                  {t('paymentAccountsReadonlyTitle')}
                </h3>
                {displayPaymentAccounts.length === 0 ? (
                  <p className='text-muted-foreground text-sm'>
                    {t('paymentAccountsReadonlyEmpty')}
                  </p>
                ) : (
                  <ul className='space-y-3 text-sm'>
                    {displayPaymentAccounts.map((a) => (
                      <li key={a.id} className='rounded-md border p-3'>
                        <div className='flex flex-wrap items-center justify-between gap-2'>
                          <span className='font-medium'>
                            {a.bankName?.trim() || '—'}
                          </span>
                          {a.isDefault ? (
                            <span className='text-muted-foreground text-xs'>
                              {t('paymentAccountsReadonlyDefault')}
                            </span>
                          ) : null}
                        </div>
                        <dl className='text-muted-foreground mt-2 grid gap-1 sm:grid-cols-2'>
                          <div>
                            <dt className='inline'>
                              {t('paymentAccountsBic')}:{' '}
                            </dt>
                            <dd className='inline'>{a.bic?.trim() || '—'}</dd>
                          </div>
                          <div>
                            <dt className='inline'>
                              {t('paymentAccountsCorrespondent')}:{' '}
                            </dt>
                            <dd className='inline'>
                              {a.correspondentAccount?.trim() || '—'}
                            </dd>
                          </div>
                          <div className='sm:col-span-2'>
                            <dt className='inline'>
                              {t('paymentAccountsNumber')}:{' '}
                            </dt>
                            <dd className='inline'>
                              {a.accountNumber?.trim() || '—'}
                            </dd>
                          </div>
                        </dl>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : showEditForm ? (
            <form
              className='space-y-6'
              onSubmit={(e) => {
                e.preventDefault();
                updateCompanyMutation.mutate();
              }}
            >
              <div className='space-y-4'>
                <div>
                  <Label htmlFor='name'>{t('companyName')}</Label>
                  <Input
                    id='name'
                    name='name'
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor='billingEmail'>{t('billingEmail')}</Label>
                  <Input
                    id='billingEmail'
                    name='billingEmail'
                    type='email'
                    value={billingEmail}
                    onChange={(e) => setBillingEmail(e.target.value)}
                    placeholder='billing@example.com'
                  />
                </div>

                <div>
                  <Label htmlFor='address'>{t('address')}</Label>
                  <Input
                    id='address'
                    name='address'
                    value={billingAddressLine}
                    onChange={(e) => setBillingAddressLine(e.target.value)}
                    placeholder={t('addressPlaceholder')}
                  />
                </div>
              </div>

              <div className='border-t pt-4'>
                <h3 className='mb-3 text-lg font-medium'>
                  {t('counterpartySectionTitle')}
                </h3>
                <CounterpartyForm
                  value={counterparty}
                  onChange={setCounterparty}
                  canUseDadata={features.dadata}
                  canUseCleaner={features.dadataCleaner}
                  dadataScope='tenant'
                />
              </div>

              <div className='border-t pt-4'>
                <h3 className='mb-3 text-lg font-medium'>
                  {t('paymentAccountsSectionTitle')}
                </h3>
                <PaymentAccountsForm
                  value={paymentAccounts}
                  onChange={setPaymentAccounts}
                  disabled={updateCompanyMutation.isPending}
                  canUseDadata={features.dadata}
                  dadataScope='tenant'
                />
              </div>

              <div className='flex gap-2'>
                <Button
                  type='submit'
                  disabled={updateCompanyMutation.isPending}
                >
                  {t('save')}
                </Button>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => setIsEditing(false)}
                >
                  {t('cancel')}
                </Button>
              </div>
              {updateCompanyMutation.isError && (
                <p className='text-destructive text-sm'>
                  {(updateCompanyMutation.error as Error).message}
                </p>
              )}
            </form>
          ) : null}
        </CardContent>

        {showReadOnly && (
          <CardFooter>
            <Button
              onClick={() => {
                if (company) {
                  setName(company.name ?? '');
                  setBillingEmail(company.billingEmail ?? '');
                  const addr = company.billingAddress as
                    | { address?: string }
                    | undefined
                    | null;
                  setBillingAddressLine(
                    typeof addr?.address === 'string' ? addr.address : ''
                  );
                  setCounterparty(
                    parseCounterpartyFromApi(company.counterparty)
                  );
                  setPaymentAccounts(
                    parsePaymentAccountsFromApi(company.paymentAccounts)
                  );
                }
                setIsEditing(true);
              }}
            >
              <Settings className='mr-2 h-4 w-4' />
              {t('edit')}
            </Button>
          </CardFooter>
        )}
      </Card>

      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        <Card
          className='cursor-pointer transition-shadow hover:shadow-lg'
          onClick={() => router.push('/settings/organization/billing')}
        >
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-lg'>
              <CreditCard className='h-5 w-5' />
              {t('quickLinks.billing')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className='text-sm text-gray-600'>
              {t('quickLinks.billingDesc')}
            </p>
          </CardContent>
        </Card>

        <Card
          className='cursor-pointer transition-shadow hover:shadow-lg'
          onClick={() => router.push('/settings/users')}
        >
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-lg'>
              <Users className='h-5 w-5' />
              {t('quickLinks.team')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className='text-sm text-gray-600'>{t('quickLinks.teamDesc')}</p>
          </CardContent>
        </Card>

        <Card
          className='cursor-pointer transition-shadow hover:shadow-lg'
          onClick={() => router.push('/settings/units')}
        >
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-lg'>
              <MapPin className='h-5 w-5' />
              {t('quickLinks.units')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className='text-sm text-gray-600'>{t('quickLinks.unitsDesc')}</p>
          </CardContent>
        </Card>

        <Link
          href='/settings/organization/login'
          className='focus-visible:ring-ring block rounded-lg focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none'
          aria-label={t('quickLinks.login')}
        >
          <Card className='h-full cursor-pointer transition-shadow hover:shadow-lg'>
            <CardHeader>
              <CardTitle className='flex items-center gap-2 text-lg'>
                <Shield className='h-5 w-5' />
                {t('quickLinks.login')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className='text-sm text-gray-600'>
                {t('quickLinks.loginDesc')}
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
