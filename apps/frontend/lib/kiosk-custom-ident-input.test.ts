import { describe, expect, it } from 'vitest';
import {
  adminClampNumericMaxLength,
  getKioskBarcodeManualInputMode,
  normalizeKioskCustomBarcodeValue
} from './kiosk-custom-ident-input';

describe('normalizeKioskCustomBarcodeValue', () => {
  it('numeric: keeps digits and clamps length', () => {
    expect(normalizeKioskCustomBarcodeValue('ab12cd34', 'numeric', 4)).toBe(
      '1234'
    );
    expect(normalizeKioskCustomBarcodeValue('123456789', 'numeric', 5)).toBe(
      '12345'
    );
  });

  it('alphanumeric: strips C0 and clamps to 256', () => {
    const long = 'a'.repeat(300);
    expect(
      normalizeKioskCustomBarcodeValue(long, 'alphanumeric', 0).length
    ).toBe(256);
    expect(
      normalizeKioskCustomBarcodeValue('x\u0000y', 'alphanumeric', 0)
    ).toBe('xy');
  });

  it('none: same as alphanumeric for normalization', () => {
    expect(normalizeKioskCustomBarcodeValue('ok', 'none', 0)).toBe('ok');
  });
});

describe('adminClampNumericMaxLength', () => {
  it('clamps to 1..64', () => {
    expect(adminClampNumericMaxLength(0, 20)).toBe(1);
    expect(adminClampNumericMaxLength(100, 20)).toBe(64);
    expect(adminClampNumericMaxLength(12, 20)).toBe(12);
  });
});

describe('getKioskBarcodeManualInputMode', () => {
  it('reads camelCase and snake_case for barcode', () => {
    expect(
      getKioskBarcodeManualInputMode({
        capture: { kind: 'barcode', manualInputMode: 'numeric' }
      })
    ).toBe('numeric');
    expect(
      getKioskBarcodeManualInputMode({
        capture: { kind: 'barcode', manual_input_mode: 'numeric' }
      })
    ).toBe('numeric');
  });

  it('defaults to alphanumeric for non-barcode or missing', () => {
    expect(
      getKioskBarcodeManualInputMode({
        capture: { kind: 'barcode' }
      })
    ).toBe('alphanumeric');
    expect(
      getKioskBarcodeManualInputMode({ capture: { kind: 'keyboard_ru_en' } })
    ).toBe('alphanumeric');
  });
});
