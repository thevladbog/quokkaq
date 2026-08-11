import {
  ExperienceTemplateSchema,
  type ExperienceTemplate
} from '@quokkaq/shared-types';

import {
  getUnitQueueDisplayExperience,
  type GetUnitQueueDisplayExperienceParams
} from '@/lib/api/generated/units';

export type QueueDisplayProfile = 'portrait' | 'landscape';

export type QueueDisplayManifestResult =
  | { kind: 'legacy' }
  | {
      kind: 'experience';
      template: ExperienceTemplate;
      templateId: string;
      versionId: string;
      version: number;
      variantId: string;
      publishedAt: string;
    }
  | {
      kind: 'invalid';
      reason:
        | 'invalid-envelope'
        | 'invalid-definition'
        | 'wrong-surface'
        | 'missing-variant';
    };

const invalidEnvelope = (): QueueDisplayManifestResult => ({
  kind: 'invalid',
  reason: 'invalid-envelope'
});

export function parseQueueDisplayManifest(
  payload: unknown
): QueueDisplayManifestResult {
  if (
    payload === null ||
    typeof payload !== 'object' ||
    Array.isArray(payload)
  ) {
    return invalidEnvelope();
  }
  const value = payload as Record<string, unknown>;
  if (value.mode === 'legacy') return { kind: 'legacy' };
  if (value.mode !== 'experience') return invalidEnvelope();

  const templateId = value.templateId;
  const versionId = value.versionId;
  const version = value.version;
  const variantId = value.variantId;
  const publishedAt = value.publishedAt;
  if (
    typeof templateId !== 'string' ||
    templateId.trim() === '' ||
    typeof versionId !== 'string' ||
    versionId.trim() === '' ||
    typeof version !== 'number' ||
    !Number.isInteger(version) ||
    version < 1 ||
    typeof variantId !== 'string' ||
    variantId.trim() === '' ||
    typeof publishedAt !== 'string' ||
    publishedAt.trim() === ''
  ) {
    return invalidEnvelope();
  }

  const parsed = ExperienceTemplateSchema.safeParse(value.definition);
  if (!parsed.success) {
    return { kind: 'invalid', reason: 'invalid-definition' };
  }
  if (parsed.data.surface !== 'queue-display') {
    return { kind: 'invalid', reason: 'wrong-surface' };
  }
  if (!parsed.data.variants.some((variant) => variant.id === variantId)) {
    return { kind: 'invalid', reason: 'missing-variant' };
  }
  return {
    kind: 'experience',
    template: parsed.data,
    templateId,
    versionId,
    version,
    variantId,
    publishedAt
  };
}

export async function fetchQueueDisplayManifest(
  unitId: string,
  profile?: QueueDisplayProfile
): Promise<QueueDisplayManifestResult> {
  try {
    const params: GetUnitQueueDisplayExperienceParams | undefined = profile
      ? { profile }
      : undefined;
    const response = await getUnitQueueDisplayExperience(unitId, params);
    if (response.status !== 200) return { kind: 'legacy' };
    return parseQueueDisplayManifest(response.data);
  } catch {
    return { kind: 'legacy' };
  }
}
