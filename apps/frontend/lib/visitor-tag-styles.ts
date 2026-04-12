import type { CSSProperties } from 'react';

const HEX6 = /^#?[0-9A-Fa-f]{6}$/i;

export function isSafeVisitorTagHex(color: string): boolean {
  return HEX6.test(color.trim());
}

export function normalizeHex6(color: string): string {
  const t = color.trim();
  return t.startsWith('#') ? t : `#${t}`;
}

/** Inline styles for a tag pill: tinted background + border from hex, readable text. */
export function visitorTagPillStyles(color: string): CSSProperties {
  if (!isSafeVisitorTagHex(color)) {
    return {};
  }
  const hex = normalizeHex6(color);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const fg = luminance > 0.55 ? '#0a0a0a' : '#fafafa';
  return {
    backgroundColor: `rgba(${r},${g},${b},0.22)`,
    borderColor: hex,
    color: fg,
    borderWidth: 1,
    borderStyle: 'solid'
  };
}
