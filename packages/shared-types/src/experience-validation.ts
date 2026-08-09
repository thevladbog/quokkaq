import { z } from 'zod';
import {
  AccessPolicySchema,
  PageAccessPolicySchema
} from './experience-condition';
import {
  ExperienceTemplateSchema,
  type ExperienceTemplate,
  type ExperienceWidget
} from './experience-template';
import { KioskIdentificationModeSchema } from './kiosk-service-identification';

export type ExperienceValidationErrorCode =
  | 'schema.invalid'
  | 'page.start_missing'
  | 'page.unreachable'
  | 'action.target_missing'
  | 'widget.unsupported_for_surface'
  | 'variant.unplaced_widget'
  | 'variant.placement_overflow'
  | 'variant.placement_overlap'
  | 'flow.required_page_missing'
  | 'condition.invalid'
  | 'touch.target_too_small'
  | 'station.page_scroll_required';

export type ExperienceValidationWarningCode =
  | 'page.unreferenced'
  | 'variant.typography_scaled'
  | 'display.primary_text_small'
  | 'theme.legacy_contrast_unknown';

export type ExperienceValidationIssueCode =
  | ExperienceValidationErrorCode
  | ExperienceValidationWarningCode;

export type ExperienceValidationPath = readonly (string | number)[];

/**
 * `details` contains only structural editor data (pixel bounds and constraints),
 * never template content, service names, identity data, or other visitor data.
 */
export type ExperienceValidationIssue = {
  code: ExperienceValidationIssueCode;
  path: ExperienceValidationPath;
  details?: Readonly<Record<string, string | number | boolean>>;
};

export type ExperienceValidationReport = {
  errors: ExperienceValidationIssue[];
  warnings: ExperienceValidationIssue[];
  canPublish: boolean;
};

type IssueCollector = {
  add: (
    code: ExperienceValidationIssueCode,
    path: ExperienceValidationPath,
    details?: Readonly<Record<string, string | number | boolean>>
  ) => void;
  entries: () => ExperienceValidationIssue[];
};

type LegacyRouteSlot =
  | 'service-info'
  | 'service-form'
  | 'identity'
  | 'confirmation'
  | 'success';

const LEGACY_ROUTE_SLOTS: readonly LegacyRouteSlot[] = [
  'service-info',
  'service-form',
  'identity',
  'confirmation',
  'success'
];

const LegacyRouteSlotSchema = z.enum(LEGACY_ROUTE_SLOTS);
const LegacyTerminalActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('submit-ticket') }).strict(),
  z.object({ type: z.literal('redeem-pre-registration') }).strict()
]);
const LegacyServiceRouteSchema = z
  .object({
    serviceId: z.string().min(1),
    identificationMode: KioskIdentificationModeSchema,
    slots: z.array(LegacyRouteSlotSchema).min(1),
    terminalActions: z.array(LegacyTerminalActionSchema).length(1)
  })
  .strict();
const LegacyRoutingMetadataSchema = z
  .object({
    source: z.literal('legacy-service-routes'),
    canonicalSlots: z
      .array(LegacyRouteSlotSchema)
      .length(LEGACY_ROUTE_SLOTS.length),
    routes: z.array(LegacyServiceRouteSchema)
  })
  .strict();

const FLOW_PAGE_FOR_SLOT = {
  'service-info': 'serviceInfoPageId',
  'service-form': 'serviceFormPageId',
  identity: 'identityPageId',
  appointment: 'appointmentPageId',
  confirmation: 'confirmationPageId',
  success: 'successPageId'
} as const;

type FlowSlot = keyof typeof FLOW_PAGE_FOR_SLOT;
type FlowPageKey =
  | 'serviceCatalogPageId'
  | (typeof FLOW_PAGE_FOR_SLOT)[FlowSlot];

const DISPLAY_BLOCKED_WIDGET_TYPES = new Set([
  'service-picker',
  'ticket-form',
  'identify',
  'ticket-success'
]);

