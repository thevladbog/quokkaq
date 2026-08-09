import { z } from 'zod';
import type { KioskConfig, ServiceModel } from './index';
import {
  ExperienceTemplateSchema,
  type ExperiencePage,
  type ExperienceTemplate,
  type ExperienceWidget
} from './experience-template';
import { migrateRegionsToCellGrid } from './screen-template-migrate-regions';
import {
  ScreenTemplateCellGridSchema,
  ScreenTemplateRegionsSchema,
  normalizeScreenTemplateInput,
  type ScreenTemplateCellGrid
} from './screen-template-layout';

const KIOSK_VARIANT_ID = 'kiosk-1080x1920';
const SIGNAGE_PORTRAIT_VARIANT_ID = 'signage-portrait';
const SIGNAGE_LANDSCAPE_VARIANT_ID = 'signage-landscape';
const AUTO_PAGE_THRESHOLD = 12;
const PAGINATED_PAGE_SIZE = 9;

const KIOSK_PROFILE = {
  id: KIOSK_VARIANT_ID,
  name: 'Kiosk 1080×1920',
  width: 1080,
  height: 1920,
  interactionMode: 'touch' as const,
  viewingDistance: 'standing' as const,
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

const ScreenTemplateUnionSchema = z.union([
  ScreenTemplateRegionsSchema,
  ScreenTemplateCellGridSchema
]);

type LegacyKioskConfig = KioskConfig & Record<string, unknown>;

function isOwnRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
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

function toScreenCellGrid(input: unknown): ScreenTemplateCellGrid {
  const parsed = ScreenTemplateUnionSchema.parse(
    normalizeScreenTemplateInput(input)
  );
  if (parsed.layoutKind === 'cellGrid') {
    return parsed;
  }
  return migrateRegionsToCellGrid(parsed.id, parsed.layout, parsed.widgets);
}

function signagePage(grid: ScreenTemplateCellGrid): ExperiencePage {
  const semanticIdCounts = new Map<string, number>();
  for (const widget of grid.portrait.widgets) {
    const id = screenWidgetId(widget.type, widget.id);
    semanticIdCounts.set(id, (semanticIdCounts.get(id) ?? 0) + 1);
  }
  const widgetIds = new Map(
    grid.portrait.widgets.map((widget) => [
      widget.id,
      screenWidgetId(
        widget.type,
        widget.id,
        (semanticIdCounts.get(screenWidgetId(widget.type, widget.id)) ?? 0) > 1
      )
    ])
  );
  const widgets: ExperienceWidget[] = grid.portrait.widgets.map((widget) => ({
    id: widgetIds.get(widget.id)!,
    type: widget.type,
    config: widget.config ?? {},
    actions: []
  }));
  const layouts = {
    [SIGNAGE_PORTRAIT_VARIANT_ID]: {
      placements: Object.fromEntries(
        grid.portrait.widgets.map((widget) => [
          widgetIds.get(widget.id)!,
          { ...widget.placement }
        ])
      )
    },
    [SIGNAGE_LANDSCAPE_VARIANT_ID]: {
      placements: Object.fromEntries(
        grid.landscape.widgets.map((widget) => [
          widgetIds.get(widget.id)!,
          { ...widget.placement }
        ])
      )
    }
  };

  return { id: 'queue-display', name: 'Queue display', widgets, layouts };
}

/** Convert either legacy screen-template shape to a single queue-display experience. */
export function experienceFromScreenTemplate(
  input: unknown
): ExperienceTemplate {
  const grid = toScreenCellGrid(input);
  const template = {
    schemaVersion: 1 as const,
    id: grid.id || 'legacy-screen',
    surface: 'queue-display' as const,
    startPageId: 'queue-display',
    variants: [
      {
        id: SIGNAGE_PORTRAIT_VARIANT_ID,
        profile: {
          id: 'signage-1080x1920',
          name: 'Signage 1080×1920',
          width: 1080,
          height: 1920,
          interactionMode: 'non-touch' as const,
          viewingDistance: 'far' as const,
          safeArea: { top: 0, right: 0, bottom: 0, left: 0 }
        },
        grid: {
          columns: grid.portrait.columns,
          rows: grid.portrait.rows
        }
      },
      {
        id: SIGNAGE_LANDSCAPE_VARIANT_ID,
        profile: {
          id: 'signage-1920x1080',
          name: 'Signage 1920×1080',
          width: 1920,
          height: 1080,
          interactionMode: 'non-touch' as const,
          viewingDistance: 'far' as const,
          safeArea: { top: 0, right: 0, bottom: 0, left: 0 }
        },
        grid: {
          columns: grid.landscape.columns,
          rows: grid.landscape.rows
        }
      }
    ],
    pages: [signagePage(grid)]
  };
  return ExperienceTemplateSchema.parse(template);
}

function normalizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }
  const match = value.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) {
    return fallback;
  }
  const hex = match[1]!.toLowerCase();
  if (hex.length === 6) {
    return `#${hex}`;
  }
  return `#${[...hex].map((part) => `${part}${part}`).join('')}`;
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
      header: normalizeHexColor(config.headerColor, DEFAULT_KIOSK_THEME.header),
      surface: normalizeHexColor(config.bodyColor, DEFAULT_KIOSK_THEME.surface),
      serviceGrid: normalizeHexColor(
        config.serviceGridColor,
        DEFAULT_KIOSK_THEME.serviceGrid
      )
    }
  };
}

