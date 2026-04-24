import type { KioskConfig, Ticket } from '@quokkaq/shared-types';
import { encodeCp1251 } from './cp1251-encode';

const ESC = 0x1b;
const GS = 0x1d;

/** 203 dpi × 80 mm paper ≈ 384 dots; scale logos to this width. */
export const KIOSK_TICKET_RECEIPT_WIDTH_DOTS = 384;

/** Rough monospaced line length for 80 mm (font A). */
const RECEIPT_MAX_CHARS = 42;

export type BuildKioskTicketEscPosInput = {
  kiosk: Pick<
    KioskConfig,
    | 'logoUrl'
    | 'printerLogoUrl'
    | 'headerText'
    | 'footerText'
    | 'showHeader'
    | 'showFooter'
    | 'showUnitInHeader'
    | 'feedbackUrl'
  >;
  ticket: Ticket;
  serviceLabel: string;
  ticketPageUrl: string;
  /** Resolved title when `showUnitInHeader` is true (same as kiosk top bar). */
  unitDisplayTitle: string;
  /**
   * Fetch logo from this URL instead of `kiosk.logoUrl` (e.g. same-origin `/api/kiosk-print-logo`
   * when storage URLs are not CORS-readable from the browser).
   */
  logoFetchUrl?: string;
  /**
   * Extra text lines on the receipt after the queue number (localized at call site, e.g. position / zone).
   */
  extraBodyLines?: string[];
};

/** Epson `ESC t n`: WPC1251 Cyrillic (page 46). Not 17 — on TM series 17 is PC866. */
const ESCPOS_CODE_PAGE_WPC1251 = 0x2e;

function appendSelectWpc1251(parts: number[]) {
  parts.push(ESC, 0x74, ESCPOS_CODE_PAGE_WPC1251);
}

/** Print buffer and feed `n` text lines (Epson `ESC d n`) — helps last line print before cut. */
function appendPrintAndFeedLines(parts: number[], n: number) {
  const clamped = Math.min(255, Math.max(0, n));
  parts.push(ESC, 0x64, clamped);
}

function normalizeReceiptTextLine(raw: string): string {
  return raw
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

function wrapLine(text: string, maxChars: number): string[] {
  const t = text.trim();
  if (t.length === 0) {
    return [];
  }
  if (t.length <= maxChars) {
    return [t];
  }
  const words = t.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (!w) {
      continue;
    }
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= maxChars) {
      cur = next;
    } else {
      if (cur) {
        lines.push(cur);
      }
      if (w.length <= maxChars) {
        cur = w;
      } else {
        let rest = w;
        while (rest.length > maxChars) {
          lines.push(rest.slice(0, maxChars));
          rest = rest.slice(maxChars);
        }
        cur = rest;
      }
    }
  }
  if (cur) {
    lines.push(cur);
  }
  return lines;
}

function wrapToDashes(maxChars: number): string {
  return '-'.repeat(Math.min(maxChars, 48));
}

function appendLine(
  parts: number[],
  text: string,
  align: 'left' | 'center' | 'right'
) {
  const a = align === 'center' ? 1 : align === 'right' ? 2 : 0;
  parts.push(ESC, 0x61, a);
  for (const b of encodeCp1251(text)) {
    parts.push(b);
  }
  parts.push(0x0a);
}

/** Epson `GS ! n`: width/height magnification (1–8). n = (w-1)*16 + (h-1). */
function appendSelectCharSize(parts: number[], n: number) {
  parts.push(GS, 0x21, n & 0xff);
}

function appendGsV0Raster(
  parts: number[],
  raster: { width: number; height: number; data: Uint8Array }
) {
  const x = raster.width / 8;
  const y = raster.height;
  const xL = x & 0xff;
  const xH = (x >> 8) & 0xff;
  const yL = y & 0xff;
  const yH = (y >> 8) & 0xff;
  parts.push(GS, 0x76, 0x30, 0x00, xL, xH, yL, yH);
  for (let i = 0; i < raster.data.length; i++) {
    parts.push(raster.data[i]!);
  }
}

