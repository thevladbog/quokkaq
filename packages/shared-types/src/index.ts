import { z } from 'zod';

export {
  TENANT_SLUG_MIN_LEN,
  TENANT_SLUG_MAX_LEN,
  RESERVED_TENANT_SLUGS,
  normalizeTenantSlug,
  isReservedTenantSlug,
  TENANT_SLUG_PART_RE,
  isValidTenantSlug
} from './tenant-slug';

// ==========================
// Zod Schemas
// ==========================

export const UserModelSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.string().nullable().optional(),
    photoUrl: z.string().nullable().optional(),
    /** When false, login is denied until access is restored. */
    isActive: z.boolean().optional().default(true),
    createdAt: z.string().nullable().optional(),
    exemptFromSsoSync: z.boolean().optional(),
    ssoProfileSyncOptOut: z.boolean().optional(),
    unitIds: z.array(z.string()).optional(),
    /** @deprecated Prefer tenantRoles and unit permissions; kept for API compatibility. */
    roles: z
      .union([
        z.array(z.string()),
        z.array(
          z.object({
            role: z.object({
              name: z.string()
            })
          })
        )
      ])
      .optional()
      .transform((val): string[] => {
        if (!val) return [];
        return val.map((v) => {
          if (typeof v === 'string') return v;
          return v.role.name;
        });
      }),
    type: z.string().optional(),
    permissions: z.record(z.string(), z.array(z.string())).optional(),
    units: z
      .array(
        z.object({
          unitId: z.string(),
          companyId: z.string().optional(),
          permissions: z.array(z.string()).optional().default([]),
          unit: z
            .object({
              companyId: z.string().optional(),
              id: z.string().optional(),
              name: z.string().optional(),
              nameEn: z.string().nullable().optional(),
              code: z.string().optional(),
              kind: z.string().optional()
            })
            .nullable()
            .optional()
        })
      )
      .optional(),
    /** Tenant-defined roles for the active company (from GET /companies/me/users). */
    tenantRoles: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          slug: z.string()
        })
      )
      .nullish()
      .transform((v) => v ?? [])
  })
  .transform((data) => ({
    ...data,
    /** True when the user has the global platform_admin role. */
    isPlatformAdmin: data.roles.includes('platform_admin'),
    /** True when the user holds the reserved tenant role `system_admin` for the active company. */
    isTenantAdmin: data.tenantRoles.some((r) => r.slug === 'system_admin')
  }));

// Service Model Schema (recursive)
export type ServiceModel = {
  id: string;
  unitId: string;
  parentId?: string | null;
  parent?: ServiceModel | null;
  children?: ServiceModel[];
  name: string;
  nameRu?: string | null;
  nameEn?: string | null;
  description?: string | null;
  descriptionRu?: string | null;
  descriptionEn?: string | null;
  imageUrl?: string | null;
  backgroundColor?: string | null;
  textColor?: string | null;
  prefix?: string | null;
  numberSequence?: string | null;
  duration?: number | null;
  maxWaitingTime?: number | null;
  maxServiceTime?: number | null;
  prebook?: boolean;
  offerIdentification?: boolean;
  isLeaf?: boolean;
  gridRow?: number | null;
  gridCol?: number | null;
  gridRowSpan?: number | null;
  gridColSpan?: number | null;
  restrictedServiceZoneId?: string | null;
  /** Optional label for [QQ] calendar SUMMARY when service names collide (Yandex CalDAV). */
  calendarSlotKey?: string | null;
};

export const ServiceModelSchema: z.ZodType<ServiceModel> = z.object({
  id: z.string(),
  unitId: z.string(),
  parentId: z.string().nullable().optional(),
  parent: z
    .lazy(() => ServiceModelSchema)
    .nullable()
    .optional(),
  children: z.array(z.lazy(() => ServiceModelSchema)).optional(),
  name: z.string(),
  nameRu: z.string().nullable().optional(),
  nameEn: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  descriptionRu: z.string().nullable().optional(),
  descriptionEn: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  backgroundColor: z.string().nullable().optional(),
  textColor: z.string().nullable().optional(),
  prefix: z.string().nullable().optional(),
  numberSequence: z.string().nullable().optional(),
  duration: z.number().nullable().optional(),
  maxWaitingTime: z.number().nullable().optional(),
  maxServiceTime: z.number().nullable().optional(),
  prebook: z.boolean().optional(),
  offerIdentification: z.boolean().optional(),
  isLeaf: z.boolean().optional(),
  gridRow: z.number().nullable().optional(),
  gridCol: z.number().nullable().optional(),
  gridRowSpan: z.number().nullable().optional(),
  gridColSpan: z.number().nullable().optional(),
  restrictedServiceZoneId: z.string().nullable().optional(),
  calendarSlotKey: z.string().nullable().optional()
});

export const UnitKindSchema = z.enum(['subdivision', 'service_zone']);

/** Runtime shape for `UnitConfig.adScreen` (matches {@link AdScreenConfig}). */
export const AdScreenConfigSchema = z
  .object({
    width: z.number(),
    duration: z.number(),
    activeMaterialIds: z.array(z.string()),
    logoUrl: z.string().optional(),
    isCustomColorsEnabled: z.boolean().optional(),
    headerColor: z.string().optional(),
    bodyColor: z.string().optional(),
    recentCallsHistoryLimit: z.number().optional()
  })
  .passthrough();

const guestSurveyCounterDisplayThemeHex = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);

/** Counter-display terminal colors stored on `SurveyDefinition.displayTheme` (JSON). */
export const GuestSurveyCounterDisplayThemeSchema = z
  .object({
    isCustomColorsEnabled: z.boolean().optional(),
    headerColor: guestSurveyCounterDisplayThemeHex.optional(),
    bodyColor: guestSurveyCounterDisplayThemeHex.optional(),
    foregroundColor: guestSurveyCounterDisplayThemeHex.optional(),
    mutedForegroundColor: guestSurveyCounterDisplayThemeHex.optional(),
    primaryColor: guestSurveyCounterDisplayThemeHex.optional(),
    primaryForegroundColor: guestSurveyCounterDisplayThemeHex.optional(),
    borderColor: guestSurveyCounterDisplayThemeHex.optional()
  })
  .strict();

export type GuestSurveyCounterDisplayTheme = z.infer<
  typeof GuestSurveyCounterDisplayThemeSchema
>;

export function parseGuestSurveyCounterDisplayTheme(
  raw: unknown
): GuestSurveyCounterDisplayTheme | null {
  const r = GuestSurveyCounterDisplayThemeSchema.safeParse(raw);
  return r.success ? r.data : null;
}

/** Pictorial 1–5 scale on counter display (`presentation: icons`). */
export const guestSurveyScaleIconPresetSchema = z.enum([
  'stars_gold',
  'hearts_red'
]);

export const guestSurveyScalePresentationSchema = z.enum(['numeric', 'icons']);

/**
 * One `scale` object inside `SurveyDefinition.questions` blocks (contract slice).
 * Full `questions` payload may be a bare array or `{ displayMode, blocks }`; this schema validates a single block.
 */
export const GuestSurveyQuestionScaleBlockSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal('scale'),
    min: z.number().int(),
    max: z.number().int(),
    label: z.record(z.string(), z.string()).optional(),
    presentation: guestSurveyScalePresentationSchema.optional(),
    iconPreset: guestSurveyScaleIconPresetSchema.optional()
  })
  .passthrough()
  .superRefine((data, ctx) => {
    if (data.presentation === 'icons') {
      if (data.min !== 1 || data.max !== 5) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['min'],
          message: 'icon scale must use min 1 and max 5'
        });
      }
      if (data.iconPreset === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['iconPreset'],
          message: 'iconPreset is required when presentation is icons'
        });
      }
    }
  });

export type GuestSurveyQuestionScaleBlock = z.infer<
  typeof GuestSurveyQuestionScaleBlockSchema
>;

const guestSurveyIdleMarkdownLocaleMax = 64 * 1024;

const guestSurveyIdleImageFileRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpeg|jpg|png|webp|svg)$/i;

const guestSurveyIdleVideoFileRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp4|webm|mov|m4v)$/i;

/** One slide on the counter idle carousel (`SurveyDefinition.idleScreen`). */
export const GuestSurveyIdleSlideSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('text'),
      id: z.string().uuid().optional(),
      markdown: z.record(
        z.string().min(1),
        z.string().max(guestSurveyIdleMarkdownLocaleMax)
      )
    })
    .strict(),
  z
    .object({
      type: z.literal('image'),
      id: z.string().uuid().optional(),
      url: z.string().min(1)
    })
    .strict(),
  z
    .object({
      type: z.literal('video'),
      id: z.string().uuid().optional(),
      url: z.string().min(1)
    })
    .strict()
]);

export type GuestSurveyIdleSlide = z.infer<typeof GuestSurveyIdleSlideSchema>;

/**
 * Counter idle screen JSON (`SurveyDefinition.idleScreen`).
 * Use {@link parseGuestSurveyIdleScreen} with `scopeUnitId` to validate media URLs match the survey scope unit.
 */
export const GuestSurveyIdleScreenSchema = z
  .object({
    slideIntervalSec: z.number().int(),
    slides: z.array(GuestSurveyIdleSlideSchema).max(30)
  })
  .strict()
  .superRefine((data, ctx) => {
    const hasSlides = data.slides.length > 0;
    if (!hasSlides && data.slideIntervalSec === 0) {
      return;
    }
    if (data.slideIntervalSec < 1 || data.slideIntervalSec > 300) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['slideIntervalSec'],
        message: hasSlides
          ? 'slideIntervalSec must be between 1 and 300 when slides are non-empty'
          : 'slideIntervalSec must be 0 or between 1 and 300 when slides are empty'
      });
    }
  });

export type GuestSurveyIdleScreen = z.infer<typeof GuestSurveyIdleScreenSchema>;

/** Max JSON size for idle screen (matches backend). */
export const guestSurveyIdleScreenMaxJsonBytes = 512 * 1024;

/**
 * Parse and validate idle screen; `scopeUnitId` must match URLs in image/video slides.
 */
export function parseGuestSurveyIdleScreen(
  raw: unknown,
  scopeUnitId: string
): GuestSurveyIdleScreen | null {
  if (typeof raw === 'string') {
    if (
      new TextEncoder().encode(raw).length > guestSurveyIdleScreenMaxJsonBytes
    ) {
      return null;
    }
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }

  const r = GuestSurveyIdleScreenSchema.safeParse(raw);
  if (!r.success) {
    return null;
  }
  const prefix = `/api/units/${scopeUnitId}/guest-survey/idle-media/`;
  for (let i = 0; i < r.data.slides.length; i++) {
    const slide = r.data.slides[i];
    if (slide.type === 'image' || slide.type === 'video') {
      const u = slide.url.trim();
      if (!u.startsWith(prefix)) {
        return null;
      }
      const fn = u.slice(prefix.length);
      if (fn.includes('/')) {
        return null;
      }
      if (slide.type === 'image') {
        if (!guestSurveyIdleImageFileRe.test(fn)) {
          return null;
        }
      } else if (!guestSurveyIdleVideoFileRe.test(fn)) {
        return null;
      }
    }
  }
  return r.data;
}

export type GuestSurveyIdleScreenSafeParseResult =
  | { success: true; data: GuestSurveyIdleScreen }
  | { success: false; error: z.ZodError };

/**
 * Parse idle screen for counter display: same as {@link parseGuestSurveyIdleScreen} but allows any
 * `/api/units/{id}/guest-survey/idle-media/...` path (survey scope unit may differ from terminal unit).
 */
export function parseGuestSurveyIdleScreenForDisplay(
  raw: unknown
): GuestSurveyIdleScreen | null {
  if (typeof raw === 'string') {
    if (
      new TextEncoder().encode(raw).length > guestSurveyIdleScreenMaxJsonBytes
    ) {
      return null;
    }
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  } else if (raw !== null && typeof raw === 'object') {
    try {
      const encoded = new TextEncoder().encode(JSON.stringify(raw));
      if (encoded.length > guestSurveyIdleScreenMaxJsonBytes) {
        return null;
      }
    } catch {
      return null;
    }
  }

  const r = GuestSurveyIdleScreenSchema.safeParse(raw);
  if (!r.success) {
    return null;
  }
  const marker = '/guest-survey/idle-media/';
  for (const slide of r.data.slides) {
    if (slide.type === 'image' || slide.type === 'video') {
      const u = slide.url.trim();
      if (!u.startsWith('/api/units/') || !u.includes(marker)) {
        return null;
      }
      const i = u.indexOf(marker);
      const fn = u
        .slice(i + marker.length)
        .split('/')[0]
        ?.split('?')[0]
        ?.trim();
      if (!fn) {
        return null;
      }
      if (slide.type === 'image') {
        if (!guestSurveyIdleImageFileRe.test(fn)) {
          return null;
        }
      } else if (!guestSurveyIdleVideoFileRe.test(fn)) {
        return null;
      }
    }
  }
  return r.data;
}

/** Runtime parse for guest session `idleScreen` (pass active survey `scopeUnitId` for URL checks). */
export function safeParseGuestSurveyIdleScreen(
  raw: unknown,
  scopeUnitId: string
): GuestSurveyIdleScreenSafeParseResult {
  const parsed = parseGuestSurveyIdleScreen(raw, scopeUnitId);
  if (parsed) {
    return { success: true, data: parsed };
  }
  return {
    success: false,
    error: new z.ZodError([
      {
        code: 'custom',
        message: 'Invalid idle screen',
        path: []
      }
    ])
  };
}

/** Runtime shape for `UnitConfig.kiosk` (matches {@link KioskConfig}). */
export const KioskConfigSchema = z
  .object({
    pin: z.string().optional(),
    welcomeTitle: z.string().optional(),
    welcomeSubtitle: z.string().optional(),
    headerText: z.string().optional(),
    footerText: z.string().optional(),
    printerConnection: z.enum(['network', 'system']).optional(),
    systemPrinterName: z.string().optional(),
    printerIp: z.string().optional(),
    printerPort: z.string().optional(),
    showHeader: z.boolean().optional(),
    showFooter: z.boolean().optional(),
    isCustomColorsEnabled: z.boolean().optional(),
    headerColor: z.string().optional(),
    bodyColor: z.string().optional(),
    serviceGridColor: z.string().optional(),
    logoUrl: z.string().optional(),
    printerLogoUrl: z.string().optional(),
    printerType: z.string().optional(),
    isPrintEnabled: z.boolean().optional(),
    feedbackUrl: z.string().optional(),
    isPreRegistrationEnabled: z.boolean().optional(),
    showUnitInHeader: z.boolean().optional(),
    kioskUnitLabelText: z.string().optional(),
    /** Seconds of inactivity on the service grid before showing the session warning. Default 45. */
    sessionIdleBeforeWarningSec: z
      .number()
      .int()
      .positive()
      .max(3_600)
      .optional(),
    /** Countdown in seconds on the warning dialog before resetting to the kiosk home. Default 15. */
    sessionIdleCountdownSec: z.number().int().positive().max(300).optional(),
    /** When false, skip mandatory post-ticket SMS step. Default true when unset. */
    visitorSmsAfterTicket: z.boolean().optional()
  })
  .passthrough();

