import type { ServiceBehavior } from '@quokkaq/shared-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/generated/auth', () => ({
  updateScreenLayoutTemplate: vi.fn(),
  publishScreenLayoutTemplate: vi.fn(),
  listScreenLayoutTemplateVersions: vi.fn(),
  restoreScreenLayoutTemplateVersion: vi.fn()
}));

vi.mock('@/lib/api/generated/desktop-terminal', () => ({
  updateDesktopTerminal: vi.fn()
}));

vi.mock('@/lib/api/generated/services', () => ({
  putServicesId: vi.fn()
}));

vi.mock('@/lib/api/generated/terminal-experience', () => ({
  getTerminalExperienceManifest: vi.fn(),
  acknowledgeTerminalExperienceManifest: vi.fn()
}));

import {
  listScreenLayoutTemplateVersions,
  publishScreenLayoutTemplate,
  restoreScreenLayoutTemplateVersion,
  updateScreenLayoutTemplate
} from '@/lib/api/generated/auth';
import { updateDesktopTerminal } from '@/lib/api/generated/desktop-terminal';
import { putServicesId } from '@/lib/api/generated/services';
import {
  acknowledgeTerminalExperienceManifest,
  getTerminalExperienceManifest
} from '@/lib/api/generated/terminal-experience';
import {
  acknowledgeTerminalExperience,
  assignExperienceToTerminal,
  fetchTerminalExperienceManifest,
  parseExperienceDefinition,
  publishExperienceTemplate,
  restoreExperienceTemplateVersion,
  TerminalExperienceAcknowledgementSchema,
  updateExperienceDraft,
  updateServiceBehavior
} from './experience-api';

function validDefinition() {
  return {
    schemaVersion: 1,
    id: 'template-a',
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
      }
    ],
    pages: [
      {
        id: 'services',
        name: 'Services',
        widgets: [{ id: 'catalog', type: 'service-picker', config: {} }],
        layouts: {
          portrait: {
            placements: {
              catalog: { col: 1, row: 1, colSpan: 12, rowSpan: 16 }
            }
          }
        }
      }
    ]
  };
}

function successfulResponse<T, Status extends number>(data: T, status: Status) {
  return { data, status, headers: new Headers() };
}

