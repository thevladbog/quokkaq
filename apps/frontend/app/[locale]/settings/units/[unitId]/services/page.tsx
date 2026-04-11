'use client';

import { useEffect } from 'react';
import { useRouter } from '@/src/i18n/navigation';
import { use } from 'react';

interface UnitServicesPageProps {
  params: Promise<{
    unitId: string;
    locale: string;
  }>;
}

export default function UnitServicesPage({ params }: UnitServicesPageProps) {
  const { unitId } = use(params);
  const router = useRouter();

  useEffect(() => {
    router.replace(`/settings/units/${unitId}`);
  }, [unitId, router]);

  return null;
}
