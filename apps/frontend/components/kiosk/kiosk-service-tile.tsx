'use client';

import {
  createElement,
  useState,
  type CSSProperties,
  type KeyboardEvent
} from 'react';
import { ChevronRight, FileText, ImageOff, Ticket } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { useTranslations } from 'next-intl';
import { getLocalizedName, cn } from '@/lib/utils';
import type { Service } from '@/lib/api';
import { relativeLuminanceFromCssColor } from '@/lib/kiosk-wcag-contrast';
import { resolveKioskTileImageKind } from '@/lib/kiosk-tile-image';
import { resolveKioskServiceIcon } from '@/lib/kiosk-service-icon';

type KioskServiceTileProps = {
  service: Service;
  locale: string;
  onSelect: (service: Service) => void;
  /** Leaf = issues ticket / identification; branch = drill into sub-services. */
  tileKind?: 'leaf' | 'branch';
  /** High-contrast kiosk theme: adjust corner indicator contrast. */
  highContrast?: boolean;
  /**
   * True when the service grid canvas is dark (by design or forced a11y HC) — used for the default
   * tile fill (dark neutral vs warm cream) and for edges on light-appearing tiles.
   */
  onDarkServiceGrid?: boolean;
  /** Optional: e.g. speak service title when the tile is focused (keyboard a11y + TTS). */
  onA11yFocus?: (service: Service) => void;
  /** Leaf + identification document: short secondary line under the title. */
  showDocumentIdHint?: boolean;
};

const cardClassBaseFrame =
  'group @container/kiosk-tile relative flex h-full min-h-0 w-full cursor-pointer flex-col gap-0 overflow-hidden rounded-3xl border py-0 transition-[transform,box-shadow,filter] kiosk-tile-a11y';

const touchActiveLight =
  'active:scale-[0.96] active:brightness-[0.93] motion-reduce:active:scale-100 motion-reduce:active:brightness-100';

const touchActiveDark =
  'active:scale-[0.97] active:brightness-[1.1] motion-reduce:active:scale-100 motion-reduce:active:brightness-100';

/** Luminance below ~mid-gray: treat custom surface as dark (no `textColor`) tiles. */
const DARK_TILE_BG_LUMA = 0.45;

/** Filled via `--kiosk-tile-default-fill` in `globals.css` (warm default; `cool-light` overrides). */
const WARM_DEFAULT_TILE_FILL_FALLBACK = 'oklch(0.98 0.01 75)';
const defaultTileFill = `var(--kiosk-tile-default-fill, ${WARM_DEFAULT_TILE_FILL_FALLBACK})`;
const WARM_SHINE_LIGHT_FALLBACK =
  'linear-gradient(145deg, rgba(253,218,178,0.28) 0%, rgba(255,255,255,0.1) 42%, transparent 60%)';

/** Default fill on a dark service grid when the service has no `backgroundColor`. */
const defaultDarkGridTileFill = 'oklch(0.23 0.02 60)';

/**
 * @param visualDarkTile — custom dark `backgroundColor` OR the dark default fill on a dark grid
 * @param isLightTileOnDarkGrid — light-appearing tile (light custom) on a dark service canvas
 */
function cardFrameClasses(
  visualDarkTile: boolean,
  isLightTileOnDarkGrid: boolean,
  highContrast: boolean | undefined
) {
  if (highContrast) {
    if (visualDarkTile) {
      // Dark tile on dark grid: strong lip so #000 and near-black are visible against canvas.
      return 'border-2 border-white/35 shadow-[0_0_0_1px_rgba(255,255,255,0.12),0_20px_50px_-10px_rgba(0,0,0,0.72)] transition-[box-shadow,border-color] md:hover:border-white/45';
    }
    // Other HC surfaces (incl. light on dark) — one chrome style.
    return 'border border-white/30 ring-1 ring-inset ring-white/20 shadow-[0_1px_0_0_rgba(255,255,255,0.1)_inset,0_18px_44px_-12px_rgba(0,0,0,0.55)] transition-shadow md:hover:ring-inset md:hover:ring-white/28';
  }
  if (isLightTileOnDarkGrid) {
    return 'border border-white/20 ring-1 ring-inset ring-white/10 shadow-[0_14px_40px_-12px_rgba(0,0,0,0.55)] transition-shadow md:hover:border-white/28';
  }
  if (visualDarkTile) {
    return 'border border-white/18 shadow-[0_12px_40px_-10px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.06)] md:hover:shadow-[0_18px_44px_-8px_rgba(0,0,0,0.55)]';
  }
  return 'border border-kiosk-ink/[0.1] ring-1 ring-inset ring-black/[0.03] shadow-[0_20px_25px_-5px_rgba(29,27,25,0.1),0_8px_10px_-6px_rgba(29,27,25,0.07)] md:hover:shadow-[0_24px_32px_-8px_rgba(29,27,25,0.14),0_10px_14px_-8px_rgba(29,27,25,0.1)]';
}

