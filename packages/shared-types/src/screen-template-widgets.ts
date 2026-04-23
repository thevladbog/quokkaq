import { z } from 'zod';

export const ScreenWidgetTypeSchema = z.enum([
  'called-tickets',
  'content-player',
  'queue-stats',
  'eta-display',
  'announcements',
  'rss-feed',
  'weather',
  'clock',
  'queue-ticker',
  'custom-html',
  /** Full-width header (logo, title, clock) inside cell grid */
  'screen-header',
  /** Footer strip with queue stats and virtual-queue QR */
  'screen-footer-qr',
  /** Standalone virtual-queue join QR (alignment in widget config). */
  'join-queue-qr'
]);

/** Styling for a layout region; avoids branching on template id in the screen renderer. */
export const ScreenLayoutPanelStyleSchema = z.enum([
  'default',
  'card',
  'scrollPadded',
  'splitSection'
]);

export const ScreenLayoutRegionSchema = z.object({
  id: z.string(),
  area: z.string(),
  size: z.string(),
  panelStyle: ScreenLayoutPanelStyleSchema.optional(),
  backgroundColor: z.string().optional()
});

export const ScreenLayoutSchema = z.object({
  type: z.enum(['split-h', 'split-v', 'grid', 'fullscreen']),
  regions: z.array(ScreenLayoutRegionSchema)
});

export const ScreenWidgetPositionSchema = z.object({
  x: z.number().optional(),
  y: z.number().optional()
});

export const ScreenWidgetSizeSchema = z.object({
  width: z.string().optional(),
  height: z.string().optional()
});

export const ScreenWidgetStyleSchema = z.object({
  backgroundColor: z.string().optional(),
  textColor: z.string().optional(),
  fontSize: z.string().optional(),
  padding: z.string().optional()
});

export const ScreenWidgetConfigSchema = z.object({
  id: z.string(),
  type: ScreenWidgetTypeSchema,
  regionId: z.string(),
  config: z.record(z.string(), z.any()).optional(),
  position: ScreenWidgetPositionSchema.optional(),
  size: ScreenWidgetSizeSchema.optional(),
  style: ScreenWidgetStyleSchema.optional()
});

export type ScreenWidgetType = z.infer<typeof ScreenWidgetTypeSchema>;
export type ScreenLayoutRegion = z.infer<typeof ScreenLayoutRegionSchema>;
export type ScreenLayout = z.infer<typeof ScreenLayoutSchema>;
export type ScreenWidgetConfig = z.infer<typeof ScreenWidgetConfigSchema>;
