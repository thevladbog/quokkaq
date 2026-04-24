/**
 * ICAO 9303 MRZ (passport TD3, ID card TD1) — parse in RAM only; no PII at rest.
 * Check digit: weights 7,3,1; values 0–9, A–Z (10–35), "<" and pad = 0.
 */

const W = [7, 3, 1] as const;

function mrzCharValue(ch: string): number {
  if (!ch) {
    return 0;
  }
  const c = ch[0]!.toUpperCase();
  if (c === '<' || c === ' ') {
    return 0;
  }
  if (c >= '0' && c <= '9') {
    return c.charCodeAt(0) - 0x30;
  }
  if (c >= 'A' && c <= 'Z') {
    return c.charCodeAt(0) - 0x37;
  }
  return 0;
}

/** Computes single ICAO check character (0–9) for a substring. */
export function icaoCheckDigit(s: string): string {
  let t = 0;
  for (let i = 0; i < s.length; i++) {
    t += mrzCharValue(s[i] ?? '') * W[i % 3]!;
  }
  return String(t % 10);
}

function verifyOrMissing(data: string, check: string | undefined): boolean {
  if (!check || check === '<') {
    return true;
  }
  if (check === '0' && icaoCheckDigit(data) === '0') {
    return true;
  }
  return icaoCheckDigit(data) === check;
}

export type MrzCheckResults = {
  documentNumber: boolean;
  dateOfBirth: boolean;
  dateOfExpiry: boolean;
};

export type ParsedICAO = {
  format: 'TD3' | 'TD1';
  lastName: string;
  firstName: string;
  documentNumber: string;
  nationality: string;
  dateOfBirthYmd: string;
  sex: string;
  dateOfExpiryYmd: string;
  documentType: string;
  rawLines: string[];
  checks: MrzCheckResults;
};

function normalizeLine(line: string, n: number): string {
  const u = line.toUpperCase().replace(/[\r\n\t]/g, '');
  if (u.length > n) {
    return u.slice(0, n);
  }
  if (u.length < n) {
    return u + '<'.repeat(n - u.length);
  }
  return u;
}

/** Surname and given names from MRZ "primary identifier" (after issuing state). */
function parseMrzNameBlock(block: string): { last: string; first: string } {
  const s = block.replace(/</g, ' ').replace(/\s+/g, ' ').trim();
  if (block.indexOf('<<') >= 0) {
    const a = block.split('<<');
    const last = (a[0] ?? '').replace(/</g, '').trim();
    const g = (a[1] ?? '')
      .split('<')
      .map((t) => t.replace(/</g, '').trim())
      .filter(Boolean);
    return { last, first: g.join(' ').trim() };
  }
  if (s.includes(' ')) {
    const p = s.split(' ');
    return { last: p[0] ?? '', first: p.slice(1).join(' ').trim() };
  }
  return { last: s, first: '' };
}

function parseTD3(line1: string, line2: string): ParsedICAO {
  const l1 = normalizeLine(line1, 44);
  const l2 = normalizeLine(line2, 44);
  const docType = l1.slice(0, 2);
  // Issuing org 3 letters at 2–4; name field 5..43
  const nameField = l1.slice(5, 44);
  const { last, first } = parseMrzNameBlock(nameField);

  const documentNumber = l2
    .slice(0, 9)
    .replace(/<+$/g, '')
    .replace(/</g, ' ')
    .trim();
  const docChk = l2[9] ?? '<';
  const nationality = l2.slice(10, 13).replace(/</g, '');
  const dob = l2.slice(13, 19);
  const dobChk = l2[19] ?? '<';
  const sex = l2[20] ?? 'X';
  const exp = l2.slice(21, 27);
  const expChk = l2[27] ?? '<';

  return {
    format: 'TD3',
    lastName: last,
    firstName: first,
    documentNumber: documentNumber || l2.slice(0, 9).replace(/</g, '').trim(),
    nationality,
    dateOfBirthYmd: dob,
    dateOfExpiryYmd: exp,
    sex: sex,
    documentType: docType,
    rawLines: [l1, l2],
    checks: {
      documentNumber: verifyOrMissing(l2.slice(0, 9), docChk),
      dateOfBirth: verifyOrMissing(dob, dobChk),
      dateOfExpiry: verifyOrMissing(exp, expChk)
    }
  };
}

