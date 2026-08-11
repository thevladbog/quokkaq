import { describe, expect, it } from 'vitest';
import type { ExperienceTemplate } from '@quokkaq/shared-types';

import {
  createExperienceBuilderStore,
  getUnreachablePageIds
} from './experience-builder-store';

function draft(): ExperienceTemplate {
  return {
    schemaVersion: 1,
    id: 'template',
    surface: 'ticket-station',
    startPageId: 'services',
    variants: [
      {
        id: 'portrait',
        profile: {
          id: 'ipad-10-9-portrait',
          name: 'Portrait',
          width: 820,
          height: 1180,
          interactionMode: 'touch',
          viewingDistance: 'near',
          safeArea: { top: 0, right: 0, bottom: 0, left: 0 }
        },
        grid: { columns: 4, rows: 4 }
      },
      {
        id: 'landscape',
        profile: {
          id: 'ipad-10-9-landscape',
          name: 'Landscape',
          width: 1180,
          height: 820,
          interactionMode: 'touch',
          viewingDistance: 'near',
          safeArea: { top: 0, right: 0, bottom: 0, left: 0 }
        },
        grid: { columns: 6, rows: 3 }
      }
    ],
    pages: [
      {
        id: 'services',
        name: 'Services',
        widgets: [
          {
            id: 'picker',
            type: 'service-picker',
            config: { title: 'Choose' },
            actions: [{ type: 'navigate', toPageId: 'details' }]
          }
        ],
        layouts: {
          portrait: {
            placements: { picker: { col: 1, row: 1, colSpan: 2, rowSpan: 2 } },
            typographyScale: 1
          },
          landscape: {
            placements: { picker: { col: 1, row: 1, colSpan: 3, rowSpan: 1 } },
            typographyScale: 1.25
          }
        }
      },
      {
        id: 'details',
        name: 'Details',
        widgets: [
          {
            id: 'info',
            type: 'rich-info',
            config: {},
            actions: [{ type: 'navigate', toPageId: 'services' }]
          }
        ],
        layouts: {
          portrait: {
            placements: { info: { col: 1, row: 1, colSpan: 2, rowSpan: 1 } }
          },
          landscape: {
            placements: { info: { col: 1, row: 1, colSpan: 2, rowSpan: 1 } }
          }
        }
      }
    ]
  };
}

function store() {
  let n = 0;
  return createExperienceBuilderStore(draft(), {
    idFactory: (prefix) => `${prefix}-${++n}`
  });
}

function fullStateSnapshot(builder: ReturnType<typeof store>) {
  const state = builder.getState();
  return structuredClone({
    draft: state.draft,
    activePageId: state.activePageId,
    activeVariantId: state.activeVariantId,
    selection: state.selection,
    history: state.history,
    redoStack: state.redoStack,
    lastSavedDraft: state.lastSavedDraft,
    isDirty: state.isDirty
  });
}

function storeWithHistoryAndRedo() {
  const builder = store();
  builder.getState().setActivePage('details');
  builder.getState().setActiveVariant('landscape');
  builder.getState().setSelection({
    kind: 'widget',
    pageId: 'details',
    widgetId: 'info'
  });
  builder.getState().renamePage('details', 'First unsaved name');
  builder.getState().renamePage('details', 'Second unsaved name');
  expect(builder.getState().undo()).toBe(true);
  return builder;
}

