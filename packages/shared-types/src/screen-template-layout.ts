import { z } from 'zod';
import {
  ScreenLayoutSchema,
  ScreenWidgetConfigSchema,
  ScreenWidgetStyleSchema,
  ScreenWidgetTypeSchema
} from './screen-template-widgets';

export const ScreenCellGridPlacementSchema = z.object({
  col: z.number().int().min(1),
  row: z.number().int().min(1),
  colSpan: z.number().int().min(1),
  rowSpan: z.number().int().min(1)
});

export type ScreenCellGridPlacement = z.infer<
  typeof ScreenCellGridPlacementSchema
>;

export const ScreenCellGridWidgetSchema = z.object({
  id: z.string().min(1),
  type: ScreenWidgetTypeSchema,
  placement: ScreenCellGridPlacementSchema,
  config: z.record(z.string(), z.any()).optional(),
  style: ScreenWidgetStyleSchema.optional()
});

export type ScreenCellGridWidget = z.infer<typeof ScreenCellGridWidgetSchema>;

function refineCellGridFace(
  face: {
    columns: number;
    rows: number;
    widgets: Array<{ id: string; placement: ScreenCellGridPlacement }>;
  },
  ctx: z.RefinementCtx,
  pathRoot: 'portrait' | 'landscape'
) {
  const { columns, rows, widgets } = face;
  const ids = new Set<string>();
  const occupied = new Map<string, number>();

  for (let i = 0; i < widgets.length; i++) {
    const w = widgets[i]!;
    if (ids.has(w.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Duplicate widget id',
        path: [pathRoot, 'widgets', i, 'id']
      });
    }
    ids.add(w.id);

    const { col, row, colSpan, rowSpan } = w.placement;
    if (col < 1 || row < 1) continue;
    if (col + colSpan - 1 > columns || row + rowSpan - 1 > rows) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Widget placement exceeds grid',
        path: [pathRoot, 'widgets', i, 'placement']
      });
      continue;
    }
    for (let c = col; c < col + colSpan; c++) {
      for (let r = row; r < row + rowSpan; r++) {
        const key = `${c}:${r}`;
        if (occupied.has(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Overlapping widgets in grid',
            path: [pathRoot, 'widgets']
          });
          return;
        }
        occupied.set(key, i);
      }
    }
  }
}

const ScreenCellGridFaceBaseSchema = z.object({
  columns: z.number().int().min(1).max(48),
  rows: z.number().int().min(1).max(48),
  widgets: z.array(ScreenCellGridWidgetSchema)
});

export type ScreenCellGridFace = z.infer<typeof ScreenCellGridFaceBaseSchema>;

export const ScreenTemplateRegionsSchema = z.object({
  layoutKind: z.literal('regions'),
  id: z.string(),
  layout: ScreenLayoutSchema,
  widgets: z.array(ScreenWidgetConfigSchema)
});

export const ScreenTemplateCellGridSchema = z
  .object({
    layoutKind: z.literal('cellGrid'),
    id: z.string(),
    portrait: ScreenCellGridFaceBaseSchema,
    landscape: ScreenCellGridFaceBaseSchema
  })
  .superRefine((t, ctx) => {
    refineCellGridFace(t.portrait, ctx, 'portrait');
    refineCellGridFace(t.landscape, ctx, 'landscape');
    const pa = new Set(t.portrait.widgets.map((w) => w.id));
    const la = new Set(t.landscape.widgets.map((w) => w.id));
    if (pa.size !== la.size || ![...pa].every((id) => la.has(id))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Portrait and landscape must include the same widgets (same ids)',
        path: ['portrait']
      });
    }
  });

export type ScreenTemplateRegions = z.infer<typeof ScreenTemplateRegionsSchema>;
export type ScreenTemplateCellGrid = z.infer<
  typeof ScreenTemplateCellGridSchema
>;

/** Normalize legacy JSON (no layoutKind) for discriminated union. */
export function normalizeScreenTemplateInput(input: unknown): unknown {
  if (input == null || typeof input !== 'object') {
    return input;
  }
  const o = input as Record<string, unknown>;
  if (o.layoutKind === 'cellGrid' || o.layoutKind === 'regions') {
    return input;
  }
  const portrait = o.portrait;
  const landscape = o.landscape;
  if (
    portrait &&
    typeof portrait === 'object' &&
    landscape &&
    typeof landscape === 'object' &&
    'columns' in (portrait as object) &&
    'rows' in (portrait as object) &&
    'widgets' in (portrait as object) &&
    'columns' in (landscape as object) &&
    'rows' in (landscape as object) &&
    'widgets' in (landscape as object)
  ) {
    return { ...o, layoutKind: 'cellGrid' };
  }
  if ('layout' in o && o.layout && typeof o.layout === 'object') {
    return { ...o, layoutKind: 'regions' };
  }
  return input;
}

export function isScreenTemplateCellGrid(
  t: ScreenTemplateUnion
): t is ScreenTemplateCellGrid {
  return t.layoutKind === 'cellGrid';
}

export function isScreenTemplateRegions(
  t: ScreenTemplateUnion
): t is ScreenTemplateRegions {
  return t.layoutKind === 'regions';
}

export type ScreenTemplateUnion =
  | ScreenTemplateRegions
  | ScreenTemplateCellGrid;
