'use client';

import { useRef, useEffect, useState, useLayoutEffect } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

const MIN = 280;
const MAX = 640;

type Props = {
  showPreview: boolean;
  previewWidth: number;
  onPreviewWidth: (w: number) => void;
  canvas: React.ReactNode;
  belowCanvas: React.ReactNode;
  preview: React.ReactNode;
};

/**
 * On `xl+` (Tailwind `xl:`), shows preview to the right of the canvas with a
 * vertical resize handle; below `xl`, layout stays a single column.
 */
export function BuilderCanvasPreviewSplit({
  showPreview,
  previewWidth,
  onPreviewWidth,
  canvas,
  belowCanvas,
  preview
}: Props) {
  const t = useTranslations('admin.screenBuilder');
  const drag = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);
  const lastW = useRef(previewWidth);
  /** Local width only while dragging; avoids syncing props via effects (eslint react-hooks/set-state-in-effect). */
  const [dragW, setDragW] = useState<number | null>(null);
  const w = dragW ?? previewWidth;

  useLayoutEffect(() => {
    if (!drag.current) {
      lastW.current = previewWidth;
    }
  }, [previewWidth]);

  useEffect(() => {
    const up = () => {
      if (!drag.current) {
        return;
      }
      drag.current = false;
      onPreviewWidth(lastW.current);
      setDragW(null);
    };
    const move = (e: PointerEvent) => {
      if (!drag.current) {
        return;
      }
      const d = e.clientX - startX.current;
      const n = Math.min(MAX, Math.max(MIN, startW.current - d));
      lastW.current = n;
      setDragW(n);
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointermove', move);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointermove', move);
    };
  }, [onPreviewWidth]);

  const [isXl, setIsXl] = useState(false);
  useLayoutEffect(() => {
    const mq = window.matchMedia('(min-width: 1280px)');
    const u = () => {
      setIsXl(mq.matches);
    };
    u();
    mq.addEventListener('change', u);
    return () => {
      mq.removeEventListener('change', u);
    };
  }, []);

  if (!showPreview) {
    return (
      <div className='min-w-0 space-y-0'>
        <div className='min-w-0'>{canvas}</div>
        {belowCanvas}
      </div>
    );
  }

  return (
    <div className='min-w-0 space-y-0'>
      <div className='flex min-w-0 flex-col gap-2 xl:flex-row xl:items-stretch'>
        <div className='flex min-h-0 min-w-0 flex-1 flex-col gap-0'>
          {canvas}
          {belowCanvas}
        </div>
        <div
          className='bg-border hover:bg-primary/50 focus-visible:ring-primary hidden w-1.5 shrink-0 cursor-col-resize self-stretch focus-visible:ring-2 xl:block'
          role='slider'
          tabIndex={0}
          aria-orientation='vertical'
          aria-label={t('canvas.resizePreview', {
            default: 'Resize canvas vs preview split'
          })}
          aria-valuemin={MIN}
          aria-valuemax={MAX}
          aria-valuenow={Math.round(w)}
          onPointerDown={(e) => {
            e.preventDefault();
            drag.current = true;
            startX.current = e.clientX;
            startW.current = w;
            lastW.current = w;
          }}
        />
        <div
          className={cn(
            'min-h-0 w-full min-w-0',
            'xl:max-w-[50vw] xl:shrink-0'
          )}
          style={
            isXl
              ? { width: w, maxWidth: 'min(50vw, 640px)', flex: '0 0 auto' }
              : { width: '100%' }
          }
        >
          {preview}
        </div>
      </div>
    </div>
  );
}
