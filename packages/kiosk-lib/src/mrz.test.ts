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