/**
 * Resolves how we paint default (no `textColor`) text + glyph: dark custom fills need light ink.
 * When `textColor` is set, callers set `color` on the card so glyphs can use `currentColor`.
 * Uses background luminance only (not global high-contrast mode), so a light tile in a HC kiosk
 * does not get dark chrome by mistake.
 */
function isDarkCustomTileSurface(backgroundColor: string | undefined): boolean {
  if (!backgroundColor?.trim()) {
    return false;
  }
  const lum = relativeLuminanceFromCssColor(backgroundColor);
  return lum != null && lum < DARK_TILE_BG_LUMA;
}

function tileShineGradient(isDark: boolean) {
  return isDark
    ? 'linear-gradient(165deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 45%, rgba(0,0,0,0.2) 100%)'
    : `var(--kiosk-tile-shine-light, ${WARM_SHINE_LIGHT_FALLBACK})`;
}

function customFillShineGradient() {
  return 'linear-gradient(150deg, rgba(255,255,255,0.14) 0%, transparent 50%)';
}

/**
 * Lucide uses stroke=currentColor: match the tile title (custom `textColor`) or pick light/dark ink
 * for default typography on custom backgrounds.
 */
function kioskTileKindIconClass(
  textColor: string | undefined,
  backgroundColor: string | undefined,
  highContrast: boolean | undefined
): string {
  if (textColor?.trim()) {
    return 'text-current/60';
  }
  if (highContrast) {
    const effBg = backgroundColor?.trim() || defaultTileFill;
    const lumHc = relativeLuminanceFromCssColor(effBg);
    const isDark = lumHc != null && lumHc < DARK_TILE_BG_LUMA;
    return isDark ? 'text-zinc-100/90' : 'text-zinc-800/50';
  }
  if (backgroundColor?.trim()) {
    const lum = relativeLuminanceFromCssColor(backgroundColor);
    if (lum != null && lum < DARK_TILE_BG_LUMA) {
      // Was text-white/55: ticket/branch hint was too easy to miss on dark tiles.
      return 'text-zinc-100/90';
    }
    if (lum != null && lum >= DARK_TILE_BG_LUMA) {
      return 'text-kiosk-surface-ink/55';
    }
  }
  return 'text-kiosk-surface-ink/50';
}

function KioskTileKindIndicator({
  tileKind,
  highContrast,
  textColor,
  backgroundColor
}: {
  tileKind?: 'leaf' | 'branch';
  highContrast?: boolean;
  textColor?: string;
  backgroundColor?: string;
}) {
  if (!tileKind) {
    return null;
  }
  const tone = kioskTileKindIconClass(textColor, backgroundColor, highContrast);
  return (
    <span
      className={`pointer-events-none absolute right-2 bottom-2 z-20 flex items-center justify-center sm:right-3 sm:bottom-3 ${tone}`}
      aria-hidden
    >
      {tileKind === 'branch' ? (
        <ChevronRight className='size-7 shrink-0 sm:size-8' strokeWidth={2.4} />
      ) : (
        <Ticket className='size-6 shrink-0 sm:size-7' strokeWidth={2.4} />
      )}
    </span>
  );
}

const DOC_TICKET_ICON_SIZE = 'size-6 shrink-0 sm:size-7';
const docTicketStrokeW = 2.4 as const;

