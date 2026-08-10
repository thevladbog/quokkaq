import type {
  ExperienceLayoutVariant,
  ExperiencePage,
  ExperienceWidget
} from '@quokkaq/shared-types';

import {
  canPlacePlacement,
  type GridItem,
  type GridPlacement
} from '@/lib/screen-grid-editor';

export type ExperienceLayoutItem =
  | {
      widget: ExperienceWidget;
      status: 'valid';
      placement: GridPlacement;
    }
  | {
      widget: ExperienceWidget;
      status: 'unplaced' | 'overflowing';
    };

export function isValidExperienceLayoutItem(
  item: ExperienceLayoutItem
): item is Extract<ExperienceLayoutItem, { status: 'valid' }> {
  return item.status === 'valid';
}

/**
 * Classifies each widget in canonical page.widgets order. Editor-only metadata
 * (layer order, lock, hide) is deliberately not considered: a hidden widget
 * still occupies its authored placement when deciding collisions and overflow.
 */
export function classifyExperienceLayout(
  page: ExperiencePage,
  variant: ExperienceLayoutVariant
): ExperienceLayoutItem[] {
  const layout = page.layouts[variant.id];
  const placed: GridItem[] = [];

  return page.widgets.map((widget) => {
    const placement = layout?.placements[widget.id];
    if (!placement) return { widget, status: 'unplaced' };
    if (
      !canPlacePlacement(
        variant.grid.columns,
        variant.grid.rows,
        placed,
        placement
      )
    ) {
      return { widget, status: 'overflowing' };
    }
    placed.push({ id: widget.id, placement });
    return { widget, status: 'valid', placement };
  });
}
