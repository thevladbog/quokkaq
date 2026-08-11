import { z } from 'zod';
import {
  AccessPolicySchema,
  PageAccessPolicySchema
} from './experience-condition';
import {
  ExperienceTemplateSchema,
  EXPERIENCE_TEMPLATE_LIMITS,
  type ExperienceTemplate,
  type ExperienceWidget
} from './experience-template';
import { LegacyAttractCompatibilitySchema } from './experience-runtime';
import { KioskIdentificationModeSchema } from './kiosk-service-identification';
import { experienceWidgetSupportsSurface } from './experience-capabilities';

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

/** Each severity is capped independently so errors never hide authoring hints. */
export const EXPERIENCE_VALIDATION_MAX_ISSUES_PER_SEVERITY = 200;

type IssueCollector = {
  add: (
    code: ExperienceValidationIssueCode,
    path: ExperienceValidationPath,
    details?: Readonly<Record<string, string | number | boolean>>
  ) => void;
  entries: () => ExperienceValidationIssue[];
  isFull: () => boolean;
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

const RuntimeAttractConfigSchema = z
  .object({
    source: z.literal('legacy-kiosk-attract'),
    compatibility: LegacyAttractCompatibilitySchema
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

const EXPERIENCE_SURFACES = new Set([
  'ticket-station',
  'queue-display',
  'counter-display',
  'visitor-mobile'
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
      if (
        !seen.has(key) &&
        issues.length < EXPERIENCE_VALIDATION_MAX_ISSUES_PER_SEVERITY
      ) {
        seen.add(key);
        issues.push(issue);
      }
    },
    entries() {
      return [...issues].sort(compareIssues);
    },
    isFull() {
      return issues.length >= EXPERIENCE_VALIDATION_MAX_ISSUES_PER_SEVERITY;
    }
  };
}

function reportFromCollectors(
  errors: IssueCollector,
  warnings: IssueCollector,
  hasBlockingPreflight = false
): ExperienceValidationReport {
  const errorEntries = errors.entries();
  return {
    errors: errorEntries,
    warnings: warnings.entries(),
    canPublish: !hasBlockingPreflight && errorEntries.length === 0
  };
}

function conditionPathFromSchemaPath(
  path: readonly (string | number)[]
): ExperienceValidationPath | undefined {
  const isPageAccess =
    path.length >= 3 &&
    path[0] === 'pages' &&
    typeof path[1] === 'number' &&
    path[2] === 'access';
  const isWidgetAccess =
    path.length >= 5 &&
    path[0] === 'pages' &&
    typeof path[1] === 'number' &&
    path[2] === 'widgets' &&
    typeof path[3] === 'number' &&
    path[4] === 'access';
  if (!isPageAccess && !isWidgetAccess) return undefined;

  const accessIndex = isPageAccess ? 2 : 4;
  return path[accessIndex + 1] === 'when'
    ? [...path.slice(0, accessIndex + 2)]
    : [...path.slice(0, accessIndex + 1), 'when'];
}

function mapSchemaIssue(issue: {
  path: readonly PropertyKey[];
  message: string;
}): ExperienceValidationIssue {
  const path = issue.path.filter(
    (segment): segment is string | number =>
      typeof segment === 'string' || typeof segment === 'number'
  );
  const conditionPath = conditionPathFromSchemaPath(path);
  if (conditionPath !== undefined) {
    return { code: 'condition.invalid', path: conditionPath };
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
  return { code: 'schema.invalid', path };
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
        !experienceWidgetSupportsSurface(
          surface as ExperienceTemplate['surface'],
          rawWidget.type,
          rawWidget.actions
        )
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
  if (widget.type !== 'service-picker') return null;
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
  const serviceIds = new Set<string>();
  for (const route of parsed.data.routes) {
    if (
      serviceIds.has(route.serviceId) ||
      !hasCanonicalLegacyRouteSlots(route.slots) ||
      (route.identificationMode !== 'none' && !route.slots.includes('identity'))
    ) {
      return null;
    }
    serviceIds.add(route.serviceId);
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

  function isRuntimeAttractPage(page: ExperienceTemplate['pages'][number]) {
    if (
      template.surface !== 'ticket-station' ||
      page.id !== 'attract' ||
      page.name !== 'Attract' ||
      page.access !== undefined ||
      page.widgets.length !== 1
    ) {
      return false;
    }
    const currentWidget = page.widgets[0]!;
    const attractConfig = RuntimeAttractConfigSchema.safeParse(
      currentWidget.config
    );
    return (
      currentWidget.id === 'attract-media' &&
      currentWidget.type === 'media' &&
      currentWidget.tone === undefined &&
      currentWidget.access === undefined &&
      currentWidget.actions.length === 0 &&
      attractConfig.success &&
      attractConfig.data.compatibility.mode !== 'off'
    );
  }

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
  for (const currentPage of template.pages) {
    if (isRuntimeAttractPage(currentPage)) {
      reachable.add(currentPage.id);
      incoming.set(currentPage.id, 1);
    }
  }
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

const ServicePickerGridSchema = z
  .object({
    rows: z.number().int().min(1).max(48),
    columns: z.number().int().min(1).max(48)
  })
  .strict();

const ServicePickerPresentationSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('auto'), grid: ServicePickerGridSchema }).strict(),
  z
    .object({
      mode: z.literal('manual'),
      grid: ServicePickerGridSchema,
      coordinateBase: z.enum(['zero-based', 'one-based']),
      placements: z.array(
        z
          .object({
            serviceId: z.string().min(1),
            row: z.number().int(),
            col: z.number().int(),
            rowSpan: z.number().int().min(1),
            colSpan: z.number().int().min(1)
          })
          .strict()
      )
    })
    .strict()
]);

const ServicePickerScrollConfigSchema = z
  .object({
    catalog: z
      .object({
        navigation: z.enum(['flat', 'categories']),
        rootCategoryIds: z.array(z.string()).optional(),
        itemCount: z.number().int().min(0).optional()
      })
      .strict()
      .optional(),
    presentation: ServicePickerPresentationSchema,
    pagination: z
      .object({
        enabled: z.boolean(),
        pageSize: z.number().int().min(1).optional(),
        threshold: z.number().int().min(1).optional()
      })
      .strict()
      .optional()
  })
  .passthrough();

function stationScrollRequiredPath(
  widget: ExperienceWidget
): ExperienceValidationPath | undefined {
  if (widget.type !== 'service-picker') return undefined;
  const parsed = ServicePickerScrollConfigSchema.safeParse(widget.config);
  if (!parsed.success) return undefined;

  const { presentation } = parsed.data;
  const capacity = presentation.grid.rows * presentation.grid.columns;
  if (presentation.mode === 'manual') {
    const coordinateMinimum =
      presentation.coordinateBase === 'zero-based' ? 0 : 1;
    const overflowingPlacementIndex = presentation.placements.findIndex(
      (placement) => {
        const row = placement.row - coordinateMinimum;
        const col = placement.col - coordinateMinimum;
        return (
          row < 0 ||
          col < 0 ||
          row + placement.rowSpan > presentation.grid.rows ||
          col + placement.colSpan > presentation.grid.columns
        );
      }
    );
    return overflowingPlacementIndex >= 0
      ? ['presentation', 'placements', overflowingPlacementIndex]
      : undefined;
  }

  const pagination = parsed.data.pagination;
  if (pagination?.enabled === true) {
    return pagination.pageSize === undefined || pagination.pageSize > capacity
      ? ['pagination', 'pageSize']
      : undefined;
  }
  const catalog = parsed.data.catalog;
  if (
    catalog?.itemCount !== undefined &&
    catalog.itemCount > capacity &&
    catalog.navigation !== 'categories'
  ) {
    return ['catalog', 'itemCount'];
  }
  return undefined;
}

function validateLayouts(
  template: ExperienceTemplate,
  errors: IssueCollector,
  warnings: IssueCollector
): void {
  for (const [pageIndex, currentPage] of template.pages.entries()) {
    if (errors.isFull()) return;
    for (const currentVariant of template.variants) {
      if (errors.isFull()) return;
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
        if (errors.isFull()) return;
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
      }
    }

    if (template.surface === 'ticket-station') {
      for (const [
        widgetIndex,
        currentWidget
      ] of currentPage.widgets.entries()) {
        if (errors.isFull()) return;
        const scrollPath = stationScrollRequiredPath(currentWidget);
        if (scrollPath !== undefined) {
          errors.add('station.page_scroll_required', [
            'pages',
            pageIndex,
            'widgets',
            widgetIndex,
            'config',
            ...scrollPath
          ]);
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
    if (errors.isFull()) return;
    for (const [widgetIndex, currentWidget] of currentPage.widgets.entries()) {
      if (errors.isFull()) return;
      if (
        !experienceWidgetSupportsSurface(
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

  if (errors.isFull()) return;
  const flowValidation = validateFlowPages(template, errors);
  if (errors.isFull()) return;
  validateGraph(template, flowValidation, errors, warnings);
  if (errors.isFull()) return;
  validateLayouts(template, errors, warnings);
}

function rawAccessExceedsConditionLimit(access: unknown): boolean {
  if (!isPlainOwnRecord(access) || !isPlainOwnRecord(access.when)) {
    return false;
  }
  let nodes = 0;
  let node: unknown = access.when;
  const parents: Array<{ children: unknown[]; nextIndex: number }> = [];
  while (node !== undefined) {
    nodes += 1;
    if (nodes > EXPERIENCE_TEMPLATE_LIMITS.maxConditionNodes) return true;
    if (
      isPlainOwnRecord(node) &&
      node.kind === 'group' &&
      Array.isArray(node.children)
    ) {
      parents.push({ children: node.children, nextIndex: 0 });
    }

    node = undefined;
    while (parents.length > 0 && node === undefined) {
      const parent = parents[parents.length - 1]!;
      if (parent.nextIndex < parent.children.length) {
        node = parent.children[parent.nextIndex++];
      } else {
        parents.pop();
      }
    }
  }
  return false;
}

function rawPlacementsExceedLimit(placements: unknown): boolean {
  if (!isPlainOwnRecord(placements)) return false;
  try {
    let count = 0;
    for (const key in placements) {
      if (!hasOwn(placements, key)) continue;
      count += 1;
      if (count > EXPERIENCE_TEMPLATE_LIMITS.maxWidgetsPerPage) return true;
    }
    return false;
  } catch {
    return true;
  }
}

function addResourceLimitIssue(
  errors: IssueCollector,
  path: ExperienceValidationPath,
  limit: number
): void {
  errors.add('schema.invalid', path, { limit });
}

/**
 * Bounds are checked before Zod walks unknown input. This keeps pathological
 * draft payloads from allocating an unbounded number of schema issues.
 */
function preflightResourceBounds(
  input: unknown,
  errors: IssueCollector
): boolean {
  if (!isPlainOwnRecord(input)) return false;
  let exceeded = false;
  if (
    Array.isArray(input.variants) &&
    input.variants.length > EXPERIENCE_TEMPLATE_LIMITS.maxVariants
  ) {
    addResourceLimitIssue(
      errors,
      ['variants'],
      EXPERIENCE_TEMPLATE_LIMITS.maxVariants
    );
    exceeded = true;
  }
  if (!Array.isArray(input.pages)) return exceeded;
  if (input.pages.length > EXPERIENCE_TEMPLATE_LIMITS.maxPages) {
    addResourceLimitIssue(
      errors,
      ['pages'],
      EXPERIENCE_TEMPLATE_LIMITS.maxPages
    );
    return true;
  }

  for (let pageIndex = 0; pageIndex < input.pages.length; pageIndex++) {
    if (errors.isFull()) return true;
    const rawPage = input.pages[pageIndex];
    if (!isPlainOwnRecord(rawPage)) continue;
    if (
      Array.isArray(rawPage.widgets) &&
      rawPage.widgets.length > EXPERIENCE_TEMPLATE_LIMITS.maxWidgetsPerPage
    ) {
      addResourceLimitIssue(
        errors,
        ['pages', pageIndex, 'widgets'],
        EXPERIENCE_TEMPLATE_LIMITS.maxWidgetsPerPage
      );
      exceeded = true;
      continue;
    }
    if (rawAccessExceedsConditionLimit(rawPage.access)) {
      addResourceLimitIssue(
        errors,
        ['pages', pageIndex, 'access', 'when'],
        EXPERIENCE_TEMPLATE_LIMITS.maxConditionNodes
      );
      return true;
    }
    if (isPlainOwnRecord(rawPage.layouts)) {
      for (const variantId in rawPage.layouts) {
        if (!hasOwn(rawPage.layouts, variantId)) continue;
        const rawLayout = rawPage.layouts[variantId];
        if (!isPlainOwnRecord(rawLayout)) continue;
        if (!rawPlacementsExceedLimit(rawLayout.placements)) continue;
        addResourceLimitIssue(
          errors,
          ['pages', pageIndex, 'layouts', variantId, 'placements'],
          EXPERIENCE_TEMPLATE_LIMITS.maxWidgetsPerPage
        );
        return true;
      }
    }
    if (!Array.isArray(rawPage.widgets)) continue;
    for (
      let widgetIndex = 0;
      widgetIndex < rawPage.widgets.length;
      widgetIndex++
    ) {
      if (errors.isFull()) return true;
      const rawWidget = rawPage.widgets[widgetIndex];
      if (!isPlainOwnRecord(rawWidget)) continue;
      if (
        Array.isArray(rawWidget.actions) &&
        rawWidget.actions.length >
          EXPERIENCE_TEMPLATE_LIMITS.maxActionsPerWidget
      ) {
        addResourceLimitIssue(
          errors,
          ['pages', pageIndex, 'widgets', widgetIndex, 'actions'],
          EXPERIENCE_TEMPLATE_LIMITS.maxActionsPerWidget
        );
        exceeded = true;
      }
      if (rawAccessExceedsConditionLimit(rawWidget.access)) {
        addResourceLimitIssue(
          errors,
          ['pages', pageIndex, 'widgets', widgetIndex, 'access', 'when'],
          EXPERIENCE_TEMPLATE_LIMITS.maxConditionNodes
        );
        return true;
      }
    }
  }
  return exceeded;
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
    if (preflightResourceBounds(template, errors)) {
      return reportFromCollectors(errors, warnings, true);
    }
    const parsed = ExperienceTemplateSchema.safeParse(template);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const mapped = mapSchemaIssue(issue);
        errors.add(mapped.code, mapped.path, mapped.details);
      }
      scanRawSurfaceAndConditions(template, errors);
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
