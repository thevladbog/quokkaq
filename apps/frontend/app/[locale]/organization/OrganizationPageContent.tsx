'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2, MapPin, CreditCard, Users, Settings } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

export function OrganizationPageContent() {
  const router = useRouter();
  const t = useTranslations('organization');
  const [isEditing, setIsEditing] = useState(false);

  // TODO: Replace with actual API calls
  const { data: company } = useQuery({
    queryKey: ['company'],
    queryFn: async () => {
      // const response = await getCompany(companyId);
      // return response;
      return {
        id: '1',
        name: 'ООО Пример',
        billingEmail: 'billing@example.com',
        ownerUserId: 'user-1',
        settings: {}
      };
    }
  });

  const updateCompanyMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      // await updateCompany(company.id, data);
      console.log('Update company:', data);
    },
    onSuccess: () => {
      setIsEditing(false);
    }
  });

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name'),
      billingEmail: formData.get('billingEmail'),
      billingAddress: {
        address: formData.get('address')
      }
    };
    updateCompanyMutation.mutate(data);
  };

  return (
    <div className='space-y-6'>
      {/* Company Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Building2 className='h-5 w-5' />
            {t('companyInfo')}
          </CardTitle>
          <CardDescription>{t('companyInfoDesc')}</CardDescription>
        </CardHeader>

        <CardContent>
          {!isEditing ? (
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
            </div>
          ) : (
            <form onSubmit={handleSave} className='space-y-4'>
              <div>
                <Label htmlFor='name'>{t('companyName')}</Label>
                <Input
                  id='name'
                  name='name'
                  defaultValue={company?.name}
                  required
                />
              </div>

              <div>
                <Label htmlFor='billingEmail'>{t('billingEmail')}</Label>
                <Input
                  id='billingEmail'
                  name='billingEmail'
                  type='email'
                  defaultValue={company?.billingEmail}
                  placeholder='billing@example.com'
                />
              </div>

              <div>
                <Label htmlFor='address'>{t('address')}</Label>
                <Input
                  id='address'
                  name='address'
                  placeholder='г. Москва, ул. Примерная, д. 1'
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
            </form>
          )}
        </CardContent>

        {!isEditing && (
          <CardFooter>
            <Button onClick={() => setIsEditing(true)}>
              <Settings className='mr-2 h-4 w-4' />
              {t('edit')}
            </Button>
          </CardFooter>
        )}
      </Card>

      {/* Quick Links */}
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