const EXPERIENCE_SURFACES = new Set([
  'ticket-station',
  'queue-display',
  'counter-display',
  'visitor-mobile'
]);

const VISITOR_MOBILE_WIDGET_TYPES = new Set([
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

const INTERACTIVE_WIDGET_TYPES = new Set([
  'service-picker',
  'rich-info',
  'ticket-form',
  'identify',
  'language-switch',
  'ticket-success'
]);

const PRIMARY_DISPLAY_WIDGET_TYPES = new Set([
  'called-tickets',
  'queue-stats',
  'eta-display',
  'queue-ticker'
]);

const MINIMUM_TOUCH_TARGET_PX = 56;

function isPlainOwnRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function issueKey(issue: ExperienceValidationIssue): string {
  return JSON.stringify([issue.code, issue.path, issue.details ?? null]);
}

function comparePaths(
  left: ExperienceValidationPath,
  right: ExperienceValidationPath
): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index++) {
    const leftSegment = String(left[index]);
    const rightSegment = String(right[index]);
    if (leftSegment < rightSegment) return -1;
    if (leftSegment > rightSegment) return 1;
  }
  return left.length - right.length;
}

function compareIssues(
  left: ExperienceValidationIssue,
  right: ExperienceValidationIssue
): number {
  const pathComparison = comparePaths(left.path, right.path);
  if (pathComparison !== 0) return pathComparison;
  if (left.code < right.code) return -1;
  if (left.code > right.code) return 1;
  return issueKey(left).localeCompare(issueKey(right));
}

function createIssueCollector(): IssueCollector {
  const issues: ExperienceValidationIssue[] = [];
  const seen = new Set<string>();

  return {
    add(code, path, details) {
      const issue: ExperienceValidationIssue = details
        ? { code, path: [...path], details: { ...details } }
        : { code, path: [...path] };
      const key = issueKey(issue);
      if (!seen.has(key)) {
        seen.add(key);
        issues.push(issue);
      }
    },
    entries() {
      return [...issues].sort(compareIssues);
    }
  };
}

function reportFromCollectors(
  errors: IssueCollector,
  warnings: IssueCollector
): ExperienceValidationReport {
  const errorEntries = errors.entries();
  return {
    errors: errorEntries,
    warnings: warnings.entries(),
    canPublish: errorEntries.length === 0
  };
}

function containsAccessPath(path: readonly (string | number)[]): number {
  return path.lastIndexOf('access');
}

function conditionPath(
  path: readonly (string | number)[]
): ExperienceValidationPath {
  const accessIndex = containsAccessPath(path);
  if (accessIndex < 0) return [...path];
  return [...path.slice(0, accessIndex + 1), 'when'];
}

function mapSchemaIssue(issue: {
  path: readonly PropertyKey[];
  message: string;
}): ExperienceValidationIssue | undefined {
  const path = issue.path.filter(
    (segment): segment is string | number =>
      typeof segment === 'string' || typeof segment === 'number'
  );
  const accessIndex = containsAccessPath(path);
  if (accessIndex >= 0) {
    return { code: 'condition.invalid', path: conditionPath(path) };
  }
  if (issue.message === 'Start page must exist') {
    return { code: 'page.start_missing', path };
  }
  if (issue.message === 'Navigation target page must exist') {
    return { code: 'action.target_missing', path };
  }
  if (issue.message === 'Page layout must place every widget') {
    return { code: 'variant.unplaced_widget', path };
  }
  if (issue.message === 'Page layout must exist for every variant') {
    return { code: 'variant.unplaced_widget', path };
  }
  if (issue.message === 'Placement exceeds variant grid') {
    return { code: 'variant.placement_overflow', path };
  }
  if (issue.message === 'Placements overlap in variant grid') {
    return { code: 'variant.placement_overlap', path };
  }
  if (issue.message === 'Flow page must exist') {
    return { code: 'flow.required_page_missing', path };
  }
  return undefined;
}