export {
  ScreenWidgetTypeSchema,
  ScreenLayoutPanelStyleSchema,
  ScreenLayoutRegionSchema,
  ScreenLayoutSchema,
  ScreenWidgetPositionSchema,
  ScreenWidgetSizeSchema,
  ScreenWidgetStyleSchema,
  ScreenWidgetConfigSchema,
  type ScreenWidgetType,
  type ScreenLayoutRegion,
  type ScreenLayout,
  type ScreenWidgetConfig
} from './screen-template-widgets';

import {
  ScreenWidgetPositionSchema,
  ScreenWidgetSizeSchema,
  ScreenWidgetStyleSchema
} from './screen-template-widgets';

export {
  ScreenCellGridPlacementSchema,
  ScreenCellGridWidgetSchema,
  ScreenTemplateRegionsSchema,
  ScreenTemplateCellGridSchema,
  normalizeScreenTemplateInput,
  isScreenTemplateCellGrid,
  isScreenTemplateRegions,
  type ScreenTemplateUnion,
  type ScreenTemplateCellGrid,
  type ScreenTemplateRegions,
  type ScreenCellGridWidget,
  type ScreenCellGridFace,
  type ScreenCellGridPlacement
} from './screen-template-layout';

export { migrateRegionsToCellGrid } from './screen-template-migrate-regions';

import {
  ScreenTemplateCellGridSchema,
  ScreenTemplateRegionsSchema,
  normalizeScreenTemplateInput
} from './screen-template-layout';

/** Drop removed widget types so stored unit configs still parse. */
function stripDeprecatedScreenTemplateWidgets(input: unknown): unknown {
  if (input == null || typeof input !== 'object') {
    return input;
  }
  const o = input as Record<string, unknown>;
  const filterProg = (arr: unknown): unknown[] | null => {
    if (!Array.isArray(arr)) return null;
    return arr.filter(
      (w) =>
        !(
          w &&
          typeof w === 'object' &&
          (w as Record<string, unknown>).type === 'progress-bar'
        )
    );
  };
  const portrait = o.portrait;
  const landscape = o.landscape;
  if (
    portrait &&
    typeof portrait === 'object' &&
    landscape &&
    typeof landscape === 'object'
  ) {
    const po = portrait as Record<string, unknown>;
    const lo = landscape as Record<string, unknown>;
    const pw = filterProg(po.widgets);
    const lw = filterProg(lo.widgets);
    if (pw && lw) {
      const origP = po.widgets as unknown[];
      const origL = lo.widgets as unknown[];
      const pChanged = pw.length !== origP.length;
      const lChanged = lw.length !== origL.length;
      if (pChanged || lChanged) {
        return {
          ...o,
          portrait: { ...po, widgets: pw },
          landscape: { ...lo, widgets: lw }
        };
      }
    }
  }
  const widgets = o.widgets;
  if (!Array.isArray(widgets)) {
    return input;
  }
  const filtered = widgets.filter(
    (w) =>
      !(
        w &&
        typeof w === 'object' &&
        (w as Record<string, unknown>).type === 'progress-bar'
      )
  );
  if (filtered.length === widgets.length) {
    return input;
  }
  return { ...o, widgets: filtered };
}

export const ScreenTemplateSchema = z.preprocess(
  (raw) =>
    normalizeScreenTemplateInput(stripDeprecatedScreenTemplateWidgets(raw)),
  z.discriminatedUnion('layoutKind', [
    ScreenTemplateRegionsSchema,
    ScreenTemplateCellGridSchema
  ])
);

/** Runtime shape for `UnitConfig.screenTemplate` (regions or cell-grid). */
export type ScreenWidgetPosition = z.infer<typeof ScreenWidgetPositionSchema>;
export type ScreenWidgetSize = z.infer<typeof ScreenWidgetSizeSchema>;
export type ScreenWidgetStyle = z.infer<typeof ScreenWidgetStyleSchema>;
export type ScreenTemplate = z.infer<typeof ScreenTemplateSchema>;

/** Set after legacy `adScreen.activeMaterialIds` is imported as a default playlist in admin. */
export const SignageConfigSchema = z
  .object({
    /** ISO timestamp when a default playlist was created from `adScreen.activeMaterialIds`. */
    legacyActiveMaterialsImportedAt: z.string().optional()
  })
  .passthrough();

export type SignageConfig = z.infer<typeof SignageConfigSchema>;

/** Optional YYYY-MM-DD (empty/undefined allowed). */
const optionalSignageYmd = z
  .string()
  .optional()
  .refine(
    (s) =>
      s === undefined ||
      s.trim() === '' ||
      /^\d{4}-\d{2}-\d{2}$/.test(s.trim()),
    { message: 'Date must be YYYY-MM-DD' }
  );

export const PlaylistItemInputSchema = z
  .object({
    materialId: z.string(),
    sortOrder: z.number().int().optional(),
    duration: z.number().int().min(0).optional(),
    validFrom: optionalSignageYmd,
    validTo: optionalSignageYmd
  })
  .refine(
    (o) => {
      const a = o.validFrom?.trim();
      const b = o.validTo?.trim();
      if (!a || !b) return true;
      return a <= b;
    },
    { path: ['validTo'], message: 'validTo must be on or after validFrom' }
  );

export const PlaylistSchema = z.object({
  id: z.string().optional(),
  unitId: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
  isDefault: z.boolean().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  items: z.array(PlaylistItemInputSchema).optional()
});

/** Object shape for schedule rows (use this with `.omit()`; full schema has refinements). */
export const PlaylistScheduleObjectSchema = z.object({
  id: z.string().optional(),
  unitId: z.string().optional(),
  playlistId: z.string(),
  daysOfWeek: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  validFrom: optionalSignageYmd,
  validTo: optionalSignageYmd,
  priority: z.number().int().optional(),
  isActive: z.boolean().optional()
});

function refinePlaylistScheduleYmdOrder<
  T extends { validFrom?: string; validTo?: string }
>(o: T) {
  const a = o.validFrom?.trim();
  const b = o.validTo?.trim();
  if (!a || !b) return true;
  return a <= b;
}

export const PlaylistScheduleSchema = PlaylistScheduleObjectSchema.refine(
  refinePlaylistScheduleYmdOrder,
  { path: ['validTo'], message: 'validTo must be on or after validFrom' }
);

/** API body for PATCH schedule (omits `id` / `unitId` from path) — `PlaylistScheduleSchema.omit()` is not allowed after `.refine()`. */
export const PlaylistScheduleUpdateBodySchema =
  PlaylistScheduleObjectSchema.omit({ id: true, unitId: true }).refine(
    refinePlaylistScheduleYmdOrder,
    { path: ['validTo'], message: 'validTo must be on or after validFrom' }
  );

