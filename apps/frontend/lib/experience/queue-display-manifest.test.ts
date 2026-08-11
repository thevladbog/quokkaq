import { describe, expect, it, vi } from 'vitest';

import { getUnitQueueDisplayExperience } from '@/lib/api/generated/units';
import {
  fetchQueueDisplayManifest,
  parseQueueDisplayManifest
} from './queue-display-manifest';

vi.mock('@/lib/api/generated/units', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/api/generated/units')
  >('@/lib/api/generated/units');
  return { ...actual, getUnitQueueDisplayExperience: vi.fn() };
});

function validManifest(overrides: Record<string, unknown> = {}) {
  return {
    mode: 'experience',
    templateId: 'template-1',
    versionId: 'version-1',
    version: 3,
    variantId: 'landscape',
    publishedAt: '2026-08-11T12:00:00Z',
    definition: {
      schemaVersion: 1,
      id: 'queue-template',
      surface: 'queue-display',
      startPageId: 'queue',
      variants: [
        {
          id: 'landscape',
          profile: {
            id: 'landscape-profile',
            name: 'Landscape',
            width: 1920,
            height: 1080,
            interactionMode: 'non-touch',
            viewingDistance: 'far',
            safeArea: { top: 0, right: 0, bottom: 0, left: 0 }
          },
          grid: { columns: 12, rows: 12 }
        }
      ],
      pages: [
        {
          id: 'queue',
          name: 'Queue',
          widgets: [
            { id: 'called', type: 'called-tickets', config: {}, actions: [] }
          ],
          layouts: {
            landscape: {
              placements: {
                called: { col: 1, row: 1, colSpan: 12, rowSpan: 12 }
              }
            }
          }
        }
      ],
      flowPages: {},
      theme: {
        preset: 'legacy-kiosk',
        tokens: {
          header: '#123456',
          surface: '#abcdef',
          serviceGrid: '#Aa00fF'
        }
      }
    },
    ...overrides
  };
}

describe('parseQueueDisplayManifest', () => {
  it('accepts legacy mode without attempting definition parsing', () => {
    expect(parseQueueDisplayManifest({ mode: 'legacy' })).toEqual({
      kind: 'legacy'
    });
  });

  it('validates and returns a queue-display experience', () => {
    const result = parseQueueDisplayManifest(validManifest());
    expect(result.kind).toBe('experience');
    if (result.kind === 'experience') {
      expect(result.template.surface).toBe('queue-display');
      expect(result.variantId).toBe('landscape');
    }
  });

  it.each([
    ['malformed envelope', { mode: 'experience' }],
    [
      'invalid definition',
      validManifest({ definition: { surface: 'queue-display' } })
    ],
    [
      'wrong surface',
      validManifest({
        definition: { ...validManifest().definition, surface: 'ticket-station' }
      })
    ],
    ['missing variant', validManifest({ variantId: 'portrait' })]
  ])('rejects %s safely', (_name, payload) => {
    expect(parseQueueDisplayManifest(payload).kind).toBe('invalid');
  });
});

describe('fetchQueueDisplayManifest', () => {
  it('maps API failures to legacy fallback', async () => {
    vi.mocked(getUnitQueueDisplayExperience).mockRejectedValueOnce(
      new Error('network')
    );
    await expect(
      fetchQueueDisplayManifest('unit-1', 'portrait')
    ).resolves.toEqual({
      kind: 'legacy'
    });
    expect(getUnitQueueDisplayExperience).toHaveBeenCalledWith('unit-1', {
      profile: 'portrait'
    });
  });
});
