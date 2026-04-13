/** Encode string to Windows-1251 bytes for ESC/POS Epson WPC1251 (use with `ESC t 46`, not `ESC t 17` — 17 is PC866). */

function buildUnicodeToCp1251(): Map<number, number> {
  const m = new Map<number, number>();
  for (let b = 0; b < 128; b++) {
    m.set(b, b);
  }
  if (typeof TextDecoder !== 'undefined') {
    try {
      const dec = new TextDecoder('windows-1251');
      for (let b = 128; b < 256; b++) {
        const ch = dec.decode(new Uint8Array([b]));
        const cp = ch.codePointAt(0);
        if (cp !== undefined && cp !== 0xfffd) {
          m.set(cp, b);
        }
      }
      return m;
    } catch {
      /* fall through */
    }
  }
  return m;
}

const UNICODE_TO_CP1251 = buildUnicodeToCp1251();

export function encodeCp1251(text: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < text.length; ) {
    const code = text.codePointAt(i)!;
    i += code > 0xffff ? 2 : 1;
    if (code < 0x80) {
      out.push(code);
      continue;
    }
    const b = UNICODE_TO_CP1251.get(code);
    out.push(b !== undefined ? b : 0x3f);
  }
  return new Uint8Array(out);
}
