import {
  BarcodeFormat,
  BinaryBitmap,
  ChecksumException,
  DecodeHintType,
  GlobalHistogramBinarizer,
  HTMLCanvasElementLuminanceSource,
  HybridBinarizer,
  InvertedLuminanceSource,
  LuminanceSource,
  MultiFormatReader,
  NotFoundException,
  PDF417Reader
} from '@zxing/library';

const FORMATS: BarcodeFormat[] = [
  BarcodeFormat.PDF_417,
  BarcodeFormat.QR_CODE,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.AZTEC,
  BarcodeFormat.DATA_MATRIX
];

const MAX_LONG_EDGE = 2560;
/** At most this many “heavy” decodes in one scan (keeps the tab responsive). */
const MAX_DECODES_PER_RUN = 96;

function isDecodeNoise(e: unknown): boolean {
  return (
    e instanceof NotFoundException ||
    e instanceof ChecksumException ||
    (e as Error)?.name === 'NotFoundException' ||
    (e as Error)?.name === 'ChecksumException' ||
    (e as Error)?.name === 'FormatException'
  );
}

function toText(
  r: { getText: () => string } | null | undefined
): string | null {
  if (!r) {
    return null;
  }
  const s = (r.getText() ?? '').trim();
  return s || null;
}

let decodeBudget = 0;

function resetDecodeBudget() {
  decodeBudget = 0;
}

/**
 * Yields to the main thread so the browser can process Close / tab clicks
 * and paint the “busy” state.
 */
function yieldToMain() {
  return new Promise<void>((r) => {
    requestAnimationFrame(() => {
      setTimeout(r, 0);
    });
  });
}

/**
 * High-res video frames (4K) would melt CPU/RAM. Downscale for decode only.
 */
function capLongEdge(
  source: HTMLCanvasElement,
  maxLong = MAX_LONG_EDGE
): HTMLCanvasElement {
  const w = source.width;
  const h = source.height;
  if (w < 2 || h < 2) {
    return source;
  }
  const long = Math.max(w, h);
  if (long <= maxLong) {
    return source;
  }
  const s = maxLong / long;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * s));
  c.height = Math.max(1, Math.round(h * s));
  const ctx = c.getContext('2d');
  if (!ctx) {
    return source;
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, 0, 0, c.width, c.height);
  return c;
}

