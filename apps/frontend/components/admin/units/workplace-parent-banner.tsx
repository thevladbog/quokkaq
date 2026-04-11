'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from '@/src/i18n/navigation';
import { useTranslations } from 'next-intl';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { unitsApi } from '@/lib/api';

export function WorkplaceParentBanner({ parentId }: { parentId: string }) {
  const t = useTranslations('admin.units');
  const router = useRouter();
  const { data: parent } = useQuery({
    queryKey: ['unit', parentId],
    queryFn: () => unitsApi.getById(parentId),
    enabled: Boolean(parentId)
  });

  const parentKind = parent?.kind;
  const parentName = parent?.name ?? '…';

  const bannerText =
    parentKind === 'subdivision'
      ? t('unit_parent_subdivision_banner', { name: parentName })
      : parentKind === 'service_zone'
        ? t('unit_parent_zone_banner', { zone: parentName })
        : t('unit_parent_generic_banner', { name: parentName });

  const openLabel =
    parentKind === 'subdivision'
      ? t('open_parent_subdivision')
      : parentKind === 'service_zone'
        ? t('open_parent_zone')
        : t('open_parent_unit');

  return (
    <Alert className='mb-4'>
      <AlertDescription className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <span>{bannerText}</span>
        <Button
          variant='outline'
          size='sm'
          className='w-fit shrink-0'
          onClick={() => router.push(`/settings/units/${parentId}`)}
        >
          {openLabel}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
