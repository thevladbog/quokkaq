import { describe, expect, it } from 'vitest';
import type { ExperienceFlowPages, ServiceModel } from '@quokkaq/shared-types';

import { resolveServiceFlow } from './service-flow';

const pages: Required<ExperienceFlowPages> = {
  serviceCatalogPageId: 'catalog',
  serviceInfoPageId: 'info',
  serviceFormPageId: 'form',
  identityPageId: 'identity',
  appointmentPageId: 'appointment',
  confirmationPageId: 'confirm',
  successPageId: 'success'
};

function service(overrides: Partial<ServiceModel> = {}): ServiceModel {
  return {
    id: 'svc',
    unitId: 'unit',
    name: 'Service',
    ...overrides
  };
}

describe('resolveServiceFlow', () => {
  it.each([
    ['plain service', service(), ['confirm', 'success']],
    [
      'information-only service',
      service({
        behavior: {
          version: 1,
          fields: [],
          information: { body: { en: 'Read this' } }
        }
      }),
      ['info', 'confirm', 'success']
    ],
    [
      'fields-only service',
      service({
        behavior: {
          version: 1,
          fields: [
            { key: 'note', label: { en: 'Note' }, type: 'text', required: true }
          ],
          dataRetentionDays: 1
        }
      }),
      ['form', 'confirm', 'success']
    ],
    [
      'badge identity',
      service({ identificationMode: 'badge' }),
      ['identity', 'confirm', 'success']
    ],
    [
      'login identity',
      service({ identificationMode: 'login' }),
      ['identity', 'confirm', 'success']
    ],
    [
      'document identity',
      service({ identificationMode: 'document' }),
      ['identity', 'confirm', 'success']
    ],
    [
      'custom identity',
      service({ identificationMode: 'custom' }),
      ['identity', 'confirm', 'success']
    ]
  ])('resolves %s', (_name, input, expected) => {
    expect(resolveServiceFlow(input, pages)).toEqual({
      ok: true,
      pageIds: expected
    });
  });

  it('routes appointment check-in without guessing regular stages', () => {
    expect(resolveServiceFlow(service({ prebook: true }), pages)).toEqual({
      ok: true,
      pageIds: ['appointment', 'success']
    });
  });

  it('returns a publish/runtime error when a required stage slot is absent', () => {
    const missingIdentity = { ...pages, identityPageId: undefined };
    expect(
      resolveServiceFlow(
        service({ identificationMode: 'badge' }),
        missingIdentity
      )
    ).toEqual({
      ok: false,
      code: 'missing-required-page-slot',
      slot: 'identityPageId'
    });
  });
});
