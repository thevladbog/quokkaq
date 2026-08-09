import {
  getKioskServiceIdentificationMode,
  type KioskIdentificationMode
} from '@quokkaq/shared-types';
import type { Service } from '@/lib/api';

export type { KioskIdentificationMode };

export function getServiceIdentificationMode(
  s: Pick<Service, 'identificationMode' | 'offerIdentification'>
): KioskIdentificationMode {
  return getKioskServiceIdentificationMode(s);
}