export const ExternalFeedTypeSchema = z.enum(['rss', 'weather', 'custom_url']);
export const ExternalFeedSchema = z.object({
  id: z.string().optional(),
  unitId: z.string().optional(),
  name: z.string(),
  type: z.union([ExternalFeedTypeSchema, z.string()]),
  url: z.string(),
  pollInterval: z.number().int().min(1).optional(),
  isActive: z.boolean().optional(),
  lastError: z.string().optional(),
  consecutiveFailures: z.number().int().min(0).optional(),
  config: z.record(z.string(), z.unknown()).optional()
});

export const ScreenAnnouncementSchema = z.object({
  id: z.string().optional(),
  unitId: z.string().optional(),
  text: z.string(),
  priority: z.number().int().optional(),
  style: z.string().optional(),
  displayMode: z.enum(['banner', 'fullscreen']).optional(),
  startsAt: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  isActive: z.boolean().optional()
});

export type PlaylistItemInput = z.infer<typeof PlaylistItemInputSchema>;

/** Runtime shape for unit `config` JSON (matches {@link UnitConfig}). */
export const UnitConfigSchema = z
  .object({
    adScreen: AdScreenConfigSchema.optional(),
    screenTemplate: ScreenTemplateSchema.optional(),
    signage: SignageConfigSchema.optional(),
    kiosk: KioskConfigSchema.optional(),
    logoUrl: z.string().optional()
  })
  .passthrough();

/** Hydrated on GET unit for kiosk/EOD pipeline; not a DB column. */
export const UnitOperationsPublicSchema = z.object({
  kioskFrozen: z.boolean().optional(),
  counterLoginBlocked: z.boolean().optional(),
  phase: z.string().optional()
});

export const UnitModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  nameEn: z.string().nullable().optional(),
  code: z.string(),
  companyId: z.string(),
  parentId: z.string().nullable().optional(),
  kind: UnitKindSchema.optional().default('subdivision'),
  sortOrder: z.number().int().optional().default(0),
  timezone: z.string(),
  config: UnitConfigSchema.nullable().optional(),
  skillBasedRoutingEnabled: z.boolean().optional().default(false),
  services: z.array(ServiceModelSchema).optional(),
  operations: UnitOperationsPublicSchema.optional()
});

export const ClientVisitTransferEventSchema = z.object({
  at: z.string(),
  transferKind: z.string().optional(),
  fromServiceName: z.string().optional(),
  fromServiceNameRu: z.string().optional(),
  fromServiceNameEn: z.string().optional(),
  toServiceName: z.string().optional(),
  toServiceNameRu: z.string().optional(),
  toServiceNameEn: z.string().optional(),
  fromCounterName: z.string().optional(),
  toCounterName: z.string().optional(),
  fromZoneLabel: z.string().optional(),
  toZoneLabel: z.string().optional()
});

export type ClientVisitTransferEvent = z.infer<
  typeof ClientVisitTransferEventSchema
>;

export const TicketModelSchema = z.object({
  id: z.string(),
  queueNumber: z.string(),
  unitId: z.string(),
  serviceZoneId: z.string().nullable().optional(),
  serviceId: z.string(),
  status: z.string(),
  priority: z.number().nullable().optional(),
  createdAt: z.string().nullable().optional(),
  calledAt: z.string().nullable().optional(),
  confirmedAt: z.string().nullable().optional(),
  maxWaitingTime: z.number().nullable().optional(),
  maxServiceTime: z.number().nullable().optional(),
  operatorComment: z.string().nullable().optional(),
  servedByName: z.string().nullable().optional(),
  transferTrail: z.array(ClientVisitTransferEventSchema).optional(),
  queuePosition: z.number().nullable().optional(),
  estimatedWaitSeconds: z.number().nullable().optional(),
  serviceZoneName: z.string().nullable().optional(),
  smsOptInAvailable: z.boolean().optional(),
  /** True when the unit client for this ticket has a non-empty E.164 phone. */
  visitorPhoneKnown: z.boolean().optional(),
  /** Kiosk: mandatory SMS capture step (consent + phone) before closing the success dialog. */
  smsPostTicketStepRequired: z.boolean().optional(),
  visitorToken: z.string().optional(),
  service: z
    .object({
      id: z.string().optional(),
      name: z.string().optional(),
      nameRu: z.string().nullable().optional(),
      nameEn: z.string().nullable().optional(),
      duration: z.number().nullable().optional()
    })
    .optional(),
  counter: z
    .object({
      id: z.string(),
      name: z.string()
    })
    .nullable()
    .optional(),
  preRegistration: z
    .object({
      id: z.string(),
      customerFirstName: z.string(),
      customerLastName: z.string(),
      customerPhone: z.string(),
      code: z.string(),
      date: z.string(),
      time: z.string(),
      comment: z.string().optional()
    })
    .nullable()
    .optional(),
  client: z
    .object({
      id: z.string(),
      firstName: z.string(),
      lastName: z.string(),
      phoneE164: z.string().nullable().optional(),
      photoUrl: z.string().nullable().optional(),
      isAnonymous: z.boolean().optional(),
      definitions: z
        .array(
          z.object({
            id: z.string(),
            label: z.string(),
            color: z.string(),
            sortOrder: z.number().optional()
          })
        )
        .optional()
    })
    .nullable()
    .optional()
});

export const BookingModelSchema = z.object({
  id: z.string(),
  userName: z.string().nullable().optional(),
  userPhone: z.string().nullable().optional(),
  unitId: z.string(),
  serviceId: z.string(),
  scheduledAt: z.string().nullable().optional(),
  status: z.string(),
  code: z.string(),
  createdAt: z.string().nullable().optional()
});

export const CounterModelSchema = z
  .object({
    id: z.string(),
    unitId: z.string(),
    serviceZoneId: z.string().nullable().optional(),
    name: z.string(),
    assignedTo: z.string().nullable().optional(),
    onBreak: z.boolean().optional(),
    breakStartedAt: z.string().nullable().optional(),
    /** Hydrated operator; backend may send only `id` when name is omitted. */
    assignedUser: z
      .object({
        name: z.string().optional()
      })
      .passthrough()
      .optional()
      .nullable()
  })
  .passthrough();

export const DesktopTerminalKindSchema = z.enum([
  'kiosk',
  'counter_guest_survey',
  'counter_board'
]);

export type DesktopTerminalKind = z.infer<typeof DesktopTerminalKindSchema>;

/**
 * Mirrors backend `models.EffectiveTerminalKind` for API payloads parsed with {@link DesktopTerminalSchema}.
 *
 * **Important:** If `counterId` is non-empty, the result is always `counter_guest_survey` or `counter_board`
 * — never `kiosk`. That includes when the wire payload has `kind: 'kiosk'` together with a counter binding:
 * `effectiveDesktopTerminalKind` coerces that combination to `counter_guest_survey` (invalid kiosk+counter
 * pairs are normalized like the server). The returned `kind` may therefore **not round-trip** as the same
 * string that was sent.
 *
 * For stricter validation (reject `kiosk` + `counterId` instead of coercing), enforce rules at your
 * request/schema boundary before calling this helper.
 */
