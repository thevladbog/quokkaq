import { z } from 'zod';
import { ScreenWidgetTypeSchema } from './screen-template-widgets';

export const ExperienceSurfaceSchema = z.enum([
  'ticket-station',
  'queue-display',
  'counter-display',
  'visitor-mobile'
]);

export const InteractionModeSchema = z.enum(['touch', 'non-touch']);
export const ViewingDistanceSchema = z.enum(['near', 'standing', 'far']);

export const DeviceProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  width: z.number().int().min(320).max(7680),
  height: z.number().int().min(320).max(7680),
  interactionMode: InteractionModeSchema,
  viewingDistance: ViewingDistanceSchema,
  safeArea: z.object({
    top: z.number().int().min(0),
    right: z.number().int().min(0),
    bottom: z.number().int().min(0),
    left: z.number().int().min(0)
  })
});

export const ExperienceGridSchema = z.object({
  columns: z.number().int().min(1).max(48),
  rows: z.number().int().min(1).max(48)
});

export const ExperienceLayoutVariantSchema = z.object({
  id: z.string().min(1),
  profile: DeviceProfileSchema,
  grid: ExperienceGridSchema
});

export const WidgetActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('set-session'),
    key: z.enum(['selectedServiceId', 'selectedCategoryId', 'activeLocale']),
    value: z.discriminatedUnion('source', [
      z.object({ source: z.literal('literal'), value: z.string() }),
      z.object({
        source: z.literal('event'),
        field: z.enum(['serviceId', 'categoryId', 'locale'])
      })
    ])
  }),
  z.object({ type: z.literal('navigate'), toPageId: z.string().min(1) }),
  z.object({ type: z.literal('submit-ticket') }),
  z.object({ type: z.literal('print-ticket') }),
  z.object({ type: z.literal('reset-session') })
]);

export const ExperienceWidgetToneSchema = z.enum([
  'default',
  'emphasized',
  'restricted',
  'destructive'
]);

export const ExperienceWidgetSchema = z.object({
  id: z.string().min(1),
  type: ScreenWidgetTypeSchema,
  config: z.record(z.string(), z.unknown()),
  tone: ExperienceWidgetToneSchema.optional(),
  actions: z.array(WidgetActionSchema).default([])
});

export const ExperiencePlacementSchema = z.object({
  col: z.number().int().min(1),
  row: z.number().int().min(1),
  colSpan: z.number().int().min(1),
  rowSpan: z.number().int().min(1)
});

export const ExperiencePageLayoutSchema = z.object({
  placements: z.record(z.string().min(1), ExperiencePlacementSchema),
  typographyScale: z.number().min(0.75).max(2).optional()
});

export const ExperiencePageSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  widgets: z.array(ExperienceWidgetSchema),
  layouts: z.record(z.string().min(1), ExperiencePageLayoutSchema)
});

export const ExperienceFlowPagesSchema = z
  .object({
    serviceCatalogPageId: z.string().min(1).optional(),
    serviceInfoPageId: z.string().min(1).optional(),
    serviceFormPageId: z.string().min(1).optional(),
    identityPageId: z.string().min(1).optional(),
    appointmentPageId: z.string().min(1).optional(),
    confirmationPageId: z.string().min(1).optional(),
    successPageId: z.string().min(1).optional()
  })
  .strict();

const ExperienceTemplateBaseSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  surface: ExperienceSurfaceSchema,
  startPageId: z.string().min(1),
  variants: z.array(ExperienceLayoutVariantSchema).min(1).max(2),
  pages: z.array(ExperiencePageSchema).min(1),
  flowPages: ExperienceFlowPagesSchema.optional()
});

