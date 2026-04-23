import { beforeEach, describe, expect, it } from 'vitest';
import { useScreenBuilderStore } from './stores/screen-builder-store';
import { signageZod } from './signage-zod';
import { SCREEN_TEMPLATE_PRESETS } from './screen-template-presets';

/**
 * “E2E-style” check: the same data path the UI uses to persist `unit.config.screenTemplate`
 * must pass `ScreenTemplateSchema` after typical edits (no real browser; keeps CI fast).
 */
describe('screen template builder → save contract', () => {
  beforeEach(() => {
    const p = SCREEN_TEMPLATE_PRESETS['info-heavy']!;
    useScreenBuilderStore.getState().initFrom(p, 'info-heavy');
  });

  it('validates after adding a widget and tweaking layout', () => {
    useScreenBuilderStore.getState().addWidget('rss-feed', 'main', 0);
    useScreenBuilderStore.getState().setTemplateId('custom-1');
    const tpl = useScreenBuilderStore.getState().template;
    const r = signageZod.screenTemplate.safeParse(tpl);
    expect(r.success).toBe(true);
  });
});