describe('experience builder store', () => {
  it('loads a remote draft atomically without retaining caller-owned references', () => {
    const builder = store();
    const incoming = draft();
    incoming.id = 'remote-template';
    incoming.pages[0]!.name = 'Remote services';
    builder.getState().renamePage('services', 'Unsaved');

    builder.getState().loadDraft(incoming);
    incoming.pages[0]!.name = 'Mutated outside';

    expect(builder.getState().draft.id).toBe('remote-template');
    expect(builder.getState().draft.pages[0]!.name).toBe('Remote services');
    expect(builder.getState().history).toHaveLength(0);
    expect(builder.getState().redoStack).toHaveLength(0);
    expect(builder.getState().isDirty).toBe(false);
  });

  it('normalizes absent actions at draft ingress and absent or undefined actions when adding widgets', () => {
    const builder = store();
    const incoming = draft();
    delete (incoming.pages[0]!.widgets[0] as { actions?: unknown }).actions;

    expect(builder.getState().loadDraft(incoming)).toBe(true);
    const loadedWidget = builder.getState().draft.pages[0]!.widgets[0]!;
    expect(loadedWidget.actions).toEqual([]);
    expect(Object.hasOwn(loadedWidget, 'actions')).toBe(true);

    const absentActionsWidgetId = builder
      .getState()
      .addWidget('services', 'media');
    const absentActionsWidget = builder
      .getState()
      .draft.pages[0]!.widgets.find(
        (widget) => widget.id === absentActionsWidgetId
      )!;
    expect(absentActionsWidget.actions).toEqual([]);
    expect(Object.hasOwn(absentActionsWidget, 'actions')).toBe(true);

    const undefinedActionsWidgetId = builder
      .getState()
      .addWidget('services', 'media', {
        actions: undefined
      });
    const undefinedActionsWidget = builder
      .getState()
      .draft.pages[0]!.widgets.find(
        (widget) => widget.id === undefinedActionsWidgetId
      )!;
    expect(undefinedActionsWidget.actions).toEqual([]);
    expect(Object.hasOwn(undefinedActionsWidget, 'actions')).toBe(true);

    for (const actions of [null, {}]) {
      const invalidBuilder = storeWithHistoryAndRedo();
      const before = fullStateSnapshot(invalidBuilder);

      expect(
        invalidBuilder.getState().addWidget('services', 'media', {
          actions: actions as never
        })
      ).toBeNull();
      expect(fullStateSnapshot(invalidBuilder)).toEqual(before);
    }
  });

  it('rejects malformed drafts atomically before actions, layouts, or access can reach store state', () => {
    const malformedDrafts: Array<{
      name: string;
      create: () => ExperienceTemplate;
    }> = [
      {
        name: 'an object instead of widget actions',
        create: () => {
          const incoming = draft();
          incoming.pages[0]!.widgets[0]!.actions = {} as never;
          return incoming;
        }
      },
      {
        name: 'a malformed action payload',
        create: () => {
          const incoming = draft();
          incoming.pages[0]!.widgets[0]!.actions = [
            { type: 'set-session', key: 'selectedServiceId' } as never
          ];
          return incoming;
        }
      },
      {
        name: 'an invalid navigate target',
        create: () => {
          const incoming = draft();
          incoming.pages[0]!.widgets[0]!.actions = [
            { type: 'navigate', toPageId: '' } as never
          ];
          return incoming;
        }
      },
      {
        name: 'a missing navigate target page',
        create: () => {
          const incoming = draft();
          incoming.pages[0]!.widgets[0]!.actions = [
            { type: 'navigate', toPageId: 'missing-page' } as never
          ];
          return incoming;
        }
      },
      {
        name: 'a malformed access condition',
        create: () => {
          const incoming = draft();
          incoming.pages[0]!.widgets[0]!.access = {
            when: {
              kind: 'rule',
              field: 'identity.isAuthenticated',
              operator: 'eq',
              value: true
            },
            whenFalse: 'lock'
          } as never;
          return incoming;
        }
      },
      {
        name: 'an empty placement',
        create: () => {
          const incoming = draft();
          incoming.pages[0]!.layouts.portrait!.placements.picker = {} as never;
          return incoming;
        }
      },
      ...[
        ['NaN', 'col', Number.NaN],
        ['infinite', 'row', Number.POSITIVE_INFINITY],
        ['fractional', 'colSpan', 1.5],
        ['zero', 'rowSpan', 0],
        ['negative', 'col', -1]
      ].map(([name, field, value]) => ({
        name: `a ${name} placement ${field}`,
        create: () => {
          const incoming = draft();
          incoming.pages[0]!.layouts.portrait!.placements.picker = {
            ...incoming.pages[0]!.layouts.portrait!.placements.picker!,
            [field]: value
          } as never;
          return incoming;
        }
      })),
      {
        name: 'a malformed typography scale',
        create: () => {
          const incoming = draft();
          incoming.pages[0]!.layouts.portrait!.typographyScale =
            Number.POSITIVE_INFINITY;
          return incoming;
        }
      },
      {
        name: 'an invalid variant grid',
        create: () => {
          const incoming = draft();
          incoming.variants[0]!.grid.columns = Number.NaN;
          return incoming;
        }
      },
      {
        name: 'a malformed page access policy',
        create: () => {
          const incoming = draft();
          incoming.pages[0]!.access = {
            when: {
              kind: 'rule',
              field: 'live.queueLength',
              operator: 'contains',
              value: 'unexpected'
            },
            whenFalse: 'hide'
          } as never;
          return incoming;
        }
      }
    ];

    for (const malformed of malformedDrafts) {
      const builder = store();
      builder.getState().setActivePage('details');
      builder.getState().setActiveVariant('landscape');
      builder.getState().renamePage('details', 'Unsaved details');
      const before = fullStateSnapshot(builder);

      expect(
        builder.getState().loadDraft(malformed.create()),
        malformed.name
      ).toBe(false);
      expect(fullStateSnapshot(builder)).toEqual(before);
      expect(() =>
        getUnreachablePageIds(builder.getState().draft)
      ).not.toThrow();
      expect(() => builder.getState().duplicatePage('services')).not.toThrow();
    }
  });

  it('preserves full state for invalid placement, typography, and copy-layout edits', () => {
    const invalidPlacements = [
      { col: Number.NaN, row: 1, colSpan: 1, rowSpan: 1 },
      { col: Number.POSITIVE_INFINITY, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 1.5, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 0, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 1, colSpan: 0, rowSpan: 1 }
    ];
    for (const placement of invalidPlacements) {
      const builder = storeWithHistoryAndRedo();
      const before = fullStateSnapshot(builder);

      expect(
        builder.getState().setPlacement('services', 'picker', placement)
      ).toBe(false);
      expect(fullStateSnapshot(builder)).toEqual(before);
    }

    for (const scale of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1]) {
      const builder = storeWithHistoryAndRedo();
      const before = fullStateSnapshot(builder);

      expect(builder.getState().setTypographyScale('services', scale)).toBe(
        false
      );
      expect(fullStateSnapshot(builder)).toEqual(before);
    }

    for (const [pageId, fromVariantId, toVariantId] of [
      ['missing-page', 'landscape', 'portrait'],
      ['services', 'missing-variant', 'portrait'],
      ['services', 'landscape', 'missing-variant'],
      ['services', 'landscape', 'landscape']
    ]) {
      const builder = storeWithHistoryAndRedo();
      const before = fullStateSnapshot(builder);

      expect(
        builder.getState().copyLayout(pageId, fromVariantId, toVariantId)
      ).toBe(false);
      expect(fullStateSnapshot(builder)).toEqual(before);
    }

    const builder = storeWithHistoryAndRedo();
    const malformedDraft = structuredClone(builder.getState().draft);
    delete (malformedDraft.pages[0]!.layouts as Record<string, unknown>)
      .landscape;
    builder.setState({ draft: malformedDraft });
    const before = fullStateSnapshot(builder);

    expect(
      builder.getState().copyLayout('services', 'landscape', 'portrait')
    ).toBe(false);
    expect(fullStateSnapshot(builder)).toEqual(before);
  });

  it('accepts a valid draft with an explicitly unplaced inactive variant widget', () => {
    const builder = store();
    const editable = draft();
    editable.pages[0]!.widgets.push({
      id: 'notice',
      type: 'rich-info',
      config: {},
      actions: []
    });
    editable.pages[0]!.layouts.portrait!.placements.notice = {
      col: 3,
      row: 3,
      colSpan: 1,
      rowSpan: 1
    };

    expect(builder.getState().loadDraft(editable)).toBe(true);
    expect(
      builder.getState().draft.pages[0]!.layouts.landscape!.placements.notice
    ).toBeUndefined();
  });

  it('rejects malformed widget action and access changes before they mutate shared state', () => {
    const builder = store();
    const before = structuredClone({
      draft: builder.getState().draft,
      history: builder.getState().history,
      redoStack: builder.getState().redoStack,
      selection: builder.getState().selection,
      isDirty: builder.getState().isDirty
    });

    expect(
      builder.getState().addWidget('services', 'media', {
        actions: [{} as never]
      })
    ).toBeNull();
    expect(
      builder.getState().addWidget('services', 'media', {
        actions: [{ type: 'navigate', toPageId: 'missing-page' } as never]
      })
    ).toBeNull();
    expect(
      builder.getState().updateWidgetShared('services', 'picker', {
        actions: [{ type: 'navigate', toPageId: '' } as never]
      })
    ).toBe(false);
    expect(
      builder.getState().updateWidgetShared('services', 'picker', {
        actions: [{ type: 'navigate', toPageId: 'missing-page' } as never]
      })
    ).toBe(false);
    expect(
      builder.getState().updateWidgetShared('services', 'picker', {
        access: { when: {}, whenFalse: 'lock' } as never
      })
    ).toBe(false);
    expect({
      draft: builder.getState().draft,
      history: builder.getState().history,
      redoStack: builder.getState().redoStack,
      selection: builder.getState().selection,
      isDirty: builder.getState().isDirty
    }).toEqual(before);
  });

  it('rejects unsafe ids and inherited records without mutating the store', () => {
    const builder = store();
    const initial = builder.getState().draft;
    const inheritedLayouts = Object.create({
      portrait: { placements: {} },
      landscape: { placements: {} }
    });
    const unsafeDraft = draft();
    unsafeDraft.pages[0]!.layouts = inheritedLayouts;
    const unsafePageDraft = draft();
    unsafePageDraft.pages[0]!.id = 'constructor';
    const unsafeIdFactoryBuilder = createExperienceBuilderStore(draft(), {
      idFactory: () => 'prototype'
    });

    for (const id of ['__proto__', 'constructor', 'prototype']) {
      expect(builder.getState().addPage({ id })).toBeNull();
    }
    expect(builder.getState().addPage(Object.create({ id: 'inherited' }))).toBe(
      null
    );
    expect(
      builder.getState().addWidget('services', 'media', {
        config: Object.create({ inherited: true })
      })
    ).toBeNull();
    expect(builder.getState().loadDraft(unsafeDraft)).toBe(false);
    expect(builder.getState().loadDraft(unsafePageDraft)).toBe(false);
    expect(builder.getState().setActiveVariant('constructor')).toBe(false);
    expect(
      unsafeIdFactoryBuilder.getState().addWidget('services', 'media')
    ).toBeNull();
    expect(builder.getState().draft).toEqual(initial);
    expect(builder.getState().history).toHaveLength(0);
  });

  it('keeps page targets stable through reorder and retargets only duplicate self-links', () => {
    const builder = store();
    const duplicateId = builder.getState().duplicatePage('services');

    expect(duplicateId).toBe('page-1');
    expect(builder.getState().draft.pages.map((page) => page.id)).toEqual([
      'services',
      'page-1',
      'details'
    ]);
    expect(builder.getState().draft.pages[0]!.widgets[0]!.actions).toEqual([
      { type: 'navigate', toPageId: 'details' }
    ]);
    expect(builder.getState().draft.pages[1]!.widgets[0]!.actions).toEqual([
      { type: 'navigate', toPageId: 'details' }
    ]);

    const selfLink = builder.getState().addWidget('services', 'rich-info', {
      actions: [{ type: 'navigate', toPageId: 'services' }]
    });
    const selfDuplicate = builder.getState().duplicatePage('services');
    const duplicated = builder
      .getState()
      .draft.pages.find((page) => page.id === selfDuplicate)!;
    expect(
      duplicated.widgets.some((widget) =>
        widget.actions.some(
          (action) =>
            action.type === 'navigate' && action.toPageId === selfDuplicate
        )
      )
    ).toBe(true);
    expect(selfLink).toBeTruthy();

    expect(builder.getState().reorderPage('details', 0)).toBe(true);
    expect(builder.getState().draft.pages[1]!.widgets[0]!.actions[0]).toEqual({
      type: 'navigate',
      toPageId: 'details'
    });
  });

  it('protects start and last pages while resetting active context and selection after deletion', () => {
    const builder = store();
    const added = builder.getState().addPage({ name: 'Disposable' });
    builder.getState().setActivePage(added!);
    builder.getState().setSelection({ kind: 'page', pageId: added! });

    expect(builder.getState().deletePage('services')).toBe(false);
    expect(builder.getState().deletePage(added!)).toBe(true);
    expect(builder.getState().activePageId).toBe('services');
    expect(builder.getState().selection).toEqual({ kind: 'none' });
    expect(builder.getState().deletePage('missing')).toBe(false);
  });

  it('reports pages without a start, action, or flow route as unreachable', () => {
    const builder = store();
    const orphan = builder.getState().addPage({ name: 'Orphan' });
    expect(getUnreachablePageIds(builder.getState().draft)).toEqual([orphan]);
    expect(builder.getState().isPageUnreachable(orphan!)).toBe(true);
  });

  it('shares widget content while keeping placement and typography variant-specific', () => {
    const builder = store();
    builder.getState().updateWidgetShared('services', 'picker', {
      config: { title: 'Updated' },
      actions: [{ type: 'reset-session' }]
    });
    builder.getState().setPlacement('services', 'picker', {
      col: 3,
      row: 3,
      colSpan: 1,
      rowSpan: 1
    });
    builder.getState().setTypographyScale('services', 1.5);

    const page = builder.getState().draft.pages[0]!;
    expect(page.widgets[0]!.config).toEqual({ title: 'Updated' });
    expect(page.layouts.portrait!.placements.picker).toEqual({
      col: 3,
      row: 3,
      colSpan: 1,
      rowSpan: 1
    });
    expect(page.layouts.landscape!.placements.picker).toEqual({
      col: 1,
      row: 1,
      colSpan: 3,
      rowSpan: 1
    });
    expect(page.layouts.portrait!.typographyScale).toBe(1.5);
    expect(page.layouts.landscape!.typographyScale).toBe(1.25);
  });

  it('copies only placements and typography across variants', () => {
    const builder = store();
    builder.getState().copyLayout('services', 'landscape', 'portrait');
    expect(builder.getState().draft.pages[0]!.layouts.portrait).toEqual(
      builder.getState().draft.pages[0]!.layouts.landscape
    );
    builder.getState().updateWidgetShared('services', 'picker', {
      config: { afterCopy: true }
    });
    expect(
      builder.getState().draft.pages[0]!.layouts.portrait!.placements
    ).toEqual(builder.getState().draft.pages[0]!.layouts.landscape!.placements);
  });

  it('refuses a copied layout that would exceed the target grid', () => {
    const builder = store();
    builder.getState().setActiveVariant('landscape');
    builder.getState().setPlacement('services', 'picker', {
      col: 5,
      row: 1,
      colSpan: 2,
      rowSpan: 1
    });

    expect(
      builder.getState().copyLayout('services', 'landscape', 'portrait')
    ).toBe(false);
    expect(
      builder.getState().draft.pages[0]!.layouts.portrait!.placements.picker
    ).toEqual({ col: 1, row: 1, colSpan: 2, rowSpan: 2 });
  });

  it('leaves new shared widgets explicitly unplaced in inactive variants', () => {
    const builder = store();
    const widgetId = builder.getState().addWidget('services', 'media');
    const page = builder.getState().draft.pages[0]!;
    expect(page.layouts.portrait!.placements[widgetId!]).toBeDefined();
    expect(page.layouts.landscape!.placements[widgetId!]).toBeUndefined();
    expect(builder.getState().removePlacement('services', widgetId!)).toBe(
      true
    );
    expect(
      builder
        .getState()
        .draft.pages[0]!.widgets.some((widget) => widget.id === widgetId)
    ).toBe(true);
  });

  it('does not make a draft dirty or add history for no-op and invalid edits', () => {
    const builder = store();
    const initialPlacement = {
      col: 1,
      row: 1,
      colSpan: 2,
      rowSpan: 2
    };

    expect(builder.getState().renamePage('services', 'Services')).toBe(false);
    expect(
      builder.getState().setPlacement('services', 'picker', initialPlacement)
    ).toBe(false);
    expect(
      builder.getState().setPlacement('services', 'picker', {
        col: 4,
        row: 4,
        colSpan: 2,
        rowSpan: 1
      })
    ).toBe(false);
    expect(
      builder.getState().updateWidgetShared('services', 'picker', {})
    ).toBe(false);
    expect(builder.getState().history).toHaveLength(0);
    expect(builder.getState().isDirty).toBe(false);
  });

  it('accepts an explicit undefined optional widget config as the legacy API does', () => {
    const builder = store();

    expect(
      builder.getState().addWidget('services', 'media', { config: undefined })
    ).toBe('widget-1');
  });

  it('uses structural equality for reordered records while preserving undefined and optional-key semantics', () => {
    const builder = store();
    const savedConfig = {
      alpha: 1,
      nested: { first: true, second: false },
      labels: ['one', 'two'],
      optional: undefined
    };
    builder
      .getState()
      .updateWidgetShared('services', 'picker', { config: savedConfig });
    builder.getState().markSaved();
    const historyAtSave = builder.getState().history.length;

    expect(
      builder.getState().updateWidgetShared('services', 'picker', {
        config: {
          labels: ['one', 'two'],
          optional: undefined,
          nested: { second: false, first: true },
          alpha: 1
        }
      })
    ).toBe(false);
    expect(builder.getState().history).toHaveLength(historyAtSave);
    expect(builder.getState().isDirty).toBe(false);
    expect(
      Object.hasOwn(
        builder.getState().draft.pages[0]!.widgets[0]!.config,
        'optional'
      )
    ).toBe(true);

    expect(
      builder
        .getState()
        .updateWidgetShared('services', 'picker', { config: {} })
    ).toBe(true);
    expect(builder.getState().isDirty).toBe(true);
    expect(builder.getState().undo()).toBe(true);
    expect(builder.getState().isDirty).toBe(false);
  });

  it('updates and clears a shared access policy without creating per-variant state', () => {
    const builder = store();
    const access = {
      when: {
        kind: 'rule' as const,
        field: 'identity.isAuthenticated' as const,
        operator: 'is-true' as const
      },
      whenFalse: 'lock' as const
    };

    expect(
      builder.getState().updateWidgetShared('services', 'picker', { access })
    ).toBe(true);
    expect(builder.getState().draft.pages[0]!.widgets[0]!.access).toEqual(
      access
    );
    expect(
      builder
        .getState()
        .updateWidgetShared('services', 'picker', { access: null })
    ).toBe(true);
    expect(
      builder.getState().draft.pages[0]!.widgets[0]!.access
    ).toBeUndefined();
  });

  it('restores draft and active context atomically, caps history, and tracks saved content', () => {
    const builder = store();
    builder.getState().markSaved();
    builder.getState().setActivePage('details');
    builder.getState().setActiveVariant('landscape');
    builder.getState().renamePage('details', 'More details');
    expect(builder.getState().isDirty).toBe(true);
    builder.getState().undo();
    expect(builder.getState().draft.pages[1]!.name).toBe('Details');
    expect(builder.getState().activePageId).toBe('details');
    expect(builder.getState().activeVariantId).toBe('landscape');
    expect(builder.getState().isDirty).toBe(false);
    builder.getState().redo();
    expect(builder.getState().draft.pages[1]!.name).toBe('More details');

    for (let index = 0; index < 45; index++) {
      builder.getState().renamePage('details', `Name ${index}`);
    }
    expect(builder.getState().history).toHaveLength(40);
    const beforeNoop = builder.getState().history.length;
    builder.getState().renamePage('details', 'Name 44');
    expect(builder.getState().history).toHaveLength(beforeNoop);
    builder.getState().undo();
    builder.getState().renamePage('details', 'New branch');
    expect(builder.getState().redo()).toBe(false);
  });
});