export const ExperienceTemplateSchema =
  ExperienceTemplateBaseSchema.superRefine((template, ctx) => {
    const variantIds = new Set<string>();
    for (
      let variantIndex = 0;
      variantIndex < template.variants.length;
      variantIndex++
    ) {
      const variant = template.variants[variantIndex]!;
      if (variantIds.has(variant.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Duplicate variant id',
          path: ['variants', variantIndex, 'id']
        });
      }
      variantIds.add(variant.id);
    }

    const pageIds = new Set<string>();
    for (let pageIndex = 0; pageIndex < template.pages.length; pageIndex++) {
      const page = template.pages[pageIndex]!;
      if (pageIds.has(page.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Duplicate page id',
          path: ['pages', pageIndex, 'id']
        });
      }
      pageIds.add(page.id);
    }

    if (!pageIds.has(template.startPageId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Start page must exist',
        path: ['startPageId']
      });
    }

    for (const [flowPageRole, pageId] of Object.entries(
      template.flowPages ?? {}
    )) {
      if (pageId && !pageIds.has(pageId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Flow page must exist',
          path: ['flowPages', flowPageRole]
        });
      }
    }

    for (let pageIndex = 0; pageIndex < template.pages.length; pageIndex++) {
      const page = template.pages[pageIndex]!;
      const widgetIds = new Set<string>();

      for (
        let widgetIndex = 0;
        widgetIndex < page.widgets.length;
        widgetIndex++
      ) {
        const widget = page.widgets[widgetIndex]!;
        if (widgetIds.has(widget.id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Duplicate widget id',
            path: ['pages', pageIndex, 'widgets', widgetIndex, 'id']
          });
        }
        widgetIds.add(widget.id);

        for (
          let actionIndex = 0;
          actionIndex < widget.actions.length;
          actionIndex++
        ) {
          const action = widget.actions[actionIndex]!;
          if (action.type === 'navigate' && !pageIds.has(action.toPageId)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'Navigation target page must exist',
              path: [
                'pages',
                pageIndex,
                'widgets',
                widgetIndex,
                'actions',
                actionIndex,
                'toPageId'
              ]
            });
          }
        }
      }

      for (const [variantId, layout] of Object.entries(page.layouts)) {
        const variant = template.variants.find(
          (candidate) => candidate.id === variantId
        );
        const layoutPath = ['pages', pageIndex, 'layouts', variantId];

        if (!variant) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Layout variant must exist',
            path: layoutPath
          });
          continue;
        }

        const occupiedCells = new Set<string>();
        for (const [widgetId, placement] of Object.entries(layout.placements)) {
          const placementPath = [...layoutPath, 'placements', widgetId];
          if (!widgetIds.has(widgetId)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'Placement widget must exist on the page',
              path: placementPath
            });
          }

          if (
            placement.col + placement.colSpan - 1 > variant.grid.columns ||
            placement.row + placement.rowSpan - 1 > variant.grid.rows
          ) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'Placement exceeds variant grid',
              path: placementPath
            });
            continue;
          }

          let overlaps = false;
          for (
            let col = placement.col;
            col < placement.col + placement.colSpan;
            col++
          ) {
            for (
              let row = placement.row;
              row < placement.row + placement.rowSpan;
              row++
            ) {
              const cell = `${col}:${row}`;
              if (occupiedCells.has(cell)) {
                overlaps = true;
              }
              occupiedCells.add(cell);
            }
          }
          if (overlaps) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'Placements overlap in variant grid',
              path: placementPath
            });
          }
        }
      }
    }
  });

export type ExperienceSurface = z.infer<typeof ExperienceSurfaceSchema>;
export type DeviceProfile = z.infer<typeof DeviceProfileSchema>;
export type ExperienceLayoutVariant = z.infer<
  typeof ExperienceLayoutVariantSchema
>;
export type WidgetAction = z.infer<typeof WidgetActionSchema>;
export type ExperienceWidget = z.infer<typeof ExperienceWidgetSchema>;
export type ExperiencePage = z.infer<typeof ExperiencePageSchema>;
export type ExperienceFlowPages = z.infer<typeof ExperienceFlowPagesSchema>;
export type ExperienceTemplate = z.infer<typeof ExperienceTemplateSchema>;
