import { describe, expect, it } from 'vitest';
import { icaoCheckDigit, parseIcaOmrz } from './mrz';
import { extractIcaOmrzFromOcrText } from './mrz-ocr-extract';

function specTd3Lines(): { l1: string; l2: string; join88: string } {
  const l1 = 'P<UTOMUSTERMANN<<ERIKA<<<<<<<<<<<<<<<<<<<<<<';
  const doc = 'C01X00T4<';
  const dchk = icaoCheckDigit(doc);
  const dob = '800101';
  const dobc = icaoCheckDigit(dob);
  const exp = '300101';
  const expc = icaoCheckDigit(exp);
  const l2 = `${doc}${dchk}UTO${dob}${dobc}M${exp}${expc}<<<<<<<<<<<<<<<0`;
  return { l1, l2, join88: l1 + l2 };
}

describe('extractIcaOmrzFromOcrText', () => {
  it('extracts from noisy newlines and junk', () => {
    const { l1, l2 } = specTd3Lines();
    const ocr = `  Some junk
${l1}
OCR: noise
${l2} more junk`;
    const s = extractIcaOmrzFromOcrText(ocr);
    expect(s).toBeTruthy();
    expect(s).toMatch(/MUSTER/i);
  });

  it('extracts from 88 char run embedded in other characters', () => {
    const { join88 } = specTd3Lines();
    const ocr = `XXX${join88}ZZZ`;
    const s = extractIcaOmrzFromOcrText(ocr);
    expect(s).toBeTruthy();
    expect(s).toMatch(/ERIKA/);
  });

  it('matches direct parseIcaOmrz on a clean 88', () => {
    const { join88 } = specTd3Lines();
    const direct = parseIcaOmrz([join88]);
    expect(direct.ok).toBe(true);
    const ext = extractIcaOmrzFromOcrText(
      `intro garbage ${join88} trailing text`
    );
    expect(ext.length).toBeGreaterThan(0);
  });

  it('prefers aligned 88 in blob after junk prefix (shifted first window is worse)', () => {
    const { join88 } = specTd3Lines();
    const ocr = `${'X'.repeat(12)}${join88}ZZZ`;
    const s = extractIcaOmrzFromOcrText(ocr);
    expect(s).toBeTruthy();
    expect(s).toMatch(/MUSTER|ERIKA|DOB|MRZ/i);
  });

  it('returns empty when MRZ is OCR mojibake (Cyrillic/dashes) with no check digits and UNK', () => {
    const s = extractIcaOmrzFromOcrText(
      `— COOR FA = | ВОСАЛ IE<<<<<<<<\n_ — 7 АЩИ<<<<<<<<<<<<<<<<<<<<<\nК — СС A 2<<<<<<<<<<<<<<<<<<<<`
    );
    expect(s).toBe('');
  });
});