function widgetSupportsSurface(
  surface: string,
  type: string,
  actions: unknown
): boolean {
  if (type === 'custom-html') return false;

  if (surface === 'queue-display' || surface === 'counter-display') {
    if (DISPLAY_BLOCKED_WIDGET_TYPES.has(type)) return false;
    return (
      !Array.isArray(actions) ||
      actions.every(
        (action) =>
          !isPlainOwnRecord(action) ||
          (action.type !== 'submit-ticket' &&
            action.type !== 'print-ticket' &&
            action.type !== 'set-session' &&
            action.type !== 'reset-session')
      )
    );
  }

  if (surface === 'visitor-mobile') {
    if (!VISITOR_MOBILE_WIDGET_TYPES.has(type)) return false;
    return (
      !Array.isArray(actions) ||
      actions.every(
        (action) => !isPlainOwnRecord(action) || action.type !== 'print-ticket'
      )
    );
  }

  return surface === 'ticket-station';
}

function scanRawCondition(
  access: unknown,
  schema: typeof AccessPolicySchema | typeof PageAccessPolicySchema,
  path: ExperienceValidationPath,
  errors: IssueCollector
): void {
  if (access === undefined || schema.safeParse(access).success) return;
  const issuePath =
    isPlainOwnRecord(access) && hasOwn(access, 'when')
      ? [...path, 'when']
      : path;
  errors.add('condition.invalid', issuePath);
}

function scanRawSurfaceAndConditions(
  input: unknown,
  errors: IssueCollector
): void {
  if (!isPlainOwnRecord(input) || !Array.isArray(input.pages)) return;
  const surface = typeof input.surface === 'string' ? input.surface : undefined;

  input.pages.forEach((rawPage, pageIndex) => {
    if (!isPlainOwnRecord(rawPage)) return;
    const pagePath: ExperienceValidationPath = ['pages', pageIndex];
    scanRawCondition(
      rawPage.access,
      PageAccessPolicySchema,
      [...pagePath, 'access'],
      errors
    );
    if (!Array.isArray(rawPage.widgets)) return;

    rawPage.widgets.forEach((rawWidget, widgetIndex) => {
      if (!isPlainOwnRecord(rawWidget)) return;
      const widgetPath: ExperienceValidationPath = [
        ...pagePath,
        'widgets',
        widgetIndex
      ];
      scanRawCondition(
        rawWidget.access,
        AccessPolicySchema,
        [...widgetPath, 'access'],
        errors
      );
      if (
        surface !== undefined &&
        EXPERIENCE_SURFACES.has(surface) &&
        typeof rawWidget.type === 'string' &&
        !widgetSupportsSurface(surface, rawWidget.type, rawWidget.actions)
      ) {
        errors.add('widget.unsupported_for_surface', widgetPath);
      }
    });
  });
}

function requiredFlowPageForWidget(
  widget: ExperienceWidget
): FlowSlot | undefined {
  switch (widget.type) {
    case 'service-picker':
      return undefined;
    case 'ticket-form':
      return isPlainOwnRecord(widget.config) &&
        widget.config.mode === 'appointment-checkin'
        ? 'appointment'
        : 'service-form';
    case 'identify':
      return 'identity';
    case 'ticket-success':
      return 'success';
    case 'rich-info': {
      const slot = isPlainOwnRecord(widget.config)
        ? widget.config.slot
        : undefined;
      return typeof slot === 'string' && slot in FLOW_PAGE_FOR_SLOT
        ? (slot as FlowSlot)
        : undefined;
    }
    default:
      return undefined;
  }
}

function hasCanonicalLegacyRouteSlots(
  slots: readonly LegacyRouteSlot[]
): boolean {
  let previousCanonicalIndex = -1;
  for (const slot of slots) {
    const canonicalIndex = LEGACY_ROUTE_SLOTS.indexOf(slot);
    if (canonicalIndex <= previousCanonicalIndex) return false;
    previousCanonicalIndex = canonicalIndex;
  }
  return slots.includes('success');
}

