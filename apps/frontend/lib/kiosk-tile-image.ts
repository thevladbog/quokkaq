/**
 * Kiosk service tile: interpret `Service.imageUrl` as URL, data-URL, or inline emoji.
 */

export type KioskTileImageKind = 'none' | 'url' | 'data_svg' | 'emoji';

const DATA_SVG = /^data:image\/svg\+xml/i;

/**
 * `none` = empty / whitespace; `data_svg` and other `data:` are handled separately in UI (img);
 * `url` = http(s), //, or non-SVG data URLs; `emoji` = short string without URL scheme.
 */
export function resolveKioskTileImageKind(
  raw: string | null | undefined
): KioskTileImageKind {
  if (raw == null) {
    return 'none';
  }
  const s = String(raw).trim();
  if (!s) {
    return 'none';
  }
  if (DATA_SVG.test(s)) {
    return 'data_svg';
  }
  if (/^https?:\/\//i.test(s) || s.startsWith('//')) {
    return 'url';
  }
  if (s.toLowerCase().startsWith('data:')) {
    return 'url';
  }
  if (isLikelyEmojiIconString(s)) {
    return 'emoji';
  }
  return 'url';
}

const LETTER_OR_DIGIT_RE = /[a-zA-Zа-яА-ЯёЁ0-9]/u;

// Emoji / joiners / variation / skin (ZWJ families, flags use regional indicators)
const EMOJI_OR_JOINER_RE =
  /^(\p{Extended_Pictographic}|\u200D|\uFE0F|[\u{1F1E6}-\u{1F1FF}]{2}|\u{1F3FB}-\u{1F3FF}|\u{FE0E})+$/u;

/**
 * Heuristic: no URL-like scheme, no letters/digits; only emoji-related codepoints (incl. ZWJ chains).
 */
export function isLikelyEmojiIconString(raw: string): boolean {
  const s = raw.trim();
  if (!s || s.length > 64) {
    return false;
  }
  if (
    /[<>]/.test(s) ||
    s.includes('://') ||
    s.toLowerCase().startsWith('data:')
  ) {
    return false;
  }
  if (LETTER_OR_DIGIT_RE.test(s)) {
    return false;
  }
  if (!/[\p{Extended_Pictographic}]/u.test(s)) {
    return false;
  }
  if (!EMOJI_OR_JOINER_RE.test(s)) {
    return false;
  }
  if (typeof Intl.Segmenter === 'undefined') {
    return true;
  }
  const it = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const graphemes = [...it.segment(s)];
  if (graphemes.length === 0 || graphemes.length > 8) {
    return false;
  }
  return true;
}
