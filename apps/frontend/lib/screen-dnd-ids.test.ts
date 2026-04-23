import { describe, it, expect } from 'vitest';
import {
  regionDropId,
  parseRegionDropId,
  libraryId,
  parseLibraryId
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
});
