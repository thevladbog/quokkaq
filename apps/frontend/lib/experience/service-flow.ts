import {
  getKioskServiceIdentificationMode,
  type ExperienceFlowPages,
  type ServiceModel
} from '@quokkaq/shared-types';

export type ServiceFlowSlot = keyof ExperienceFlowPages;

export type ServiceFlowResolution =
  | { ok: true; pageIds: string[] }
  | {
      ok: false;
      code: 'missing-required-page-slot';
      slot: ServiceFlowSlot;
    };

const pageSlotForStage = {
  information: 'serviceInfoPageId',
  fields: 'serviceFormPageId',
  identity: 'identityPageId',
  appointment: 'appointmentPageId',
  confirmation: 'confirmationPageId',
  success: 'successPageId'
} as const satisfies Record<string, ServiceFlowSlot>;

type ServiceFlowStage = keyof typeof pageSlotForStage;

function needsIdentity(service: ServiceModel) {
  return getKioskServiceIdentificationMode(service) !== 'none';
}

/**
 * Maps a selected service's trusted behaviour to template-owned pages.  It
 * deliberately refuses incomplete mappings: publish validation and deployed
 * runtime can surface the same stable error instead of falling back to a page.
 */
export function resolveServiceFlow(
  service: ServiceModel,
  flowPages: ExperienceFlowPages | undefined
): ServiceFlowResolution {
  const stages: ServiceFlowStage[] = service.prebook
    ? ['appointment', 'success']
    : [
        ...(service.behavior?.information ? (['information'] as const) : []),
        ...(service.behavior?.fields.length ? (['fields'] as const) : []),
        ...(needsIdentity(service) ? (['identity'] as const) : []),
        ...(service.behavior?.route?.mode === 'page-slot'
          ? ([
              service.behavior.route.slot === 'service-info'
                ? 'information'
                : service.behavior.route.slot === 'service-form'
                  ? 'fields'
                  : service.behavior.route.slot
            ] as const)
          : []),
        'confirmation',
        'success'
      ];

  const pageIds: string[] = [];
  const seen = new Set<ServiceFlowStage>();
  for (const stage of stages) {
    if (seen.has(stage)) continue;
    seen.add(stage);
    const slot = pageSlotForStage[stage];
    const pageId = flowPages?.[slot];
    if (!pageId) {
      return { ok: false, code: 'missing-required-page-slot', slot };
    }
    pageIds.push(pageId);
  }
  return { ok: true, pageIds };
}