export function effectiveDesktopTerminalKind(input: {
  kind?: DesktopTerminalKind | undefined;
  counterId?: string | null | undefined;
}): DesktopTerminalKind {
  const hasCounter =
    input.counterId != null && String(input.counterId).trim() !== '';
  const raw = input.kind;
  const k =
    raw === undefined || raw === null ? '' : String(raw).toLowerCase().trim();
  if (!k) {
    return hasCounter ? 'counter_guest_survey' : 'kiosk';
  }
  if (k === 'counter_board') return 'counter_board';
  if (k === 'counter_guest_survey') return 'counter_guest_survey';
  if (hasCounter) return 'counter_guest_survey';
  return 'kiosk';
}

export const DesktopTerminalSchema = z
  .object({
    id: z.string(),
    unitId: z.string(),
    counterId: z.string().nullable().optional(),
    counterName: z.string().optional(),
    kind: DesktopTerminalKindSchema.optional(),
    name: z.string().nullable().optional(),
    defaultLocale: z.string(),
    kioskFullscreen: z.boolean().optional().default(false),
    revokedAt: z.string().nullable().optional(),
    lastSeenAt: z.string().nullable().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
    unitName: z.string().optional()
  })
  .transform((row) => ({
    ...row,
    kind: effectiveDesktopTerminalKind(row)
  }));

export const CreateDesktopTerminalResponseSchema = z.object({
  terminal: DesktopTerminalSchema,
  pairingCode: z.string()
});

// ==========================
// TypeScript Types
// ==========================

export type User = z.infer<typeof UserModelSchema>;
export type Unit = z.infer<typeof UnitModelSchema>;
export type UnitKind = z.infer<typeof UnitKindSchema>;
export type Service = z.infer<typeof ServiceModelSchema>;
export type Ticket = z.infer<typeof TicketModelSchema>;
export type Booking = z.infer<typeof BookingModelSchema>;
export type Counter = z.infer<typeof CounterModelSchema>;
export type DesktopTerminal = z.infer<typeof DesktopTerminalSchema>;

export type Material = {
  id: string;
  type: string;
  url: string;
  filename: string;
  createdAt: string;
};

export type LoginCredentials = {
  email: string;
  password: string;
};

export type LoginResponse = {
  accessToken: string;
};

export interface AdScreenConfig {
  width: number;
  duration: number;
  activeMaterialIds: string[];
  logoUrl?: string;
  isCustomColorsEnabled?: boolean;
  headerColor?: string;
  bodyColor?: string;
  /** Max rows in the "last called" list on the ticket screen; 0 or unset = unlimited. */
  recentCallsHistoryLimit?: number;
}

export interface KioskConfig {
  pin?: string;
  /** Main screen hero headline above the service grid (kiosk home). */
  welcomeTitle?: string;
  /** Main screen hero subline below welcomeTitle. */
  welcomeSubtitle?: string;
  headerText?: string;
  footerText?: string;
  printerConnection?: 'network' | 'system';
  systemPrinterName?: string;
  printerIp?: string;
  printerPort?: string;
  showHeader?: boolean;
  showFooter?: boolean;
  isCustomColorsEnabled?: boolean;
  headerColor?: string;
  bodyColor?: string;
  serviceGridColor?: string;
  /** Logo in the kiosk UI (color is fine). */
  logoUrl?: string;
  /**
   * Optional logo raster for thermal receipts only. Prefer high-contrast black-and-white (PNG, JPEG, BMP, SVG, WebP).
   * When empty, `logoUrl` is used for printing as well.
   */
  printerLogoUrl?: string;
  printerType?: string;
  isPrintEnabled?: boolean;
  feedbackUrl?: string;
  isPreRegistrationEnabled?: boolean;
  /** Show unit title in kiosk header (next to logo). Default true when unset. */
  showUnitInHeader?: boolean;
  /** Custom kiosk header label; when empty, the unit name from the API is shown. */
  kioskUnitLabelText?: string;
  /**
   * Seconds of inactivity on the service selection flow before the session warning dialog. Defaults to 45 if unset.
   */
  sessionIdleBeforeWarningSec?: number;
  /**
   * Countdown in seconds on the warning dialog before returning to the kiosk home. Defaults to 15 if unset.
   */
  sessionIdleCountdownSec?: number;
  /**
   * When false, the kiosk will not require the post-ticket SMS opt-in step. Defaults to true when unset
   * (enforced in the API for `smsPostTicketStepRequired`).
   */
  visitorSmsAfterTicket?: boolean;
}

export interface UnitConfig {
  adScreen?: AdScreenConfig;
  /** When set, `/screen/[unitId]` uses {@link ScreenRenderer} instead of the legacy fixed layout. */
  screenTemplate?: ScreenTemplate;
  /** Digital signage: migration markers and future keys. */
  signage?: SignageConfig;
  kiosk?: KioskConfig;
  logoUrl?: string;
  [key: string]: unknown;
}

export interface PreRegistration {
  id: string;
  unitId: string;
  serviceId: string;
  date: string;
  time: string;
  code: string;
  customerFirstName: string;
  customerLastName: string;
  customerPhone: string;
  comment?: string;
  status: string;
  ticketId?: string;
  createdAt: string;
  externalEventHref?: string;
  externalEventEtag?: string;
  calendarIntegrationId?: string;
  service?: Service;
  ticket?: Ticket;
}

// ==========================
// API Request/Response Types
// ==========================

/** Kiosk visitor locale; must match backend handlers. */
export const kioskVisitorLocaleSchema = z.enum(['en', 'ru']);

/**
 * POST /units/{unitId}/tickets body (unit id is in the path).
 * Branches: anonymous (serviceId only), staff (+ clientId), kiosk (+ visitorPhone + visitorLocale).
 */
export const createTicketRequestSchema = z
  .object({
    serviceId: z.string().min(1),
    clientId: z.string().optional(),
    visitorPhone: z.string().optional(),
    visitorLocale: kioskVisitorLocaleSchema.optional()
  })
  .superRefine((data, ctx) => {
    const cid = (data.clientId ?? '').trim();
    const phone = (data.visitorPhone ?? '').trim();
    const hasClient = cid.length > 0;
    const hasPhone = phone.length > 0;
    const hasLocale = data.visitorLocale !== undefined;

    if (hasClient && hasPhone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'clientId cannot be combined with visitorPhone',
        path: ['clientId']
      });
    }
    if (hasPhone && !hasLocale) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'visitorLocale is required when visitorPhone is set',
        path: ['visitorLocale']
      });
    }
    if (!hasPhone && hasLocale) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'visitorPhone is required when visitorLocale is set',
        path: ['visitorPhone']
      });
    }
  })
  .transform((data) => {
    const serviceId = data.serviceId.trim();
    const cid = (data.clientId ?? '').trim();
    const phone = (data.visitorPhone ?? '').trim();
    const out: {
      serviceId: string;
      clientId?: string;
      visitorPhone?: string;
      visitorLocale?: z.infer<typeof kioskVisitorLocaleSchema>;
    } = { serviceId };
    if (cid) {
      out.clientId = cid;
    }
    if (phone && data.visitorLocale) {
      out.visitorPhone = phone;
      out.visitorLocale = data.visitorLocale;
    }
    return out;
  });

export type CreateTicketRequestInput = z.input<
  typeof createTicketRequestSchema
>;
export type CreateTicketRequest = z.output<typeof createTicketRequestSchema>;

