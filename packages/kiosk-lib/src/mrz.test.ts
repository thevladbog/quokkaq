import { describe, expect, it } from 'vitest';
import { icaoCheckDigit, parseIcaOmrz } from './mrz';

describe('icaoCheckDigit', () => {
  it('matches mod-10 (ICAO 9303)', () => {
    expect(icaoCheckDigit('L898902C3')).toBe('6');
  });
});

describe('parseIcaOmrz TD3', () => {
  it('parses 44+44 two-line passport MRZ and extracts fields', () => {
    // Structure per ICAO: line2 doc# 9 + checks; we use specimen-like layout.
    const l1 = 'P<UTOMUSTERMANN<<ERIKA<<<<<<<<<<<<<<<<<<<<<<';
    const doc = 'C01X00T4<';
    const dchk = icaoCheckDigit(doc);
    const dob = '800101';
    const dobc = icaoCheckDigit(dob);
    const exp = '300101';
    const expc = icaoCheckDigit(exp);
    const l2 = `${doc}${dchk}UTO${dob}${dobc}M${exp}${expc}<<<<<<<<<<<<<<<0`;
    expect(l1.length).toBe(44);
    expect(l2.length).toBe(44);

    const r = parseIcaOmrz([l1, l2]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.format).toBe('TD3');
      expect(r.value.lastName).toMatch(/MUSTER/i);
      expect(r.value.lastName).toBeTruthy();
      expect(r.value.documentNumber.replace(/</g, '').toUpperCase()).toContain(
        'C01X00T4'
      );
    }
  });

  it('treats leading 3< as P< (common OCR for TD3 line1)', () => {
    const l1Good = 'P<UTOMUSTERMANN<<ERIKA<<<<<<<<<<<<<<<<<<<<<<';
    const l1Ocr = '3' + l1Good.slice(1);
    const doc = 'C01X00T4<';
    const dchk = icaoCheckDigit(doc);
    const dob = '800101';
    const dobc = icaoCheckDigit(dob);
    const exp = '300101';
    const expc = icaoCheckDigit(exp);
    const l2 = `${doc}${dchk}UTO${dob}${dobc}M${exp}${expc}<<<<<<<<<<<<<<<0`;
    const a = parseIcaOmrz([l1Good, l2]);
    const b = parseIcaOmrz([l1Ocr, l2]);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(b.value.lastName).toBe(a.value.lastName);
    }
  });

  it('strips non-ICAO characters (Cyrillic, em dash) before parsing', () => {
    const l1 = 'P<UTOMUSTERMANN<<ERIKA<<<<<<<<<<<<<<<<<<<<<<';
    const doc = 'C01X00T4<';
    const dchk = icaoCheckDigit(doc);
    const dob = '800101';
    const dobc = icaoCheckDigit(dob);
    const exp = '300101';
    const expc = icaoCheckDigit(exp);
    const l2 = `${doc}${dchk}UTO${dob}${dobc}M${exp}${expc}<<<<<<<<<<<<<<<0`;
    const r = parseIcaOmrz([`— ${l1} (ВО) `, l2]);
    expect(r.ok).toBe(true);
  });

  it('accepts 88-char single paste (no newlines)', () => {
    const l1 = 'P<UTOMUSTERMANN<<ERIKA<<<<<<<<<<<<<<<<<<<<<<';
    const doc = 'C01X00T4<';
    const dchk = icaoCheckDigit(doc);
    const dob = '800101';
    const dobc = icaoCheckDigit(dob);
    const exp = '300101';
    const expc = icaoCheckDigit(exp);
    const l2 = `${doc}${dchk}UTO${dob}${dobc}M${exp}${expc}<<<<<<<<<<<<<<<0`;
    const r = parseIcaOmrz([l1 + l2]);
    expect(r.ok).toBe(true);
  });
});
