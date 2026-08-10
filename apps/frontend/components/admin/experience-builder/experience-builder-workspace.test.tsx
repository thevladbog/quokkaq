import React from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExperienceTemplate } from '@quokkaq/shared-types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values?.default ? String(values.default) : key
}));

import {
  CreateExperienceDialog,
  createExperienceDraft,
  EXPERIENCE_PROFILE_PRESETS
} from './create-experience-dialog';
import { ExperienceCanvas, validCanvasItems } from './experience-canvas';
import { ExperienceBuilderShell } from './experience-builder-shell';
import type { ExperiencePreviewRenderProps } from './experience-preview-dialog';
import { classifyExperienceLayout } from './experience-layout-classification';
import { editorLayerKey } from './experience-layers-panel';
import { parseExperienceBuilderTab } from './experience-side-panel';
import { searchCatalogEntries } from './experience-widget-catalog';
import { collectUnplacedWidgets } from './unplaced-widgets-tray';
import { useExperienceBuilderStore } from '@/lib/stores/experience-builder-store';

afterEach(() => {
  cleanup();
});

describe('CreateExperienceDialog', () => {
  it('creates a ticket-station draft with concrete iPad portrait and landscape variants', () => {
    const onCreate = vi.fn();
    render(
      <CreateExperienceDialog open onOpenChange={vi.fn()} onCreate={onCreate} />
    );

    fireEvent.click(screen.getByRole('radio', { name: /ticket station/i }));
    fireEvent.click(
      screen.getByRole('checkbox', { name: /iPad 10.9 portrait/i })
    );
    fireEvent.click(
      screen.getByRole('checkbox', { name: /iPad 10.9 landscape/i })
    );
    fireEvent.click(screen.getByRole('button', { name: /create experience/i }));

    const draft = onCreate.mock.calls[0]?.[0] as ExperienceTemplate;
    expect(draft.surface).toBe('ticket-station');
    expect(draft.variants.map((variant) => variant.profile.id)).toEqual([
      'ipad-10-9-portrait',
      'ipad-10-9-landscape'
    ]);
    expect(draft.variants.map((variant) => variant.profile.width)).toEqual([
      820, 1180
    ]);
    expect(
      screen.queryByRole('radio', { name: /tablet/i })
    ).not.toBeInTheDocument();
  });

  it('rejects an invalid or unsupported profile instead of creating a mutable generic device', () => {
    expect(() =>
      createExperienceDraft('queue-display', [EXPERIENCE_PROFILE_PRESETS[0]!])
    ).toThrow(/not available/i);

    expect(() =>
      createExperienceDraft('ticket-station', [
        EXPERIENCE_PROFILE_PRESETS[0]!,
        EXPERIENCE_PROFILE_PRESETS[0]!
      ])
    ).toThrow(/unique/i);
  });

  it('copies only canonical DeviceProfile fields into a draft variant', () => {
    const draft = createExperienceDraft('ticket-station', [
      EXPERIENCE_PROFILE_PRESETS[0]!
    ]);

    expect(Object.keys(draft.variants[0]!.profile).sort()).toEqual([
      'height',
      'id',
      'interactionMode',
      'name',
      'safeArea',
      'viewingDistance',
      'width'
    ]);
    expect(draft.variants[0]!.profile).not.toHaveProperty('supportedSurfaces');
  });
});

function workspaceDraft(): ExperienceTemplate {
  return {
    schemaVersion: 1,
    id: 'desk-experience',
    surface: 'ticket-station',
    startPageId: 'services',
    variants: [
      {
        id: 'portrait',
        profile: {
          id: 'ipad-10-9-portrait',
          name: 'iPad 10.9 portrait',
          width: 820,
          height: 1180,
          interactionMode: 'touch',
          viewingDistance: 'near',
          safeArea: { top: 24, right: 24, bottom: 24, left: 24 }
        },
        grid: { columns: 12, rows: 18 }
      },
      {
        id: 'landscape',
        profile: {
          id: 'ipad-10-9-landscape',
          name: 'iPad 10.9 landscape',
          width: 1180,
          height: 820,
          interactionMode: 'touch',
          viewingDistance: 'near',
          safeArea: { top: 24, right: 24, bottom: 24, left: 24 }
        },
        grid: { columns: 18, rows: 12 }
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
            config: { title: 'Choose service' },
            actions: [{ type: 'navigate', toPageId: 'details' }]
          }
        ],
        layouts: {
          portrait: {
            placements: { picker: { col: 1, row: 1, colSpan: 6, rowSpan: 4 } }
          },
          landscape: { placements: {} }
        }
      },
      {
        id: 'details',
        name: 'Details',
        widgets: [],
        layouts: {
          portrait: { placements: {} },
          landscape: { placements: {} }
        }
      }
    ]
  };
}

