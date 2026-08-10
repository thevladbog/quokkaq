import { create } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { immer } from 'zustand/middleware/immer';
import {
  ExperienceDraftSchema,
  ExperienceDraftWidgetSchema,
  ExperiencePageLayoutSchema
} from '@quokkaq/shared-types';
import type {
  ExperiencePage,
  ExperienceTemplate,
  ExperienceWidget
} from '@quokkaq/shared-types';

import {
  canPlacePlacement,
  copyGridLayout,
  firstFreeCell,
  type GridPlacement,
  type GridItem
} from '@/lib/screen-grid-editor';

const HISTORY_CAP = 40;

export type ExperienceBuilderSelection =
  | { kind: 'none' }
  | { kind: 'page'; pageId: string }
  | { kind: 'widget'; pageId: string; widgetId: string };

export type ExperienceBuilderSnapshot = {
  draft: ExperienceTemplate;
  activePageId: string;
  activeVariantId: string;
  selection: ExperienceBuilderSelection;
};

export type ExperienceBuilderOptions = {
  /** Injectable for deterministic tests; production uses cryptographically safe IDs when available. */
  idFactory?: (prefix: 'page' | 'widget') => string;
};

export type AddPageInput = { id?: string; name?: string };
export type AddWidgetInput = Pick<
  Partial<ExperienceWidget>,
  'config' | 'tone' | 'access' | 'actions'
>;
export type SharedWidgetUpdate = Omit<AddWidgetInput, 'tone' | 'access'> & {
  type?: ExperienceWidget['type'];
  /** `null` intentionally clears an optional shared policy/tone. */
  tone?: ExperienceWidget['tone'] | null;
  access?: ExperienceWidget['access'] | null;
};

type DraftState = {
  draft: ExperienceTemplate;
  activePageId: string;
  activeVariantId: string;
  selection: ExperienceBuilderSelection;
  history: ExperienceBuilderSnapshot[];
  redoStack: ExperienceBuilderSnapshot[];
  lastSavedDraft: ExperienceTemplate;
  isDirty: boolean;
};

export type ExperienceBuilderState = DraftState & {
  loadDraft: (draft: ExperienceTemplate) => boolean;
  addPage: (input?: AddPageInput) => string | null;
  renamePage: (pageId: string, name: string) => boolean;
  duplicatePage: (pageId: string) => string | null;
  deletePage: (pageId: string) => boolean;
  reorderPage: (pageId: string, toIndex: number) => boolean;
  setStartPage: (pageId: string) => boolean;
  addWidget: (
    pageId: string,
    type: ExperienceWidget['type'],
    input?: AddWidgetInput
  ) => string | null;
  updateWidgetShared: (
    pageId: string,
    widgetId: string,
    updates: SharedWidgetUpdate
  ) => boolean;
  deleteWidget: (pageId: string, widgetId: string) => boolean;
  setPlacement: (
    pageId: string,
    widgetId: string,
    placement: GridPlacement
  ) => boolean;
  removePlacement: (pageId: string, widgetId: string) => boolean;
  setTypographyScale: (pageId: string, scale: number | undefined) => boolean;
  copyLayout: (
    pageId: string,
    fromVariantId: string,
    toVariantId: string
  ) => boolean;
  setActivePage: (pageId: string) => boolean;
  setActiveVariant: (variantId: string) => boolean;
  setSelection: (selection: ExperienceBuilderSelection) => boolean;
  isPageUnreachable: (pageId: string) => boolean;
  markSaved: () => void;
  undo: () => boolean;
  redo: () => boolean;
};

const UNSAFE_RECORD_IDS = new Set(['__proto__', 'constructor', 'prototype']);

function hasOwn(value: object, key: PropertyKey): boolean {
  try {
    return Object.prototype.hasOwnProperty.call(value, key);
  } catch {
    return false;
  }
}

function isPlainOwnRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  try {
    return Object.getPrototypeOf(value) === Object.prototype;
  } catch {
    return false;
  }
}

function isSafeRecordID(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim() !== '' &&
    !UNSAFE_RECORD_IDS.has(value)
  );
}

