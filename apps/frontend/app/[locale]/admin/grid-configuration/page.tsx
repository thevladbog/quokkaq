'use client';

import ServiceGridEditor from '@/components/ServiceGridEditor';
import { useTranslations } from 'next-intl';

export default function GridConfigurationPage() {
  const t = useTranslations('admin');

  return (
    <div className='space-y-6'>
      <div className='flex items-center justify-between'>
        <h1 className='text-3xl font-bold'>
          {t('grid_configuration.title', {
            defaultValue: 'Grid Configuration'
          })}
        </h1>
      </div>

      <ServiceGridEditor />
    </div>
  );
}
