/**
 * Russian bank transfer QR (ST00012).
 * Payload is encoded as UTF-8 bytes in the QR matrix. Many mobile banks decode the scanned
 * string as UTF-8; if we put Windows-1251 bytes instead, Cyrillic is shown as Latin-1 mojibake
 * (e.g. П → "Ï", о → "î").
 * CRC-16/CCITT-FALSE is computed over UTF-8 bytes of the payload before the CRC field.
 * `qr.js` (via react-qr-code) emits one byte per char code (low 8 bits), so we pass a "binary
 * string" built from UTF-8 octets (char codes 0–255).
 * Ref: NSPK / bank materials (verify with your bank app).
 */

const textEncoder = new TextEncoder();

const ru20 = /^\d{20}$/;
const ru9 = /^\d{9}$/;
const ruInn10 = /^\d{10}$/;
const ruInn12 = /^\d{12}$/;
const ruKpp = /^\d{9}$/;

function crc16CcittFalse(bytes: Uint8Array): number {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc =
        (crc & 0x8000) !== 0
          ? ((crc << 1) ^ 0x1021) & 0xffff
          : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

function sanitizeField(s: string): string {
  return s.replace(/\|/g, ' ').replace(/\r?\n/g, ' ').trim();
}

/** UTF-8 bytes → string for qr.js (one char per octet, codes 0–255). */
function utf8QrBinaryString(unicode: string): string {
  const u8 = textEncoder.encode(unicode);
  let out = '';
  for (let i = 0; i < u8.length; i++) {
    out += String.fromCharCode(u8[i]);
  }
  return out;
}

export type RuBankQrSt00012Input = {
  /** Payee name (ЮЛ / ИП), max ~160 in practice */
  name: string;
  /** Settlement account (р/с), 20 digits */
  personalAcc: string;
  bankName: string;
  bic: string;
  correspondentAccount: string;
  /** Amount in minor units (kopecks) */
  sumKopecks: number;
  purpose: string;
  payeeInn: string;
  kpp?: string;
};

/**
 * Returns a binary string for `<QRCode value={...} />` (UTF-8 octets as char codes), or null if invalid.
 */
export function buildRuBankQrSt00012Payload(
  input: RuBankQrSt00012Input
): string | null {
  const name = sanitizeField(input.name).slice(0, 160);
  const personalAcc = input.personalAcc.replace(/\D/g, '');
  const bankName = sanitizeField(input.bankName).slice(0, 45);
  const bic = input.bic.replace(/\D/g, '');
  const corr = input.correspondentAccount.replace(/\D/g, '');
  const purpose = sanitizeField(input.purpose).slice(0, 210);
  const inn = input.payeeInn.replace(/\D/g, '');
  if (!name || !ru20.test(personalAcc) || !bankName || !ru9.test(bic)) {
    return null;
  }
  if (!ru20.test(corr)) return null;
  if (!(ruInn10.test(inn) || ruInn12.test(inn))) return null;
  if (
    !Number.isInteger(input.sumKopecks) ||
    !Number.isSafeInteger(input.sumKopecks) ||
    input.sumKopecks <= 0
  ) {
    return null;
  }
  const sum = input.sumKopecks;

  const parts = [
    'ST00012',
    `Name=${name}`,
    `PersonalAcc=${personalAcc}`,
    `BankName=${bankName}`,
    `BIC=${bic}`,
    `CorrespAcc=${corr}`,
    `Sum=${sum}`,
    `Purpose=${purpose}`,
    `PayeeINN=${inn}`
  ];
  const kpp = input.kpp?.replace(/\D/g, '') ?? '';
  if (ruInn10.test(inn) && ruKpp.test(kpp)) {
    parts.push(`KPP=${kpp}`);
  }

  const withoutCrc = parts.join('|');
  const withoutCrcUtf8 = textEncoder.encode(withoutCrc);
  const crcVal = crc16CcittFalse(withoutCrcUtf8);
  const crcHex = crcVal.toString(16).toUpperCase().padStart(4, '0');
  const fullUnicode = `${withoutCrc}|CRC=${crcHex}`;
  return utf8QrBinaryString(fullUnicode);
}
