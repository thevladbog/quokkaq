import { describe, expect, it } from 'vitest';
import { Buffer } from 'node:buffer';
import { encodeCp1251 } from './cp1251-encode';
import {
  formatRuDrivingLicenseText,
  isLikelyRuDrivingLicenseFromScanString,
  parseRuDrivingLicenseBarcode
} from './ru-driving-license';

describe('parseRuDrivingLicenseBarcode', () => {
  it('parses open pipe-separated UTF-8 (synthetic data)', () => {
    const open =
      '1001999991|20160101|20260101|ПЕТРОВ|ПЁТР|ПЁТРОВИЧ|19850505|A,B,BE,MTS|77|100199999112';
    const p = parseRuDrivingLicenseBarcode(open);
    expect(p.documentId).toBe('1001999991');
    expect(p.issueYmd).toBe('20160101');
    expect(p.expiryYmd).toBe('20260101');
    expect(p.lastName).toContain('ПЕ');
    expect(p.birthYmd).toBe('19850505');
    expect(p.categories).toBe('A,B,BE,MTS');
    expect(p.encoding).toBe('plain');
  });

  it('decodes base64 UTF-8 of same content', () => {
    const open =
      '2002002002|20200115|20260115|IVANOV|IVAN|IVANOVICH|19900101|B,BE|16|200200200299';
    const b64 = Buffer.from(open, 'utf8').toString('base64');
    const p = parseRuDrivingLicenseBarcode(b64);
    expect(p.documentId).toBe('2002002002');
    expect(p.lastName).toBe('IVANOV');
    expect(p.encoding).toBe('utf-8');
  });

  it('decodes full line encoded as Windows-1251 in base64', () => {
    const line =
      '3003003003|20190101|20290101|СИДОРОВ|СИДОР|СИДОР|19700303|A|10|30030030030';
    const bytes = encodeCp1251(line);
    const b64 = Buffer.from(bytes).toString('base64');
    const p = parseRuDrivingLicenseBarcode(b64);
    expect(p.documentId).toBe('3003003003');
    expect(p.lastName).toBe('СИДОРОВ');
    expect(p.firstName).toBe('СИДОР');
    expect(p.middleName).toBe('СИДОР');
    expect(p.encoding).toBe('windows-1251');
  });
});

describe('isLikelyRuDrivingLicenseFromScanString', () => {
  it('is false for stray pipe from OCR (e.g. passport text)', () => {
    expect(isLikelyRuDrivingLicenseFromScanString('a|b|hello')).toBe(false);
  });

  it('is true for ≥9 pipe fields (RI driver license line)', () => {
    const open =
      '1001999991|20160101|20260101|ПЕТРОВ|ПЁТР|ПЁТРОВИЧ|19850505|A|77|1';
    expect(isLikelyRuDrivingLicenseFromScanString(open)).toBe(true);
  });

  it('is true for base64 of license', () => {
    const line =
      '2002002002|20200115|20260115|IVANOV|IVAN|IVANOVICH|19900101|B,BE|16|200200200299';
    const b64 = Buffer.from(line, 'utf8').toString('base64');
    expect(isLikelyRuDrivingLicenseFromScanString(b64)).toBe(true);
  });
});

describe('formatRuDrivingLicenseText', () => {
  it('joins key fields for clipboard', () => {
    const t = formatRuDrivingLicenseText({
      documentId: '1',
      issueYmd: '20000101',
      expiryYmd: '20100101',
      lastName: 'X',
      firstName: 'Y',
      middleName: 'Z',
      birthYmd: '19800101',
      categories: 'B',
      issuingUnitCode: '99',
      trailer: '',
      encoding: 'plain'
    });
    expect(t).toMatch(/1.*20000101/);
  });
});
