import type { ParsedICAO } from './mrz';

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
  return s.replace(/<+$/g, '').replace(/</g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * In-memory only: “pretty” fields + raw MRZ lines. If ICAO check digits don’t line up, we warn
 * and label dubious dates as raw. `P<` vs `3<` in TD3 line1 is normalised in {@link parseIcaOmrz}.
 */
export function formatIcaOmrzForKiosk(p: ParsedICAO): string {
  const d = p.dateOfBirthYmd ? formatYymd(p.dateOfBirthYmd) : '';
  const e = p.dateOfExpiryYmd ? formatYymd(p.dateOfExpiryYmd) : '';
  const type = p.documentType
    ? String(p.documentType).replace(/</g, ' ').replace(/\s+/g, ' ').trim() ||
      '—'
    : '';
  const nat = p.nationality
    ? p.nationality.replace(/</g, ' ').replace(/\s+/g, ' ').trim()
    : '';
  const doc = p.documentNumber ? cleanDocNo(p.documentNumber) : '';
  const sx = (p.sex ?? '').replace(/[<>]/g, '').trim().toUpperCase();
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
