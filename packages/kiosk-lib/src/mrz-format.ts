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

/** In-memory only: plain text for clipboard, no raw lines. */
export function formatIcaOmrzForKiosk(p: ParsedICAO): string {
  const n = [p.lastName, p.firstName].filter(Boolean).join(' ').trim();
  const d = p.dateOfBirthYmd ? yymmddToLabel(p.dateOfBirthYmd) : '';
  const e = p.dateOfExpiryYmd ? yymmddToLabel(p.dateOfExpiryYmd) : '';
  return [
    n,
    p.documentNumber && `ID ${p.documentNumber}`,
    p.nationality && p.nationality,
    d && `DOB ${d}`,
    e && `Exp ${e}`
  ]
    .filter(Boolean)
    .join('\n');
}
