'use client';

import { MonitorSmartphone } from 'lucide-react';
import { useTranslations } from 'next-intl';

export type ExperienceDeviceStatus = {
  id: string;
  name: string;
  variantName: string | null;
  lastSeenAt: string | null;
  appliedVersion: number | null;
};

function formatLastSeen(value: string | null): string {
  if (value === null) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

export function DeviceAssignmentTable({
  devices
}: {
  devices: readonly ExperienceDeviceStatus[];
}) {
  const t = useTranslations('experience.builder.task11');
  const label = t('publish.devices', { default: 'Compatible devices' });

  return (
    <section className='space-y-3' aria-label={label}>
      <div>
        <h3 className='text-sm font-semibold'>{label}</h3>
        <p className='text-muted-foreground mt-1 text-xs'>
          {t('publish.assignmentNotice', {
            default:
              'Assignment becomes available after runtime validation in the next rollout. Device rows are read-only here.'
          })}
        </p>
      </div>
      <div className='overflow-x-auto rounded-md border'>
        <table className='min-w-full text-left text-xs'>
          <caption className='sr-only'>{label}</caption>
          <thead className='bg-muted/50 text-muted-foreground'>
            <tr>
              <th scope='col' className='px-3 py-2 font-medium'>
                {t('publish.device', { default: 'Device' })}
              </th>
              <th scope='col' className='px-3 py-2 font-medium'>
                {t('publish.variant', { default: 'Variant' })}
              </th>
              <th scope='col' className='px-3 py-2 font-medium'>
                {t('publish.lastSeen', { default: 'Last seen' })}
              </th>
              <th scope='col' className='px-3 py-2 font-medium'>
                {t('publish.appliedVersion', { default: 'Applied' })}
              </th>
            </tr>
          </thead>
          <tbody>
            {devices.length === 0 ? (
              <tr>
                <td className='text-muted-foreground px-3 py-3' colSpan={4}>
                  {t('publish.noDevices', {
                    default: 'No compatible devices have been paired.'
                  })}
                </td>
              </tr>
            ) : (
              devices.map((device) => (
                <tr key={device.id} className='border-t'>
                  <th scope='row' className='px-3 py-3 font-medium'>
                    <MonitorSmartphone
                      className='mr-1 inline size-3.5'
                      aria-hidden
                    />
                    {device.name}
                  </th>
                  <td className='px-3 py-3'>{device.variantName ?? '—'}</td>
                  <td className='px-3 py-3'>
                    {device.lastSeenAt === null ? (
                      '—'
                    ) : (
                      <time dateTime={device.lastSeenAt}>
                        {formatLastSeen(device.lastSeenAt)}
                      </time>
                    )}
                  </td>
                  <td className='px-3 py-3'>
                    {device.appliedVersion === null
                      ? '—'
                      : `v${device.appliedVersion}`}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
