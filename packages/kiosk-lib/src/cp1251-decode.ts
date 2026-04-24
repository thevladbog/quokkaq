/** Decodes Windows-1251 bytes to a JS string (browser/Node 18+). */

export function decodeCp1251ToString(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') {
    try {
      return new TextDecoder('windows-1251').decode(bytes);
    } catch {
      // ignore
    }
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}
