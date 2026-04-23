import { describe, it, expect } from 'vitest';
import {
  regionDropId,
  parseRegionDropId,
  libraryId,
  parseLibraryId,
  canvasWidgetId,
  parseCanvasWidgetId,
  canvasCellId,
  parseCanvasCellId
} from '@/components/admin/units/signage/builder/screen-dnd-ids';

describe('screen dnd ids', () => {
  it('encodes and parses region drop id', () => {
    const id = regionDropId('main');
    expect(id).toBe('screen-region:main');
    expect(parseRegionDropId(id)).toBe('main');
    expect(parseRegionDropId('x')).toBeNull();
  });

  it('encodes and parses library id', () => {
    const id = libraryId('clock');
    expect(id).toBe('screen-palette:clock');
    const p = parseLibraryId(id);
    expect(p?.from).toBe('library');
    expect(p?.type).toBe('clock');
  });

  it('encodes and parses canvas widget id', () => {
    const id = canvasWidgetId('wabc123');
    expect(id).toBe('screen-canvas-widget:wabc123');
    const p = parseCanvasWidgetId(id);
    expect(p?.from).toBe('canvas');
    expect(p?.widgetId).toBe('wabc123');
    expect(parseCanvasWidgetId('screen-palette:clock')).toBeNull();
  });

  it('encodes and parses canvas cell id', () => {
    const id = canvasCellId(3, 7);
    expect(id).toBe('screen-canvas-cell:3:7');
    expect(parseCanvasCellId(id)).toEqual({ col: 3, row: 7 });
    expect(parseCanvasCellId('screen-canvas-cell:3')).toBeNull();
  });
});
