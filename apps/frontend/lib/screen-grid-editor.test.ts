import { describe, expect, it } from 'vitest';

import {
  canPlacePlacement,
  copyGridLayout,
  findDuplicatePlacement,
  firstFreeCell,
  movePlacement,
  occupiedCells,
  resizePlacement
} from './screen-grid-editor';

const items = [
  { id: 'first', placement: { col: 1, row: 1, colSpan: 2, rowSpan: 2 } },
  { id: 'second', placement: { col: 4, row: 1, colSpan: 1, rowSpan: 1 } }
];

describe('screen grid editor', () => {
  it('returns occupied cells and the first free cell in reading order', () => {
    expect([...occupiedCells(items)]).toEqual([
      '1:1',
      '1:2',
      '2:1',
      '2:2',
      '4:1'
    ]);
    expect(firstFreeCell(4, 2, items)).toEqual({ col: 3, row: 1 });
    expect(firstFreeCell(4, 2, items, 'first')).toEqual({ col: 1, row: 1 });
  });

  it('rejects out-of-bounds and overlapping placements', () => {
    expect(
      canPlacePlacement(4, 3, items, {
        col: 2,
        row: 2,
        colSpan: 2,
        rowSpan: 2
      })
    ).toBe(false);
    expect(
      canPlacePlacement(4, 3, items, {
        col: 4,
        row: 3,
        colSpan: 2,
        rowSpan: 1
      })
    ).toBe(false);
    expect(
      canPlacePlacement(
        4,
        3,
        items,
        { col: 1, row: 1, colSpan: 2, rowSpan: 2 },
        'first'
      )
    ).toBe(true);
  });

  it('moves and resizes only valid placements', () => {
    const original = { col: 1, row: 1, colSpan: 2, rowSpan: 2 };
    expect(movePlacement(4, 3, items, 'first', original, 2, 0)).toBeNull();
    expect(movePlacement(4, 3, items, 'first', original, 0, 1)).toEqual({
      col: 1,
      row: 2,
      colSpan: 2,
      rowSpan: 2
    });
    expect(resizePlacement(4, 3, items, 'first', original, 3, 2)).toEqual({
      col: 1,
      row: 1,
      colSpan: 3,
      rowSpan: 2
    });
    expect(resizePlacement(4, 3, items, 'first', original, 4, 4)).toBeNull();
  });

  it('copies variant layout values without sharing mutable placement data', () => {
    const source = {
      placements: { first: { col: 1, row: 1, colSpan: 2, rowSpan: 2 } },
      typographyScale: 1.25
    };
    const copy = copyGridLayout(source);
    copy.placements.first!.col = 3;
    copy.typographyScale = 1;

    expect(source).toEqual({
      placements: { first: { col: 1, row: 1, colSpan: 2, rowSpan: 2 } },
      typographyScale: 1.25
    });
  });

  it('duplicates into the first free 1×1 cell and grows only to the configured limit', () => {
    expect(
      findDuplicatePlacement(
        2,
        1,
        items,
        { col: 1, row: 1, colSpan: 2, rowSpan: 2 },
        3
      )
    ).toEqual({
      placement: { col: 1, row: 3, colSpan: 1, rowSpan: 1 },
      rows: 3
    });
  });
});
