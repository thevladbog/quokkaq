import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
import { validCanvasItems } from './experience-canvas';
import { ExperienceBuilderShell } from './experience-builder-shell';
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
});
