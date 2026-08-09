import { z } from 'zod';
import {
  KioskConfigSchema,
  ServiceModelSchema,
  type KioskConfig,
  type ServiceModel
} from './index';
import {
  ExperienceTemplateSchema,
  type ExperiencePage,
  type ExperienceTemplate,
  type ExperienceWidget
} from './experience-template';
import {
  ScreenTemplateCellGridSchema,
  ScreenTemplateRegionsSchema,
  type ScreenCellGridFace,
  type ScreenTemplateCellGrid,
  type ScreenTemplateRegions
} from './screen-template-layout';
import {
  KioskIdentificationModeSchema,
  getKioskServiceIdentificationMode,
  type KioskIdentificationMode
} from './kiosk-service-identification';
import { LegacyAttractCompatibilitySchema } from './experience-runtime';

const KIOSK_VARIANT_ID = 'kiosk-1080x1920';
const SIGNAGE_PORTRAIT_VARIANT_ID = 'signage-portrait';
const SIGNAGE_LANDSCAPE_VARIANT_ID = 'signage-landscape';
const AUTO_PAGE_THRESHOLD = 12;
const PAGINATED_PAGE_SIZE = 9;
const MANUAL_GRID_ROWS = 8;
const MANUAL_GRID_COLUMNS = 8;
const SIGNAGE_COLUMNS = 12;
const SIGNAGE_ROWS = 24;

const KIOSK_PROFILE = {
  id: KIOSK_VARIANT_ID,
  name: 'Kiosk 1080×1920',
  width: 1080,
  height: 1920,
  interactionMode: 'touch' as const,
  viewingDistance: 'standing' as const,
  safeArea: { top: 0, right: 0, bottom: 0, left: 0 }
};

const SIGNAGE_PORTRAIT_PROFILE = {
  id: 'signage-1080x1920',
  name: 'Signage 1080×1920',
  width: 1080,
  height: 1920,
  interactionMode: 'non-touch' as const,
  viewingDistance: 'far' as const,
  safeArea: { top: 0, right: 0, bottom: 0, left: 0 }
};

const SIGNAGE_LANDSCAPE_PROFILE = {
  id: 'signage-1920x1080',
  name: 'Signage 1920×1080',
  width: 1920,
  height: 1080,
  interactionMode: 'non-touch' as const,
  viewingDistance: 'far' as const,
  safeArea: { top: 0, right: 0, bottom: 0, left: 0 }
};

const KIOSK_THEME_SURFACES = {
  'warm-light': {
    header: '#fff9f4',
    surface: '#fef8f3',
    serviceGrid: '#f2ebe6'
  },
  'cool-light': {
    header: '#f8faff',
    surface: '#f0f4ff',
    serviceGrid: '#e8eef6'
  },
  dark: {
    header: '#0f0f0f',
    surface: '#1a1a1a',
    serviceGrid: '#141414'
  },
  'high-contrast-preset': {
    header: '#000000',
    surface: '#111111',
    serviceGrid: '#0a0a0a'
  }
} as const;

const DEFAULT_KIOSK_THEME = KIOSK_THEME_SURFACES['warm-light'];

const NormalizationErrorCodeSchema = z.enum([
  'unsupported-schema-version',
  'ambiguous-legacy-input',
  'invalid-versioned-experience',
  'invalid-screen-template',
  'incompatible-orientation-content',
  'invalid-kiosk-input',
  'unsupported-experience-input'
]);

export type ExperienceNormalizationErrorCode = z.infer<
  typeof NormalizationErrorCodeSchema
>;

/** Stable normalization failure that deliberately contains no source values. */
export class ExperienceNormalizationError extends Error {
  readonly code: ExperienceNormalizationErrorCode;

  constructor(code: ExperienceNormalizationErrorCode) {
    super(`Experience normalization failed: ${code}`);
    this.name = 'ExperienceNormalizationError';
    this.code = code;
  }
}

const LegacyRouteSlotSchema = z.enum([
  'service-info',
  'service-form',
  'identity',
  'confirmation',
  'success'
]);

type LegacyRouteSlot = z.infer<typeof LegacyRouteSlotSchema>;