function imageDataToEscPosRaster(img: ImageData): Uint8Array {
  const { width, height, data } = img;
  const bytesPerRow = width / 8;
  const out = new Uint8Array(bytesPerRow * height);
  let o = 0;
  for (let y = 0; y < height; y++) {
    for (let xb = 0; xb < bytesPerRow; xb++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = xb * 8 + bit;
        const i = (y * width + x) * 4;
        if (i < 0 || i + 2 >= data.length) {
          continue;
        }
        const r = data[i] ?? 255;
        const g = data[i + 1] ?? 255;
        const b = data[i + 2] ?? 255;
        const lum = (r * 299 + g * 587 + b * 114) / 1000;
        if (lum < 180) {
          byte |= 0x80 >> bit;
        }
      }
      out[o++] = byte;
    }
  }
  return out;
}

/**
 * Queue number as GS v0 raster using a rounded system font (canvas), so it does not rely on
 * ESC/POS `GS !` bitmap scaling (6×6 built-in glyphs look very blocky on 203 dpi).
 * Returns null in non-DOM environments (tests, SSR) — caller should use text fallback.
 */
function renderQueueNumberRaster(
  raw: string,
  maxWidthDots: number
): { width: number; height: number; data: Uint8Array } | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const text = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!text) {
    return null;
  }

  const maxW = Math.min(maxWidthDots, KIOSK_TICKET_RECEIPT_WIDTH_DOTS);
  /** Narrow side margins so short queue numbers can use a larger font. */
  const margin = 8;
  const usable = Math.max(32, maxW - margin);
  /** Prefer rounded/gothic UI faces; fall back to system sans. */
  const fontFamily =
    'ui-rounded, "Hiragino Maru Gothic ProN", "Arial Rounded MT Bold", "Nunito", "Segoe UI", system-ui, sans-serif';

  const probe = document.createElement('canvas');
  const pctx = probe.getContext('2d');
  if (!pctx) {
    return null;
  }

  let fontSize = 132;
  const minSize = 36;
  while (fontSize >= minSize) {
    pctx.font = `600 ${fontSize}px ${fontFamily}`;
    if (pctx.measureText(text).width <= usable) {
      break;
    }
    fontSize -= 5;
  }

  pctx.font = `600 ${fontSize}px ${fontFamily}`;
  const m = pctx.measureText(text);
  const tw = Math.ceil(m.width);
  const ascent = m.actualBoundingBoxAscent ?? fontSize * 0.72;
  const descent = m.actualBoundingBoxDescent ?? fontSize * 0.28;
  const th = Math.ceil(ascent + descent);
  const padX = 6;
  const padY = 6;
  const w8 = Math.min(maxW, Math.max(8, Math.ceil((tw + padX * 2) / 8) * 8));
  const h = Math.max(th + padY * 2, Math.round(fontSize * 1.22));

  const canvas = document.createElement('canvas');
  canvas.width = w8;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w8, h);
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${fontSize}px ${fontFamily}`;
  ctx.fillText(text, w8 / 2, h / 2);

  const img = ctx.getImageData(0, 0, w8, h);
  const data = imageDataToEscPosRaster(img);
  return { width: w8, height: h, data };
}

function rasterFromDrawable(
  drawable: ImageBitmap | HTMLImageElement,
  maxWidthDots: number
): { width: number; height: number; data: Uint8Array } | null {
  const srcW =
    'width' in drawable && typeof drawable.width === 'number'
      ? drawable.width
      : (drawable as HTMLImageElement).naturalWidth;
  const srcH =
    'height' in drawable && typeof drawable.height === 'number'
      ? drawable.height
      : (drawable as HTMLImageElement).naturalHeight;
  if (srcW < 1 || srcH < 1) {
    return null;
  }
  const scale = Math.min(1, maxWidthDots / srcW);
  const w = Math.max(8, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));
  const w8 = Math.ceil(w / 8) * 8;
  const canvas = document.createElement('canvas');
  canvas.width = w8;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w8, h);
  ctx.drawImage(drawable as CanvasImageSource, 0, 0, w, h);
  if ('close' in drawable && typeof drawable.close === 'function') {
    drawable.close();
  }
  const img = ctx.getImageData(0, 0, w8, h);
  const data = imageDataToEscPosRaster(img);
  return { width: w8, height: h, data };
}

async function fetchLogoEscPosRaster(
  logoUrl: string,
  maxWidthDots: number
): Promise<{ width: number; height: number; data: Uint8Array } | null> {
  if (typeof document === 'undefined') {
    return null;
  }
  try {
    const res = await fetch(logoUrl, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) {
      return null;
    }
    const blob = await res.blob();
    if (typeof createImageBitmap === 'function') {
      try {
        const bmp = await createImageBitmap(blob);
        return rasterFromDrawable(bmp, maxWidthDots);
      } catch {
        /* SVG/WebP etc. — fall through to Image() */
      }
    }
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.decoding = 'async';
      const ok = await new Promise<boolean>((resolve) => {
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = url;
      });
      if (!ok) {
        return null;
      }
      return rasterFromDrawable(img, maxWidthDots);
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}

/** Epson / compatible QR Model 2; URL should be ASCII. */
function appendQrModel2Url(parts: number[], url: string) {
  const bytes = new TextEncoder().encode(url);
  if (bytes.length > 2048) {
    throw new Error('QR URL too long');
  }
  parts.push(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);
  parts.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06);
  parts.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31);
  const n = bytes.length + 3;
  parts.push(GS, 0x28, 0x6b, n & 0xff, (n >> 8) & 0xff, 0x31, 0x50, 0x30);
  for (let i = 0; i < bytes.length; i++) {
    parts.push(bytes[i]!);
  }
  parts.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30);
}

function buildEscPosReceiptCp1251(lines: string[]): Uint8Array {
  const parts: number[] = [];
  parts.push(ESC, 0x40);
  appendSelectWpc1251(parts);
  for (const line of lines) {
    for (const b of encodeCp1251(line)) {
      parts.push(b);
    }
    parts.push(0x0a);
  }
  appendPrintAndFeedLines(parts, 3);
  parts.push(0x0a);
  parts.push(GS, 0x56, 0x00);
  return new Uint8Array(parts);
}

function buildFallbackTicketEscPos(
  input: BuildKioskTicketEscPosInput
): Uint8Array {
  const lines: string[] = [];
  const k = input.kiosk;
  const maxC = RECEIPT_MAX_CHARS;

  if (k.showHeader !== false && k.headerText?.trim()) {
    for (const raw of k.headerText.split('\n')) {
      lines.push(...wrapLine(normalizeReceiptTextLine(raw), maxC));
    }
    lines.push('');
  }
  if (k.showUnitInHeader !== false && input.unitDisplayTitle.trim()) {
    lines.push(normalizeReceiptTextLine(input.unitDisplayTitle.trim()));
    lines.push('');
  }
  lines.push('');
  lines.push(normalizeReceiptTextLine(input.serviceLabel));
  lines.push(`#${input.ticket.queueNumber}`);
  lines.push('');
  if (k.showFooter !== false && k.footerText?.trim()) {
    lines.push('');
    for (const raw of k.footerText.split('\n')) {
      lines.push(...wrapLine(normalizeReceiptTextLine(raw), maxC));
    }
  }
  const fb = k.feedbackUrl?.trim();
  if (fb) {
    lines.push('');
    lines.push(
      normalizeReceiptTextLine(fb.split('{{ticketId}}').join(input.ticket.id))
    );
  }
  return buildEscPosReceiptCp1251(lines);
}