function KioskDocumentIdBottomBar({
  label,
  highContrast,
  textColor,
  backgroundColor
}: {
  label: string;
  highContrast?: boolean;
  textColor?: string;
  backgroundColor: string;
}) {
  const tone = kioskTileKindIconClass(textColor, backgroundColor, highContrast);
  return (
    <div
      className={cn(
        'pointer-events-none absolute bottom-2 left-2 z-20 flex min-h-0 max-w-[min(12rem,calc(100%-3.25rem))] items-center gap-1.5 sm:bottom-3 sm:left-3 sm:max-w-[min(14rem,calc(100%-3.5rem))]',
        tone
      )}
      role='note'
    >
      <FileText
        className={cn(DOC_TICKET_ICON_SIZE)}
        strokeWidth={docTicketStrokeW}
        aria-hidden
      />
      <span className='line-clamp-2 min-w-0 flex-1 text-left text-[0.65rem] leading-tight sm:text-xs'>
        {label}
      </span>
    </div>
  );
}

type TileImageProps = { imageUrl: string; title: string };

function firstGraphemeForLabel(title: string): string {
  const t = title.trim();
  if (!t) {
    return '';
  }
  return [...t][0] ?? t.charAt(0);
}

function KioskNoImageGlyph({
  service,
  title,
  useInheritedColor,
  isDarkNoFg
}: {
  service: Service;
  title: string;
  /** Parent sets `color` on the card to `textColor` — use currentColor for the badge. */
  useInheritedColor: boolean;
  isDarkNoFg: boolean;
}) {
  const key = service.iconKey?.trim();
  const letter = firstGraphemeForLabel(title).toUpperCase();
  const glyphSize =
    'mb-1.5 flex size-[3.5rem] shrink-0 items-center justify-center rounded-full @min-[12rem]/kiosk-tile:mb-0 @min-[12rem]/kiosk-tile:size-16 @min-[20rem]/kiosk-tile:size-[4.5rem] sm:size-16';

  const fromInherited =
    'bg-current/12 text-current ring-1 ring-current/22 shadow-[0_1px_0_0_rgba(255,255,255,0.12)]';
  const onLight =
    'bg-kiosk-surface-ink/10 text-kiosk-surface-ink ring-1 ring-kiosk-surface-border/50 shadow-[0_1px_0_0_rgba(255,255,255,0.4)]';
  // Brighter well + stronger edge so ticket/file glyphs read on dark default / dark custom tiles.
  const onDark =
    'bg-white/32 text-white ring-2 ring-white/45 shadow-[0_0_0_1px_rgba(255,255,255,0.12),inset_0_1px_0_0_rgba(255,255,255,0.28)]';
  const badge = useInheritedColor
    ? fromInherited
    : isDarkNoFg
      ? onDark
      : onLight;

  const iconStroke = isDarkNoFg ? 2.6 : useInheritedColor ? 2.25 : 2.25;
  const keyIconClass = cn(
    'shrink-0',
    'size-6 @min-[12rem]/kiosk-tile:size-7 @min-[20rem]/kiosk-tile:size-8 sm:size-7',
    isDarkNoFg
      ? 'text-white [stroke:currentColor] [paint-order:stroke_fill_markers] drop-shadow-[0_0.5px_1px_rgba(0,0,0,0.55)]'
      : useInheritedColor
        ? 'text-current [stroke:currentColor]'
        : 'text-kiosk-surface-ink [stroke:currentColor]'
  );

  if (key) {
    return (
      <div className={cn(glyphSize, badge)} aria-hidden>
        {createElement(resolveKioskServiceIcon(key), {
          className: keyIconClass,
          strokeWidth: iconStroke
        })}
      </div>
    );
  }
  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-full text-lg font-semibold sm:text-xl @min-[12rem]/kiosk-tile:text-2xl @min-[20rem]/kiosk-tile:text-3xl',
        glyphSize,
        badge
      )}
      aria-hidden
    >
      {letter || '•'}
    </div>
  );
}

