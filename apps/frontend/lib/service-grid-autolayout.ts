import type { Service } from '@quokkaq/shared-types';

/** Total services on one tree level at or below this; pagination kicks in after 12. */
export const KIOSK_AUTOLAYOUT_PAGE_THRESHOLD = 12;
/** Services per page when total exceeds {@link KIOSK_AUTOLAYOUT_PAGE_THRESHOLD} (3×3). */
export const KIOSK_AUTOLAYOUT_PAGINATED_PER_PAGE = 9;

type GridDims = { rows: number; cols: number };

/**
 * Kiosk `serviceGridLayout: 'auto'` (explicit or absent treated as manual elsewhere).
 */
export function isKioskServiceGridAuto(
  kiosk: { serviceGridLayout?: 'manual' | 'auto' } | null | undefined
): boolean {
  return kiosk?.serviceGridLayout === 'auto';
}

type SortableService = Service & { sortOrder?: number };

/**
 * Stable sort: sortOrder asc (missing = 0), then name, then id.
 */
export function sortServicesForKioskAutolayout<T extends Service>(
  items: T[]
): T[] {
  return [...items].sort((a, b) => {
    const A = a as SortableService;
    const B = b as SortableService;
    const oa = A.sortOrder ?? 0;
    const ob = B.sortOrder ?? 0;
    if (oa !== ob) {
      return oa - ob;
    }
    const nameCmp = a.name.localeCompare(b.name, undefined, {
      sensitivity: 'base'
    });
    if (nameCmp !== 0) {
      return nameCmp;
    }
    return a.id.localeCompare(b.id);
  });
}

/**
 * How many "pages" of the auto layout are needed for `total` services (after filters).
 * - 0 services → 0 pages (no tiles).
 * - 1–12 → 1 page (variable grid).
 * - 13+ → `ceil(n / 9)` pages of 3×3.
 */
export function getAutolayoutPageCount(total: number): number {
  if (total <= 0) {
    return 0;
  }
  if (total <= KIOSK_AUTOLAYOUT_PAGE_THRESHOLD) {
    return 1;
  }
  return Math.ceil(total / KIOSK_AUTOLAYOUT_PAGINATED_PER_PAGE);
}

/**
 * 0-based page index clamped to the last valid page.
 */
export function clampAutolayoutPageIndex(
  pageIndex: number,
  total: number
): number {
  const pages = getAutolayoutPageCount(total);
  if (pages <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(pages - 1, Math.floor(pageIndex)));
}

/**
 * Returns services visible on a given 0-based page, already sorted.
 */
export function getAutolayoutPageSlice(
  allSorted: Service[],
  pageIndex: number
): Service[] {
  const total = allSorted.length;
  if (total <= 0) {
    return [];
  }
  if (total <= KIOSK_AUTOLAYOUT_PAGE_THRESHOLD) {
    return allSorted;
  }
  const pages = getAutolayoutPageCount(total);
  const p = Math.max(0, Math.min(pages - 1, pageIndex));
  const start = p * KIOSK_AUTOLAYOUT_PAGINATED_PER_PAGE;
  return allSorted.slice(start, start + KIOSK_AUTOLAYOUT_PAGINATED_PER_PAGE);
}

/**
 * Inner grid dimensions for one page.
 * - When the whole level has ≤12 services: follow the design table (one viewport).
 * - When 13+ services total: each page uses 3×3, up to 9 per page.
 */
export function getAutolayoutGridDimensions(
  countOnThisPage: number,
  totalAtLevel: number
): GridDims {
  if (countOnThisPage <= 0) {
    return { rows: 0, cols: 0 };
  }
  if (totalAtLevel > KIOSK_AUTOLAYOUT_PAGE_THRESHOLD) {
    return { rows: 3, cols: 3 };
  }
  const n = countOnThisPage;
  if (n === 1) {
    return { rows: 1, cols: 1 };
  }
  if (n === 2) {
    return { rows: 1, cols: 2 };
  }
  if (n === 3 || n === 4) {
    return { rows: 2, cols: 2 };
  }
  if (n === 5 || n === 6) {
    return { rows: 2, cols: 3 };
  }
  if (n >= 7 && n <= 9) {
    return { rows: 3, cols: 3 };
  }
  // 10–12: 3 columns × 4 rows
  return { rows: 4, cols: 3 };
}

export type AutolayoutGridSlot<T extends Service = Service> =
  | { type: 'service'; service: T; row: number; col: number }
  | { type: 'empty'; row: number; col: number };

/**
 * Fills a row-major `rows`×`cols` grid: services first, then empty placeholders.
 * Cell indices (row, col) are 0-based; for CSS in the inner grid use `row+1` / `col+1` (1-based line numbers).
 */
export function buildAutolayoutPageSlots<T extends Service>(
  servicesThisPage: T[],
  totalAtLevel: number
): AutolayoutGridSlot<T>[] {
  const { rows, cols } = getAutolayoutGridDimensions(
    servicesThisPage.length,
    totalAtLevel
  );
  if (rows === 0 || cols === 0) {
    return [];
  }
  const cap = rows * cols;
  const out: AutolayoutGridSlot<T>[] = [];
  for (let i = 0; i < cap; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    if (i < servicesThisPage.length) {
      out.push({
        type: 'service',
        service: servicesThisPage[i],
        row: r,
        col: c
      });
    } else {
      out.push({ type: 'empty', row: r, col: c });
    }
  }
  return out;
}
