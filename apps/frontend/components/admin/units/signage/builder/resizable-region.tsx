'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useScreenBuilderStore } from '@/lib/stores/screen-builder-store';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

function parseSideWidthPx(size: string | undefined): number {
  if (!size) {
    return 320;
  }
  const px = size.match(/(\d+(?:\.\d+)?)px/);
  if (px) {
    return Math.round(Number(px[1]));
  }
  if (size.includes('min(') || size.includes('fr') || size.includes('%')) {
    return 320;
  }
  const n = parseFloat(size);
  return Number.isFinite(n) ? n : 320;
}

type Props = {
  sideRegionId: string;
  sideSize: string;
  main: React.ReactNode;
  side: React.ReactNode;
};

const MIN = 160;
const MAX = 800;

/**
 * Main + side columns with a draggable split (no react-rnd — Rnd’s absolute
 * positioning breaks flex + dnd-kit inside the scaled canvas).
 */
export function ResizableBuilderSplit({
  sideRegionId,
  sideSize,
  main,
  side
}: Props) {
  const t = useTranslations('admin.screenBuilder');
  const baseW = parseSideWidthPx(sideSize);
  const drag = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);
  const lastW = useRef(baseW);
  const [dragW, setDragW] = useState<number | null>(null);
  const w = dragW ?? baseW;

  useLayoutEffect(() => {
    const next = parseSideWidthPx(sideSize);
    if (!drag.current) {
      lastW.current = next;
    }
  }, [sideSize]);

  useEffect(() => {
    const up = () => {
      if (!drag.current) {
        return;
      }
      drag.current = false;
      const clamped = Math.min(MAX, Math.max(MIN, Math.round(lastW.current)));
      lastW.current = clamped;
      setDragW(null);
      useScreenBuilderStore
        .getState()
        .setRegionSize(sideRegionId, `${clamped}px`);
    };
    const move = (e: PointerEvent) => {
      if (!drag.current) {
        return;
      }
      const d = e.clientX - startX.current;
      // Separator sits left of the side column: moving the pointer right narrows the side.
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
  }, [sideRegionId]);

  return (
    <div
      className={cn(
        'bg-muted/10 flex h-full min-h-0 w-full min-w-0 flex-1 flex-row',
        'overflow-hidden rounded-md border'
      )}
    >
      <div className='flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'>
        {main}
      </div>
      <div
        className='bg-border hover:bg-primary/50 focus-visible:ring-primary w-1.5 shrink-0 cursor-col-resize self-stretch focus-visible:ring-2 focus-visible:outline-none'
        role='slider'
        tabIndex={0}
        aria-orientation='vertical'
        aria-label={t('canvas.resizeSide', { default: 'Resize side column' })}
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
        className='flex h-full min-h-0 shrink-0 flex-col overflow-hidden'
        style={{ width: w, minWidth: MIN, maxWidth: MAX }}
      >
        {side}
      </div>
    </div>
  );
}
