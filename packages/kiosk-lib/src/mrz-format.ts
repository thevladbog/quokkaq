import type { ParsedICAO } from './mrz';

function isSixDecimalDigits(ymd: string): boolean {
  if (ymd.length !== 6) {
    return false;
  }
  for (let i = 0; i < 6; i++) {
    const c = ymd[i] ?? '';
    if (c < '0' || c > '9') {
      return false;
    }
  }
  return true;
}

/**
 * “Only filler” per `[<0]+` on 6-byte MRZ fields (e.g. 000000) — O(n) scan, no regex.
 */
function isOnlyChevronOrZero(ymd: string): boolean {
  if (ymd.length < 1) {
    return false;
  }
  for (let i = 0; i < ymd.length; i++) {
    const c = ymd[i] ?? '';
    if (c !== '0' && c !== '<') {
      return false;
    }
  }
  return true;
}

function isAsciiSpace(c: string): boolean {
  return (
    c === ' ' ||
    c === '\t' ||
    c === '\n' ||
    c === '\r' ||
    c === '\f' ||
    c === '\v' ||
    c === '\u00a0'
  );
}

function stripTrailingChar(s: string, ch: string): string {
  let end = s.length;
  while (end > 0 && s[end - 1] === ch) {
    end -= 1;
  }
  return s.slice(0, end);
}

function replaceAllChar1(s: string, ch: string, replacement: string): string {
  if (replacement.length !== 1 || !s.includes(ch)) {
    return s;
  }
  let out = '';
  for (let i = 0; i < s.length; i++) {
    out += s[i] === ch ? replacement : s[i]!;
  }
  return out;
}

/** O(n) collapse of runs of ASCII-ish whitespace. */
function collapseWhitespace(s: string): string {
  const parts: string[] = [];
  let i = 0;
  const n = s.length;
  while (i < n) {
    while (i < n && isAsciiSpace(s[i]!)) {
      i++;
    }
    if (i >= n) {
      break;
    }
    const start = i;
    i++;
    while (i < n && !isAsciiSpace(s[i]!)) {
      i++;
    }
    parts.push(s.slice(start, i));
  }
  return parts.join(' ');
}

function removeAngleBrackets(s: string): string {
  if (s.length === 0) {
    return s;
  }
  if (s.indexOf('<') < 0 && s.indexOf('>') < 0) {
    return s;
  }
  let out = '';
  for (let j = 0; j < s.length; j++) {
    const c = s[j]!;
    if (c !== '<' && c !== '>') {
      out += c;
    }
  }
  return out;
}

function mrzPrettyField(s: string): string {
  return collapseWhitespace(replaceAllChar1(s, '<', ' ')).trim();
}

function yymmddToLabel(yymmdd: string): string {
  if (yymmdd.length !== 6) {
    return yymmdd;
  }
  const yy = parseInt(yymmdd.slice(0, 2), 10);
  if (Number.isNaN(yy)) {
    return yymmdd;
  }
  const y = yy < 50 ? 2000 + yy : 1900 + yy;
  return `${y}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;
}

/** Rejects 2030-32-47 style output when OCR/parse mangles YYMMDD. */
function isPlausibleYymmdd(ymd: string): boolean {
  if (!isSixDecimalDigits(ymd)) {
    return false;
  }
  if (ymd === '<<<<<<' || isOnlyChevronOrZero(ymd)) {
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
 * “Pretty” when checksum-backed fields look sane; else leave six digits to avoid false calendar.
 */
function formatYymd(ymd: string): string {
  if (!ymd || ymd.length !== 6) {
    return ymd || '—';
  }
  if (!isPlausibleYymmdd(ymd)) {
    return `${ymd} (raw, verify in MRZ)`;
  }
  return yymmddToLabel(ymd);
}

function cleanDocNo(s: string): string {
  return collapseWhitespace(
    replaceAllChar1(stripTrailingChar(s, '<'), '<', ' ')
  ).trim();
}

/**
 * In-memory only: “pretty” fields + raw MRZ lines. If ICAO check digits don’t line up, we warn
 * and label dubious dates as raw. `P<` vs `3<` in TD3 line1 is normalised in {@link parseIcaOmrz}.
 */
export function formatIcaOmrzForKiosk(p: ParsedICAO): string {
  const d = p.dateOfBirthYmd ? formatYymd(p.dateOfBirthYmd) : '';
  const e = p.dateOfExpiryYmd ? formatYymd(p.dateOfExpiryYmd) : '';
  const type = p.documentType
    ? mrzPrettyField(String(p.documentType)) || '—'
    : '';
  const nat = p.nationality ? mrzPrettyField(p.nationality) : '';
  const doc = p.documentNumber ? cleanDocNo(p.documentNumber) : '';
  const sx = removeAngleBrackets(p.sex ?? '')
    .trim()
    .toUpperCase();
  const ver =
    p.checks.documentNumber && p.checks.dateOfBirth && p.checks.dateOfExpiry;
  const last = (p.lastName ?? '').trim();
  const first = (p.firstName ?? '').trim();
  const head: string[] = [];
  if (!ver) {
    head.push(
      'Warning: at least one MRZ check digit does not match — re-check names and dates against the machine lines below.'
    );
  }
  if (last) {
    head.push(`Surname: ${last}`);
  }
  if (first) {
    head.push(`Given names: ${first}`);
  }
  if (type) {
    head.push(`Type (MRZ col 1): ${type}`);
  }
  if (nat) {
    head.push(`Nationality: ${nat}`);
  }
  if (doc) {
    head.push(`Document number: ${doc}`);
  }
  if (sx && sx.length === 1) {
    head.push(`Sex: ${sx === 'X' || sx === '<' ? 'unknown / see MRZ' : sx}`);
  }
  if (d) {
    head.push(`Date of birth: ${d}`);
  }
  if (e) {
    head.push(`Date of expiry: ${e}`);
  }
  if (p.rawLines.length > 0) {
    head.push('');
    head.push('MRZ (ICAO) — use these lines to correct OCR above:');
    for (const row of p.rawLines) {
      head.push(row);
    }
  }
  return head.join('\n');
}
