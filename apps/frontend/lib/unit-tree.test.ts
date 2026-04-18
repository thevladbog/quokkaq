import { describe, expect, it } from 'vitest';
import { buildDescendantForest, buildUnitForest } from '@/lib/unit-tree';
import type { Unit } from '@quokkaq/shared-types';

const u = (
  id: string,
  parentId: string | null,
  kind: Unit['kind'],
  name: string,
  nameEn?: string | null
): Unit =>
  ({
    id,
    parentId,
    kind,
    name,
    nameEn: nameEn ?? null,
    code: id,
    companyId: 'c1',
    timezone: 'UTC'
  }) as Unit;

describe('buildUnitForest', () => {
  it('orders roots and nests children', () => {
    const units = [
      u('b', 'a', 'service_zone', 'B'),
      u('a', null, 'subdivision', 'A'),
      u('c', 'a', 'subdivision', 'C')
    ];
    const forest = buildUnitForest(units);
    expect(forest).toHaveLength(1);
    expect(forest[0].unit.id).toBe('a');
    expect(forest[0].children.map((c) => c.unit.id).sort()).toEqual(['b', 'c']);
    expect(forest[0].children[0].children).toEqual([]);
  });

  it('sorts roots by English display name when locale is en', () => {
    const units = [
      u('x', null, 'subdivision', 'Я', 'Zulu'),
      u('y', null, 'subdivision', 'А', 'Alpha')
    ];
    const forest = buildUnitForest(units, 'en');
    expect(forest.map((n) => n.unit.id)).toEqual(['y', 'x']);
  });
});

describe('buildDescendantForest', () => {
  it('builds tree of descendants under root', () => {
    const units = [
      u('root', null, 'subdivision', 'Root'),
      u('z1', 'root', 'service_zone', 'Z1'),
      u('s1', 'root', 'subdivision', 'S1'),
      u('z2', 's1', 'service_zone', 'Z2')
    ];
    const forest = buildDescendantForest('root', units);
    expect(forest).toHaveLength(2);
    const ids = forest.map((n) => n.unit.id).sort();
    expect(ids).toEqual(['s1', 'z1']);
    const s1 = forest.find((n) => n.unit.id === 's1');
    expect(s1?.children).toHaveLength(1);
    expect(s1?.children[0].unit.id).toBe('z2');
  });
});
