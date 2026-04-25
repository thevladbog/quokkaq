/**
 * Kiosk "Other" custom identification: barcode + optional manual input constraints.
 * Align with `kioskIdentificationConfig.capture` JSON on the service.
 */
export type KioskCustomManualInputMode = 'none' | 'numeric' | 'alphanumeric';

const ALPHANUMERIC_MAX = 256;

const MANUAL_MODES: readonly KioskCustomManualInputMode[] = [
  'none',
  'numeric',
  'alphanumeric'
];

/**
 * `kioskIdentificationConfig` may come from our admin (camelCase) or hand-edited
 * JSON (`manual_input_mode`). Used by the kiosk and admin form parsing.
 */
export function getKioskBarcodeManualInputMode(
  identConfig: unknown
): KioskCustomManualInputMode {
  if (
    !identConfig ||
    typeof identConfig !== 'object' ||
    Array.isArray(identConfig)
  ) {
    return 'alphanumeric';
  }
  const ident = identConfig as { capture?: unknown };
  const cap = ident.capture;
  if (!cap || typeof cap !== 'object' || Array.isArray(cap)) {
    return 'alphanumeric';
  }
  const c = cap as Record<string, unknown>;
  if (c.kind !== 'barcode') {
    return 'alphanumeric';
  }
  const raw = c.manualInputMode ?? c.manual_input_mode;
  if (raw === 'none' || raw === 'numeric' || raw === 'alphanumeric') {
    return raw;
  }
  if (typeof raw === 'string') {
    const s = raw.trim().toLowerCase();
    if (MANUAL_MODES.includes(s as KioskCustomManualInputMode)) {
      return s as KioskCustomManualInputMode;
    }
  }
  return 'alphanumeric';
}

/**
 * For numeric mode: keep digits only, then clamp length.
 * For alphanumeric / none: strip C0 controls, clamp length to a safe max.
 */
export function normalizeKioskCustomBarcodeValue(
  raw: string,
  mode: KioskCustomManualInputMode,
  numericMaxLength: number
): string {
  if (mode === 'numeric') {
    const max = (() => {
      const n = Math.floor(numericMaxLength);
      if (Number.isNaN(n)) return 20;
      return Math.max(1, Math.min(64, n));
    })();
    return raw.replace(/\D/g, '').slice(0, max);
  }
  return raw.replace(/[\u0000-\u001F\u007F]/g, '').slice(0, ALPHANUMERIC_MAX);
}

export function adminClampNumericMaxLength(
  n: number | undefined,
  fallback = 20
): number {
  const f = Math.floor(n ?? fallback);
  if (Number.isNaN(f)) return Math.min(64, Math.max(1, fallback));
  return Math.max(1, Math.min(64, f));
}
