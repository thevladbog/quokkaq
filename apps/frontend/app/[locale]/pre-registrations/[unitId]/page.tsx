'use client';

import { use, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { getGetUnitsIdQueryKey } from '@/lib/api/generated/units';
import { unitsApi, PreRegistration } from '@/lib/api';
import { PreRegistrationTable } from '@/components/pre-registration/PreRegistrationTable';
import { PreRegistrationForm } from '@/components/pre-registration/PreRegistrationForm';
import { useRouter } from '@/src/i18n/navigation';
import { useSyncActiveUnit } from '@/contexts/ActiveUnitContext';
import { getUnitDisplayName } from '@/lib/unit-display';

interface UnitPreRegistrationsPageProps {
  params: Promise<{
    unitId: string;
    locale: string;
  }>;
}

export default function UnitPreRegistrationsPage({
  params
}: UnitPreRegistrationsPageProps) {
  const { unitId } = use(params);
  const router = useRouter();
  const t = useTranslations('admin.pre_registrations');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  useSyncActiveUnit(unitId);

  const { data: unit } = useQuery({
    queryKey: getGetUnitsIdQueryKey(unitId),
    queryFn: () => unitsApi.getById(unitId)
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPreReg, setSelectedPreReg] = useState<PreRegistration | null>(
    null
  );

  const handleCreate = () => {
    setSelectedPreReg(null);
    setDialogOpen(true);
  };

  const handleEdit = (preReg: PreRegistration) => {
    setSelectedPreReg(preReg);
    setDialogOpen(true);
  };

  const handleSuccess = () => {
    setDialogOpen(false);
  };

  return (
    <div className='container mx-auto flex-1 p-4'>
      <div className='mb-6 flex items-center justify-between'>
        <div className='flex items-center gap-4'>
          <Button variant='ghost' size='icon' onClick={() => router.back()}>
            <ArrowLeft className='h-4 w-4' />
          </Button>
          <div>
            <h1 className='text-3xl font-bold'>{t('title')}</h1>
            {unit && (
              <p className='text-muted-foreground'>
                {getUnitDisplayName(unit, locale)}
              </p>
            )}
          </div>
        </div>
        <Button onClick={handleCreate}>
          <Plus className='mr-2 h-4 w-4' />
          {tCommon('create')}
        </Button>
      </div>

      <PreRegistrationTable unitId={unitId} onEdit={handleEdit} />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className='sm:max-w-[600px]'>
          <DialogHeader>
            <DialogTitle>
              {selectedPreReg ? t('edit_title') : t('create_title')}
            </DialogTitle>
            <DialogDescription>
              {selectedPreReg ? t('edit_desc') : t('create_desc')}
            </DialogDescription>
          </DialogHeader>
          <PreRegistrationForm
            unitId={unitId}
            initialData={selectedPreReg}
            onSuccess={handleSuccess}
            onCancel={() => setDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