/** Variables for `useCreateTicketInUnit` — mutually exclusive identity branches. */
export type CreateTicketInUnitMutationVariables =
  | {
      unitId: string;
      serviceId: string;
      clientId?: never;
      visitorPhone?: never;
      visitorLocale?: never;
    }
  | {
      unitId: string;
      serviceId: string;
      clientId: string;
      visitorPhone?: never;
      visitorLocale?: never;
    }
  | {
      unitId: string;
      serviceId: string;
      visitorPhone: string;
      visitorLocale: z.infer<typeof kioskVisitorLocaleSchema>;
      clientId?: never;
    };

/** POST /units/{unitId}/call-next — matches backend handlers.CallNextRequest after trim/dedupe. */
export const callNextRequestSchema = z
  .object({
    counterId: z.string().min(1),
    serviceIds: z.array(z.string()).optional(),
    /** @deprecated Prefer serviceIds */
    serviceId: z.string().optional()
  })
  .transform((data) => {
    const counterId = data.counterId.trim();
    let serviceIds = data.serviceIds;
    if (serviceIds?.length) {
      serviceIds = [
        ...new Set(serviceIds.map((s) => s.trim()).filter((s) => s.length > 0))
      ];
    } else {
      serviceIds = undefined;
    }
    const sid = data.serviceId?.trim();
    return {
      counterId,
      ...(serviceIds?.length ? { serviceIds } : {}),
      ...(sid ? { serviceId: sid } : {})
    };
  });

export type CallNextRequest = z.infer<typeof callNextRequestSchema>;

export type CreateBookingRequest = {
  unitId: string;
  serviceId: string;
  userName?: string;
  userPhone?: string;
  scheduledAt?: string;
};

export type CreateServiceRequest = Omit<Service, 'id'>;

export type UpdateServiceRequest = Partial<Service>;

export type TransferTicketRequest = {
  toCounterId?: string;
  toUserId?: string;
};

// ==========================
// SaaS Types (Subscription & Billing)
// ==========================

export const partyTypeSchema = z.enum([
  'legal_entity',
  'sole_proprietor',
  'individual'
]);

const digits10 = /^\d{10}$/;
const digits12 = /^\d{12}$/;
const digits9 = /^\d{9}$/;
const digits13 = /^\d{13}$/;
const digits15 = /^\d{15}$/;

const addressPartSchema = z
  .object({
    unrestricted: z.string().optional(),
    postalCode: z.string().optional(),
    fiasId: z.string().optional()
  })
  .optional();

const ruBic9 = /^\d{9}$/;
const ruAccount20 = /^\d{20}$/;

/**
 * Single RU bank account (JSON item in `companies.payment_accounts`).
 * Kept in sync with Go: `internal/handlers.normalizePaymentAccountsJSON` (BIC / account digit rules, max 30 rows).
 */
export const PaymentAccountSchema = z
  .object({
    id: z.string().optional(),
    bankName: z.string().optional(),
    bic: z.string().optional(),
    correspondentAccount: z.string().optional(),
    accountNumber: z.string().optional(),
    swift: z.string().optional(),
    isDefault: z.boolean().optional()
  })
  .superRefine((row, ctx) => {
    const bic = (row.bic ?? '').trim();
    if (bic && !ruBic9.test(bic)) {
      ctx.addIssue({
        code: 'custom',
        path: ['bic'],
        message: 'BIC must be 9 digits'
      });
    }
    const ks = (row.correspondentAccount ?? '').trim();
    if (ks && !ruAccount20.test(ks)) {
      ctx.addIssue({
        code: 'custom',
        path: ['correspondentAccount'],
        message: 'Correspondent account must be 20 digits'
      });
    }
    const rs = (row.accountNumber ?? '').trim();
    if (rs && !ruAccount20.test(rs)) {
      ctx.addIssue({
        code: 'custom',
        path: ['accountNumber'],
        message: 'Account number must be 20 digits'
      });
    }
  });

export const PaymentAccountsSchema = z
  .array(PaymentAccountSchema)
  .max(30)
  .superRefine((accounts, ctx) => {
    const defaults = accounts.filter((a) => a.isDefault === true);
    if (defaults.length > 1) {
      ctx.addIssue({
        code: 'custom',
        message: 'At most one payment account may be marked as default'
      });
    }
  });

export type PaymentAccount = z.infer<typeof PaymentAccountSchema>;

/** RU counterparty profile (JSON stored in companies.counterparty). */
export const CounterpartySchema = z
  .object({
    schemaVersion: z.number().int().optional(),
    partyType: partyTypeSchema,
    inn: z.string().optional(),
    kpp: z.string().optional(),
    ogrn: z.string().optional(),
    ogrnip: z.string().optional(),
    fullName: z.string().optional(),
    shortName: z.string().optional(),
    passport: z
      .object({
        series: z.string().optional(),
        number: z.string().optional(),
        issuedBy: z.string().optional(),
        issueDate: z.string().optional()
      })
      .optional(),
    addresses: z
      .object({
        legal: addressPartSchema,
        actual: addressPartSchema,
        postal: addressPartSchema
      })
      .optional(),
    phone: z.string().optional(),
    email: z.union([z.string().email(), z.literal('')]).optional(),
    contacts: z
      .array(
        z.object({
          fullName: z.string().optional(),
          position: z.string().optional(),
          phone: z.string().optional(),
          email: z.string().optional()
        })
      )
      .optional(),
    edo: z
      .object({
        operator: z.string().optional(),
        participantId: z.string().optional()
      })
      .optional()
  })
  .superRefine((val, ctx) => {
    const inn = (val.inn ?? '').trim();
    const kpp = (val.kpp ?? '').trim();
    const ogrn = (val.ogrn ?? '').trim();
    const ogrnip = (val.ogrnip ?? '').trim();
    switch (val.partyType) {
      case 'legal_entity':
        if (inn && !digits10.test(inn)) {
          ctx.addIssue({
            code: 'custom',
            path: ['inn'],
            message: 'INN must be 10 digits for legal entity'
          });
        }
        if (kpp && !digits9.test(kpp)) {
          ctx.addIssue({
            code: 'custom',
            path: ['kpp'],
            message: 'KPP must be 9 digits'
          });
        }
        if (ogrnip) {
          ctx.addIssue({
            code: 'custom',
            path: ['ogrnip'],
            message: 'OGRNIP must not be set for legal entity'
          });
        }
        if (ogrn && !digits13.test(ogrn)) {
          ctx.addIssue({
            code: 'custom',
            path: ['ogrn'],
            message: 'OGRN must be 13 digits'
          });
        }
        break;
      case 'sole_proprietor':
        if (inn && !digits12.test(inn)) {
          ctx.addIssue({
            code: 'custom',
            path: ['inn'],
            message: 'INN must be 12 digits for sole proprietor'
          });
        }
        if (kpp) {
          ctx.addIssue({
            code: 'custom',
            path: ['kpp'],
            message: 'KPP must not be set for sole proprietor'
          });
        }
        if (ogrnip && !digits15.test(ogrnip)) {
          ctx.addIssue({
            code: 'custom',
            path: ['ogrnip'],
            message: 'OGRNIP must be 15 digits'
          });
        }
        break;
      case 'individual':
        if (inn && !digits12.test(inn)) {
          ctx.addIssue({
            code: 'custom',
            path: ['inn'],
            message: 'INN must be 12 digits when set'
          });
        }
        if (kpp) {
          ctx.addIssue({
            code: 'custom',
            path: ['kpp'],
            message: 'KPP must not be set for individual'
          });
        }
        if (ogrn || ogrnip) {
          ctx.addIssue({
            code: 'custom',
            path: ['ogrn'],
            message: 'OGRN/OGRNIP must not be set for individual'
          });
        }
        break;
      default:
        break;
    }
  });