type LegacyRouting = z.infer<typeof LegacyRoutingMetadataSchema>;

function parseLegacyRouting(
  widget: ExperienceWidget
): LegacyRouting | undefined | null {
  if (
    !isPlainOwnRecord(widget.config) ||
    !hasOwn(widget.config, 'legacyRouting')
  ) {
    return undefined;
  }
  const parsed = LegacyRoutingMetadataSchema.safeParse(
    widget.config.legacyRouting
  );
  if (!parsed.success) return null;
  if (
    !parsed.data.canonicalSlots.every(
      (slot, index) => slot === LEGACY_ROUTE_SLOTS[index]
    )
  ) {
    return null;
  }
  for (const route of parsed.data.routes) {
    if (!hasCanonicalLegacyRouteSlots(route.slots)) return null;
    const terminalAction = route.terminalActions[0]!;
    if (
      (route.identificationMode === 'qr' &&
        terminalAction.type !== 'redeem-pre-registration') ||
      (route.identificationMode !== 'qr' &&
        terminalAction.type !== 'submit-ticket')
    ) {
      return null;
    }
  }
  return parsed.data;
}

type FlowValidation = {
  legacyRoutes: Array<{ pageId: string; routing: LegacyRouting }>;
};

function validateFlowPages(
  template: ExperienceTemplate,
  errors: IssueCollector
): FlowValidation {
  const required = new Set<FlowPageKey>();
  const legacyRoutes: FlowValidation['legacyRoutes'] = [];

  for (const [pageIndex, currentPage] of template.pages.entries()) {
    for (const [widgetIndex, currentWidget] of currentPage.widgets.entries()) {
      if (currentWidget.type === 'service-picker') {
        required.add('serviceCatalogPageId');
      }
      const requiredSlot = requiredFlowPageForWidget(currentWidget);
      if (requiredSlot !== undefined) {
        required.add(FLOW_PAGE_FOR_SLOT[requiredSlot]);
      }

      const routing = parseLegacyRouting(currentWidget);
      if (routing === null) {
        errors.add('schema.invalid', [
          'pages',
          pageIndex,
          'widgets',
          widgetIndex,
          'config',
          'legacyRouting'
        ]);
        continue;
      }
      if (routing !== undefined) {
        for (const route of routing.routes) {
          for (const slot of route.slots) {
            required.add(FLOW_PAGE_FOR_SLOT[slot]);
          }
        }
        legacyRoutes.push({ pageId: currentPage.id, routing });
      }
    }
  }

  for (const flowPageKey of required) {
    if (template.flowPages?.[flowPageKey] === undefined) {
      errors.add('flow.required_page_missing', ['flowPages', flowPageKey]);
    }
  }

  return { legacyRoutes };
}

