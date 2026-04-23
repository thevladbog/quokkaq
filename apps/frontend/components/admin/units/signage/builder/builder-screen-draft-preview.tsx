'use client';

import { useTranslations } from 'next-intl';
import { isScreenTemplateCellGrid } from '@quokkaq/shared-types';
import { getGetUnitsUnitIdTicketsQueryKey } from '@/lib/api/generated/tickets-counters';
import { UnitConfig } from '@/lib/api';
import { useScreenRendererLiveData } from '@/components/screen/use-screen-renderer-live-data';
import { ScreenRenderer } from '@/components/screen/screen-renderer';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { useScreenBuilderStore } from '@/lib/stores/screen-builder-store';

type Props = {
  unitId: string;
};

/**
 * Live queue/signage data with the **draft** template from the builder store (no apply/save).
 */
export function BuilderScreenDraftPreview({ unitId }: Props) {
  const st = useTranslations('admin.screenBuilder');
  const live = useScreenRendererLiveData(unitId);
  const template = useScreenBuilderStore((s) => s.template);
  const editOrientation = useScreenBuilderStore((s) => s.editOrientation);

  const {
    locale,
    queryClient,
    unit,
    isUnitLoading,
    ticketsLoading,
    ticketsPending,
    ticketsError,
    currentTime,
    contentSlides,
    queueStatus,
    calledTickets,
    waitingTicketsForScreen,
    annForRenderer,
    virtualQueueEnabled,
    queueUrl,
    adConfig
  } = live;

  const config = unit?.config as UnitConfig | undefined;
  const ad = config?.adScreen;
  const isCustomColorsEnabled = ad?.isCustomColorsEnabled || false;
  const bodyColor = isCustomColorsEnabled ? ad?.bodyColor || '' : '';

  if (isUnitLoading || ticketsLoading || ticketsPending) {
    return (
      <div className='border-border bg-muted/10 flex min-h-[200px] items-center justify-center rounded-lg border'>
        <Spinner className='h-8 w-8' />
      </div>
    );
  }

  if (!unit) {
    return (
      <p className='text-muted-foreground border-border rounded-lg border px-3 py-6 text-center text-xs'>
        {st('draftPreviewUnitMissing', {
          default: 'Unit could not be loaded for preview.'
        })}
      </p>
    );
  }

  if (ticketsError) {
    return (
      <div className='border-border flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-lg border px-3 py-4 text-center'>
        <p className='text-muted-foreground text-xs'>
          {st('draftPreviewTicketsError', {
            default: 'Could not load tickets for preview.'
          })}
        </p>
        <Button
          type='button'
          size='sm'
          variant='outline'
          className='text-xs'
          onClick={() =>
            void queryClient.invalidateQueries({
              queryKey: getGetUnitsUnitIdTicketsQueryKey(unitId)
            })
          }
        >
          {st('draftPreviewRetry', { default: 'Retry' })}
        </Button>
      </div>
    );
  }

  if (!isScreenTemplateCellGrid(template)) {
    return (
      <p className='text-muted-foreground border-border rounded-lg border px-3 py-4 text-center text-xs'>
        {st('draftPreviewCellGridOnly', {
          default: 'Preview is only available for cell-grid layouts.'
        })}
      </p>
    );
  }

  return (
    <div className='border-border/80 min-w-0 space-y-2 rounded-lg border bg-black/5 p-2 dark:bg-white/5'>
      <div className='flex items-center justify-between gap-2 px-0.5'>
        <span className='text-muted-foreground text-xs font-medium'>
          {st('draftLivePreviewTitle', {
            default: 'Live preview (draft layout, real data)'
          })}
        </span>
      </div>
      <div
        className='bg-background relative w-full overflow-auto rounded-md border shadow-inner'
        style={{
          height: 'min(420px, 52vh)',
          maxHeight: 'min(520px, 60vh)',
          backgroundColor: bodyColor || undefined
        }}
      >
        <div className='flex h-full min-h-[260px] w-full min-w-0 flex-col overflow-hidden'>
          <ScreenRenderer
            unitId={unitId}
            locale={locale}
            template={template}
            unit={unit}
            calledTickets={calledTickets}
            waitingTickets={waitingTicketsForScreen}
            queueStatus={queueStatus}
            contentSlides={contentSlides}
            defaultImageSeconds={adConfig?.duration || 5}
            announcements={annForRenderer}
            adBodyColor={bodyColor}
            historyLimit={adConfig?.recentCallsHistoryLimit ?? 0}
            currentTime={currentTime}
            virtualQueueEnabled={virtualQueueEnabled}
            queueUrl={queueUrl}
            forcedLayoutFace={editOrientation}
          />
        </div>
      </div>
    </div>
  );
}