function isSupportedJsonLike(
  value: unknown,
  ancestors = new Set<object>()
): boolean {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return true;
  }
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || ancestors.has(value)) return false;

  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) return false;
    ancestors.add(value);
    const valid = Object.keys(value).every((key) => {
      const index = Number(key);
      if (!Number.isInteger(index) || index < 0 || String(index) !== key) {
        return false;
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return (
        descriptor !== undefined &&
        'value' in descriptor &&
        isSupportedJsonLike(descriptor.value, ancestors)
      );
    });
    ancestors.delete(value);
    return valid;
  }

  if (!isPlainOwnRecord(value)) return false;
  ancestors.add(value);
  const valid = Object.keys(value).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return (
      descriptor !== undefined &&
      'value' in descriptor &&
      isSupportedJsonLike(descriptor.value, ancestors)
    );
  });
  ancestors.delete(value);
  return valid;
}

function cloneJsonLike(value: unknown): unknown {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    const copy = new Array(value.length);
    for (const key of Object.keys(value)) {
      Object.defineProperty(copy, key, {
        value: cloneJsonLike(value[Number(key)]),
        enumerable: true,
        writable: true,
        configurable: true
      });
    }
    return copy;
  }
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    Object.defineProperty(copy, key, {
      value: cloneJsonLike(descriptor.value),
      enumerable: true,
      writable: true,
      configurable: true
    });
  }
  return copy;
}

function clone<T>(value: T): T {
  return cloneJsonLike(value) as T;
}

