'use client';

import { useState } from 'react';
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
  Settings
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { companiesApiExt } from '@/lib/api';
import {
  CounterpartyForm,
  emptyCounterparty,
  parseCounterpartyFromApi
} from '@/components/organization/CounterpartyForm';
import { CounterpartySchema, type Counterparty } from '@quokkaq/shared-types';

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
      return companiesApiExt.patchMe({
        name: name.trim(),
        billingEmail: billingEmail.trim(),
        ...(billingAddressLine.trim()
          ? { billingAddress: { address: billingAddressLine.trim() } }
          : { clearBillingAddress: true }),
        counterparty: cpParsed.data
      });
    },
    onSuccess: () => {
      setIsEditing(false);
      void qc.invalidateQueries({ queryKey: ['company-me'] });
    }
  });

  const billingAddrDisplay = company?.billingAddress as
    | { address?: string }
    | undefined
    | null;

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

      <div className='grid gap-4 md:grid-cols-3'>
        <Card
          className='cursor-pointer transition-shadow hover:shadow-lg'
          onClick={() => router.push('/organization/billing')}
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
          onClick={() => router.push('/admin/users')}
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
          onClick={() => router.push('/admin/units')}
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
      </div>
    </div>
  );
}