const CANONICAL_ROUTE_SLOTS: readonly LegacyRouteSlot[] = [
  'service-info',
  'service-form',
  'identity',
  'confirmation',
  'success'
];

const LegacyTerminalOutcomeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('submit-ticket') }).strict(),
  z.object({ type: z.literal('redeem-pre-registration') }).strict()
]);

const LegacyServiceRouteSchema = z
  .object({
    serviceId: z.string().min(1),
    identificationMode: KioskIdentificationModeSchema,
    slots: z.array(LegacyRouteSlotSchema).min(1),
    terminalActions: z.array(LegacyTerminalOutcomeSchema).length(1)
  })
  .strict();

const LegacyRoutingMetadataSchema = z
  .object({
    source: z.literal('legacy-service-routes'),
    canonicalSlots: z
      .array(LegacyRouteSlotSchema)
      .length(CANONICAL_ROUTE_SLOTS.length),
    routes: z.array(LegacyServiceRouteSchema)
  })
  .strict();

function fail(code: ExperienceNormalizationErrorCode): never {
  throw new ExperienceNormalizationError(code);
}

function isOwnRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function semanticId(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function screenWidgetId(
  type: string,
  sourceId: string,
  disambiguate = false
): string {
  const id = `display-${semanticId(type, 'widget')}-${semanticId(sourceId, 'legacy')}`;
  return disambiguate ? `${id}-${encodeURIComponent(sourceId)}` : id;
}

function normalizeHexColor(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const match = value.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) {
    return undefined;
  }
  const hex = match[1]!.toLowerCase();
  if (hex.length === 6) {
    return `#${hex}`;
  }
  return `#${[...hex].map((part) => `${part}${part}`).join('')}`;
}

function normalizeHexColorWithFallback(
  value: unknown,
  fallback: string
): string {
  return normalizeHexColor(value) ?? fallback;
}

