import type { ParsedICAO } from './mrz';
import { icaoCheckDigit, parseIcaOmrz } from './mrz';
import { formatIcaOmrzForKiosk } from './mrz-format';

function isMrzCheckDigitCh(ch: string | undefined): boolean {
  return !!ch && ch >= '0' && ch <= '9';
}

/**
 * `ParsedICAO.checks` treats a missing check character (`<`) as a pass; for
 * extraction we need true mod-10 agreement when a digit is present, otherwise
 * it is "unknown" and must not make junk parse look valid.
 */
function hasStrictChecksumHit(p: ParsedICAO): boolean {
  if (p.format === 'TD3') {
    const l2 = p.rawLines[1] ?? '';
    if (l2.length < 28) {
      return false;
    }
    const cDoc = l2[9];
    if (isMrzCheckDigitCh(cDoc) && icaoCheckDigit(l2.slice(0, 9)) === cDoc) {
      return true;
    }
    const cDob = l2[19];
    if (isMrzCheckDigitCh(cDob) && icaoCheckDigit(l2.slice(13, 19)) === cDob) {
      return true;
    }
    const cExp = l2[27];
    if (isMrzCheckDigitCh(cExp) && icaoCheckDigit(l2.slice(21, 27)) === cExp) {
      return true;
    }
    return false;
  }
  const l2 = p.rawLines[1] ?? '';
  const l3 = p.rawLines[2] ?? '';
  if (l2.length < 27 || l3.length < 15) {
    return false;
  }
  const cDoc = l2[9];
  if (isMrzCheckDigitCh(cDoc) && icaoCheckDigit(l2.slice(0, 9)) === cDoc) {
    return true;
  }
  const cDob = l2[25];
  if (isMrzCheckDigitCh(cDob) && icaoCheckDigit(l2.slice(19, 25)) === cDob) {
    return true;
  }
  const cExp = l3[14];
  if (isMrzCheckDigitCh(cExp) && icaoCheckDigit(l3.slice(8, 14)) === cExp) {
    return true;
  }
  return false;
}

function isPlausibleYymmdd(ymd: string): boolean {
  if (!/^\d{6}$/.test(ymd)) {
    return false;
  }
  if (ymd === '<<<<<<' || /^[<0]+$/.test(ymd)) {
    return false;
  }
  const mm = parseInt(ymd.slice(2, 4), 10);
  const dd = parseInt(ymd.slice(4, 6), 10);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) {
    return false;
  }
  return true;
}

/**
 * Do not return pseudo-MRZ to the operator when no checksum lines up, unless
 * the structured fields are still plausibly real (otherwise random Latin from
 * OCR noise in the MRZ area becomes a fake TD3 with doc type "7" / doc "A2").
 */
function isAcceptableIcaOmrzCandidate(p: ParsedICAO): boolean {
  if (hasStrictChecksumHit(p)) {
    return true;
  }
  if (p.format === 'TD1' && p.nationality === 'UNK') {
    return false;
  }
  if (p.format === 'TD3' && !p.nationality?.trim()) {
    return false;
  }
  const d = p.dateOfBirthYmd;
  const e = p.dateOfExpiryYmd;
  if (
    !/^\d{6}$/.test(d ?? '') ||
    !/^\d{6}$/.test(e ?? '') ||
    !isPlausibleYymmdd(d!) ||
    !isPlausibleYymmdd(e!) ||
    p.nationality.length !== 3 ||
    p.nationality === 'UNK'
  ) {
    return false;
  }
  return true;
}

function scoreCandidate(p: ParsedICAO): number {
  let s = 0;
  if (p.checks.documentNumber) s += 1;
  if (p.checks.dateOfBirth) s += 1;
  if (p.checks.dateOfExpiry) s += 1;
  const l1 = p.rawLines[0] ?? '';
  if (l1.length >= 5 && l1.slice(2, 5) === 'RUS') s += 3;
  const l2 = p.format === 'TD1' ? (p.rawLines[1] ?? '') : '';
  if (l2.length >= 19 && l2.slice(16, 19) === 'RUS') s += 3;
  if (l1.length >= 10) {
    const nameBlock = l1.slice(5);
    if (nameBlock.includes('<<')) s += 1;
  }
  if (p.lastName.length >= 3) s += 1;
  if (p.firstName.length >= 1) s += 1;
  return s;
}

type ParseOk = { ok: true; value: ParsedICAO };

function isOk(r: import('./mrz').ParseIcaOmrzResult): r is ParseOk {
  return r.ok === true;
}

let best: { score: number; value: ParsedICAO } | null = null;

function offerCandidate(r: import('./mrz').ParseIcaOmrzResult): void {
  if (!isOk(r)) {
    return;
  }
  const sc = scoreCandidate(r.value);
  if (!best || sc > best.score) {
    best = { score: sc, value: r.value };
  }
}

/** All 88- and 90-char starts; same as two-line / three-line array forms in {@link parseIcaOmrz}. */
function offerAllAlnumWindowCandidates(alnum: string): void {
  for (let i = 0; i + 88 <= alnum.length; i++) {
    offerCandidate(parseIcaOmrz([alnum.slice(i, i + 88)]));
  }
  for (let i = 0; i + 90 <= alnum.length; i++) {
    offerCandidate(parseIcaOmrz([alnum.slice(i, i + 90)]));
  }
}

/**
 * Finds TD1 (3×30) or TD3 (2×44) MRZ inside noisy Tesseract (or other) text.
 * Picks the **highest-scoring** parse over all line breaks and all 88/90 window shifts
 * (fixes left-truncated TD1 where the first working window was `...BYREV<<...` instead of `I<RUSBOGATYREV<<...`).
 */
export function extractIcaOmrzFromOcrText(raw: string): string {
  const t0 = String(raw).trim();
  if (!t0) {
    return '';
  }

  best = null;

  const lines0 = t0
    .split('\n')
    .map((l) => l.replace(/\r/g, '').trim())
    .filter(Boolean);
  if (lines0.length) {
    const first = lines0[0] as string;
    if (lines0.length === 1) {
      if (first.length === 88 || first.length === 90) {
        offerCandidate(parseIcaOmrz([first]));
      }
    } else if (lines0.length === 2) {
      offerCandidate(parseIcaOmrz([lines0[0] as string, lines0[1] as string]));
    } else if (lines0.length >= 3) {
      offerCandidate(
        parseIcaOmrz([
          lines0[0] as string,
          lines0[1] as string,
          lines0[2] as string
        ])
      );
    }
  }

  const perLine = t0
    .split('\n')
    .map((l) =>
      l
        .replace(/\r/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9<]+/g, '')
    )
    .filter((l) => l.length >= 20);
  for (let i = 0; i < perLine.length; i++) {
    if (i + 1 < perLine.length) {
      offerCandidate(parseIcaOmrz([perLine[i]!, perLine[i + 1]!]));
    }
    if (i + 2 < perLine.length) {
      offerCandidate(
        parseIcaOmrz([perLine[i]!, perLine[i + 1]!, perLine[i + 2]!])
      );
    }
  }

  const alnum = t0.toUpperCase().replace(/[^A-Z0-9<]+/g, '');
  if (alnum.length >= 88) {
    offerAllAlnumWindowCandidates(alnum);
  }

  if (!best) {
    return '';
  }
  if (!isAcceptableIcaOmrzCandidate(best.value)) {
    return '';
  }
  return formatIcaOmrzForKiosk(best.value);
}