describe('experience API wrappers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an explicit invalid-definition result instead of coercing a malformed definition', async () => {
    vi.mocked(updateScreenLayoutTemplate).mockResolvedValue(
      successfulResponse(
        { id: 'template-a', definition: { schemaVersion: 99 } },
        200
      )
    );

    const result = await updateExperienceDraft('template-a', {
      definition: validDefinition()
    });

    expect(result.kind).toBe('invalid-definition');
    expect(updateScreenLayoutTemplate).toHaveBeenCalledWith(
      'template-a',
      expect.objectContaining({
        definition: expect.objectContaining({ id: 'template-a' })
      })
    );
  });

  it('does not send an invalid draft definition to the generated client', async () => {
    const result = await updateExperienceDraft('template-a', {
      definition: { schemaVersion: 99 }
    });

    expect(result).toMatchObject({ kind: 'invalid-definition' });
    expect(updateScreenLayoutTemplate).not.toHaveBeenCalled();
  });

  it('rejects a draft response whose parsed definition belongs to another template', async () => {
    const mismatchedDefinition = validDefinition();
    mismatchedDefinition.id = 'template-b';
    vi.mocked(updateScreenLayoutTemplate).mockResolvedValue(
      successfulResponse(
        { id: 'template-a', definition: mismatchedDefinition },
        200
      )
    );

    const result = await updateExperienceDraft('template-a', {
      definition: validDefinition()
    });

    expect(result).toEqual({
      kind: 'invalid-definition',
      issues: [
        {
          code: 'response.invalid',
          path: ['definition', 'id'],
          message: 'definition id does not match'
        }
      ]
    });
  });

  it('maps a published immutable version to a parsed experience result', async () => {
    vi.mocked(publishScreenLayoutTemplate).mockResolvedValue(
      successfulResponse(
        {
          id: 'version-7',
          templateId: 'template-a',
          version: 7,
          publishedAt: '2026-08-10T00:00:00Z',
          definition: validDefinition()
        },
        201
      )
    );

    const result = await publishExperienceTemplate('template-a');

    expect(result).toMatchObject({
      kind: 'valid',
      version: { id: 'version-7', templateId: 'template-a', version: 7 },
      template: { id: 'template-a', surface: 'ticket-station' }
    });
    expect(publishScreenLayoutTemplate).toHaveBeenCalledWith('template-a');
  });

  it('preserves generated API errors instead of translating them into a template result', async () => {
    const apiError = new Error('forbidden');
    vi.mocked(publishScreenLayoutTemplate).mockRejectedValue(apiError);

    await expect(publishExperienceTemplate('template-a')).rejects.toBe(
      apiError
    );
  });

  it('maps restore and version-history calls without reading opaque history definitions', async () => {
    vi.mocked(listScreenLayoutTemplateVersions).mockResolvedValue(
      successfulResponse(
        {
          items: [
            {
              id: 'version-7',
              templateId: 'template-a',
              version: 7,
              publishedAt: '2026-08-10T00:00:00Z'
            }
          ],
          nextBeforeVersion: null,
          hasMore: false
        },
        200
      )
    );
    vi.mocked(restoreScreenLayoutTemplateVersion).mockResolvedValue(
      successfulResponse(
        {
          id: 'version-8',
          templateId: 'template-a',
          version: 8,
          publishedAt: '2026-08-10T00:01:00Z',
          definition: validDefinition()
        },
        201
      )
    );

    const history = await import('./experience-api').then((module) =>
      module.listExperienceTemplateVersions('template-a')
    );
    const restored = await restoreExperienceTemplateVersion(
      'template-a',
      'version-7'
    );

    expect(history).toEqual({
      items: [
        {
          id: 'version-7',
          templateId: 'template-a',
          version: 7,
          publishedAt: '2026-08-10T00:00:00Z'
        }
      ],
      nextBeforeVersion: null,
      hasMore: false
    });
    expect(restored).toMatchObject({ kind: 'valid', version: { version: 8 } });
    expect(restoreScreenLayoutTemplateVersion).toHaveBeenCalledWith(
      'template-a',
      'version-7'
    );
  });

  it('uses the generated terminal update to assign or clear a template variant', async () => {
    vi.mocked(updateDesktopTerminal).mockResolvedValue(
      successfulResponse(undefined, 204)
    );

    await assignExperienceToTerminal('terminal-9', {
      templateId: 'template-a',
      variantId: 'portrait'
    });

    expect(updateDesktopTerminal).toHaveBeenCalledWith('terminal-9', {
      experienceTemplateId: 'template-a',
      experienceVariantId: 'portrait'
    });
  });

  it('exposes service behavior through the generated service update client', async () => {
    vi.mocked(putServicesId).mockResolvedValue(
      successfulResponse({ id: 'service-4' }, 200)
    );
    const behavior: ServiceBehavior = {
      version: 1,
      fields: [
        {
          key: 'room',
          label: { en: 'Room', ru: 'Room' },
          type: 'text',
          required: true
        }
      ],
      dataRetentionDays: 7
    };

    await updateServiceBehavior('service-4', behavior);

    expect(putServicesId).toHaveBeenCalledWith('service-4', { behavior });
  });

  it('uses the terminal-auth generated client and strict acknowledgement variants', async () => {
    vi.mocked(getTerminalExperienceManifest).mockResolvedValue(
      successfulResponse({ mode: 'legacy' }, 200)
    );
    vi.mocked(acknowledgeTerminalExperienceManifest).mockResolvedValue(
      successfulResponse(undefined, 204)
    );

    await expect(
      fetchTerminalExperienceManifest('terminal-jwt')
    ).resolves.toEqual({ mode: 'legacy' });
    await acknowledgeTerminalExperience('terminal-jwt', {
      status: 'rejected',
      versionId: 'version-7',
      reasonCode: 'renderer.timeout'
    });

    expect(getTerminalExperienceManifest).toHaveBeenCalledWith({
      headers: { Authorization: 'Bearer terminal-jwt' }
    });
    expect(acknowledgeTerminalExperienceManifest).toHaveBeenCalledWith(
      {
        status: 'rejected',
        versionId: 'version-7',
        reasonCode: 'renderer.timeout'
      },
      { headers: { Authorization: 'Bearer terminal-jwt' } }
    );
  });

  it('rejects acknowledgements that violate the applied/rejected wire contract', () => {
    expect(
      TerminalExperienceAcknowledgementSchema.safeParse({
        status: 'applied',
        versionId: 'version-7',
        reasonCode: 'renderer.timeout'
      }).success
    ).toBe(false);
    expect(
      TerminalExperienceAcknowledgementSchema.safeParse({
        status: 'rejected',
        versionId: 'version-7'
      }).success
    ).toBe(false);
    expect(parseExperienceDefinition({ schemaVersion: 99 })).toMatchObject({
      kind: 'invalid-definition'
    });
  });
});
