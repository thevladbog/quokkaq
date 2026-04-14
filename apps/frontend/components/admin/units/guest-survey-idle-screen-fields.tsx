'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GuestSurveyCompletionEditor } from '@/components/admin/units/guest-survey-completion-editor';
import {
  deleteUnitsUnitIdGuestSurveyIdleMediaFileName,
  postUnitsUnitIdGuestSurveyIdleMedia
} from '@/lib/api/generated/surveys';
import { authenticatedApiFetch } from '@/lib/authenticated-api-fetch';
import type {
  IdleScreenDraft,
  IdleSlideDraft
} from '@/lib/guest-survey-idle-draft';
import {
  idleMediaFileNameFromApiUrl,
  idleMediaPathForAuthenticatedFetch,
  newIdleSlideKey
} from '@/lib/guest-survey-idle-draft';

function IdleSlideMediaPreview({ apiUrl }: { apiUrl: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isVideo, setIsVideo] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- admin preview: fetch blob with staff JWT */
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    const path = idleMediaPathForAuthenticatedFetch(apiUrl);
    if (!path) {
      setBlobUrl(null);
      return () => {};
    }
    (async () => {
      try {
        const res = await authenticatedApiFetch(path);
        if (!res.ok || cancelled) return;
        const ct = res.headers.get('content-type') ?? '';
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setIsVideo(ct.startsWith('video/'));
        setBlobUrl(objectUrl);
      } catch {
        if (!cancelled) setBlobUrl(null);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [apiUrl]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!apiUrl.trim()) {
    return <p className='text-muted-foreground text-xs'>—</p>;
  }
  if (!blobUrl) {
    return (
      <div className='bg-muted h-32 max-w-full animate-pulse rounded-md border' />
    );
  }
  if (isVideo) {
    return (
      <video
        src={blobUrl}
        controls
        muted
        playsInline
        className='max-h-48 max-w-full rounded-md border object-contain'
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- private blob URL from API
    <img
      src={blobUrl}
      alt=''
      className='max-h-48 max-w-full rounded-md border object-contain'
    />
  );
}

type TIdle = (key: string) => string;

async function deleteIdleMediaIfPresent(unitId: string, apiUrl: string) {
  const fn = idleMediaFileNameFromApiUrl(apiUrl);
  if (!fn) return;
  await deleteUnitsUnitIdGuestSurveyIdleMediaFileName(unitId, fn);
}

export function GuestSurveyIdleScreenFields({
  unitId,
  draft,
  onChange,
  idPrefix,
  t,
  onUploadError
}: {
  unitId: string;
  draft: IdleScreenDraft;
  onChange: (d: IdleScreenDraft) => void;
  idPrefix: string;
  t: TIdle;
  onUploadError: (messageKey: string) => void;
}) {
  const setSlides = (slides: IdleSlideDraft[]) =>
    onChange({ ...draft, slides });

  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= draft.slides.length) return;
    const next = [...draft.slides];
    const tmp = next[index]!;
    next[index] = next[j]!;
    next[j] = tmp;
    setSlides(next);
  };

  const removeAt = async (index: number) => {
    const s = draft.slides[index];
    if (!s) return;
    if (s.type === 'image' || s.type === 'video') {
      if (s.url.trim()) {
        try {
          await deleteIdleMediaIfPresent(unitId, s.url);
        } catch {
          /* best-effort */
        }
      }
    }
    setSlides(draft.slides.filter((_, i) => i !== index));
  };

  const addText = () =>
    setSlides([
      ...draft.slides,
      {
        key: newIdleSlideKey(),
        type: 'text',
        markdownEn: '',
        markdownRu: ''
      }
    ]);

  const addImage = () =>
    setSlides([
      ...draft.slides,
      { key: newIdleSlideKey(), type: 'image', url: '' }
    ]);

  const addVideo = () =>
    setSlides([
      ...draft.slides,
      { key: newIdleSlideKey(), type: 'video', url: '' }
    ]);

  const patchSlide = (index: number, patch: Partial<IdleSlideDraft>) => {
    const next = [...draft.slides];
    const cur = next[index];
    if (!cur) return;
    next[index] = { ...cur, ...patch } as IdleSlideDraft;
    setSlides(next);
  };

  const patchSlideByKey = (
    slideKey: string,
    patch: Partial<IdleSlideDraft>
  ) => {
    setSlides(
      draft.slides.map((s) =>
        s.key === slideKey ? ({ ...s, ...patch } as IdleSlideDraft) : s
      )
    );
  };

  const clearMediaAt = async (index: number) => {
    const s = draft.slides[index];
    if (!s || (s.type !== 'image' && s.type !== 'video')) return;
    if (s.url.trim()) {
      try {
        await deleteIdleMediaIfPresent(unitId, s.url);
      } catch {
        /* best-effort */
      }
    }
    const next = [...draft.slides];
    const cur = next[index];
    if (cur?.type === 'image' || cur?.type === 'video') {
      next[index] = { ...cur, url: '' };
      setSlides(next);
    }
  };

  const uploadMedia = async (
    slideKey: string,
    file: File,
    kind: 'image' | 'video'
  ) => {
    const slide = draft.slides.find((s) => s.key === slideKey);
    if (!slide || (slide.type !== 'image' && slide.type !== 'video')) return;

    const allowedImage = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/svg+xml'
    ];
    const allowedVideo = ['video/mp4', 'video/webm', 'video/quicktime'];
    const ok =
      kind === 'image'
        ? allowedImage.includes(file.type) ||
          /\.(jpe?g|png|webp|svg)$/i.test(file.name)
        : allowedVideo.includes(file.type) ||
          /\.(mp4|webm|mov|m4v)$/i.test(file.name);
    if (!ok) {
      onUploadError(
        kind === 'image' ? 'idle_upload_type_image' : 'idle_upload_type_video'
      );
      return;
    }

    const prevUrl = slide.url.trim();
    const res = await postUnitsUnitIdGuestSurveyIdleMedia(unitId, { file });
    if (res.status !== 200 || !res.data?.url) {
      onUploadError('idle_upload_error');
      return;
    }
    patchSlideByKey(slideKey, { url: res.data.url });
    if (prevUrl) {
      try {
        await deleteIdleMediaIfPresent(unitId, prevUrl);
      } catch {
        /* best-effort */
      }
    }
  };

  return (
    <div className='space-y-4 rounded-lg border p-4'>
      <div>
        <Label className='text-base font-medium'>
          {t('idle_section_title')}
        </Label>
        <p className='text-muted-foreground mt-1 text-xs'>
          {t('idle_section_hint')}
        </p>
      </div>

      <div className='grid max-w-xs gap-2'>
        <Label htmlFor={`${idPrefix}-idle-interval`}>
          {t('idle_interval_label')}
        </Label>
        <Input
          id={`${idPrefix}-idle-interval`}
          type='number'
          min={1}
          max={300}
          value={draft.slideIntervalSec || ''}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            onChange({
              ...draft,
              slideIntervalSec: Number.isFinite(v) ? v : draft.slideIntervalSec
            });
          }}
          disabled={draft.slides.length === 0}
        />
        <p className='text-muted-foreground text-xs'>
          {t('idle_interval_hint')}
        </p>
      </div>

      <div className='flex flex-wrap gap-2'>
        <Button type='button' variant='outline' size='sm' onClick={addText}>
          {t('idle_add_text')}
        </Button>
        <Button type='button' variant='outline' size='sm' onClick={addImage}>
          {t('idle_add_image')}
        </Button>
        <Button type='button' variant='outline' size='sm' onClick={addVideo}>
          {t('idle_add_video')}
        </Button>
      </div>

      {draft.slides.length === 0 ? (
        <p className='text-muted-foreground text-sm'>
          {t('idle_empty_slides')}
        </p>
      ) : (
        <ul className='space-y-4'>
          {draft.slides.map((slide, index) => (
            <li
              key={slide.key}
              className='bg-card space-y-3 rounded-lg border p-3 shadow-sm'
            >
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <span className='text-sm font-medium'>
                  {slide.type === 'text' && t('idle_type_text')}
                  {slide.type === 'image' && t('idle_type_image')}
                  {slide.type === 'video' && t('idle_type_video')}
                </span>
                <div className='flex flex-wrap gap-1'>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon'
                    className='h-8 w-8'
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    aria-label={t('move_up')}
                  >
                    <ChevronUp className='h-4 w-4' />
                  </Button>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon'
                    className='h-8 w-8'
                    disabled={index === draft.slides.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label={t('move_down')}
                  >
                    <ChevronDown className='h-4 w-4' />
                  </Button>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon'
                    className='text-destructive h-8 w-8'
                    onClick={() => void removeAt(index)}
                    aria-label={t('idle_remove_slide')}
                  >
                    <Trash2 className='h-4 w-4' />
                  </Button>
                </div>
              </div>

              {slide.type === 'text' && (
                <Tabs defaultValue='en' className='w-full'>
                  <TabsList>
                    <TabsTrigger value='en'>
                      {t('completion_tab_en')}
                    </TabsTrigger>
                    <TabsTrigger value='ru'>
                      {t('completion_tab_ru')}
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value='en' className='mt-3'>
                    <GuestSurveyCompletionEditor
                      unitId={unitId}
                      markdown={slide.markdownEn}
                      onChange={(md) => patchSlide(index, { markdownEn: md })}
                      placeholder={t('idle_text_placeholder')}
                    />
                  </TabsContent>
                  <TabsContent value='ru' className='mt-3'>
                    <GuestSurveyCompletionEditor
                      unitId={unitId}
                      markdown={slide.markdownRu}
                      onChange={(md) => patchSlide(index, { markdownRu: md })}
                      placeholder={t('idle_text_placeholder')}
                    />
                  </TabsContent>
                </Tabs>
              )}

              {slide.type === 'image' && (
                <div className='space-y-2'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <Input
                      type='file'
                      accept='image/jpeg,image/png,image/webp,image/svg+xml,.jpg,.jpeg,.png,.webp,.svg'
                      className='max-w-sm'
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        if (!f) return;
                        void uploadMedia(slide.key, f, 'image');
                      }}
                    />
                    {slide.url ? (
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        onClick={() => void clearMediaAt(index)}
                      >
                        {t('idle_remove_file')}
                      </Button>
                    ) : null}
                  </div>
                  <IdleSlideMediaPreview apiUrl={slide.url} />
                </div>
              )}

              {slide.type === 'video' && (
                <div className='space-y-2'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <Input
                      type='file'
                      accept='video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v'
                      className='max-w-sm'
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        if (!f) return;
                        void uploadMedia(slide.key, f, 'video');
                      }}
                    />
                    {slide.url ? (
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        onClick={() => void clearMediaAt(index)}
                      >
                        {t('idle_remove_file')}
                      </Button>
                    ) : null}
                  </div>
                  <IdleSlideMediaPreview apiUrl={slide.url} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
