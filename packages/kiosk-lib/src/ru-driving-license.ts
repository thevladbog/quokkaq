import { decodeCp1251ToString } from './cp1251-decode';

const PIPE_MIN_FIELDS = 9;

export type RuDrivingLicenseParseEncoding =
  | 'utf-8'
  | 'windows-1251'
  | 'plain'
  | 'unknown';

export type ParsedRuDrivingLicense = {
  documentId: string;
  issueYmd: string;
  expiryYmd: string;
  lastName: string;
  firstName: string;
  middleName: string;
  birthYmd: string;
  /** e.g. "A,A1,B" */
  categories: string;
  /** Regional GIBDD code in samples */
  issuingUnitCode: string;
  /** Opaque serial/check suffix when present (public Q&A) */
  trailer: string;
  /** How binary payload was interpreted; **never** the raw PII. */
  encoding: RuDrivingLicenseParseEncoding;
};

function parsePipeFields(s: string): string[] {
  return s.split('|').map((f) => f.replace(/\0/g, '').trim());
}

/**
 * RU VU 2D barcode: ≥9 pipe-separated fields, or a compact base64 payload. Use this
 * to ignore stray "|" in OCR of passports / other pages (avoids "partial" false positives).
 */
export function isLikelyRuDrivingLicenseFromScanString(raw: string): boolean {
  const t = String(raw).trim();
  if (!t) {
    return false;
  }
  const compact = t.replace(/\s+/g, '');
  if (looksLikeBase64(compact) && compact.length >= 16) {
    return true;
  }
  if (!t.includes('|')) {
    return false;
  }
  return parsePipeFields(t).length >= PIPE_MIN_FIELDS;
}

/** Returns true for plausible base64 of reasonable length. */
function looksLikeBase64(s: string): boolean {
  const t = s.replace(/\s+/g, '');
  if (t.length < 16) {
    return false;
  }
  if (t.length % 4 === 1) {
    return false;
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(t)) {
    return false;
  }
  return t.length % 4 === 0;
}

function decodeBase64ToBytes(b64: string): Uint8Array | null {
  const t = b64.replace(/\s+/g, '');
  try {
    if (typeof atob === 'function') {
      const bin = atob(t);
      const u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) {
        u[i] = bin.charCodeAt(i);
      }
      return u;
    }
    if (typeof Buffer !== 'undefined') {
      return new Uint8Array(Buffer.from(t, 'base64'));
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Tries valid UTF-8 first; if invalid or not enough fields, decodes as Windows-1251 (RФ сканеры);
 * only then lax UTF-8 (mojibake for mixed bytes).
 */
function bytesToTextWithHeuristic(bytes: Uint8Array): {
  text: string;
  enc: RuDrivingLicenseParseEncoding;
} {
  try {
    const u = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (u.split('|').length >= PIPE_MIN_FIELDS) {
      return { text: u, enc: 'utf-8' };
    }
  } catch {
    // not well-formed UTF-8 (typical for cp1251 FIO in PDF417)
  }
  const c1251 = decodeCp1251ToString(bytes);
  if (c1251.split('|').length >= PIPE_MIN_FIELDS) {
    return { text: c1251, enc: 'windows-1251' };
  }
  const lax = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  if (lax.split('|').length >= PIPE_MIN_FIELDS) {
    return { text: lax, enc: 'utf-8' };
  }
  return { text: lax, enc: 'unknown' };
}

function fromPipeParts(
  parts: string[],
  enc: RuDrivingLicenseParseEncoding
): ParsedRuDrivingLicense {
  const n = parts.length;
  if (n < 9) {
    return {
      documentId: '',
      issueYmd: '',
      expiryYmd: '',
      lastName: '',
      firstName: '',
      middleName: '',
      birthYmd: '',
      categories: '',
      issuingUnitCode: '',
      trailer: parts.join('|'),
      encoding: enc
    };
  }
  return {
    documentId: (parts[0] ?? '').trim(),
    issueYmd: (parts[1] ?? '').trim().replace(/-/g, '').slice(0, 8),
    expiryYmd: (parts[2] ?? '').trim().replace(/-/g, '').slice(0, 8),
    lastName: (parts[3] ?? '').trim(),
    firstName: (parts[4] ?? '').trim(),
    middleName: (parts[5] ?? '').trim(),
    birthYmd: (parts[6] ?? '').trim().replace(/-/g, '').slice(0, 8),
    categories: (parts[7] ?? '').trim(),
    issuingUnitCode: (parts[8] ?? '').trim(),
    trailer: n > 9 ? parts.slice(9).join('|') : '',
    encoding: enc
  };
}

/**
 * RU driver license barcode: pipe-separated fields, sometimes wrapped in base64; ФИО may be UTF-8 or cp1251 in binary.
 */
export function parseRuDrivingLicenseBarcode(
  raw: string
): ParsedRuDrivingLicense {
  const t = String(raw).trim();
  if (!t) {
    return fromPipeParts([], 'plain');
  }
  if (t.includes('|') && t.split('|').length >= PIPE_MIN_FIELDS) {
    return fromPipeParts(parsePipeFields(t), 'plain');
  }
  if (looksLikeBase64(t)) {
    const bytes = decodeBase64ToBytes(t);
    if (bytes) {
      const { text, enc } = bytesToTextWithHeuristic(bytes);
      if (text.includes('|') && text.split('|').length >= PIPE_MIN_FIELDS) {
        return fromPipeParts(parsePipeFields(text), enc);
      }
      return {
        documentId: '',
        issueYmd: '',
        expiryYmd: '',
        lastName: '',
        firstName: '',
        middleName: '',
        birthYmd: '',
        categories: '',
        issuingUnitCode: '',
        trailer: '',
        encoding: 'unknown'
      };
    }
  }
  if (t.includes('|')) {
    return fromPipeParts(parsePipeFields(t), 'plain');
  }
  return {
    documentId: '',
    issueYmd: '',
    expiryYmd: '',
    lastName: '',
    firstName: '',
    middleName: '',
    birthYmd: '',
    categories: '',
    issuingUnitCode: '',
    trailer: t.slice(0, 64),
    encoding: 'plain'
  };
}

/** Human-readable one block for copy/paste to forms (in-memory). */
export function formatRuDrivingLicenseText(p: ParsedRuDrivingLicense): string {
  const parts = [
    p.documentId,
    p.issueYmd,
    p.expiryYmd,
    p.lastName,
    p.firstName,
    p.middleName,
    p.birthYmd,
    p.categories
  ].filter(Boolean);
  return parts.join(' ');
}
