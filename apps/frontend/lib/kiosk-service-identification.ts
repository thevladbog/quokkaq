import type { Service } from '@/lib/api';

export type KioskIdentificationMode =
  | 'none'
  | 'phone'
  | 'qr'
  | 'document'
  | 'login'
  | 'badge';

export function getServiceIdentificationMode(
  s: Pick<Service, 'identificationMode' | 'offerIdentification'>
): KioskIdentificationMode {
  const m = s.identificationMode;
  if (
    m === 'phone' ||
    m === 'qr' ||
    m === 'document' ||
    m === 'login' ||
    m === 'badge' ||
    m === 'none'
  ) {
    return m;
  }
  if (s.offerIdentification) {
    return 'phone';
  }
  return 'none';
}