function KioskServiceTileImage({ imageUrl, title }: TileImageProps) {
  const [imageFailed, setImageFailed] = useState(false);
  if (imageFailed) {
    return (
      <div
        className='text-muted-foreground flex h-full w-full flex-col items-center justify-center gap-1 px-2'
        aria-hidden
      >
        <ImageOff className='size-8 opacity-60' strokeWidth={1.5} />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageUrl}
      alt={title}
      className='pointer-events-none h-full w-full object-cover'
      onError={() => setImageFailed(true)}
    />
  );
}

export function KioskServiceTile({
  service,
  locale,
  onSelect,
  tileKind,
  highContrast,
  onDarkServiceGrid,
  onA11yFocus,
  showDocumentIdHint
}: KioskServiceTileProps) {
  const t = useTranslations('kiosk.service_tile');
  const title = getLocalizedName(
    service.name,
    service.nameRu || '',
    service.nameEn || '',
    locale
  );
  const description = service.description
    ? getLocalizedName(
        service.description,
        service.descriptionRu,
        service.descriptionEn,
        locale
      )
    : '';

  const bg = service.backgroundColor?.trim() || undefined;
  const fg = service.textColor?.trim() || undefined;

  const useDarkDefaultTile = Boolean(!bg && onDarkServiceGrid);
  const isCustomDarkSurface = isDarkCustomTileSurface(bg);
  const visualDarkTile = isCustomDarkSurface || useDarkDefaultTile;
  const isLightTileOnDarkGrid = Boolean(onDarkServiceGrid && !visualDarkTile);
  const displayTileFill = useDarkDefaultTile
    ? defaultDarkGridTileFill
    : defaultTileFill;
  const displayBg = bg || displayTileFill;
  const hasExplicitFg = Boolean(fg);
  const cardStyle: CSSProperties = {
    backgroundColor: bg ?? displayTileFill,
    ...(hasExplicitFg ? { color: fg } : {})
  };

  const gradientBackground = bg
    ? isCustomDarkSurface
      ? tileShineGradient(true)
      : customFillShineGradient()
    : tileShineGradient(Boolean(onDarkServiceGrid));

  const titleClass = [
    'kiosk-service-tile-title line-clamp-3 max-w-full font-bold tracking-tight wrap-break-word',
    !hasExplicitFg && (visualDarkTile ? 'text-white' : 'text-kiosk-surface-ink')
  ]
    .filter(Boolean)
    .join(' ');

  const descClass = [
    'kiosk-service-tile-desc line-clamp-2 max-w-full wrap-break-word',
    hasExplicitFg
      ? 'opacity-80'
      : visualDarkTile
        ? 'text-white/78'
        : 'text-kiosk-surface-ink-muted'
  ]
    .filter(Boolean)
    .join(' ');

  const trimmedImage = service.imageUrl?.trim() ?? '';
  const imageKind = resolveKioskTileImageKind(service.imageUrl);
  const isDarkForTouch = visualDarkTile;
  const cardClassBase = cn(
    cardClassBaseFrame,
    cardFrameClasses(visualDarkTile, isLightTileOnDarkGrid, highContrast),
    isDarkForTouch ? touchActiveDark : touchActiveLight
  );

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(service);
    }
  };

  if (!trimmedImage) {
    return (
      <Card
        className={cardClassBase}
        role='button'
        tabIndex={0}
        aria-label={title}
        onClick={() => onSelect(service)}
        onKeyDown={onKeyDown}
        onFocus={() => onA11yFocus?.(service)}
        style={cardStyle}
      >
        <div
          className='pointer-events-none absolute inset-0 rounded-3xl opacity-90'
          style={{ background: gradientBackground }}
        />
        <div
          className={cn(
            'relative z-10 flex h-full min-h-0 w-full min-w-0 flex-col items-center justify-center gap-0.5 overflow-hidden px-2.5 py-2 text-center sm:gap-1 sm:px-3 sm:py-2.5 md:px-4',
            '@min-[12rem]/kiosk-tile:flex-row @min-[12rem]/kiosk-tile:items-center @min-[12rem]/kiosk-tile:justify-center @min-[12rem]/kiosk-tile:gap-4 @min-[12rem]/kiosk-tile:px-4 @min-[16rem]/kiosk-tile:gap-5',
            tileKind || showDocumentIdHint
              ? 'pb-7 @min-[12rem]/kiosk-tile:pb-8'
              : ''
          )}
        >
          <KioskNoImageGlyph
            service={service}
            title={title}
            useInheritedColor={hasExplicitFg}
            isDarkNoFg={!hasExplicitFg && visualDarkTile}
          />
          <div className='flex w-full max-w-full min-w-0 flex-col items-center justify-center gap-0.5 text-center @min-[12rem]/kiosk-tile:max-w-[14.5rem] @min-[12rem]/kiosk-tile:shrink @min-[14rem]/kiosk-tile:max-w-[16rem] @min-[20rem]/kiosk-tile:max-w-[18.5rem]'>
            <p className={cn(titleClass, 'text-balance')}>{title}</p>
            {description ? <p className={descClass}>{description}</p> : null}
          </div>
        </div>
        {showDocumentIdHint ? (
          <KioskDocumentIdBottomBar
            label={t('document_id_hint', {
              defaultValue: 'Have a government-issued ID ready.'
            })}
            highContrast={highContrast}
            textColor={fg}
            backgroundColor={displayBg}
          />
        ) : null}
        <KioskTileKindIndicator
          tileKind={tileKind}
          highContrast={highContrast}
          textColor={fg}
          backgroundColor={displayBg}
        />
      </Card>
    );
  }

  return (
    <Card
      className={cardClassBase}
      role='button'
      tabIndex={0}
      aria-label={title}
      onClick={() => onSelect(service)}
      onKeyDown={onKeyDown}
      onFocus={() => onA11yFocus?.(service)}
      style={cardStyle}
    >
      <div className='flex h-full min-h-0 flex-1 flex-col gap-2 p-2 sm:p-2.5 md:gap-2.5 md:p-3 @min-[15rem]/kiosk-tile:flex-row @min-[15rem]/kiosk-tile:items-stretch @min-[15rem]/kiosk-tile:gap-3'>
        <div className='relative h-[42%] min-h-[4.5rem] w-full shrink-0 overflow-hidden rounded-2xl bg-neutral-200/35 @min-[15rem]/kiosk-tile:h-auto @min-[15rem]/kiosk-tile:min-h-0 @min-[15rem]/kiosk-tile:w-[42%] @min-[15rem]/kiosk-tile:self-stretch'>
          {imageKind === 'emoji' ? (
            <div
              className='flex h-full w-full items-center justify-center text-5xl leading-none select-none sm:text-6xl @min-[15rem]/kiosk-tile:text-5xl @min-[15rem]/kiosk-tile:sm:text-6xl'
              aria-hidden
            >
              {trimmedImage}
            </div>
          ) : (
            <KioskServiceTileImage
              key={`${service.id}-${service.imageUrl}`}
              imageUrl={trimmedImage}
              title={title}
            />
          )}
        </div>

        <div
          className='border-kiosk-border/25 relative flex min-h-0 min-w-0 flex-1 flex-col justify-center overflow-hidden rounded-2xl border-t pt-2 @min-[15rem]/kiosk-tile:border-t-0 @min-[15rem]/kiosk-tile:border-l @min-[15rem]/kiosk-tile:pt-0 @min-[15rem]/kiosk-tile:pl-3'
          style={{ backgroundColor: bg || displayTileFill }}
        >
          <div
            className='pointer-events-none absolute inset-0 rounded-2xl opacity-90'
            style={{ background: gradientBackground }}
          />
          <div className='relative z-10 flex min-h-0 flex-col items-center justify-center gap-0.5 px-2 py-1 text-center sm:gap-1 sm:px-3 sm:py-2 md:px-4'>
            <p className={titleClass}>{title}</p>
            {description ? <p className={descClass}>{description}</p> : null}
          </div>
        </div>
      </div>
      {showDocumentIdHint ? (
        <KioskDocumentIdBottomBar
          label={t('document_id_hint', {
            defaultValue: 'Have a government-issued ID ready.'
          })}
          highContrast={highContrast}
          textColor={fg}
          backgroundColor={displayBg}
        />
      ) : null}
      <KioskTileKindIndicator
        tileKind={tileKind}
        highContrast={highContrast}
        textColor={fg}
        backgroundColor={displayBg}
      />
    </Card>
  );
}
