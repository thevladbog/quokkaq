import { describe, expect, it } from 'vitest';
import { resolveUnitFilterFromQuery } from './integrations-unit-filter';

describe('resolveUnitFilterFromQuery', () => {
  it('returns null when param is missing', () => {
    expect(resolveUnitFilterFromQuery(null, ['a', 'b'])).toBeNull();
  });

  it('returns the id when it exists in the list', () => {
    expect(resolveUnitFilterFromQuery('u1', ['u1', 'u2'])).toBe('u1');
  });

  it('returns null when id is unknown', () => {
    expect(resolveUnitFilterFromQuery('ghost', ['u1'])).toBeNull();
  });
});