function equalJsonLike(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (
    left === null ||
    right === null ||
    typeof left !== 'object' ||
    typeof right !== 'object'
  ) {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (
      !Array.isArray(left) ||
      !Array.isArray(right) ||
      left.length !== right.length
    ) {
      return false;
    }
    for (let index = 0; index < left.length; index++) {
      const leftHas = hasOwn(left, index);
      const rightHas = hasOwn(right, index);
      if (leftHas !== rightHas) return false;
      if (leftHas && !equalJsonLike(left[index], right[index])) return false;
    }
    return true;
  }
  if (!isPlainOwnRecord(left) || !isPlainOwnRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  for (let index = 0; index < leftKeys.length; index++) {
    const key = leftKeys[index]!;
    if (key !== rightKeys[index] || !hasOwn(right, key)) return false;
    if (!equalJsonLike(left[key], right[key])) return false;
  }
  return true;
}

function isSafeWidgetInput(value: unknown): boolean {
  if (!isPlainOwnRecord(value) || !isSupportedJsonLike(value)) return false;
  return (
    !hasOwn(value, 'config') ||
    value.config === undefined ||
    isPlainOwnRecord(value.config)
  );
}

function isSafeDraftWidget(value: unknown): value is ExperienceWidget {
  if (
    !isPlainOwnRecord(value) ||
    !isSupportedJsonLike(value) ||
    !isSafeRecordID(value.id) ||
    !isPlainOwnRecord(value.config)
  ) {
    return false;
  }
  try {
    return ExperienceDraftWidgetSchema.safeParse(value).success;
  } catch {
    return false;
  }
}

function isSafePageLayout(
  value: unknown
): value is ExperiencePage['layouts'][string] {
  if (
    !isPlainOwnRecord(value) ||
    !isSupportedJsonLike(value) ||
    !isPlainOwnRecord(value.placements) ||
    Object.keys(value.placements).some((id) => !isSafeRecordID(id))
  ) {
    return false;
  }
  try {
    return ExperiencePageLayoutSchema.safeParse(value).success;
  } catch {
    return false;
  }
}

function hasSafeDraftRecordShape(value: unknown): value is ExperienceTemplate {
  if (!isPlainOwnRecord(value) || !isSupportedJsonLike(value)) return false;
  if (
    !isSafeRecordID(value.id) ||
    !isSafeRecordID(value.startPageId) ||
    !Array.isArray(value.variants) ||
    !Array.isArray(value.pages)
  ) {
    return false;
  }
  const variantIDs = new Set<string>();
  for (const variant of value.variants) {
    if (!isPlainOwnRecord(variant) || !isSafeRecordID(variant.id)) return false;
    variantIDs.add(variant.id);
  }
  for (const page of value.pages) {
    if (
      !isPlainOwnRecord(page) ||
      !isSafeRecordID(page.id) ||
      !Array.isArray(page.widgets) ||
      !isPlainOwnRecord(page.layouts)
    ) {
      return false;
    }
    for (const widget of page.widgets) {
      if (
        !isPlainOwnRecord(widget) ||
        !isSafeRecordID(widget.id) ||
        !isPlainOwnRecord(widget.config)
      ) {
        return false;
      }
    }
    for (const [variantID, layout] of Object.entries(page.layouts)) {
      if (
        !isSafeRecordID(variantID) ||
        !variantIDs.has(variantID) ||
        !isSafePageLayout(layout)
      ) {
        return false;
      }
    }
  }
  return true;
}

function isSafeTemplateDraft(value: unknown): value is ExperienceTemplate {
  try {
    return (
      hasSafeDraftRecordShape(value) &&
      ExperienceDraftSchema.safeParse(value).success
    );
  } catch {
    return false;
  }
}

function defaultIdFactory(prefix: 'page' | 'widget'): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function collectPageIds(template: ExperienceTemplate): Set<string> {
  return new Set(template.pages.map((page) => page.id).filter(isSafeRecordID));
}

function collectWidgetIds(template: ExperienceTemplate): Set<string> {
  return new Set(
    template.pages.flatMap((page) =>
      page.widgets.map((widget) => widget.id).filter(isSafeRecordID)
    )
  );
}

function uniqueId(
  prefix: 'page' | 'widget',
  reserved: Set<string>,
  factory: (prefix: 'page' | 'widget') => string
): string | null {
  for (let attempt = 0; attempt < 100; attempt++) {
    let candidate: string;
    try {
      candidate = factory(prefix).trim();
    } catch {
      return null;
    }
    if (isSafeRecordID(candidate) && !reserved.has(candidate)) return candidate;
  }
  return null;
}

function pageById(
  template: ExperienceTemplate,
  pageId: string
): ExperiencePage | undefined {
  if (!isSafeRecordID(pageId)) return undefined;
  return template.pages.find(
    (page) => isSafeRecordID(page.id) && page.id === pageId
  );
}

function activeVariantExists(state: DraftState): boolean {
  return state.draft.variants.some(
    (variant) => variant.id === state.activeVariantId
  );
}

function snapshot(state: DraftState): ExperienceBuilderSnapshot {
  return {
    draft: clone(state.draft),
    activePageId: state.activePageId,
    activeVariantId: state.activeVariantId,
    selection: clone(state.selection)
  };
}

function restoreSnapshot(
  state: DraftState,
  value: ExperienceBuilderSnapshot
): void {
  state.draft = clone(value.draft);
  state.activePageId = value.activePageId;
  state.activeVariantId = value.activeVariantId;
  state.selection = clone(value.selection);
  ensureActiveContext(state);
}

function refreshDirty(state: DraftState): void {
  state.isDirty = !equalJsonLike(state.draft, state.lastSavedDraft);
}

function commitEdit(
  state: DraftState,
  before: ExperienceBuilderSnapshot
): boolean {
  const after = snapshot(state);
  if (equalJsonLike(before, after)) return false;
  state.history.push(before);
  if (state.history.length > HISTORY_CAP) state.history.shift();
  state.redoStack = [];
  refreshDirty(state);
  return true;
}

function ensureActiveContext(state: DraftState): void {
  const firstPageId = state.draft.pages[0]?.id;
  const firstVariantId = state.draft.variants[0]?.id;
  if (!pageById(state.draft, state.activePageId) && firstPageId !== undefined) {
    state.activePageId = firstPageId;
  }
  if (
    !state.draft.variants.some(
      (variant) => variant.id === state.activeVariantId
    ) &&
    firstVariantId !== undefined
  ) {
    state.activeVariantId = firstVariantId;
  }
  if (!isSelectionValid(state)) state.selection = { kind: 'none' };
}

function isSelectionValid(state: DraftState): boolean {
  const selection = state.selection;
  if (selection.kind === 'none') return true;
  const page = pageById(state.draft, selection.pageId);
  if (!page) return false;
  if (selection.kind === 'page') return true;
  return page.widgets.some((widget) => widget.id === selection.widgetId);
}

function isPageReferencedElsewhere(
  template: ExperienceTemplate,
  candidateId: string
): boolean {
  if (
    Object.values(template.flowPages ?? {}).some((id) => id === candidateId)
  ) {
    return true;
  }
  return template.pages.some(
    (page) =>
      page.id !== candidateId &&
      page.widgets.some((widget) =>
        widget.actions.some(
          (action) =>
            action.type === 'navigate' && action.toPageId === candidateId
        )
      )
  );
}

function layoutItems(page: ExperiencePage, variantId: string): GridItem[] {
  const layout = ownPageLayout(page, variantId);
  if (!layout) return [];
  return page.widgets.flatMap((widget) => {
    const placement = hasOwn(layout.placements, widget.id)
      ? layout.placements[widget.id]
      : undefined;
    return placement === undefined ? [] : [{ id: widget.id, placement }];
  });
}

function ownPageLayout(
  page: ExperiencePage | undefined,
  variantId: string
): ExperiencePage['layouts'][string] | undefined {
  if (!page || !isSafeRecordID(variantId) || !hasOwn(page.layouts, variantId)) {
    return undefined;
  }
  return page.layouts[variantId];
}

function layoutFitsVariant(
  page: ExperiencePage,
  layout: { placements: Record<string, GridPlacement> },
  grid: { columns: number; rows: number }
): boolean {
  const widgetIds = new Set(page.widgets.map((widget) => widget.id));
  const placed: GridItem[] = [];
  for (const [widgetId, placement] of Object.entries(layout.placements)) {
    if (
      !widgetIds.has(widgetId) ||
      !canPlacePlacement(grid.columns, grid.rows, placed, placement)
    ) {
      return false;
    }
    placed.push({ id: widgetId, placement });
  }
  return true;
}

function retargetCopiedActions(
  actions: ExperienceWidget['actions'],
  sourcePageId: string,
  copiedPageId: string
): ExperienceWidget['actions'] {
  return actions.map((action) =>
    action.type === 'navigate' && action.toPageId === sourcePageId
      ? { ...action, toPageId: copiedPageId }
      : clone(action)
  );
}

function defaultDraft(): ExperienceTemplate {
  return {
    schemaVersion: 1,
    id: 'new-experience',
    surface: 'ticket-station',
    startPageId: 'start',
    variants: [
      {
        id: 'portrait',
        profile: {
          id: 'ipad-10-9-portrait',
          name: 'iPad portrait',
          width: 820,
          height: 1180,
          interactionMode: 'touch',
          viewingDistance: 'near',
          safeArea: { top: 0, right: 0, bottom: 0, left: 0 }
        },
        grid: { columns: 12, rows: 18 }
      }
    ],
    pages: [
      {
        id: 'start',
        name: 'Start',
        widgets: [],
        layouts: { portrait: { placements: {} } }
      }
    ]
  };
}

export function getUnreachablePageIds(template: ExperienceTemplate): string[] {
  if (!isSafeTemplateDraft(template)) return [];
  const pagesById = new Map(template.pages.map((page) => [page.id, page]));
  const pending = [
    template.startPageId,
    ...Object.values(template.flowPages ?? {}).filter(
      (pageId): pageId is string => pageId !== undefined
    )
  ];
  const reachable = new Set<string>();

  while (pending.length > 0) {
    const pageId = pending.shift()!;
    if (reachable.has(pageId)) continue;
    const page = pagesById.get(pageId);
    if (!page) continue;
    reachable.add(pageId);
    for (const widget of page.widgets) {
      for (const action of widget.actions) {
        if (action.type === 'navigate' && !reachable.has(action.toPageId)) {
          pending.push(action.toPageId);
        }
      }
    }
  }

  return template.pages
    .filter((page) => !reachable.has(page.id))
    .map((page) => page.id);
}

function createExperienceBuilderState(
  initialDraft: ExperienceTemplate,
  options: ExperienceBuilderOptions = {}
) {
  const idFactory = options.idFactory ?? defaultIdFactory;
  const initial = clone(
    isSafeTemplateDraft(initialDraft) ? initialDraft : defaultDraft()
  );
  const initialPageId = initial.pages[0]?.id ?? '';
  const initialVariantId = initial.variants[0]?.id ?? '';

  return immer<ExperienceBuilderState>((set, get) => ({
    draft: initial,
    activePageId: initialPageId,
    activeVariantId: initialVariantId,
    selection: { kind: 'none' },
    history: [],
    redoStack: [],
    lastSavedDraft: clone(initial),
    isDirty: false,

    loadDraft: (draft) => {
      if (!isSafeTemplateDraft(draft)) return false;
      let changed = false;
      set((state) => {
        const next = clone(draft);
        state.draft = next;
        state.activePageId = next.pages[0]?.id ?? '';
        state.activeVariantId = next.variants[0]?.id ?? '';
        state.selection = { kind: 'none' };
        state.history = [];
        state.redoStack = [];
        state.lastSavedDraft = clone(next);
        state.isDirty = false;
        changed = true;
      });
      return changed;
    },

    addPage: (input = {}) => {
      let result: string | null = null;
      set((state) => {
        if (!isPlainOwnRecord(input) || !isSupportedJsonLike(input)) return;
        const before = snapshot(state);
        const reserved = collectPageIds(state.draft);
        const rawRequestedId = hasOwn(input, 'id') ? input.id : undefined;
        if (
          rawRequestedId !== undefined &&
          typeof rawRequestedId !== 'string'
        ) {
          return;
        }
        const rawName = hasOwn(input, 'name') ? input.name : undefined;
        if (rawName !== undefined && typeof rawName !== 'string') return;
        const requestedId = rawRequestedId?.trim();
        if (
          requestedId !== undefined &&
          requestedId !== '' &&
          !isSafeRecordID(requestedId)
        ) {
          return;
        }
        const pageId =
          requestedId !== undefined &&
          requestedId !== '' &&
          !reserved.has(requestedId)
            ? requestedId
            : uniqueId('page', reserved, idFactory);
        if (!pageId) return;
        const pageNumber = state.draft.pages.length + 1;
        state.draft.pages.push({
          id: pageId,
          name: rawName?.trim() || `Page ${pageNumber}`,
          widgets: [],
          layouts: Object.fromEntries(
            state.draft.variants.map((variant) => [
              variant.id,
              { placements: {} }
            ])
          )
        });
        state.activePageId = pageId;
        state.selection = { kind: 'page', pageId };
        if (commitEdit(state, before)) result = pageId;
      });
      return result;
    },

    renamePage: (pageId, name) => {
      let changed = false;
      set((state) => {
        const page = pageById(state.draft, pageId);
        const nextName = name.trim();
        if (!page || nextName === '' || page.name === nextName) return;
        const before = snapshot(state);
        page.name = nextName;
        changed = commitEdit(state, before);
      });
      return changed;
    },

    duplicatePage: (pageId) => {
      let result: string | null = null;
      set((state) => {
        const source = pageById(state.draft, pageId);
        if (!source) return;
        const before = snapshot(state);
        const copiedPageId = uniqueId(
          'page',
          collectPageIds(state.draft),
          idFactory
        );
        if (!copiedPageId) return;

        const reservedWidgetIds = collectWidgetIds(state.draft);
        const widgetIds = new Map<string, string>();
        for (const widget of source.widgets) {
          const copiedWidgetId = uniqueId(
            'widget',
            reservedWidgetIds,
            idFactory
          );
          if (!copiedWidgetId) return;
          reservedWidgetIds.add(copiedWidgetId);
          widgetIds.set(widget.id, copiedWidgetId);
        }

        const copy: ExperiencePage = {
          ...clone(source),
          id: copiedPageId,
          name: `${source.name} copy`,
          widgets: source.widgets.map((widget) => ({
            ...clone(widget),
            id: widgetIds.get(widget.id)!,
            actions: retargetCopiedActions(
              widget.actions,
              source.id,
              copiedPageId
            )
          })),
          layouts: Object.fromEntries(
            state.draft.variants.map((variant) => {
              const sourceLayout = ownPageLayout(source, variant.id) ?? {
                placements: {}
              };
              const copiedLayout = copyGridLayout(sourceLayout);
              return [
                variant.id,
                {
                  ...copiedLayout,
                  placements: Object.fromEntries(
                    Object.entries(copiedLayout.placements).flatMap(
                      ([widgetId, placement]) => {
                        const copiedWidgetId = widgetIds.get(widgetId);
                        return copiedWidgetId
                          ? [[copiedWidgetId, placement]]
                          : [];
                      }
                    )
                  )
                }
              ];
            })
          )
        };
        const sourceIndex = state.draft.pages.findIndex(
          (page) => page.id === source.id
        );
        state.draft.pages.splice(sourceIndex + 1, 0, copy);
        state.activePageId = copiedPageId;
        state.selection = { kind: 'page', pageId: copiedPageId };
        if (commitEdit(state, before)) result = copiedPageId;
      });
      return result;
    },

    deletePage: (pageId) => {
      let changed = false;
      set((state) => {
        const pageIndex = state.draft.pages.findIndex(
          (page) => page.id === pageId
        );
        if (
          pageIndex < 0 ||
          state.draft.pages.length <= 1 ||
          state.draft.startPageId === pageId ||
          isPageReferencedElsewhere(state.draft, pageId)
        ) {
          return;
        }
        const before = snapshot(state);
        state.draft.pages.splice(pageIndex, 1);
        state.activePageId = state.draft.startPageId;
        state.selection = { kind: 'none' };
        changed = commitEdit(state, before);
      });
      return changed;
    },

    reorderPage: (pageId, toIndex) => {
      let changed = false;
      set((state) => {
        const fromIndex = state.draft.pages.findIndex(
          (page) => page.id === pageId
        );
        if (
          fromIndex < 0 ||
          !Number.isInteger(toIndex) ||
          toIndex < 0 ||
          toIndex >= state.draft.pages.length ||
          fromIndex === toIndex
        ) {
          return;
        }
        const before = snapshot(state);
        const [page] = state.draft.pages.splice(fromIndex, 1);
        state.draft.pages.splice(toIndex, 0, page!);
        changed = commitEdit(state, before);
      });
      return changed;
    },

    setStartPage: (pageId) => {
      let changed = false;
      set((state) => {
        if (
          !pageById(state.draft, pageId) ||
          state.draft.startPageId === pageId
        ) {
          return;
        }
        const before = snapshot(state);
        state.draft.startPageId = pageId;
        changed = commitEdit(state, before);
      });
      return changed;
    },

    addWidget: (pageId, type, input = {}) => {
      let result: string | null = null;
      set((state) => {
        if (!isSafeWidgetInput(input)) return;
        const page = pageById(state.draft, pageId);
        const variant = state.draft.variants.find(
          (candidate) => candidate.id === state.activeVariantId
        );
        const layout = ownPageLayout(page, state.activeVariantId);
        if (!page || !variant || !layout || !activeVariantExists(state)) return;
        const cell = firstFreeCell(
          variant.grid.columns,
          variant.grid.rows,
          layoutItems(page, variant.id)
        );
        if (!cell) return;
        const widgetId = uniqueId(
          'widget',
          collectWidgetIds(state.draft),
          idFactory
        );
        if (!widgetId) return;
        const nextWidget: unknown = {
          id: widgetId,
          type,
          config: clone(input.config ?? {}),
          ...(input.tone === undefined ? {} : { tone: input.tone }),
          ...(input.access === undefined
            ? {}
            : { access: clone(input.access) }),
          actions: clone(input.actions ?? [])
        };
        const nextLayout = copyGridLayout(layout);
        nextLayout.placements[widgetId] = {
          col: cell.col,
          row: cell.row,
          colSpan: 1,
          rowSpan: 1
        };
        if (!isSafeDraftWidget(nextWidget) || !isSafePageLayout(nextLayout)) {
          return;
        }
        const nextDraft = clone(state.draft);
        const nextPage = pageById(nextDraft, pageId);
        if (!nextPage) return;
        nextPage.widgets.push(nextWidget);
        nextPage.layouts[state.activeVariantId] = nextLayout;
        if (!isSafeTemplateDraft(nextDraft)) return;
        const before = snapshot(state);
        state.draft = nextDraft;
        state.selection = { kind: 'widget', pageId, widgetId };
        if (commitEdit(state, before)) result = widgetId;
      });
      return result;
    },

    updateWidgetShared: (pageId, widgetId, updates) => {
      let changed = false;
      set((state) => {
        if (!isSafeWidgetInput(updates)) return;
        const page = pageById(state.draft, pageId);
        const widgetIndex =
          page?.widgets.findIndex((candidate) => candidate.id === widgetId) ??
          -1;
        if (!page || widgetIndex < 0) return;
        const nextWidget = clone(page.widgets[widgetIndex]!);
        if (updates.type !== undefined) nextWidget.type = updates.type;
        if (updates.config !== undefined)
          nextWidget.config = clone(updates.config);
        if (updates.tone !== undefined) {
          if (updates.tone === null) delete nextWidget.tone;
          else nextWidget.tone = updates.tone;
        }
        if (updates.access !== undefined) {
          if (updates.access === null) delete nextWidget.access;
          else nextWidget.access = clone(updates.access);
        }
        if (updates.actions !== undefined)
          nextWidget.actions = clone(updates.actions);
        if (!isSafeDraftWidget(nextWidget)) return;
        const nextDraft = clone(state.draft);
        const nextPage = pageById(nextDraft, pageId);
        if (!nextPage) return;
        nextPage.widgets[widgetIndex] = nextWidget;
        if (!isSafeTemplateDraft(nextDraft)) return;
        const before = snapshot(state);
        state.draft = nextDraft;
        changed = commitEdit(state, before);
      });
      return changed;
    },

    deleteWidget: (pageId, widgetId) => {
      let changed = false;
      set((state) => {
        const page = pageById(state.draft, pageId);
        const index =
          page?.widgets.findIndex((widget) => widget.id === widgetId) ?? -1;
        if (!page || index < 0) return;
        const before = snapshot(state);
        page.widgets.splice(index, 1);
        for (const layout of Object.values(page.layouts)) {
          delete layout.placements[widgetId];
        }
        if (
          state.selection.kind === 'widget' &&
          state.selection.pageId === pageId &&
          state.selection.widgetId === widgetId
        ) {
          state.selection = { kind: 'none' };
        }
        changed = commitEdit(state, before);
      });
      return changed;
    },

    setPlacement: (pageId, widgetId, placement) => {
      let changed = false;
      set((state) => {
        const page = pageById(state.draft, pageId);
        const variant = state.draft.variants.find(
          (candidate) => candidate.id === state.activeVariantId
        );
        const layout = ownPageLayout(page, state.activeVariantId);
        if (
          !page ||
          !variant ||
          !layout ||
          !page.widgets.some((widget) => widget.id === widgetId)
        ) {
          return;
        }
        const nextLayout = copyGridLayout(layout);
        nextLayout.placements[widgetId] = clone(placement);
        if (
          !isSafePageLayout(nextLayout) ||
          !canPlacePlacement(
            variant.grid.columns,
            variant.grid.rows,
            layoutItems(page, variant.id),
            placement,
            widgetId
          )
        ) {
          return;
        }
        const nextDraft = clone(state.draft);
        const nextPage = pageById(nextDraft, pageId);
        if (!nextPage) return;
        nextPage.layouts[state.activeVariantId] = nextLayout;
        if (!isSafeTemplateDraft(nextDraft)) return;
        const before = snapshot(state);
        state.draft = nextDraft;
        changed = commitEdit(state, before);
      });
      return changed;
    },

    removePlacement: (pageId, widgetId) => {
      let changed = false;
      set((state) => {
        const page = pageById(state.draft, pageId);
        const layout = ownPageLayout(page, state.activeVariantId);
        if (!page || !layout || !hasOwn(layout.placements, widgetId)) return;
        const before = snapshot(state);
        delete layout.placements[widgetId];
        changed = commitEdit(state, before);
      });
      return changed;
    },

    setTypographyScale: (pageId, scale) => {
      let changed = false;
      set((state) => {
        const page = pageById(state.draft, pageId);
        const layout = ownPageLayout(page, state.activeVariantId);
        if (!page || !layout) return;
        const nextLayout = copyGridLayout(layout);
        if (scale === undefined) delete nextLayout.typographyScale;
        else nextLayout.typographyScale = scale;
        if (!isSafePageLayout(nextLayout)) return;
        const nextDraft = clone(state.draft);
        const nextPage = pageById(nextDraft, pageId);
        if (!nextPage) return;
        nextPage.layouts[state.activeVariantId] = nextLayout;
        if (!isSafeTemplateDraft(nextDraft)) return;
        const before = snapshot(state);
        state.draft = nextDraft;
        changed = commitEdit(state, before);
      });
      return changed;
    },

    copyLayout: (pageId, fromVariantId, toVariantId) => {
      let changed = false;
      set((state) => {
        const page = pageById(state.draft, pageId);
        if (
          !page ||
          fromVariantId === toVariantId ||
          !state.draft.variants.some(
            (variant) => variant.id === fromVariantId
          ) ||
          !state.draft.variants.some((variant) => variant.id === toVariantId) ||
          !ownPageLayout(page, fromVariantId) ||
          !ownPageLayout(page, toVariantId)
        ) {
          return;
        }
        const targetVariant = state.draft.variants.find(
          (variant) => variant.id === toVariantId
        );
        const copiedLayout = copyGridLayout(
          ownPageLayout(page, fromVariantId)!
        );
        if (
          !targetVariant ||
          !isSafePageLayout(copiedLayout) ||
          !layoutFitsVariant(page, copiedLayout, targetVariant.grid)
        ) {
          return;
        }
        const nextDraft = clone(state.draft);
        const nextPage = pageById(nextDraft, pageId);
        if (!nextPage) return;
        nextPage.layouts[toVariantId] = copiedLayout;
        if (!isSafeTemplateDraft(nextDraft)) return;
        const before = snapshot(state);
        state.draft = nextDraft;
        changed = commitEdit(state, before);
      });
      return changed;
    },

    setActivePage: (pageId) => {
      let changed = false;
      set((state) => {
        if (!pageById(state.draft, pageId) || state.activePageId === pageId)
          return;
        state.activePageId = pageId;
        state.selection = { kind: 'none' };
        changed = true;
      });
      return changed;
    },

    setActiveVariant: (variantId) => {
      let changed = false;
      set((state) => {
        if (
          !isSafeRecordID(variantId) ||
          !state.draft.variants.some((variant) => variant.id === variantId) ||
          state.activeVariantId === variantId
        ) {
          return;
        }
        state.activeVariantId = variantId;
        changed = true;
      });
      return changed;
    },

    setSelection: (selection) => {
      let changed = false;
      set((state) => {
        const before = clone(state.selection);
        state.selection = clone(selection);
        if (!isSelectionValid(state)) state.selection = { kind: 'none' };
        changed = !equalJsonLike(before, state.selection);
      });
      return changed;
    },

    isPageUnreachable: (pageId) =>
      getUnreachablePageIds(get().draft).includes(pageId),

    markSaved: () => {
      set((state) => {
        state.lastSavedDraft = clone(state.draft);
        state.isDirty = false;
      });
    },

    undo: () => {
      let changed = false;
      set((state) => {
        const previous = state.history.pop();
        if (!previous) return;
        state.redoStack.push(snapshot(state));
        if (state.redoStack.length > HISTORY_CAP) state.redoStack.shift();
        restoreSnapshot(state, previous);
        refreshDirty(state);
        changed = true;
      });
      return changed;
    },

    redo: () => {
      let changed = false;
      set((state) => {
        const next = state.redoStack.pop();
        if (!next) return;
        state.history.push(snapshot(state));
        if (state.history.length > HISTORY_CAP) state.history.shift();
        restoreSnapshot(state, next);
        refreshDirty(state);
        changed = true;
      });
      return changed;
    }
  }));
}

/** Isolated factory for tests and future route-scoped builders. */
export function createExperienceBuilderStore(
  initialDraft: ExperienceTemplate,
  options?: ExperienceBuilderOptions
): StoreApi<ExperienceBuilderState> {
  return createStore<ExperienceBuilderState>()(
    createExperienceBuilderState(initialDraft, options)
  );
}

/** App-level singleton following the existing screen-builder store convention. */
export const useExperienceBuilderStore = create<ExperienceBuilderState>()(
  createExperienceBuilderState(defaultDraft())
);
