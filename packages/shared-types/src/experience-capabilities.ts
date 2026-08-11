import type { ExperienceSurface } from './experience-template';
import {
  ScreenWidgetTypeSchema,
  type ScreenWidgetType
} from './screen-template-widgets';

const DISPLAY_BLOCKED_WIDGET_TYPES = new Set<ScreenWidgetType>([
  'service-picker',
  'ticket-form',
  'identify',
  'ticket-success'
]);

const VISITOR_MOBILE_WIDGET_TYPES = new Set<ScreenWidgetType>([
  'service-picker',
  'rich-info',
  'ticket-form',
  'language-switch',
  'ticket-success',
  'media',
  'eta-display',
  'clock',
  'join-queue-qr'
]);

const DISPLAY_FORBIDDEN_ACTIONS = new Set([
  'submit-ticket',
  'print-ticket',
  'set-session',
  'reset-session'
]);
const VISITOR_MOBILE_FORBIDDEN_ACTIONS = new Set(['print-ticket']);

function hasForbiddenAction(
  actions: unknown,
  forbidden: ReadonlySet<string>
): boolean {
  return (
    Array.isArray(actions) &&
    actions.some(
      (action) =>
        action !== null &&
        typeof action === 'object' &&
        typeof (action as { type?: unknown }).type === 'string' &&
        forbidden.has((action as { type: string }).type)
    )
  );
}

/** Canonical widget-and-action capability contract for publish and runtime. */
export function experienceWidgetSupportsSurface(
  surface: ExperienceSurface,
  type: unknown,
  actions: unknown
): type is ScreenWidgetType {
  const parsedType = ScreenWidgetTypeSchema.safeParse(type);
  if (!parsedType.success) return false;
  const widgetType = parsedType.data;

  if (
    widgetType === 'custom-html' &&
    surface !== 'queue-display' &&
    surface !== 'counter-display'
  ) {
    return false;
  }

  if (surface === 'queue-display' || surface === 'counter-display') {
    return (
      !DISPLAY_BLOCKED_WIDGET_TYPES.has(widgetType) &&
      !hasForbiddenAction(actions, DISPLAY_FORBIDDEN_ACTIONS)
    );
  }

  if (surface === 'visitor-mobile') {
    return (
      VISITOR_MOBILE_WIDGET_TYPES.has(widgetType) &&
      !hasForbiddenAction(actions, VISITOR_MOBILE_FORBIDDEN_ACTIONS)
    );
  }

  return surface === 'ticket-station' && widgetType !== 'custom-html';
}