function flattenServices(services: readonly ServiceModel[]): ServiceModel[] {
  const result: ServiceModel[] = [];
  const seen = new Set<string>();
  const visit = (service: ServiceModel) => {
    if (seen.has(service.id)) {
      return;
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

function activeLocales(config: LegacyKioskConfig, services: ServiceModel[]) {
  const configured = config.activeLocales ?? config.locales;
  if (Array.isArray(configured)) {
    const unique = [
      ...new Set(
        configured
          .filter(
            (locale): locale is string =>
              typeof locale === 'string' && locale.trim() !== ''
          )
          .map((locale) => locale.trim())
      )
    ];
    if (unique.length > 0) {
      return unique;
    }
  }
  const locales = new Set<string>();
  if (services.some((service) => Boolean(service.nameRu?.trim()))) {
    locales.add('ru');
  }
  if (services.some((service) => Boolean(service.nameEn?.trim()))) {
    locales.add('en');
  }
  return [...locales].sort();
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

function hasBehaviorRouteSlot(
  service: ServiceModel,
  slot: 'service-info' | 'service-form' | 'confirmation'
): boolean {
  return (
    service.behavior?.route?.mode === 'page-slot' &&
    service.behavior.route.slot === slot
  );
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

function selectedServiceActions(
  targetPageId: string
): ExperienceWidget['actions'] {
  const actions: ExperienceWidget['actions'] = [
    {
      type: 'set-session',
      key: 'selectedServiceId',
      value: { source: 'event', field: 'serviceId' }
    }
  ];
  if (targetPageId === 'success') {
    actions.push({ type: 'submit-ticket' });
  }
  actions.push({ type: 'navigate', toPageId: targetPageId });
  return actions;
}

/**
 * Derive the portable ticket-station shell. Service data remains runtime-owned;
 * the compatibility config captures only legacy navigation, grid, and pagination intent.
 */
export function experienceFromKioskConfig(
  config: KioskConfig = {},
  sourceServices: readonly ServiceModel[] = []
): ExperienceTemplate {
  const legacyConfig = config as LegacyKioskConfig;
  const services = flattenServices(sourceServices);
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
  const usesPagination = largestLevel > AUTO_PAGE_THRESHOLD;
  const activeLocaleIds = activeLocales(legacyConfig, services);
  const hasInfo = services.some(
    (service) =>
      service.behavior?.information !== undefined ||
      hasBehaviorRouteSlot(service, 'service-info')
  );
  const hasForm = services.some(
    (service) =>
      service.behavior?.fields.length ||
      hasBehaviorRouteSlot(service, 'service-form')
  );
  const hasIdentity =
    services.some(
      (service) =>
        service.identificationMode !== undefined &&
        service.identificationMode !== 'none'
    ) || services.some((service) => service.offerIdentification === true);
  const hasConfirmation = services.some((service) =>
    hasBehaviorRouteSlot(service, 'confirmation')
  );
  const hasAppointment = Boolean(
    config.isAppointmentCheckinEnabled ?? config.isPreRegistrationEnabled
  );
  const hasAttract =
    config.kioskAttractInactivityMode === undefined ||
    config.kioskAttractInactivityMode !== 'off';

  const serviceTarget = hasInfo
    ? 'service-info'
    : hasForm
      ? 'service-form'
      : hasIdentity
        ? 'identity'
        : hasConfirmation
          ? 'confirmation'
          : 'success';
  const presentation = usesAutoGrid
    ? { mode: 'auto', grid: autoGrid(largestLevel) }
    : {
        mode: 'manual',
        grid: { rows: 8, columns: 8 },
        placements: services
          .filter(
            (service) =>
              typeof service.gridRow === 'number' &&
              typeof service.gridCol === 'number'
          )
          .map((service) => ({
            serviceId: service.id,
            row: service.gridRow!,
            col: service.gridCol!,
            rowSpan: service.gridRowSpan || 1,
            colSpan: service.gridColSpan || 1
          }))
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
        }
      },
      selectedServiceActions(serviceTarget)
    )
  ];
  if (activeLocaleIds.length > 1) {
    serviceWidgets.push(
      widget('language-switch', 'language-switch', {
        source: 'legacy-active-locales',
        locales: activeLocaleIds
      })
    );
  }
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
        widget('attract-media', 'media', { source: 'legacy-kiosk-attract' }, [
          { type: 'navigate', toPageId: 'services' }
        ])
      ])
    );
  }
  pages.push(kioskPage('services', 'Services', serviceWidgets));
  if (hasInfo) {
    pages.push(
      kioskPage('service-info', 'Service information', [
        widget(
          'service-information',
          'rich-info',
          { source: 'selected-service-behavior', section: 'information' },
          [
            {
              type: 'navigate',
              toPageId: hasForm
                ? 'service-form'
                : hasIdentity
                  ? 'identity'
                  : hasConfirmation
                    ? 'confirmation'
                    : 'success'
            }
          ]
        )
      ])
    );
  }
  if (hasForm) {
    pages.push(
      kioskPage('service-form', 'Service form', [
        widget(
          'service-form',
          'ticket-form',
          { source: 'selected-service-behavior', section: 'fields' },
          [
            {
              type: 'navigate',
              toPageId: hasIdentity
                ? 'identity'
                : hasConfirmation
                  ? 'confirmation'
                  : 'success'
            }
          ]
        )
      ])
    );
  }
  if (hasIdentity) {
    pages.push(
      kioskPage('identity', 'Identification', [
        widget(
          'legacy-identification',
          'identify',
          { source: 'legacy-service-identification' },
          [
            {
              type: 'navigate',
              toPageId: hasConfirmation ? 'confirmation' : 'success'
            }
          ]
        )
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
        widget(
          'ticket-confirmation',
          'rich-info',
          { source: 'selected-service-behavior', section: 'confirmation' },
          [{ type: 'submit-ticket' }, { type: 'navigate', toPageId: 'success' }]
        )
      ])
    );
  }
  pages.push(
    kioskPage('success', 'Ticket created', [
      widget(
        'ticket-success',
        'ticket-success',
        { source: 'legacy-ticket-success' },
        [
          { type: 'reset-session' },
          { type: 'navigate', toPageId: hasAttract ? 'attract' : 'services' }
        ]
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
    startPageId: hasAttract ? 'attract' : 'services',
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

/** Normalize a versioned experience or either supported legacy source without mutation. */
export function normalizeExperienceInput(input: unknown): ExperienceTemplate {
  if (isOwnRecord(input) && input.schemaVersion === 1) {
    const parsed = ExperienceTemplateSchema.safeParse(input);
    if (!parsed.success) {
      throw parsed.error;
    }
    return structuredClone(input) as ExperienceTemplate;
  }
  if (
    isOwnRecord(input) &&
    (Object.prototype.hasOwnProperty.call(input, 'layout') ||
      (Object.prototype.hasOwnProperty.call(input, 'portrait') &&
        Object.prototype.hasOwnProperty.call(input, 'landscape')))
  ) {
    return experienceFromScreenTemplate(input);
  }
  if (isOwnRecord(input) && Array.isArray(input.services)) {
    const nestedConfig = isOwnRecord(input.config)
      ? input.config.kiosk
      : undefined;
    const config = (input.kiosk ??
      nestedConfig ??
      input.config ??
      {}) as KioskConfig;
    return experienceFromKioskConfig(config, input.services as ServiceModel[]);
  }
  throw new TypeError('Unsupported experience input');
}
