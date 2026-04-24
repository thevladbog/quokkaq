import { describe, expect, it } from 'vitest';
import { getServiceIdentificationMode } from './kiosk-service-identification';
import type { Service } from './api';

function svc(p: Partial<Service>): Service {
  return p as Service;
}

/** Contract checks for leaf services with `identificationMode: none` — kiosk issues a ticket without a pre-step. */
describe('getServiceIdentificationMode', () => {
  it('returns explicit modes from the service', () => {
    for (const m of ['none', 'phone', 'qr', 'login', 'badge'] as const) {
      expect(
        getServiceIdentificationMode(
          svc({ identificationMode: m, offerIdentification: true })
        )
      ).toBe(m);
    }
  });

  it('maps legacy offerIdentification to phone', () => {
    expect(
      getServiceIdentificationMode(
        svc({ offerIdentification: true, identificationMode: undefined })
      )
    ).toBe('phone');
  });

  it('defaults to none for invalid modes without offerIdentification', () => {
    expect(
      getServiceIdentificationMode(
        svc({
          identificationMode: 'invalid' as never,
          offerIdentification: false
        })
      )
    ).toBe('none');
  });
});
