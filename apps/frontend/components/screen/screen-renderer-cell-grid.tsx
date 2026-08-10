'use client';

import type { ScreenTemplateCellGrid } from '@quokkaq/shared-types';
import { useEffect, useState } from 'react';

import {
  ScreenGridRuntime,
  type ScreenGridRuntimeProps
} from '@/components/screen/screen-grid-runtime';

export type ScreenRendererCellGridProps = Omit<
  ScreenGridRuntimeProps,
  'face'
> & {
  template: ScreenTemplateCellGrid;
  /** When set (e.g. admin builder), ignore viewport orientation and use this face. */
  forcedLayoutFace?: 'portrait' | 'landscape';
};

function useLandscapeOrientation(): boolean {
  const [landscape, setLandscape] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(orientation: landscape)');
    const update = () => setLandscape(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return landscape;
}

/** Legacy compatibility wrapper. Orientation selection intentionally stays here. */
export function ScreenRendererCellGrid({
  template,
  forcedLayoutFace,
  ...runtimeProps
}: ScreenRendererCellGridProps) {
  const detectedLandscape = useLandscapeOrientation();
  const faceName =
    forcedLayoutFace ?? (detectedLandscape ? 'landscape' : 'portrait');
  return <ScreenGridRuntime {...runtimeProps} face={template[faceName]} />;
}