export type Counterparty = z.infer<typeof CounterpartySchema>;
export type PartyType = z.infer<typeof partyTypeSchema>;

/**
 * Billing period for subscription plans. API/DB may send empty, null, or legacy
 * spellings; we coerce so nested `subscription.pendingPlan` in company payloads
 * does not break Zod (e.g. after PATCH /platform/companies/:id).
 */
export const subscriptionPlanIntervalSchema = z.preprocess(
  (val) => {
    if (val === null || val === undefined) {
      return 'month';
    }
    const s = String(val).trim().toLowerCase();
    if (s === '' || s === 'month' || s === 'monthly' || s === 'mo') {
      return 'month';
    }
    if (
      s === 'year' ||
      s === 'yearly' ||
      s === 'annual' ||
      s === 'yr' ||
      s === 'y'
    ) {
      return 'year';
    }
    return val;
  },
  z.enum(['month', 'year'], {
    message: 'Invalid subscription plan interval'
  })
);

export const SubscriptionPlanSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    /** English catalog title for EN locale; empty means use `name`. */
    nameEn: z.string().optional().default(''),
    code: z.string(),
    price: z
      .number()
      .describe(
        'Amount in minor currency units (e.g. cents for USD), matching Stripe amounts.'
      ),
    currency: z.string(),
    interval: subscriptionPlanIntervalSchema,
    features: z.record(z.string(), z.boolean()).optional(),
    limits: z.record(z.string(), z.number()).optional(),
    isActive: z.boolean(),
    /** Omitted on older API responses; treat as public catalog visibility. */
    isPublic: z.boolean().optional().default(true),
    displayOrder: z.number().int().optional().default(1000),
    limitsNegotiable: z.record(z.string(), z.boolean()).optional(),
    allowInstantPurchase: z.boolean().optional().default(true),
    /** Single highlighted tier on marketing and in-app plan pickers. */
    isPromoted: z.boolean().optional().default(false),
    /**
     * When true: plan is always free (price=0 by contract).
     * UI shows "Бесплатно" / "Free" instead of "Custom pricing".
     * Semantically distinct from enterprise (also price=0 but not free).
     */
    isFree: z.boolean().optional().default(false),
    /**
     * How the `price` field is interpreted:
     * - "flat"     – fixed price per billing period
     * - "per_unit" – price per active subdivision per billing period
     */
    pricingModel: z.enum(['flat', 'per_unit']).optional().default('flat'),
    /** 1–100: yearly checkout uses list monthly × 12 × (100 − pct) / 100. Mutually exclusive with annualPrepayPricePerMonth. */
    annualPrepayDiscountPercent: z.number().int().min(1).max(100).optional(),
    /** Minor units: effective monthly when billed annually; yearly charge = this × 12. Mutually exclusive with annualPrepayDiscountPercent. */
    annualPrepayPricePerMonth: z.number().int().positive().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional()
  })
  .superRefine((plan, ctx) => {
    if (
      plan.annualPrepayDiscountPercent != null &&
      plan.annualPrepayPricePerMonth != null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['annualPrepayPricePerMonth'],
        message:
          'Cannot set both annualPrepayDiscountPercent and annualPrepayPricePerMonth'
      });
    }
  });

export const SubscriptionSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  planId: z.string(),
  status: z.enum(['trial', 'active', 'past_due', 'canceled', 'paused']),
  currentPeriodStart: z.string(),
  currentPeriodEnd: z.string(),
  cancelAtPeriodEnd: z.boolean(),
  trialEnd: z.string().nullable().optional(),
  pendingPlanId: z.string().nullable().optional(),
  pendingEffectiveAt: z.string().nullable().optional(),
  stripeSubscriptionId: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  plan: SubscriptionPlanSchema.optional(),
  pendingPlan: SubscriptionPlanSchema.optional()
});

/** Tenant-visible SaaS operator fields for invoice payment (GET /invoices/me/vendor). */
export const SaasVendorSchema = z.object({
  name: z.string(),
  billingEmail: z.union([z.string().email(), z.literal('')]).optional(),
  billingAddress: z.record(z.string(), z.any()).optional(),
  paymentAccounts: PaymentAccountsSchema.optional(),
  counterparty: CounterpartySchema.optional()
});

export type SaasVendor = z.infer<typeof SaasVendorSchema>;

/** Matches backend `maxInvoicePaymentTermsRunes` (UTF-8 runes). */
export const invoicePaymentTermsMaxCharacters = 32000;
/** Matches backend line comment limit (UTF-8 runes). */
export const invoiceLineCommentMaxCharacters = 512;

/** SSO access provisioning mode (matches backend `models.SsoAccessSource` / `SsoAccessSourceManual` | `SsoAccessSourceSSOGroups`). */
export const SsoAccessSourceSchema = z.enum(['manual', 'sso_groups']);
export type SsoAccessSource = z.infer<typeof SsoAccessSourceSchema>;

export const CompanySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string().optional(),
  strictPublicTenantResolve: z.boolean().optional(),
  opaqueLoginLinksOnly: z.boolean().optional(),
  ssoJitProvisioning: z.boolean().optional(),
  ownerUserId: z.string().optional(),
  subscriptionId: z.string().nullable().optional(),
  isSaasOperator: z.boolean().optional(),
  /** Default «Условия оплаты» (markdown) for new invoices; SaaS operator company only. */
  invoiceDefaultPaymentTerms: z
    .string()
    .max(invoicePaymentTermsMaxCharacters)
    .nullable()
    .optional(),
  billingEmail: z.union([z.string().email(), z.literal('')]).optional(),
  billingAddress: z.record(z.string(), z.any()).optional(),
  paymentAccounts: PaymentAccountsSchema.optional(),
  counterparty: CounterpartySchema.optional(),
  settings: z.record(z.string(), z.any()).optional(),
  onboardingState: z.record(z.string(), z.any()).optional(),
  /** IdP group mappings drive access when `sso_groups`; otherwise manual tenant RBAC. */
  ssoAccessSource: SsoAccessSourceSchema.optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  subscription: SubscriptionSchema.optional(),
  units: z.array(UnitModelSchema).optional()
});

export const CompanyMeFeaturesSchema = z.object({
  dadata: z.boolean(),
  dadataCleaner: z.boolean()
});

export const CompanyMePlanCapabilitiesSchema = z.object({
  apiAccess: z.boolean(),
  outboundWebhooks: z.boolean(),
  publicQueueWidget: z.boolean(),
  customScreenLayouts: z.boolean().optional(),
  visitorNotifications: z.boolean().optional()
});

export const CompanyMeResponseSchema = z.object({
  company: CompanySchema,
  features: CompanyMeFeaturesSchema,
  /** Subscription-gated integration surfaces (GET /companies/me). */
  planCapabilities: CompanyMePlanCapabilitiesSchema.optional(),
  /** Canonical API origin (matches backend API_PUBLIC_URL). */
  publicApiUrl: z.string().optional(),
  /** Canonical app origin (matches backend PUBLIC_APP_URL / APP_BASE_URL). */
  publicAppUrl: z.string().optional()
});