/** 90° CW: helps when a horizontal PDF417/strip is vertical in the image. */
function rotate90Cw(source: HTMLCanvasElement): HTMLCanvasElement {
  const w = source.width;
  const h = source.height;
  if (w < 2 || h < 2) {
    return source;
  }
  const c = document.createElement('canvas');
  c.width = h;
  c.height = w;
  const ctx = c.getContext('2d');
  if (!ctx) {
    return source;
  }
  ctx.imageSmoothingEnabled = false;
  ctx.translate(c.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(source, 0, 0);
  return c;
}

function* luminanceChain(
  canvas: HTMLCanvasElement
): Generator<LuminanceSource> {
  yield new HTMLCanvasElementLuminanceSource(canvas, false);
  yield new InvertedLuminanceSource(
    new HTMLCanvasElementLuminanceSource(canvas, false)
  );
}

/**
 * Single read path, minimal formats for speed and stability.
 */
function decodeOnce(lum: LuminanceSource, useGlobal: boolean): string | null {
  if (decodeBudget >= MAX_DECODES_PER_RUN) {
    return null;
  }
  const B = useGlobal ? GlobalHistogramBinarizer : HybridBinarizer;
  const withFormats = new Map<DecodeHintType, unknown>([
    [DecodeHintType.TRY_HARDER, true],
    [DecodeHintType.POSSIBLE_FORMATS, FORMATS]
  ]);
  const anyFormat = new Map<DecodeHintType, unknown>([
    [DecodeHintType.TRY_HARDER, true]
  ]);

  try {
    const pdf = new PDF417Reader();
    decodeBudget += 1;
    const t = toText(
      pdf.decode(
        new BinaryBitmap(new B(lum)),
        new Map<DecodeHintType, unknown>([[DecodeHintType.TRY_HARDER, true]])
      )
    );
    if (t) {
      return t;
    }
  } catch (e) {
    if (!isDecodeNoise(e)) {
      void 0;
    }
  }

  try {
    const m = new MultiFormatReader();
    m.setHints(withFormats);
    decodeBudget += 1;
    const t = toText(
      m.decode(
        new BinaryBitmap(
          new (useGlobal ? GlobalHistogramBinarizer : HybridBinarizer)(lum)
        ),
        withFormats
      )
    );
    if (t) {
      return t;
    }
  } catch (e) {
    if (!isDecodeNoise(e)) {
      void 0;
    }
  }

  if (decodeBudget < MAX_DECODES_PER_RUN) {
    try {
      const m2 = new MultiFormatReader();
      m2.setHints(anyFormat);
      decodeBudget += 1;
      const t = toText(m2.decode(new BinaryBitmap(new B(lum)), anyFormat));
      if (t) {
        return t;
      }
    } catch (e) {
      if (!isDecodeNoise(e)) {
        void 0;
      }
    }
  }

  return null;
}

function runAllDecodesOnCanvasSync(canvas: HTMLCanvasElement): string | null {
  for (const lum of luminanceChain(canvas)) {
    for (const useGlobal of [false, true] as const) {
      if (decodeBudget >= MAX_DECODES_PER_RUN) {
        return null;
      }
      const t = decodeOnce(lum, useGlobal);
      if (t) {
        return t;
      }
    }
  }
  return null;
}

function centerSquareFraction(
  source: HTMLCanvasElement,
  fraction: number
): HTMLCanvasElement {
  const w = source.width;
  const h = source.height;
  if (w < 8 || h < 8) {
    return source;
  }
  const f = Math.min(1, Math.max(0.2, fraction));
  const side = Math.max(1, Math.round(Math.min(w, h) * f));
  const x0 = Math.floor((w - side) / 2);
  const y0 = Math.floor((h - side) / 2);
  const c = document.createElement('canvas');
  c.width = side;
  c.height = side;
  const ctx = c.getContext('2d');
  if (!ctx) {
    return source;
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, x0, y0, side, side, 0, 0, side, side);
  return c;
}

function centerHorizontalBand(
  source: HTMLCanvasElement,
  yFracStart: number,
  yFracEnd: number
): HTMLCanvasElement {
  const h = source.height;
  const y0 = Math.max(0, Math.floor(h * yFracStart));
  const y1 = Math.min(h, Math.ceil(h * yFracEnd));
  const ch = Math.max(1, y1 - y0);
  if (ch >= h * 0.95) {
    return source;
  }
  const c = document.createElement('canvas');
  c.width = source.width;
  c.height = ch;
  const ctx = c.getContext('2d');
  if (!ctx) {
    return source;
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, 0, y0, source.width, ch, 0, 0, source.width, ch);
  return c;
}

function scaleCanvas(
  source: HTMLCanvasElement,
  scale: number
): HTMLCanvasElement {
  if (scale <= 1.0001) {
    return source;
  }
  const out = scaleCanvasImpl(source, scale);
  const long = Math.max(out.width, out.height);
  if (long > MAX_LONG_EDGE) {
    return capLongEdge(out, MAX_LONG_EDGE);
  }
  return out;
}

function scaleCanvasImpl(
  source: HTMLCanvasElement,
  scale: number
): HTMLCanvasElement {
  if (scale <= 1.0001) {
    return source;
  }
  const c = document.createElement('canvas');
  c.width = Math.round(source.width * scale);
  c.height = Math.round(source.height * scale);
  const ctx = c.getContext('2d');
  if (!ctx) {
    return source;
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, 0, 0, c.width, c.height);
  return c;
}

/**
 * PDF417 on RU ID cards is a full-width strip — crop squares first (QR) would miss it, so
 * we run full frame + many horizontal bands + optional rotation before tight QR crops.
 * @yields
 */
function buildVariantCanvases(source: HTMLCanvasElement): HTMLCanvasElement[] {
  const list: HTMLCanvasElement[] = [];
  const w = source.width;
  const h = source.height;
  const seen = new Set<string>();
  const add = (c: HTMLCanvasElement, id: string) => {
    const k = `${id}:${c.width}x${c.height}`;
    if (!seen.has(k)) {
      seen.add(k);
      list.push(c);
    }
  };
  const base = (id: string, c: HTMLCanvasElement) => {
    add(capLongEdge(c, MAX_LONG_EDGE), id);
  };
  add(source, 'full');
  if (h > w * 1.1) {
    const r = capLongEdge(rotate90Cw(source), MAX_LONG_EDGE);
    if (r !== source) {
      add(r, 'rot90');
    }
  }
  if (h > 320) {
    for (const [a, b] of [
      [0.05, 0.42] as [number, number],
      [0.12, 0.48] as [number, number],
      [0.18, 0.55] as [number, number],
      [0.25, 0.62] as [number, number],
      [0.32, 0.7] as [number, number],
      [0.4, 0.78] as [number, number],
      [0.48, 0.9] as [number, number],
      [0.15, 0.92] as [number, number]
    ] as [number, number][]) {
      const band = centerHorizontalBand(source, a, b);
      if (band !== source) {
        base(`h${a}-${b}`, band);
      }
    }
  }
  if (w < 2000) {
    const s = Math.min(2.5, MAX_LONG_EDGE / Math.max(w, 1));
    if (s > 1.05) {
      const up = capLongEdge(scaleCanvas(source, s), MAX_LONG_EDGE);
      if (up !== source) {
        add(up, 'up');
      }
    }
  }
  for (const frac of [0.9, 0.65, 0.5] as const) {
    base(
      `sq${frac}`,
      capLongEdge(centerSquareFraction(source, frac), MAX_LONG_EDGE)
    );
  }
  return list.slice(0, 16);
}

/**
 * @returns first decoded string (trimmed) or null.
 * Always **await** this: it yields to the main thread so the UI can stay interactive.
 */
export async function tryDecodeBarcodeStringFromCanvasAsync(
  canvas: HTMLCanvasElement
): Promise<string | null> {
  resetDecodeBudget();
  const capped = capLongEdge(canvas, MAX_LONG_EDGE);
  const variants = buildVariantCanvases(capped);
  for (const variant of variants) {
    await yieldToMain();
    const t = runAllDecodesOnCanvasSync(variant);
    if (t) {
      return t;
    }
  }
  return null;
}
