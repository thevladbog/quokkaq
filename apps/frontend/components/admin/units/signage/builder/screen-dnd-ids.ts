import type { ScreenWidgetType } from '@quokkaq/shared-types';

export const REGION_PREFIX = 'screen-region' as const;
export const LIBRARY_PREFIX = 'screen-palette' as const;

export function regionDropId(rid: string) {
  return `${REGION_PREFIX}:${rid}`;
}
export function parseRegionDropId(
  str: string | null | number | undefined
): string | null {
  if (str == null) return null;
  const s = String(str);
  if (s.startsWith(`${REGION_PREFIX}:`)) {
    return s.slice(REGION_PREFIX.length + 1);
  }
  return null;
}
export function libraryId(type: ScreenWidgetType) {
  return `${LIBRARY_PREFIX}:${type}`;
}
export function parseLibraryId(s: string | null | number | undefined): {
  from: 'library';
  type: ScreenWidgetType;
} | null {
  if (s == null) return null;
  const t = String(s);
  if (!t.startsWith(`${LIBRARY_PREFIX}:`)) return null;
  return {
    from: 'library',
    type: t.slice(LIBRARY_PREFIX.length + 1) as ScreenWidgetType
  };
}
