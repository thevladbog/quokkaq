import React from 'react';
import { DndContext } from '@dnd-kit/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScreenTemplate } from '@quokkaq/shared-types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { default?: string }) =>
    values?.default ?? key
}));

import { useScreenBuilderStore } from '@/lib/stores/screen-builder-store';
import {
  BuilderCanvas,
  BuilderCanvasGrid,
  resolvedDeviceFrameScale,
  safeAreaOverlayInsets
} from './builder-canvas';

const template: ScreenTemplate = {
  layoutKind: 'cellGrid',
  id: 'legacy-canvas',
  portrait: {
    columns: 4,
    rows: 4,
    widgets: [
      {
        id: 'clock-one',
        type: 'clock',
        config: {},
        placement: { col: 1, row: 1, colSpan: 2, rowSpan: 2 }
      }
    ]
  },
  landscape: { columns: 4, rows: 4, widgets: [] }
};

afterEach(cleanup);

beforeEach(() => {
  useScreenBuilderStore.getState().initFrom(template, null);
});

describe('BuilderCanvas legacy wrapper', () => {
  it('keeps its public canvas label and selects a legacy widget through the grid adapter', () => {
    render(
      <DndContext>
        <BuilderCanvas />
      </DndContext>
    );

    expect(screen.getByLabelText('Layout canvas')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /widget\.clock/i }));

    expect(useScreenBuilderStore.getState().selection).toEqual({
      kind: 'widget',
      id: 'clock-one'
    });
  });

  it('keeps the legacy resize mutation routed through the shared grid callback', () => {
    const onPlacementChange = vi.fn();
    render(
      <DndContext>
        <BuilderCanvasGrid
          face='portrait'
          grid={{ columns: 4, rows: 4 }}
          items={template.portrait.widgets}
          canEdit
          ariaLabel='Callback canvas'
          onPlacementChange={onPlacementChange}
          renderItem={({ item, onPlacementChange: changePlacement }) => (
            <button
              key={item.id}
              type='button'
              onClick={() =>
                changePlacement?.({
                  ...item.placement,
                  colSpan: item.placement.colSpan + 1
                })
              }
            >
              Resize {item.id}
            </button>
          )}
        />
      </DndContext>
    );

    fireEvent.click(screen.getByRole('button', { name: /resize clock-one/i }));
    expect(onPlacementChange).toHaveBeenCalledWith('clock-one', {
      col: 1,
      row: 1,
      colSpan: 3,
      rowSpan: 2
    });
  });

  it('resizes a selected legacy widget through the prop-driven canvas adapter', () => {
    const previousRect = HTMLElement.prototype.getBoundingClientRect;
    const previousSetPointerCapture = HTMLElement.prototype.setPointerCapture;
    const previousReleasePointerCapture =
      HTMLElement.prototype.releasePointerCapture;
    HTMLElement.prototype.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 400,
        bottom: 400,
        width: 400,
        height: 400,
        toJSON: () => ({})
      }) as DOMRect;
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.releasePointerCapture = vi.fn();

    try {
      render(
        <DndContext>
          <BuilderCanvas />
        </DndContext>
      );
      const widget = screen.getByRole('button', { name: /widget\.clock/i });
      fireEvent.click(widget);
      const handle = widget.querySelector('[role="presentation"]');
      expect(handle).not.toBeNull();

      fireEvent.pointerDown(handle!, { pointerId: 1 });
      fireEvent.pointerMove(handle!, {
        pointerId: 1,
        clientX: 290,
        clientY: 290
      });
      fireEvent.pointerUp(handle!, { pointerId: 1 });

      expect(
        useScreenBuilderStore.getState().template.portrait.widgets[0]?.placement
      ).toEqual({ col: 1, row: 1, colSpan: 3, rowSpan: 3 });
    } finally {
      HTMLElement.prototype.getBoundingClientRect = previousRect;
      HTMLElement.prototype.setPointerCapture = previousSetPointerCapture;
      HTMLElement.prototype.releasePointerCapture =
        previousReleasePointerCapture;
    }
  });

  it('suppresses shared-grid pointer mutation callbacks when editing is disabled', () => {
    const onPlacementChange = vi.fn();
    render(
      <DndContext>
        <BuilderCanvasGrid
          face='portrait'
          grid={{ columns: 4, rows: 4 }}
          items={template.portrait.widgets}
          canEdit={false}
          ariaLabel='Read only canvas'
          onPlacementChange={onPlacementChange}
          renderItem={({ item, onPlacementChange: changePlacement }) => (
            <button
              key={item.id}
              type='button'
              onClick={() => changePlacement?.(item.placement)}
            >
              Try move {item.id}
            </button>
          )}
        />
      </DndContext>
    );

    fireEvent.click(
      screen.getByRole('button', { name: /try move clock-one/i })
    );
    expect(onPlacementChange).not.toHaveBeenCalled();
  });

  it('uses dimension-aware safe-area inset geometry for portrait and landscape devices', () => {
    expect(
      safeAreaOverlayInsets(
        { top: 24, right: 24, bottom: 24, left: 24 },
        { width: 820, height: 1180 }
      )
    ).toEqual({
      top: `${(24 / 1180) * 100}%`,
      right: `${(24 / 820) * 100}%`,
      bottom: `${(24 / 1180) * 100}%`,
      left: `${(24 / 820) * 100}%`
    });
    expect(
      safeAreaOverlayInsets(
        { top: 24, right: 24, bottom: 24, left: 24 },
        { width: 1180, height: 820 }
      )
    ).toEqual({
      top: `${(24 / 820) * 100}%`,
      right: `${(24 / 1180) * 100}%`,
      bottom: `${(24 / 820) * 100}%`,
      left: `${(24 / 1180) * 100}%`
    });
  });

  it('provides an internal scrolling zoom surface instead of clipping at 125%', () => {
    render(
      <DndContext>
        <BuilderCanvasGrid
          face='portrait'
          grid={{ columns: 4, rows: 4 }}
          items={template.portrait.widgets}
          canEdit
          zoom={1.25}
          deviceSize={{ width: 820, height: 1180 }}
          ariaLabel='Zoom canvas'
          renderItem={({ item }) => <span key={item.id}>{item.id}</span>}
        />
      </DndContext>
    );

    expect(screen.getByTestId('builder-canvas-zoom-surface')).toHaveClass(
      'overflow-auto'
    );
    expect(screen.getByTestId('builder-canvas-device-frame')).toHaveAttribute(
      'data-zoom',
      '1.25'
    );
  });

  it('expands a placement grid enough for 44px cells while preserving device aspect ratio', () => {
    const grid = { columns: 18, rows: 12 };
    const device = { width: 1180, height: 820 };
    const scale = resolvedDeviceFrameScale(device, grid, 1, 44);
    const frameWidth = device.width * scale;
    const frameHeight = device.height * scale;
    const cellWidth = (frameWidth - 20 - 17 * 3) / grid.columns;
    const cellHeight = (frameHeight - 20 - 11 * 3) / grid.rows;

    expect(cellWidth).toBeGreaterThanOrEqual(44);
    expect(cellHeight).toBeGreaterThanOrEqual(44);
    expect(frameWidth / frameHeight).toBeCloseTo(device.width / device.height);
  });
});
