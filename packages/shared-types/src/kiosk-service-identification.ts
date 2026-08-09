import { z } from 'zod';

export const KioskIdentificationModeSchema = z.enum([
  'none',
  'phone',
  'qr',
  'document',
  'custom',
  'login',
  'badge'
]);

export type KioskIdentificationMode = z.infer<
  typeof KioskIdentificationModeSchema
>;

/** Minimum canonical service fields needed by kiosk identity routing. */
export type KioskIdentificationService = {
  identificationMode?: string;
  offerIdentification?: boolean;
};

/**
 * Canonical kiosk resolver. An explicit supported mode, including `none`, wins
 * over the legacy `offerIdentification` flag; that flag only supplies the
 * historical phone fallback when no explicit mode exists.
 */
export function getKioskServiceIdentificationMode(
  service: KioskIdentificationService
): KioskIdentificationMode {
  const explicit = KioskIdentificationModeSchema.safeParse(
    service.identificationMode
  );
  if (explicit.success) {
    return explicit.data;
  }
  return service.offerIdentification ? 'phone' : 'none';
}