function sanitizeWidgetStyle(
  style:
    | {
        backgroundColor?: string;
        textColor?: string;
        fontSize?: string;
        padding?: string;
      }
    | undefined
) {
  if (!style) {
    return undefined;
  }
  const sanitized = {
    ...(normalizeHexColor(style.backgroundColor)
      ? { backgroundColor: normalizeHexColor(style.backgroundColor) }
      : {}),
    ...(normalizeHexColor(style.textColor)
      ? { textColor: normalizeHexColor(style.textColor) }
      : {}),
    ...(style.fontSize?.trim() ? { fontSize: style.fontSize.trim() } : {}),
    ...(style.padding?.trim() ? { padding: style.padding.trim() } : {})
  };
  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

type LegacyScreenKind = 'regions' | 'cellGrid';

function classifyLegacyScreenInput(
  input: Record<string, unknown>
): LegacyScreenKind | undefined {
  const hasRegionsShape = hasOwn(input, 'layout');
  const hasCellGridShape =
    hasOwn(input, 'portrait') && hasOwn(input, 'landscape');
  if (hasOwn(input, 'layoutKind')) {
    if (input.layoutKind !== 'regions' && input.layoutKind !== 'cellGrid') {
      return fail('invalid-screen-template');
    }
    const hasContradictoryShape =
      input.layoutKind === 'regions'
        ? hasOwn(input, 'portrait') || hasOwn(input, 'landscape')
        : hasOwn(input, 'layout');
    const hasExpectedShape =
      input.layoutKind === 'regions' ? hasRegionsShape : hasCellGridShape;
    if (!hasExpectedShape || hasContradictoryShape) {
      return fail('invalid-screen-template');
    }
    return input.layoutKind;
  }
  if (hasRegionsShape && hasCellGridShape) {
    return fail('ambiguous-legacy-input');
  }
  if (hasRegionsShape) return 'regions';
  if (hasCellGridShape) return 'cellGrid';
  return undefined;
}

function parseScreenTemplate(
  input: unknown
):
  | { kind: 'regions'; template: ScreenTemplateRegions }
  | { kind: 'cellGrid'; template: ScreenTemplateCellGrid } {
  if (!isOwnRecord(input)) {
    return fail('invalid-screen-template');
  }
  const kind = classifyLegacyScreenInput(input);
  if (!kind) {
    return fail('invalid-screen-template');
  }

  if (kind === 'regions') {
    const result = ScreenTemplateRegionsSchema.safeParse({
      ...input,
      ...(hasOwn(input, 'layoutKind') ? {} : { layoutKind: 'regions' })
    });
    if (!result.success) {
      return fail('invalid-screen-template');
    }
    return { kind: 'regions', template: result.data };
  }

  const result = ScreenTemplateCellGridSchema.safeParse({
    ...input,
    ...(hasOwn(input, 'layoutKind') ? {} : { layoutKind: 'cellGrid' })
  });
  if (!result.success) {
    return fail('invalid-screen-template');
  }
  return { kind: 'cellGrid', template: result.data };
}

function stableContent(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return `string:${JSON.stringify(value)}`;
  if (typeof value === 'boolean') return `boolean:${value}`;
  if (typeof value === 'number') return `number:${value}`;
  if (Array.isArray(value)) {
    return `array:[${value.map((entry) => stableContent(entry)).join(',')}]`;
  }
  if (isOwnRecord(value)) {
    return `record:{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableContent(value[key])}`)
      .join(',')}}`;
  }
  return `unsupported:${Object.prototype.toString.call(value)}`;
}

function assertEquivalentCellGridContent(grid: ScreenTemplateCellGrid): void {
  const landscapeWidgets = new Map(
    grid.landscape.widgets.map((widget) => [widget.id, widget])
  );
  for (const portraitWidget of grid.portrait.widgets) {
    const landscapeWidget = landscapeWidgets.get(portraitWidget.id);
    if (
      !landscapeWidget ||
      portraitWidget.type !== landscapeWidget.type ||
      stableContent(portraitWidget.config ?? {}) !==
        stableContent(landscapeWidget.config ?? {}) ||
      stableContent(portraitWidget.style ?? {}) !==
        stableContent(landscapeWidget.style ?? {})
    ) {
      fail('incompatible-orientation-content');
    }
  }
}

function assertUniqueWidgetIds(widgets: readonly { id: string }[]): void {
  const ids = new Set<string>();
  for (const widget of widgets) {
    if (ids.has(widget.id)) {
      fail('invalid-screen-template');
    }
    ids.add(widget.id);
  }
}

function regionFace(template: ScreenTemplateRegions): ScreenCellGridFace {
  const count = template.widgets.length;
  if (count === 0) {
    return { columns: SIGNAGE_COLUMNS, rows: SIGNAGE_ROWS, widgets: [] };
  }
  if (count <= SIGNAGE_ROWS) {
    const rowSpan = Math.floor(SIGNAGE_ROWS / count);
    return {
      columns: SIGNAGE_COLUMNS,
      rows: SIGNAGE_ROWS,
      widgets: template.widgets.map((widget, index) => {
        const row = index * rowSpan + 1;
        return {
          id: widget.id,
          type: widget.type,
          placement: {
            col: 1,
            row,
            colSpan: SIGNAGE_COLUMNS,
            rowSpan: index === count - 1 ? SIGNAGE_ROWS - row + 1 : rowSpan
          },
          config: widget.config,
          style: widget.style
        };
      })
    };
  }

  const rows = Math.max(SIGNAGE_ROWS, Math.ceil(count / SIGNAGE_COLUMNS));
  if (rows > 48) {
    return fail('invalid-screen-template');
  }
  return {
    columns: SIGNAGE_COLUMNS,
    rows,
    widgets: template.widgets.map((widget, index) => ({
      id: widget.id,
      type: widget.type,
      placement: {
        col: (index % SIGNAGE_COLUMNS) + 1,
        row: Math.floor(index / SIGNAGE_COLUMNS) + 1,
        colSpan: 1,
        rowSpan: 1
      },
      config: widget.config,
      style: widget.style
    }))
  };
}

function semanticScreenWidgetIds(
  widgets: readonly { id: string; type: string }[]
): Map<string, string> {
  assertUniqueWidgetIds(widgets);
  const semanticIdCounts = new Map<string, number>();
  for (const widget of widgets) {
    const id = screenWidgetId(widget.type, widget.id);
    semanticIdCounts.set(id, (semanticIdCounts.get(id) ?? 0) + 1);
  }
  return new Map(
    widgets.map((widget) => [
      widget.id,
      screenWidgetId(
        widget.type,
        widget.id,
        (semanticIdCounts.get(screenWidgetId(widget.type, widget.id)) ?? 0) > 1
      )
    ])
  );
}

function regionWidgetConfig(
  template: ScreenTemplateRegions,
  widget: ScreenTemplateRegions['widgets'][number]
): Record<string, unknown> {
  const region = template.layout.regions.find(
    (candidate) => candidate.id === widget.regionId
  );
  if (!region) {
    return fail('invalid-screen-template');
  }
  const style = sanitizeWidgetStyle(widget.style);
  return {
    ...(widget.config ?? {}),
    compatibility: {
      source: 'legacy-screen-regions',
      region: {
        id: region.id,
        area: region.area,
        size: region.size,
        ...(region.panelStyle ? { panelStyle: region.panelStyle } : {}),
        ...(normalizeHexColor(region.backgroundColor)
          ? { backgroundColor: normalizeHexColor(region.backgroundColor) }
          : {})
      },
      widget: {
        ...(widget.position ? { position: { ...widget.position } } : {}),
        ...(widget.size ? { size: { ...widget.size } } : {}),
        ...(style ? { style } : {})
      }
    }
  };
}

function cellGridWidgetConfig(
  widget: ScreenTemplateCellGrid['portrait']['widgets'][number]
): Record<string, unknown> {
  const style = sanitizeWidgetStyle(widget.style);
  return {
    ...(widget.config ?? {}),
    compatibility: {
      source: 'legacy-screen-cell-grid',
      widget: {
        ...(style ? { style } : {})
      }
    }
  };
}

function signagePage(
  portrait: ScreenCellGridFace,
  landscape: ScreenCellGridFace | undefined,
  configForWidget: (sourceId: string) => Record<string, unknown>
): ExperiencePage {
  const widgetIds = semanticScreenWidgetIds(portrait.widgets);
  const widgets: ExperienceWidget[] = portrait.widgets.map((widget) => ({
    id: widgetIds.get(widget.id)!,
    type: widget.type,
    config: configForWidget(widget.id),
    actions: []
  }));
  const layouts: ExperiencePage['layouts'] = {
    [SIGNAGE_PORTRAIT_VARIANT_ID]: {
      placements: Object.fromEntries(
        portrait.widgets.map((widget) => [
          widgetIds.get(widget.id)!,
          { ...widget.placement }
        ])
      )
    }
  };
  if (landscape) {
    layouts[SIGNAGE_LANDSCAPE_VARIANT_ID] = {
      placements: Object.fromEntries(
        landscape.widgets.map((widget) => [
          widgetIds.get(widget.id)!,
          { ...widget.placement }
        ])
      )
    };
  }
  return { id: 'queue-display', name: 'Queue display', widgets, layouts };
}

/** Convert either legacy screen-template shape to a single queue-display experience. */
export function experienceFromScreenTemplate(
  input: unknown
): ExperienceTemplate {
  const source = parseScreenTemplate(input);
  if (source.kind === 'regions') {
    assertUniqueWidgetIds(source.template.widgets);
    const portrait = regionFace(source.template);
    const sourceWidgets = new Map(
      source.template.widgets.map((widget) => [widget.id, widget])
    );
    return ExperienceTemplateSchema.parse({
      schemaVersion: 1,
      id: source.template.id || 'legacy-screen',
      surface: 'queue-display',
      startPageId: 'queue-display',
      variants: [
        {
          id: SIGNAGE_PORTRAIT_VARIANT_ID,
          profile: SIGNAGE_PORTRAIT_PROFILE,
          grid: { columns: portrait.columns, rows: portrait.rows }
        }
      ],
      pages: [
        signagePage(portrait, undefined, (sourceId) => {
          const widget = sourceWidgets.get(sourceId);
          return widget
            ? regionWidgetConfig(source.template, widget)
            : fail('invalid-screen-template');
        })
      ]
    });
  }

  assertEquivalentCellGridContent(source.template);
  const portraitWidgets = new Map(
    source.template.portrait.widgets.map((widget) => [widget.id, widget])
  );
  return ExperienceTemplateSchema.parse({
    schemaVersion: 1,
    id: source.template.id || 'legacy-screen',
    surface: 'queue-display',
    startPageId: 'queue-display',
    variants: [
      {
        id: SIGNAGE_PORTRAIT_VARIANT_ID,
        profile: SIGNAGE_PORTRAIT_PROFILE,
        grid: {
          columns: source.template.portrait.columns,
          rows: source.template.portrait.rows
        }
      },
      {
        id: SIGNAGE_LANDSCAPE_VARIANT_ID,
        profile: SIGNAGE_LANDSCAPE_PROFILE,
        grid: {
          columns: source.template.landscape.columns,
          rows: source.template.landscape.rows
        }
      }
    ],
    pages: [
      signagePage(
        source.template.portrait,
        source.template.landscape,
        (sourceId) => {
          const widget = portraitWidgets.get(sourceId);
          return widget
            ? cellGridWidgetConfig(widget)
            : fail('invalid-screen-template');
        }
      )
    ]
  });
}

function legacyKioskTheme(config: KioskConfig) {
  const selected =
    config.kioskBaseTheme &&
    Object.prototype.hasOwnProperty.call(
      KIOSK_THEME_SURFACES,
      config.kioskBaseTheme
    )
      ? KIOSK_THEME_SURFACES[config.kioskBaseTheme]
      : DEFAULT_KIOSK_THEME;
  if (!config.isCustomColorsEnabled) {
    return { preset: 'legacy-kiosk' as const, tokens: { ...selected } };
  }
  return {
    preset: 'legacy-kiosk' as const,
    tokens: {
      header: normalizeHexColorWithFallback(
        config.headerColor,
        DEFAULT_KIOSK_THEME.header
      ),
      surface: normalizeHexColorWithFallback(
        config.bodyColor,
        DEFAULT_KIOSK_THEME.surface
      ),
      serviceGrid: normalizeHexColorWithFallback(
        config.serviceGridColor,
        DEFAULT_KIOSK_THEME.serviceGrid
      )
    }
  };
}

function parseKioskConfig(input: unknown): KioskConfig {
  const parsed = KioskConfigSchema.safeParse(input);
  return parsed.success ? parsed.data : fail('invalid-kiosk-input');
}

function parseServices(input: unknown): ServiceModel[] {
  const parsed = z.array(ServiceModelSchema).safeParse(input);
  return parsed.success ? parsed.data : fail('invalid-kiosk-input');
}

function flattenServices(services: readonly ServiceModel[]): ServiceModel[] {
  const result: ServiceModel[] = [];
  const seen = new Set<string>();
  const visit = (service: ServiceModel) => {
    if (seen.has(service.id)) {
      fail('invalid-kiosk-input');
    }
    seen.add(service.id);
    result.push(service);
    for (const child of service.children ?? []) {
      visit(child);
    }
  };
  for (const service of services) {
    visit(service);
  }
  return result;
}

function serviceHasChildren(
  service: ServiceModel,
  all: ServiceModel[]
): boolean {
  return (
    service.isLeaf === false ||
    (service.children?.length ?? 0) > 0 ||
    all.some((candidate) => candidate.parentId === service.id)
  );
}

function autoGrid(total: number) {
  if (total <= 1) return { rows: 1, columns: 1 };
  if (total === 2) return { rows: 1, columns: 2 };
  if (total <= 4) return { rows: 2, columns: 2 };
  if (total <= 6) return { rows: 2, columns: 3 };
  if (total <= 9) return { rows: 3, columns: 3 };
  if (total <= AUTO_PAGE_THRESHOLD) return { rows: 4, columns: 3 };
  return { rows: 3, columns: 3 };
}

function serviceRouteSlots(
  service: ServiceModel,
  identificationMode: KioskIdentificationMode
): LegacyRouteSlot[] {
  const slots = new Set<LegacyRouteSlot>();
  if (service.behavior?.information !== undefined) {
    slots.add('service-info');
  }
  if (service.behavior?.fields.length) {
    slots.add('service-form');
  }
  if (identificationMode !== 'none') {
    slots.add('identity');
  }
  if (service.behavior?.route?.mode === 'page-slot') {
    slots.add(service.behavior.route.slot);
  }
  slots.add('success');
  return CANONICAL_ROUTE_SLOTS.filter((slot) => slots.has(slot));
}

function legacyServiceRoute(service: ServiceModel) {
  const identificationMode = getKioskServiceIdentificationMode(service);
  return LegacyServiceRouteSchema.parse({
    serviceId: service.id,
    identificationMode,
    slots: serviceRouteSlots(service, identificationMode),
    terminalActions: [
      {
        type:
          identificationMode === 'qr'
            ? 'redeem-pre-registration'
            : 'submit-ticket'
      }
    ]
  });
}

function isTerminalService(
  service: ServiceModel,
  all: ServiceModel[]
): boolean {
  return !serviceHasChildren(service, all) && service.isLeaf !== false;
}

function manualPlacements(services: ServiceModel[]) {
  return services
    .filter(
      (service) =>
        typeof service.gridRow === 'number' &&
        typeof service.gridCol === 'number'
    )
    .map((service) => {
      const row = service.gridRow!;
      const col = service.gridCol!;
      const rowSpan = service.gridRowSpan ?? 1;
      const colSpan = service.gridColSpan ?? 1;
      if (
        !Number.isInteger(row) ||
        !Number.isInteger(col) ||
        !Number.isInteger(rowSpan) ||
        !Number.isInteger(colSpan) ||
        row < 0 ||
        col < 0 ||
        rowSpan < 1 ||
        colSpan < 1 ||
        row + rowSpan > MANUAL_GRID_ROWS ||
        col + colSpan > MANUAL_GRID_COLUMNS
      ) {
        return fail('invalid-kiosk-input');
      }
      return { serviceId: service.id, row, col, rowSpan, colSpan };
    });
}

function kioskPage(
  id: string,
  name: string,
  widgets: ExperienceWidget[]
): ExperiencePage {
  const placementRows =
    widgets.length === 1 ? 24 : Math.floor(24 / widgets.length);
  const placements: Record<
    string,
    { col: number; row: number; colSpan: number; rowSpan: number }
  > = {};
  for (const [index, widget] of widgets.entries()) {
    const row = index * placementRows + 1;
    placements[widget.id] = {
      col: 1,
      row,
      colSpan: 12,
      rowSpan: index === widgets.length - 1 ? 25 - row : placementRows
    };
  }
  return {
    id,
    name,
    widgets,
    layouts: { [KIOSK_VARIANT_ID]: { placements } }
  };
}

function widget(
  id: string,
  type: ExperienceWidget['type'],
  config: Record<string, unknown>,
  actions: ExperienceWidget['actions'] = []
): ExperienceWidget {
  return { id, type, config, actions };
}

function selectedServiceActions(): ExperienceWidget['actions'] {
  return [
    {
      type: 'set-session',
      key: 'selectedServiceId',
      value: { source: 'event', field: 'serviceId' }
    }
  ];
}

function legacyAttractCompatibility(config: KioskConfig) {
  const mode = config.kioskAttractInactivityMode ?? 'session_then_attract';
  const signageMode =
    config.kioskAttractSignageMode === 'materials'
      ? 'materials'
      : config.kioskAttractSignageMode === 'playlist' &&
          config.kioskAttractPlaylistId?.trim()
        ? 'playlist'
        : 'inherit';
  const signage = {
    mode: signageMode,
    ...(signageMode === 'playlist'
      ? { playlistId: config.kioskAttractPlaylistId! }
      : {}),
    ...(signageMode === 'materials' && config.kioskAttractActiveMaterialIds
      ? { materialIds: [...config.kioskAttractActiveMaterialIds] }
      : {}),
    ...(config.kioskAttractSlideDurationSec !== undefined
      ? { slideDurationSec: config.kioskAttractSlideDurationSec }
      : {})
  };
  return LegacyAttractCompatibilitySchema.parse({
    mode,
    sessionIdleBeforeWarningSec: config.sessionIdleBeforeWarningSec ?? 45,
    sessionIdleCountdownSec: config.sessionIdleCountdownSec ?? 15,
    showAttractAfterSessionEnd: config.showAttractAfterSessionEnd !== false,
    attractIdleSec: config.attractIdleSec ?? 60,
    showQueueDepthOnAttract: config.showQueueDepthOnAttract !== false,
    signage
  });
}

/**
 * Derive the portable ticket-station shell. KioskConfig has no persisted locale
 * selector, so this compatibility import deliberately does not synthesize a
 * one-locale language-switch rule from localized service labels.
 */
export function experienceFromKioskConfig(
  configInput: unknown = {},
  sourceServicesInput: unknown = []
): ExperienceTemplate {
  const config = parseKioskConfig(configInput);
  const services = flattenServices(parseServices(sourceServicesInput));
  const topLevel = services.filter((service) => !service.parentId);
  const categoryIds = topLevel
    .filter((service) => serviceHasChildren(service, services))
    .map((service) => service.id);
  const siblingCounts = [topLevel.length];
  for (const service of services) {
    const children = services.filter(
      (candidate) => candidate.parentId === service.id
    );
    if (children.length > 0) siblingCounts.push(children.length);
  }
  const largestLevel = Math.max(0, ...siblingCounts);
  const usesAutoGrid = config.serviceGridLayout === 'auto';
  const usesPagination = usesAutoGrid && largestLevel > AUTO_PAGE_THRESHOLD;
  const serviceRoutes = services
    .filter((service) => isTerminalService(service, services))
    .map(legacyServiceRoute);
  const legacyRouting = LegacyRoutingMetadataSchema.parse({
    source: 'legacy-service-routes',
    canonicalSlots: [...CANONICAL_ROUTE_SLOTS],
    routes: serviceRoutes
  });
  const hasInfo = serviceRoutes.some((route) =>
    route.slots.includes('service-info')
  );
  const hasForm = serviceRoutes.some((route) =>
    route.slots.includes('service-form')
  );
  const hasIdentity = serviceRoutes.some((route) =>
    route.slots.includes('identity')
  );
  const hasConfirmation = serviceRoutes.some((route) =>
    route.slots.includes('confirmation')
  );
  const hasAppointment = Boolean(
    config.isAppointmentCheckinEnabled ?? config.isPreRegistrationEnabled
  );
  const attractCompatibility = legacyAttractCompatibility(config);
  const hasAttract = attractCompatibility.mode !== 'off';
  const presentation = usesAutoGrid
    ? { mode: 'auto', grid: autoGrid(largestLevel) }
    : {
        mode: 'manual',
        grid: { rows: MANUAL_GRID_ROWS, columns: MANUAL_GRID_COLUMNS },
        coordinateBase: 'zero-based' as const,
        placements: manualPlacements(services)
      };
  const serviceWidgets: ExperienceWidget[] = [
    widget(
      'service-picker',
      'service-picker',
      {
        source: 'legacy-kiosk-services',
        catalog: {
          navigation: categoryIds.length > 0 ? 'categories' : 'flat',
          rootCategoryIds: categoryIds
        },
        presentation,
        pagination: {
          enabled: usesPagination,
          pageSize: PAGINATED_PAGE_SIZE,
          threshold: AUTO_PAGE_THRESHOLD
        },
        legacyRouting
      },
      selectedServiceActions()
    )
  ];
  if (hasAppointment) {
    serviceWidgets.push(
      widget(
        'appointment-entry',
        'rich-info',
        { source: 'legacy-appointment-checkin' },
        [{ type: 'navigate', toPageId: 'appointment' }]
      )
    );
  }

  const pages: ExperiencePage[] = [];
  if (hasAttract) {
    pages.push(
      kioskPage('attract', 'Attract', [
        widget('attract-media', 'media', {
          source: 'legacy-kiosk-attract',
          compatibility: attractCompatibility
        })
      ])
    );
  }
  pages.push(kioskPage('services', 'Services', serviceWidgets));
  if (hasInfo) {
    pages.push(
      kioskPage('service-info', 'Service information', [
        widget('service-information', 'rich-info', {
          source: 'legacy-service-routes',
          slot: 'service-info'
        })
      ])
    );
  }
  if (hasForm) {
    pages.push(
      kioskPage('service-form', 'Service form', [
        widget('service-form', 'ticket-form', {
          source: 'legacy-service-routes',
          slot: 'service-form'
        })
      ])
    );
  }
  if (hasIdentity) {
    pages.push(
      kioskPage('identity', 'Identification', [
        widget('legacy-identification', 'identify', {
          source: 'legacy-service-identification',
          routingSource: 'legacy-service-routes'
        })
      ])
    );
  }
  if (hasAppointment) {
    pages.push(
      kioskPage('appointment', 'Appointment check-in', [
        widget(
          'appointment-checkin',
          'ticket-form',
          {
            mode: 'appointment-checkin',
            phoneLookup: config.isAppointmentPhoneLookupEnabled ?? true
          },
          [{ type: 'submit-ticket' }, { type: 'navigate', toPageId: 'success' }]
        )
      ])
    );
  }
  if (hasConfirmation) {
    pages.push(
      kioskPage('confirmation', 'Confirmation', [
        widget('ticket-confirmation', 'rich-info', {
          source: 'legacy-service-routes',
          slot: 'confirmation'
        })
      ])
    );
  }
  pages.push(
    kioskPage('success', 'Ticket created', [
      widget(
        'ticket-success',
        'ticket-success',
        { source: 'legacy-ticket-success' },
        [{ type: 'reset-session' }, { type: 'navigate', toPageId: 'services' }]
      )
    ])
  );

  const flowPages = {
    serviceCatalogPageId: 'services',
    ...(hasInfo ? { serviceInfoPageId: 'service-info' } : {}),
    ...(hasForm ? { serviceFormPageId: 'service-form' } : {}),
    ...(hasIdentity ? { identityPageId: 'identity' } : {}),
    ...(hasAppointment ? { appointmentPageId: 'appointment' } : {}),
    ...(hasConfirmation ? { confirmationPageId: 'confirmation' } : {}),
    successPageId: 'success'
  };
  return ExperienceTemplateSchema.parse({
    schemaVersion: 1,
    id: 'legacy-kiosk',
    surface: 'ticket-station',
    startPageId: 'services',
    variants: [
      {
        id: KIOSK_VARIANT_ID,
        profile: KIOSK_PROFILE,
        grid: { columns: 12, rows: 24 }
      }
    ],
    pages,
    flowPages,
    theme: legacyKioskTheme(config)
  });
}

function kioskConfigFromEnvelope(input: Record<string, unknown>): unknown {
  if (hasOwn(input, 'kiosk')) {
    return input.kiosk;
  }
  if (isOwnRecord(input.config) && hasOwn(input.config, 'kiosk')) {
    return input.config.kiosk;
  }
  return isOwnRecord(input.config) ? input.config : {};
}

/** Normalize a versioned experience or either supported legacy source without mutation. */
export function normalizeExperienceInput(input: unknown): ExperienceTemplate {
  if (!isOwnRecord(input)) {
    return fail('unsupported-experience-input');
  }
  if (hasOwn(input, 'schemaVersion') && input.schemaVersion !== undefined) {
    if (input.schemaVersion !== 1) {
      return fail('unsupported-schema-version');
    }
    const parsed = ExperienceTemplateSchema.safeParse(input);
    if (!parsed.success) {
      return fail('invalid-versioned-experience');
    }
    return structuredClone(parsed.data);
  }

  const screenKind = classifyLegacyScreenInput(input);
  const sourceKinds = [
    screenKind !== undefined,
    Array.isArray(input.services)
  ].filter(Boolean).length;
  if (sourceKinds > 1) {
    return fail('ambiguous-legacy-input');
  }
  if (sourceKinds === 0) {
    return fail('unsupported-experience-input');
  }
  if (Array.isArray(input.services)) {
    return experienceFromKioskConfig(
      kioskConfigFromEnvelope(input),
      input.services
    );
  }
  return experienceFromScreenTemplate(input);
}
