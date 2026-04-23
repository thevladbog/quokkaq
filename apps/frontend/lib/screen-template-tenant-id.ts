import type { ScreenTemplate } from '@quokkaq/shared-types';
import { SCREEN_TEMPLATE_PRESET_KEYS } from '@/lib/screen-template-from-unit';

function newTenantTemplateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `t-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * If the template still uses a built-in preset id (e.g. `info-heavy`), assign a
 * fresh UUID so tenant library rows and unit copies do not collide with presets.
 */
export function ensureTenantScreenTemplateId<T extends ScreenTemplate>(
  template: T
): T {
  const next = JSON.parse(JSON.stringify(template)) as T;
  if ((SCREEN_TEMPLATE_PRESET_KEYS as readonly string[]).includes(next.id)) {
    next.id = newTenantTemplateId();
  }
  return next;
}