export const InvoiceLineSchema = z.object({
  id: z.string(),
  invoiceId: z.string(),
  position: z.number(),
  catalogItemId: z.string().nullable().optional(),
  descriptionPrint: z.string(),
  lineComment: z
    .string()
    .max(invoiceLineCommentMaxCharacters)
    .optional()
    .default(''),
  quantity: z.number(),
  unit: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v == null ? '' : v)),
  unitPriceInclVatMinor: z.number(),
  discountPercent: z.number().nullable().optional(),
  discountAmountMinor: z.number().nullable().optional(),
  vatExempt: z.boolean(),
  vatRatePercent: z.number(),
  lineNetMinor: z.number(),
  vatAmountMinor: z.number(),
  lineGrossMinor: z.number(),
  subscriptionPlanId: z.string().nullable().optional(),
  subscriptionPeriodStart: z.string().nullable().optional(),
  subscriptionPeriodEnd: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  plan: SubscriptionPlanSchema.optional()
});

export const CatalogItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  printName: z.string(),
  unit: z.string(),
  article: z.string(),
  defaultPriceMinor: z.number(),
  currency: z.string(),
  vatExempt: z.boolean(),
  vatRatePercent: z.number(),
  subscriptionPlanId: z.string().nullable().optional(),
  isActive: z.boolean(),
  /** CommerceML: Ид номенклатуры в 1С (УНФ), до 128 символов. */
  onecNomenclatureGuid: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  plan: SubscriptionPlanSchema.optional()
});

export const InvoiceSchema = z.object({
  id: z.string(),
  companyId: z.string().nullable().optional(),
  subscriptionId: z.string().nullable().optional(),
  amount: z.number(),
  currency: z.string(),
  status: z.enum(['draft', 'open', 'paid', 'void', 'uncollectible']),
  paymentProvider: z.string().optional(),
  paymentProviderInvoiceId: z.string().optional(),
  paidAt: z.string().nullable().optional(),
  dueDate: z.string(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  subscription: SubscriptionSchema.optional(),
  documentNumber: z.string().nullable().optional(),
  subtotalExclVatMinor: z.number().optional(),
  vatTotalMinor: z.number().optional(),
  allowYookassaPaymentLink: z.boolean().optional(),
  allowStripePaymentLink: z.boolean().optional(),
  provisionSubscriptionsOnPayment: z.boolean().optional(),
  yookassaPaymentId: z.string().optional(),
  yookassaConfirmationUrl: z.string().optional(),
  stripeCheckoutUrl: z.string().optional(),
  stripeSessionId: z.string().optional(),
  provisioningDoneAt: z.string().nullable().optional(),
  issuedAt: z.string().nullable().optional(),
  buyerSnapshot: z
    .union([z.record(z.string(), z.unknown()), z.null()])
    .optional(),
  /** Markdown in admin; PDF renders plain text. */
  paymentTerms: z
    .string()
    .max(invoicePaymentTermsMaxCharacters)
    .nullable()
    .optional(),
  lines: z.array(InvoiceLineSchema).optional()
});

export const UsageMetricSchema = z.object({
  current: z.number(),
  limit: z.number()
});

export const UsageMetricsSchema = z.object({
  currentPeriod: z.object({
    start: z.string(),
    end: z.string()
  }),
  metrics: z
    .object({
      units: UsageMetricSchema.optional(),
      users: UsageMetricSchema.optional(),
      tickets_per_month: UsageMetricSchema.optional(),
      services: UsageMetricSchema.optional(),
      counters: UsageMetricSchema.optional()
    })
    .catchall(UsageMetricSchema) // Allow any other metric keys
});

export type SubscriptionPlan = z.infer<typeof SubscriptionPlanSchema>;
export type Subscription = z.infer<typeof SubscriptionSchema>;
export type Company = z.infer<typeof CompanySchema>;
export type CompanyMeResponse = z.infer<typeof CompanyMeResponseSchema>;
export type Invoice = z.infer<typeof InvoiceSchema>;
export type InvoiceLine = z.infer<typeof InvoiceLineSchema>;
export type CatalogItem = z.infer<typeof CatalogItemSchema>;

/** Platform invoice draft line (matches backend JSON). */
export const InvoiceDraftLineInputSchema = z.object({
  catalogItemId: z.string().nullable().optional(),
  descriptionPrint: z.string(),
  lineComment: z
    .string()
    .max(invoiceLineCommentMaxCharacters)
    .optional()
    .default(''),
  quantity: z.number(),
  unit: z
    .string()
    .optional()
    .describe('Unit of measure for print (e.g. шт, мес.)'),
  unitPriceInclVatMinor: z
    .number()
    .nullable()
    .optional()
    .describe(
      'Omit with catalogItemId to use catalog default; include 0 for a free line.'
    ),
  discountPercent: z.number().nullable().optional(),
  discountAmountMinor: z.number().nullable().optional(),
  vatExempt: z.boolean().nullable().optional(),
  vatRatePercent: z.number().nullable().optional(),
  subscriptionPlanId: z.string().nullable().optional(),
  subscriptionPeriodStart: z.string().nullable().optional()
});

/** Platform invoice draft create / PATCH draft body (matches backend JSON). */
export const InvoiceDraftUpsertBodySchema = z.object({
  companyId: z.string().optional(),
  dueDate: z.string(),
  currency: z.string(),
  allowYookassaPaymentLink: z.boolean(),
  allowStripePaymentLink: z.boolean(),
  provisionSubscriptionsOnPayment: z.boolean(),
  /** Omit on PATCH to keep existing; send empty string to clear. */
  paymentTerms: z.string().max(invoicePaymentTermsMaxCharacters).optional(),
  lines: z.array(InvoiceDraftLineInputSchema)
});

/** POST create draft: `companyId` is required (PATCH draft omits it). */
export const InvoiceDraftCreateBodySchema = InvoiceDraftUpsertBodySchema.extend(
  {
    companyId: z.string().min(1)
  }
);

export type InvoiceDraftLineInput = z.infer<typeof InvoiceDraftLineInputSchema>;
export type InvoiceDraftUpsertBody = z.infer<
  typeof InvoiceDraftUpsertBodySchema
>;
export type InvoiceDraftCreateBody = z.infer<
  typeof InvoiceDraftCreateBodySchema
>;
export type UsageMetric = z.infer<typeof UsageMetricSchema>;
export type UsageMetrics = z.infer<typeof UsageMetricsSchema>;

/** One row from GET .../clients/{clientId}/history */
export const UnitClientHistoryItemSchema = z.object({
  id: z.string(),
  unitId: z.string(),
  unitClientId: z.string(),
  actorUserId: z.string().nullish(),
  actorName: z.string().nullish(),
  action: z.string(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string()
});

export const UnitClientHistoryListResponseSchema = z.object({
  items: z.array(UnitClientHistoryItemSchema),
  nextCursor: z.string().nullish()
});

export type UnitClientHistoryItem = z.infer<typeof UnitClientHistoryItemSchema>;
export type UnitClientHistoryListResponse = z.infer<
  typeof UnitClientHistoryListResponseSchema
>;

// Signup Request
export type SignupRequest = {
  name: string;
  email: string;
  password: string;
  companyName: string;
  planCode?: string;
  billingPeriod?: 'month' | 'annual';
};

export type SignupResponse = {
  accessToken: string;
};