/** TD1: three lines × 30. Line 2: doc# 0-8, chk 9, opt 10-15, nat 16-18, DOB 19-24, chk 25, … (ICAO 9303). */
function parseTD1(a: string, b: string, c: string): ParsedICAO {
  const l1 = normalizeLine(a, 30);
  const l2 = normalizeLine(b, 30);
  const l3 = normalizeLine(c, 30);
  const nameField = l1.slice(5, 30);
  const { last, first } = parseMrzNameBlock(nameField);

  const documentNumber = l2
    .slice(0, 9)
    .replace(/<+$/g, '')
    .replace(/</g, ' ')
    .trim();
  const docChk = l2[9] ?? '<';
  const nationality = l2.slice(16, 19).replace(/</g, '') || 'UNK';
  const yymmddDob = l2.slice(19, 25);
  const dobChk = l2[25] ?? '<';
  /** Line3: many TD1s store optional + composite; use bytes 0-5 + 6 for expiry in common layouts, plus sex at 7. */
  const yymmddExp = l3.slice(8, 14);
  const expChk = l3[14] ?? '<';
  const sex = l3[7] || l3[0] || 'X';

  return {
    format: 'TD1',
    lastName: last,
    firstName: first,
    documentNumber: documentNumber || l2.slice(0, 9).replace(/</g, '').trim(),
    nationality,
    dateOfBirthYmd: yymmddDob,
    dateOfExpiryYmd: yymmddExp,
    sex: String(sex).slice(0, 1).toUpperCase(),
    documentType: l1.slice(0, 2),
    rawLines: [l1, l2, l3],
    checks: {
      documentNumber: verifyOrMissing(l2.slice(0, 9), docChk),
      dateOfBirth: verifyOrMissing(yymmddDob, dobChk),
      dateOfExpiry: verifyOrMissing(yymmddExp, expChk)
    }
  };
}

export type ParseIcaOmrzResult =
  | { ok: true; value: ParsedICAO }
  | { ok: false; error: string };

/**
 * Parse TD3 (2×44) or TD1 (3×30) from MRZ line strings. Lines may include trailing whitespace.
 */
export function parseIcaOmrz(lines: string[]): ParseIcaOmrzResult {
  const clean = lines
    .map((l) => l.replace(/\r/g, '').replace(/\n/g, '').trim())
    .filter((l) => l.length > 0);
  if (clean.length === 2) {
    const a = clean[0] ?? '';
    const b = clean[1] ?? '';
    if (a.length < 20 || b.length < 20) {
      return { ok: false, error: 'TD3: lines too short' };
    }
    return { ok: true, value: parseTD3(a, b) };
  }
  if (clean.length === 3) {
    if ((clean[0] ?? '').length < 20) {
      return { ok: false, error: 'TD1: line too short' };
    }
    return {
      ok: true,
      value: parseTD1(
        clean[0] as string,
        clean[1] as string,
        clean[2] as string
      )
    };
  }
  if (clean.length === 1) {
    // Single long paste: try split 44+44 or 30*3
    const t = clean[0] as string;
    if (t.length === 88) {
      return { ok: true, value: parseTD3(t.slice(0, 44), t.slice(44, 88)) };
    }
    if (t.length === 90) {
      return {
        ok: true,
        value: parseTD1(t.slice(0, 30), t.slice(30, 60), t.slice(60, 90))
      };
    }
  }
  return {
    ok: false,
    error: 'Expected 2 lines (TD3) or 3 lines (TD1) or 88/90-char run-on'
  };
}