async function buildRichTicketEscPos(
  input: BuildKioskTicketEscPosInput
): Promise<Uint8Array> {
  const parts: number[] = [];
  const k = input.kiosk;
  const maxC = RECEIPT_MAX_CHARS;

  parts.push(ESC, 0x40);
  appendSelectWpc1251(parts);
  /** Top margin without a lone LF right after `ESC t` (some firmwares garble the first text line). */
  appendLine(parts, '', 'center');

  const printLogoCandidate =
    k.printerLogoUrl?.trim() || k.logoUrl?.trim() || '';
  const logoSrc = input.logoFetchUrl?.trim() || printLogoCandidate;
  if (logoSrc) {
    const raster = await fetchLogoEscPosRaster(
      logoSrc,
      KIOSK_TICKET_RECEIPT_WIDTH_DOTS
    );
    if (raster) {
      parts.push(ESC, 0x61, 0x01);
      appendGsV0Raster(parts, raster);
      parts.push(0x0a);
      parts.push(ESC, 0x61, 0x00);
      appendSelectWpc1251(parts);
    }
  }

  if (k.showHeader !== false && k.headerText?.trim()) {
    appendSelectWpc1251(parts);
    for (const raw of k.headerText.split('\n')) {
      const norm = normalizeReceiptTextLine(raw);
      for (const wl of wrapLine(norm, maxC)) {
        appendLine(parts, wl, 'center');
      }
    }
    appendLine(parts, '', 'left');
  }

  if (k.showUnitInHeader !== false && input.unitDisplayTitle.trim()) {
    appendLine(
      parts,
      normalizeReceiptTextLine(input.unitDisplayTitle.trim()),
      'center'
    );
    appendLine(parts, '', 'left');
  }

  appendLine(parts, normalizeReceiptTextLine(input.serviceLabel), 'center');

  const queueNum = String(input.ticket.queueNumber ?? '').trim();
  const queueRaster = renderQueueNumberRaster(
    queueNum,
    KIOSK_TICKET_RECEIPT_WIDTH_DOTS
  );
  if (queueRaster) {
    parts.push(ESC, 0x61, 0x01);
    appendGsV0Raster(parts, queueRaster);
    parts.push(0x0a);
    parts.push(ESC, 0x61, 0x00);
    appendSelectWpc1251(parts);
  } else {
    /**
     * Non-browser: no canvas. Use `GS !` 5×5 — larger than 4×4, still less blocky than 6×6 (`0x55`).
     * n = (w-1)*16 + (h-1) → 0x44 is 5×5.
     */
    appendSelectCharSize(parts, 0x44);
    appendLine(parts, queueNum || '—', 'center');
    appendSelectCharSize(parts, 0x00);
  }

  if (input.extraBodyLines && input.extraBodyLines.length > 0) {
    appendSelectWpc1251(parts);
    for (const line of input.extraBodyLines) {
      const t = String(line).trim();
      if (!t) {
        continue;
      }
      for (const wl of wrapLine(t, maxC)) {
        appendLine(parts, wl, 'center');
      }
    }
  }

  appendLine(parts, wrapToDashes(maxC), 'left');

  appendSelectWpc1251(parts);
  parts.push(ESC, 0x61, 0x01);
  try {
    appendQrModel2Url(parts, input.ticketPageUrl);
  } catch {
    appendLine(parts, '[QR]', 'center');
  }
  parts.push(ESC, 0x61, 0x00);

  if (k.showFooter !== false && k.footerText?.trim()) {
    appendSelectWpc1251(parts);
    for (const raw of k.footerText.split('\n')) {
      const norm = normalizeReceiptTextLine(raw);
      for (const wl of wrapLine(norm, maxC)) {
        appendLine(parts, wl, 'center');
      }
    }
  }

  const fb = k.feedbackUrl?.trim();
  if (fb) {
    appendSelectWpc1251(parts);
    const replaced = normalizeReceiptTextLine(
      fb.split('{{ticketId}}').join(input.ticket.id)
    );
    for (const wl of wrapLine(replaced, maxC)) {
      appendLine(parts, wl, 'left');
    }
  }

  parts.push(0x0a);
  appendPrintAndFeedLines(parts, 4);
  parts.push(0x0a);
  parts.push(GS, 0x56, 0x00);
  return new Uint8Array(parts);
}

/**
 * Full ticket receipt: logo, header/footer from kiosk config, service, large queue #,
 * centered QR (URL only inside QR, no printed link line), optional feedback URL.
 * On failure, falls back to a plain CP1251 text receipt.
 */
export async function buildKioskTicketEscPos(
  input: BuildKioskTicketEscPosInput
): Promise<Uint8Array> {
  try {
    return await buildRichTicketEscPos(input);
  } catch {
    return buildFallbackTicketEscPos(input);
  }
}
