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
