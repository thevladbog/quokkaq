import { describe, expect, it } from 'vitest';
import { clientPointToGridCell } from './builder-canvas-grid-utils';

describe('clientPointToGridCell', () => {
  const rect = {
    left: 100,
    top: 50,
    width: 100,
    height: 80,
    right: 200,
    bottom: 130,
    x: 100,
    y: 50,
    toJSON: () => ''
  } as DOMRect;

  it('maps top-left client point to cell 1,1', () => {
    expect(clientPointToGridCell(100, 50, rect, 4, 2, 0)).toEqual({
      col: 1,
      row: 1
    });
  });

  it('maps bottom-right inside rect to last cell', () => {
    expect(clientPointToGridCell(199, 129, rect, 4, 2, 0)).toEqual({
      col: 4,
      row: 2
    });
  });

  it('respects gap between tracks', () => {
    const gap = 4;
    const cellW = (100 - 3 * gap) / 4;
    const xMidCell2 = 100 + cellW + gap + cellW / 2;
    const out = clientPointToGridCell(xMidCell2, 90, rect, 4, 2, gap);
    expect(out.col).toBe(2);
  });
});