function validateGraph(
  template: ExperienceTemplate,
  flowValidation: FlowValidation,
  errors: IssueCollector,
  warnings: IssueCollector
): void {
  const pagesById = new Map(template.pages.map((page) => [page.id, page]));
  const adjacency = new Map<string, Set<string>>(
    template.pages.map((page) => [page.id, new Set<string>()])
  );
  const incoming = new Map<string, number>(
    template.pages.map((page) => [page.id, 0])
  );

  function addEdge(fromPageId: string, toPageId: string): void {
    const targets = adjacency.get(fromPageId);
    if (!targets || !pagesById.has(toPageId) || targets.has(toPageId)) return;
    targets.add(toPageId);
    incoming.set(toPageId, (incoming.get(toPageId) ?? 0) + 1);
  }

  for (const currentPage of template.pages) {
    for (const currentWidget of currentPage.widgets) {
      for (const action of currentWidget.actions) {
        if (action.type === 'navigate') {
          addEdge(currentPage.id, action.toPageId);
        }
      }
    }
  }

  for (const { pageId, routing } of flowValidation.legacyRoutes) {
    for (const route of routing.routes) {
      const routePageIds = [
        pageId,
        ...route.slots
          .map((slot) => template.flowPages?.[FLOW_PAGE_FOR_SLOT[slot]])
          .filter(
            (flowPageId): flowPageId is string => flowPageId !== undefined
          )
      ];
      for (let index = 0; index < routePageIds.length - 1; index++) {
        addEdge(routePageIds[index]!, routePageIds[index + 1]!);
      }
    }
  }

  const reachable = new Set<string>();
  const queue = [template.startPageId];
  while (queue.length > 0) {
    const pageId = queue.shift()!;
    if (reachable.has(pageId)) continue;
    reachable.add(pageId);
    for (const targetPageId of adjacency.get(pageId) ?? []) {
      if (!reachable.has(targetPageId)) queue.push(targetPageId);
    }
  }

  for (const [pageIndex, currentPage] of template.pages.entries()) {
    const pagePath: ExperienceValidationPath = ['pages', pageIndex];
    // Reachability is a publish blocker. Missing inbound references are a
    // non-blocking authoring hint and can intentionally coexist with it.
    if (!reachable.has(currentPage.id)) {
      errors.add('page.unreachable', pagePath);
    }
    if (
      currentPage.id !== template.startPageId &&
      (incoming.get(currentPage.id) ?? 0) === 0
    ) {
      warnings.add('page.unreferenced', pagePath);
    }
  }
}

function isInteractiveWidget(widget: ExperienceWidget): boolean {
  return INTERACTIVE_WIDGET_TYPES.has(widget.type) || widget.actions.length > 0;
}

function scrollRequiringManualPlacementIndex(
  widget: ExperienceWidget
): number | undefined {
  if (!isPlainOwnRecord(widget.config)) return undefined;
  const presentation = widget.config.presentation;
  if (!isPlainOwnRecord(presentation) || presentation.mode !== 'manual') {
    return undefined;
  }
  const pagination = widget.config.pagination;
  if (isPlainOwnRecord(pagination) && pagination.enabled === true) {
    return undefined;
  }
  const grid = presentation.grid;
  const gridRows = isPlainOwnRecord(grid) ? grid.rows : undefined;
  const gridColumns = isPlainOwnRecord(grid) ? grid.columns : undefined;
  if (
    !isPlainOwnRecord(grid) ||
    typeof gridRows !== 'number' ||
    typeof gridColumns !== 'number' ||
    !Number.isInteger(gridRows) ||
    !Number.isInteger(gridColumns) ||
    gridRows < 1 ||
    gridColumns < 1 ||
    !Array.isArray(presentation.placements)
  ) {
    return undefined;
  }

  const overflowingPlacementIndex = presentation.placements.findIndex(
    (placement) => {
      if (!isPlainOwnRecord(placement)) return false;
      const { row, col, rowSpan, colSpan } = placement;
      return (
        typeof row === 'number' &&
        typeof col === 'number' &&
        typeof rowSpan === 'number' &&
        typeof colSpan === 'number' &&
        Number.isInteger(row) &&
        Number.isInteger(col) &&
        Number.isInteger(rowSpan) &&
        Number.isInteger(colSpan) &&
        row >= 0 &&
        col >= 0 &&
        rowSpan >= 1 &&
        colSpan >= 1 &&
        (row + rowSpan > gridRows || col + colSpan > gridColumns)
      );
    }
  );
  return overflowingPlacementIndex >= 0 ? overflowingPlacementIndex : undefined;
}

