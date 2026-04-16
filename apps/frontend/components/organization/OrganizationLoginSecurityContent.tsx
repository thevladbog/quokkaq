'use client';

import { useQuery } from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Link } from '@/src/i18n/navigation';
import { useTranslations } from 'next-intl';
import { AlertCircle } from 'lucide-react';
import { companiesApiExt } from '@/lib/api';
import { OrganizationOpaqueLoginLinkCard } from '@/components/organization/organization-opaque-login-link-card';

export function OrganizationLoginSecurityContent() {
  const t = useTranslations('organization.loginSecurity');

  const companyMe = useQuery({
    queryKey: ['company-me'],
    queryFn: () => companiesApiExt.getMe()
  });

  if (companyMe.isLoading) {
    return <p className='text-muted-foreground text-sm'>{t('loading')}</p>;
  }

  if (companyMe.isError || !companyMe.data?.company) {
    return (
      <Alert variant='destructive'>
        <AlertCircle />
        <AlertTitle>{t('loadErrorTitle')}</AlertTitle>
        <AlertDescription>{t('loadError')}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className='space-y-6'>
      <div className='text-muted-foreground text-sm'>
        <Link
          href='/settings/organization'
          className='text-primary hover:underline'
        >
          ← {t('backToOrganization')}
        </Link>
      </div>

      <Alert>
        <AlertTitle>{t('authMovedTitle')}</AlertTitle>
        <AlertDescription className='space-y-2'>
          <p>{t('authMovedDescription')}</p>
          <p>
            <Link
              href='/settings/integrations?tab=auth'
              className='text-primary font-medium underline'
            >
              {t('authMovedLink')}
            </Link>
          </p>
        </AlertDescription>
      </Alert>

      <OrganizationOpaqueLoginLinkCard
        publicAppUrl={companyMe.data.publicAppUrl}
      />
    </div>
  );
}
