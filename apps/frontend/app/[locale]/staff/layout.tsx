import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { Spinner } from '@/components/ui/spinner';

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pageTitles' });

  return {
    title: t('staff.selection')
  };
}

function StaffSuspenseFallback() {
  return (
    <div className='flex min-h-[50vh] items-center justify-center'>
      <Spinner className='text-primary h-10 w-10' />
    </div>
  );
}

export default function StaffLayout({ children }: Props) {
  return <Suspense fallback={<StaffSuspenseFallback />}>{children}</Suspense>;
}