function validateLayouts(
  template: ExperienceTemplate,
  errors: IssueCollector,
  warnings: IssueCollector
): void {
  for (const [pageIndex, currentPage] of template.pages.entries()) {
    for (const currentVariant of template.variants) {
      const layout = currentPage.layouts[currentVariant.id]!;
      const typographyPath: ExperienceValidationPath = [
        'pages',
        pageIndex,
        'layouts',
        currentVariant.id,
        'typographyScale'
      ];
      if (
        layout.typographyScale !== undefined &&
        layout.typographyScale !== 1
      ) {
        warnings.add('variant.typography_scaled', typographyPath);
      }

      const availableWidth =
        currentVariant.profile.width -
        currentVariant.profile.safeArea.left -
        currentVariant.profile.safeArea.right;
      const availableHeight =
        currentVariant.profile.height -
        currentVariant.profile.safeArea.top -
        currentVariant.profile.safeArea.bottom;

      for (const [
        widgetIndex,
        currentWidget
      ] of currentPage.widgets.entries()) {
        const placement = layout.placements[currentWidget.id]!;
        const placementPath: ExperienceValidationPath = [
          'pages',
          pageIndex,
          'layouts',
          currentVariant.id,
          'placements',
          currentWidget.id
        ];
        const width = Math.floor(
          (availableWidth / currentVariant.grid.columns) * placement.colSpan
        );
        const height = Math.floor(
          (availableHeight / currentVariant.grid.rows) * placement.rowSpan
        );
        if (
          currentVariant.profile.interactionMode === 'touch' &&
          isInteractiveWidget(currentWidget) &&
          (width < MINIMUM_TOUCH_TARGET_PX || height < MINIMUM_TOUCH_TARGET_PX)
        ) {
          errors.add('touch.target_too_small', placementPath, {
            minimum: MINIMUM_TOUCH_TARGET_PX,
            width,
            height
          });
        }

        if (
          (template.surface === 'queue-display' ||
            template.surface === 'counter-display') &&
          PRIMARY_DISPLAY_WIDGET_TYPES.has(currentWidget.type) &&
          (layout.typographyScale ?? 1) < 1
        ) {
          warnings.add('display.primary_text_small', typographyPath);
        }

        if (template.surface === 'ticket-station') {
          const placementIndex =
            scrollRequiringManualPlacementIndex(currentWidget);
          if (placementIndex !== undefined) {
            errors.add('station.page_scroll_required', [
              'pages',
              pageIndex,
              'widgets',
              widgetIndex,
              'config',
              'presentation',
              'placements',
              placementIndex
            ]);
          }
        }
      }
    }
  }

  if (template.theme?.preset === 'legacy-kiosk') {
    warnings.add('theme.legacy_contrast_unknown', ['theme']);
  }
}

function validateParsedTemplate(
  template: ExperienceTemplate,
  errors: IssueCollector,
  warnings: IssueCollector
): void {
  for (const [pageIndex, currentPage] of template.pages.entries()) {
    for (const [widgetIndex, currentWidget] of currentPage.widgets.entries()) {
      if (
        !widgetSupportsSurface(
          template.surface,
          currentWidget.type,
          currentWidget.actions
        )
      ) {
        errors.add('widget.unsupported_for_surface', [
          'pages',
          pageIndex,
          'widgets',
          widgetIndex
        ]);
      }
    }
  }

  const flowValidation = validateFlowPages(template, errors);
  validateGraph(template, flowValidation, errors, warnings);
  validateLayouts(template, errors, warnings);
}

/**
 * Validates a draft definition before it can be published. Runtime-owned stale
 * data and emergency overlays are intentional invariants of the renderer, so
 * templates never need to declare (or be checked for) synthetic overlay widgets.
 */
export function validateExperienceForPublish(
  template: unknown
): ExperienceValidationReport {
  const errors = createIssueCollector();
  const warnings = createIssueCollector();

  try {
    const parsed = ExperienceTemplateSchema.safeParse(template);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const mapped = mapSchemaIssue(issue);
        if (mapped !== undefined) {
          errors.add(mapped.code, mapped.path, mapped.details);
        }
      }
      scanRawSurfaceAndConditions(template, errors);
      if (errors.entries().length === 0) {
        errors.add('schema.invalid', []);
      }
      return reportFromCollectors(errors, warnings);
    }

    validateParsedTemplate(parsed.data, errors, warnings);
    return reportFromCollectors(errors, warnings);
  } catch {
    return {
      errors: [{ code: 'schema.invalid', path: [] }],
      warnings: [],
      canPublish: false
    };
  }
}
