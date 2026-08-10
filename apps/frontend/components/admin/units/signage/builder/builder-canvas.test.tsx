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
import { BuilderCanvas } from './builder-canvas';

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
});
