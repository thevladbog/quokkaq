import type { Unit, ScreenTemplate } from '@quokkaq/shared-types';
import { ScreenTemplateSchema } from '@quokkaq/shared-types';
import { SCREEN_TEMPLATE_PRESETS } from '@/lib/screen-template-presets';

export const SCREEN_TEMPLATE_PRESET_KEYS = Object.keys(
  SCREEN_TEMPLATE_PRESETS
) as (keyof typeof SCREEN_TEMPLATE_PRESETS)[];

export function normalizeBuilderPresetId(
  preset: string | null | undefined
): (typeof SCREEN_TEMPLATE_PRESET_KEYS)[number] | null {
  if (preset && (SCREEN_TEMPLATE_PRESET_KEYS as string[]).includes(preset)) {
    return preset as (typeof SCREEN_TEMPLATE_PRESET_KEYS)[number];
  }
  return null;
}

/**
 * Draft template + preset hint from persisted unit config (or built-in default).
 * Call `useScreenBuilderStore.getState().initFrom(template, normalizeBuilderPresetId(sourcePresetId))`.
 */
export function getInitialScreenTemplateFromUnit(unit: Unit): {
  template: ScreenTemplate;
  sourcePresetId: string | null;
} {
  const raw = (unit.config as { screenTemplate?: unknown } | null)
    ?.screenTemplate;
  const p = raw ? ScreenTemplateSchema.safeParse(raw) : null;
  if (p?.success) {
    const template = p.data;
    const matched = (SCREEN_TEMPLATE_PRESET_KEYS as string[]).find(
      (k) => k === template.id
    ) as (typeof SCREEN_TEMPLATE_PRESET_KEYS)[number] | undefined;
    return {
      template,
      sourcePresetId: matched ?? template.id
    };
  }
  return {
    template: SCREEN_TEMPLATE_PRESETS['info-heavy']!,
    sourcePresetId: 'info-heavy'
  };
}

/** Preset key for tab UI: known preset id or closest match; default info-heavy for custom ids. */
export function getTabPresetKeyFromUnit(
  unit: Unit
): (typeof SCREEN_TEMPLATE_PRESET_KEYS)[number] {
  const { template, sourcePresetId } = getInitialScreenTemplateFromUnit(unit);
  const n = normalizeBuilderPresetId(sourcePresetId);
  if (n) {
    return n;
  }
  if ((SCREEN_TEMPLATE_PRESET_KEYS as string[]).includes(template.id)) {
    return template.id as (typeof SCREEN_TEMPLATE_PRESET_KEYS)[number];
  }
  return 'info-heavy';
}