describe('ExperienceBuilderShell', () => {
  it('keeps page targets stable while display order changes and surfaces the selected page', () => {
    useExperienceBuilderStore.getState().loadDraft(workspaceDraft());
    render(<ExperienceBuilderShell />);

    fireEvent.click(screen.getByRole('button', { name: /move details up/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));

    const state = useExperienceBuilderStore.getState();
    expect(state.draft.pages.map((page) => page.id)).toEqual([
      'details',
      'services'
    ]);
    expect(state.draft.pages[1]?.widgets[0]?.actions).toEqual([
      { type: 'navigate', toPageId: 'details' }
    ]);
    expect(state.activePageId).toBe('details');
  });

  it('keeps editor-only layer lock and hide outside the runtime draft', () => {
    useExperienceBuilderStore.getState().loadDraft(workspaceDraft());
    render(<ExperienceBuilderShell />);

    fireEvent.click(screen.getByRole('tab', { name: /layers/i }));
    fireEvent.click(
      screen.getByRole('button', { name: /select choose service/i })
    );
    fireEvent.click(
      screen.getByRole('button', { name: /lock choose service/i })
    );
    fireEvent.click(
      screen.getByRole('button', { name: /hide choose service/i })
    );

    const widget =
      useExperienceBuilderStore.getState().draft.pages[0]?.widgets[0];
    expect(widget?.access).toBeUndefined();
    expect(widget?.actions).toEqual([
      { type: 'navigate', toPageId: 'details' }
    ]);
    expect(screen.getByText(/hidden in editor/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Choose service' })
    ).not.toBeInTheDocument();
  });

  it('reorders layers in editor metadata without changing the shared widget list', () => {
    useExperienceBuilderStore.getState().loadDraft(workspaceDraft());
    useExperienceBuilderStore.getState().addWidget('services', 'media', {
      config: { title: 'Welcome image' }
    });
    render(<ExperienceBuilderShell />);

    fireEvent.click(screen.getByRole('tab', { name: /layers/i }));
    fireEvent.click(
      screen.getByRole('button', { name: /move choose service down/i })
    );

    expect(
      screen.getAllByTestId('experience-layer').map((node) => node.textContent)
    ).toEqual(expect.arrayContaining(['Welcome image', 'Choose service']));
    expect(screen.getAllByTestId('experience-layer')[0]).toHaveTextContent(
      'Welcome image'
    );
    expect(
      useExperienceBuilderStore
        .getState()
        .draft.pages[0]?.widgets.map((widget) => widget.id)
    ).toEqual(['picker', expect.any(String)]);
    expect(
      screen
        .getAllByTestId('experience-canvas-widget')
        .map((node) => node.getAttribute('data-widget-id'))
    ).toEqual([expect.stringMatching(/^widget-/), 'picker']);
  });

  it('renders shared widget changes in both variants while retaining separate placements', () => {
    useExperienceBuilderStore.getState().loadDraft(workspaceDraft());
    useExperienceBuilderStore
      .getState()
      .updateWidgetShared('services', 'picker', {
        config: { title: 'Employee services' }
      });
    useExperienceBuilderStore.getState().setActiveVariant('landscape');
    useExperienceBuilderStore.getState().setPlacement('services', 'picker', {
      col: 2,
      row: 2,
      colSpan: 3,
      rowSpan: 2
    });
    render(<ExperienceBuilderShell />);

    expect(
      screen.getByRole('button', { name: 'Employee services' })
    ).toBeInTheDocument();
    const layouts =
      useExperienceBuilderStore.getState().draft.pages[0]?.layouts;
    expect(layouts?.portrait?.placements.picker).toEqual({
      col: 1,
      row: 1,
      colSpan: 6,
      rowSpan: 4
    });
    expect(layouts?.landscape?.placements.picker).toEqual({
      col: 2,
      row: 2,
      colSpan: 3,
      rowSpan: 2
    });
  });

  it('uses the prop-driven canvas placement callback for keyboard positioning', () => {
    useExperienceBuilderStore.getState().loadDraft(workspaceDraft());
    render(<ExperienceBuilderShell />);

    const picker = screen.getByRole('button', { name: 'Choose service' });
    fireEvent.click(picker);
    fireEvent.keyDown(picker, { key: 'ArrowRight' });

    expect(
      useExperienceBuilderStore.getState().draft.pages[0]?.layouts.portrait
        .placements.picker
    ).toEqual({ col: 2, row: 1, colSpan: 6, rowSpan: 4 });
  });

  it('does not move a selected locked widget with the keyboard', () => {
    useExperienceBuilderStore.getState().loadDraft(workspaceDraft());
    render(<ExperienceBuilderShell />);

    fireEvent.click(screen.getByRole('tab', { name: /layers/i }));
    fireEvent.click(
      screen.getByRole('button', { name: /select choose service/i })
    );
    fireEvent.click(
      screen.getByRole('button', { name: /lock choose service/i })
    );
    const picker = screen.getByRole('button', { name: 'Choose service' });
    fireEvent.keyDown(picker, { key: 'ArrowRight' });

    expect(
      useExperienceBuilderStore.getState().draft.pages[0]?.layouts.portrait
        .placements.picker
    ).toEqual({ col: 1, row: 1, colSpan: 6, rowSpan: 4 });
  });

  it('keeps all mutation controls read-only-safe when canEdit is false', () => {
    useExperienceBuilderStore.getState().loadDraft(workspaceDraft());
    const before = JSON.stringify(useExperienceBuilderStore.getState().draft);
    const onPreview = vi.fn();
    render(<ExperienceBuilderShell canEdit={false} onPreview={onPreview} />);

    expect(screen.getByRole('button', { name: /zoom in/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /add page/i })).toBeDisabled();
    expect(screen.getByLabelText(/open services actions/i)).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /preview/i }));
    expect(onPreview).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /close preview/i }));

    fireEvent.click(screen.getByRole('tab', { name: /layers/i }));
    expect(
      screen.getByRole('button', { name: /lock choose service/i })
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('tab', { name: /add/i }));
    expect(
      screen.getByRole('button', { name: /service picker/i })
    ).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/layout variant/i), {
      target: { value: 'landscape' }
    });
    expect(screen.getByLabelText(/copy layout from/i)).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /place choose service/i })
    ).toBeDisabled();
    expect(JSON.stringify(useExperienceBuilderStore.getState().draft)).toBe(
      before
    );
  });

  it('keeps save and publish separate and never assigns a device from this workspace', async () => {
    const publishableDraft: ExperienceTemplate = {
      schemaVersion: 1,
      id: 'lobby-display',
      surface: 'queue-display',
      startPageId: 'queue',
      variants: [
        {
          id: 'display',
          profile: {
            id: 'display',
            name: 'Hall display',
            width: 1920,
            height: 1080,
            interactionMode: 'non-touch',
            viewingDistance: 'far',
            safeArea: { top: 0, right: 0, bottom: 0, left: 0 }
          },
          grid: { columns: 12, rows: 18 }
        }
      ],
      pages: [
        {
          id: 'queue',
          name: 'Queue',
          widgets: [
            { id: 'calls', type: 'called-tickets', config: {}, actions: [] }
          ],
          layouts: {
            display: {
              placements: {
                calls: { col: 1, row: 1, colSpan: 12, rowSpan: 18 }
              }
            }
          }
        }
      ]
    };
    useExperienceBuilderStore.getState().loadDraft(publishableDraft);
    useExperienceBuilderStore.getState().updateWidgetShared('queue', 'calls', {
      config: { title: 'Updated queue' }
    });
    const onSaveDraft = vi.fn();
    const onPublish = vi.fn();
    render(
      <ExperienceBuilderShell
        onSaveDraft={onSaveDraft}
        onPublish={onPublish}
        devices={[
          {
            id: 'terminal-1',
            name: 'Lobby iPad',
            variantName: 'Portrait',
            lastSeenAt: null,
            appliedVersion: null
          }
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    expect(onSaveDraft).toHaveBeenCalledTimes(1);
    expect(onPublish).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(useExperienceBuilderStore.getState().isDirty).toBe(false)
    );

    fireEvent.click(screen.getByRole('button', { name: /^publish$/i }));
    expect(
      screen.getByText(/assignment becomes available after runtime validation/i)
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /assign/i })).toBeNull();
    expect(onPublish).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /^publish$/i }));
    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  it('keeps a failed parsed draft dirty and exposes the safe validation result', async () => {
    useExperienceBuilderStore.getState().loadDraft(workspaceDraft());
    useExperienceBuilderStore
      .getState()
      .updateWidgetShared('services', 'picker', {
        config: { title: 'Employee services' }
      });
    const onSaveDraft = vi.fn().mockResolvedValue({
      kind: 'invalid-definition',
      issues: [
        {
          code: 'response.invalid',
          path: ['definition'],
          message: 'not rendered verbatim'
        }
      ]
    });

    render(<ExperienceBuilderShell onSaveDraft={onSaveDraft} />);
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      /server response contains an invalid experience definition/i
    );
    expect(alert).toHaveTextContent(/location: definition/i);
    expect(alert).not.toHaveTextContent('response.invalid');
    expect(alert).not.toHaveTextContent('not rendered verbatim');
    expect(useExperienceBuilderStore.getState().isDirty).toBe(true);
  });

  it('keeps edits made while a draft save is pending dirty', async () => {
    useExperienceBuilderStore.getState().loadDraft(workspaceDraft());
    useExperienceBuilderStore
      .getState()
      .updateWidgetShared('services', 'picker', {
        config: { title: 'Submitted title' }
      });

    let finishSave: (() => void) | undefined;
    const onSaveDraft = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve;
        })
    );
    render(<ExperienceBuilderShell onSaveDraft={onSaveDraft} />);

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    expect(onSaveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        pages: [
          expect.objectContaining({
            widgets: [
              expect.objectContaining({ config: { title: 'Submitted title' } })
            ]
          }),
          expect.anything()
        ]
      })
    );

    act(() => {
      useExperienceBuilderStore
        .getState()
        .updateWidgetShared('services', 'picker', {
          config: { title: 'Edited while saving' }
        });
    });
    await act(async () => {
      finishSave?.();
      await Promise.resolve();
    });

    expect(
      useExperienceBuilderStore.getState().draft.pages[0]?.widgets[0]?.config
        .title
    ).toBe('Edited while saving');
    expect(useExperienceBuilderStore.getState().isDirty).toBe(true);
  });

  it('forwards the selected synthetic scenario through the runtime preview seam', () => {
    useExperienceBuilderStore.getState().loadDraft(workspaceDraft());
    const renderPreview = vi.fn((props: ExperiencePreviewRenderProps) => (
      <output data-testid='runtime-preview-context'>
        {String(props.scenarioContext.identity?.isEmployee)}
      </output>
    ));

    render(
      <ExperienceBuilderShell
        onPublish={vi.fn()}
        renderPreview={renderPreview}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /preview/i }));
    expect(screen.getByTestId('runtime-preview-context')).toHaveTextContent(
      'false'
    );

    fireEvent.click(
      screen.getByRole('button', { name: /^authenticated employee$/i })
    );
    expect(screen.getByTestId('runtime-preview-context')).toHaveTextContent(
      'true'
    );
    expect(renderPreview).toHaveBeenLastCalledWith(
      expect.objectContaining({
        draft: expect.objectContaining({ id: 'desk-experience' }),
        variant: expect.objectContaining({ id: 'portrait' }),
        scenarioContext: expect.objectContaining({
          identity: expect.objectContaining({ isEmployee: true })
        })
      })
    );
  });

  it('uses one focusable scroll region for the real 100% device preview', () => {
    useExperienceBuilderStore.getState().loadDraft(workspaceDraft());
    render(<ExperienceBuilderShell />);

    fireEvent.click(screen.getByRole('button', { name: /preview/i }));
    fireEvent.click(screen.getByRole('button', { name: /100% scale/i }));

    const viewport = screen.getByRole('region', {
      name: /device preview canvas/i
    });
    expect(viewport).toHaveAttribute('tabindex', '0');
    expect(viewport).toHaveClass('overflow-auto');

    const canvas = within(viewport).getByTestId('builder-canvas-zoom-surface');
    expect(canvas).toHaveClass('overflow-visible');
    expect(canvas).not.toHaveClass('overflow-auto');
    expect(
      within(viewport).getByTestId('builder-canvas-device-frame')
    ).toHaveAttribute('data-effective-scale', '1');

    const scrollOwners = [viewport, ...viewport.querySelectorAll('*')].filter(
      (element) => element.classList.contains('overflow-auto')
    );
    expect(scrollOwners).toEqual([viewport]);

    fireEvent.click(screen.getByRole('button', { name: /fit to window/i }));
    expect(viewport).toHaveClass('overflow-hidden');
    expect(viewport).not.toHaveAttribute('tabindex');
    expect(canvas).toHaveClass('overflow-auto');
    expect(canvas).not.toHaveClass('overflow-visible');
  });

  it('shows an incomplete landscape tray and lets pointer and keyboard users place a widget in a chosen cell', () => {
    useExperienceBuilderStore.getState().loadDraft(workspaceDraft());
    render(<ExperienceBuilderShell />);

    fireEvent.change(screen.getByLabelText(/layout variant/i), {
      target: { value: 'landscape' }
    });
    const place = screen.getByRole('button', { name: /place choose service/i });
    place.focus();
    fireEvent.keyDown(place, { key: 'Enter' });
    fireEvent.click(
      screen.getByRole('button', {
        name: /place choose service in column 4, row 3/i
      })
    );

    const layout =
      useExperienceBuilderStore.getState().draft.pages[0]?.layouts.landscape;
    expect(layout?.placements.picker).toEqual({
      col: 4,
      row: 3,
      colSpan: 1,
      rowSpan: 1
    });
    expect(screen.getAllByText(/1180×820/).length).toBeGreaterThan(0);
  });

  it('copies a complete portrait layout into the incomplete landscape variant', () => {
    useExperienceBuilderStore.getState().loadDraft(workspaceDraft());
    render(<ExperienceBuilderShell />);

    fireEvent.change(screen.getByLabelText(/layout variant/i), {
      target: { value: 'landscape' }
    });
    fireEvent.change(screen.getByLabelText(/copy layout from/i), {
      target: { value: 'portrait' }
    });

    expect(
      useExperienceBuilderStore.getState().draft.pages[0]?.layouts.landscape
        .placements.picker
    ).toEqual({ col: 1, row: 1, colSpan: 6, rowSpan: 4 });
    expect(screen.getByText(/all widgets are placed/i)).toBeInTheDocument();
  });

  it('keeps overflowing landscape placements out of the valid canvas and flags them in the tray', () => {
    const draft = workspaceDraft();
    const page = draft.pages[0]!;
    const landscape = draft.variants[1]!;
    page.layouts.landscape.placements.picker = {
      col: 18,
      row: 12,
      colSpan: 2,
      rowSpan: 2
    };

    expect(collectUnplacedWidgets(page, landscape)).toEqual([
      expect.objectContaining({ id: 'picker', reason: 'overflowing' })
    ]);
    expect(validCanvasItems(page, landscape, {})).toEqual([]);
  });

  it('keeps canonical overlap validity and tray counts stable when editor layer order reverses', () => {
    const draft = workspaceDraft();
    const page = draft.pages[0]!;
    const portrait = draft.variants[0]!;
    page.widgets.push(
      {
        id: 'overlap',
        type: 'media',
        config: { title: 'Overlapping media' },
        actions: []
      },
      {
        id: 'independent',
        type: 'media',
        config: { title: 'Independent text' },
        actions: []
      }
    );
    page.layouts.portrait.placements.overlap = {
      col: 1,
      row: 1,
      colSpan: 6,
      rowSpan: 4
    };
    page.layouts.portrait.placements.independent = {
      col: 8,
      row: 1,
      colSpan: 3,
      rowSpan: 2
    };

    expect(
      classifyExperienceLayout(page, portrait).map((item) => [
        item.widget.id,
        item.status
      ])
    ).toEqual([
      ['picker', 'valid'],
      ['overlap', 'overflowing'],
      ['independent', 'valid']
    ]);
    const canonicalTray = collectUnplacedWidgets(page, portrait);
    expect(canonicalTray).toEqual([
      expect.objectContaining({ id: 'overlap', reason: 'overflowing' })
    ]);

    const canonicalItems = validCanvasItems(page, portrait, {}, undefined, [
      'picker',
      'overlap',
      'independent'
    ]);
    const reversedItems = validCanvasItems(page, portrait, {}, undefined, [
      'independent',
      'overlap',
      'picker'
    ]);
    expect(canonicalItems.map((item) => item.id)).toEqual([
      'picker',
      'independent'
    ]);
    expect(reversedItems.map((item) => item.id)).toEqual([
      'independent',
      'picker'
    ]);
    expect(collectUnplacedWidgets(page, portrait)).toEqual(canonicalTray);

    const hiddenFirstItems = validCanvasItems(
      page,
      portrait,
      { [editorLayerKey(page.id, 'picker')]: { hidden: true } },
      undefined,
      ['independent', 'overlap', 'picker']
    );
    expect(hiddenFirstItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'picker', hidden: true }),
        expect.objectContaining({ id: 'independent' })
      ])
    );
    expect(hiddenFirstItems.map((item) => item.id)).not.toContain('overlap');

    const { unmount } = render(
      <ExperienceCanvas
        page={page}
        variant={portrait}
        canEdit
        zoom={1}
        editorState={{}}
        orderedWidgetIds={['picker', 'overlap', 'independent']}
        onSelectWidget={vi.fn()}
        onPlacementChange={vi.fn()}
      />
    );
    expect(
      screen
        .getAllByTestId('experience-canvas-widget')
        .map((node) => node.getAttribute('data-widget-id'))
    ).toEqual(['picker', 'independent']);
    unmount();

    render(
      <ExperienceCanvas
        page={page}
        variant={portrait}
        canEdit
        zoom={1}
        editorState={{}}
        orderedWidgetIds={['independent', 'overlap', 'picker']}
        onSelectWidget={vi.fn()}
        onPlacementChange={vi.fn()}
      />
    );
    expect(
      screen
        .getAllByTestId('experience-canvas-widget')
        .map((node) => node.getAttribute('data-widget-id'))
    ).toEqual(['independent', 'picker']);
    expect(
      screen
        .getAllByTestId('experience-canvas-widget')
        .map((node) => node.getAttribute('data-widget-id'))
    ).not.toContain('overlap');
  });
});

describe('Experience widget catalog search', () => {
  it('matches translated labels and descriptions instead of English catalog literals', () => {
    const ru = (key: string, values?: { default?: string }) => {
      const translated: Record<string, string> = {
        'catalog.widgets.servicePicker.label': 'Выбор услуги',
        'catalog.widgets.servicePicker.description': 'Категории и услуги'
      };
      return translated[key] ?? values?.default ?? key;
    };

    expect(
      searchCatalogEntries('ticket-station', 'Категории', ru).map(
        (entry) => entry.type
      )
    ).toContain('service-picker');
  });
});

describe('Experience builder panel tabs', () => {
  it('accepts only declared builder tabs without a type assertion', () => {
    expect(parseExperienceBuilderTab('pages')).toBe('pages');
    expect(parseExperienceBuilderTab('layers')).toBe('layers');
    expect(parseExperienceBuilderTab('add')).toBe('add');
    expect(parseExperienceBuilderTab('unexpected')).toBeNull();
  });
});
