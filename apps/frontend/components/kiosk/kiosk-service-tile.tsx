'use client';

import type { CSSProperties } from 'react';

import { Card } from '@/components/ui/card';
import { getLocalizedName } from '@/lib/utils';
import type { Service } from '@/lib/api';

type KioskServiceTileProps = {
  service: Service;
  locale: string;
  onSelect: (service: Service) => void;
};

const cardClassName =
  'group border-kiosk-border/25 @container/kiosk-tile relative flex h-full min-h-0 w-full cursor-pointer flex-col gap-0 overflow-hidden rounded-3xl border py-0 shadow-[0_20px_25px_-5px_rgba(29,27,25,0.08),0_8px_10px_-6px_rgba(29,27,25,0.06)] transition-[transform,box-shadow] active:scale-[0.99] md:hover:shadow-[0_24px_32px_-8px_rgba(29,27,25,0.12),0_10px_14px_-8px_rgba(29,27,25,0.08)]';

export function KioskServiceTile({
  service,
  locale,
  onSelect
}: KioskServiceTileProps) {
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

  const bg = service.backgroundColor || undefined;
  const fg = service.textColor || undefined;

  const cardStyle: CSSProperties = {
    backgroundColor: bg ?? 'oklch(0.98 0.01 75)',
    color: fg ?? undefined
  };

  const gradientBackground = bg
    ? 'linear-gradient(145deg, rgba(255,255,255,0.12) 0%, transparent 55%)'
    : 'linear-gradient(145deg, rgba(253,218,178,0.22) 0%, transparent 50%)';

  const titleClass = `line-clamp-3 max-w-full text-sm leading-tight font-bold tracking-tight wrap-break-word sm:text-base md:text-lg lg:text-xl ${fg ? '' : 'text-kiosk-ink'}`;
  const descClass = `line-clamp-2 max-w-full text-[11px] leading-snug wrap-break-word sm:text-xs ${fg ? 'opacity-75' : 'text-neutral-500'}`;

  if (!service.imageUrl) {
    return (
      <Card
        className={cardClassName}
        onClick={() => onSelect(service)}
        style={cardStyle}
      >
        <div
          className='pointer-events-none absolute inset-0 rounded-3xl opacity-90'
          style={{ background: gradientBackground }}
        />
        <div className='relative z-10 flex h-full min-h-0 w-full flex-col items-center justify-center gap-0.5 overflow-hidden px-2 py-1.5 text-center sm:gap-1 sm:px-3 sm:py-2 md:px-4 md:py-3'>
          <p className={titleClass} style={fg ? { color: fg } : undefined}>
            {title}
          </p>
          {description ? <p className={descClass}>{description}</p> : null}
        </div>
      </Card>
    );
  }

  return (
    <Card
      className={cardClassName}
      onClick={() => onSelect(service)}
      style={cardStyle}
    >
      <div className='flex h-full min-h-0 flex-1 flex-col gap-2 p-2 sm:p-2.5 md:gap-2.5 md:p-3 @min-[15rem]/kiosk-tile:flex-row @min-[15rem]/kiosk-tile:items-stretch @min-[15rem]/kiosk-tile:gap-3'>
        <div className='relative h-[42%] min-h-[4.5rem] w-full shrink-0 overflow-hidden rounded-2xl bg-neutral-200/35 @min-[15rem]/kiosk-tile:h-auto @min-[15rem]/kiosk-tile:min-h-0 @min-[15rem]/kiosk-tile:w-[42%] @min-[15rem]/kiosk-tile:self-stretch'>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={service.imageUrl}
            alt={title}
            className='pointer-events-none h-full w-full object-cover'
          />
        </div>

        <div
          className='border-kiosk-border/25 relative flex min-h-0 min-w-0 flex-1 flex-col justify-center overflow-hidden rounded-2xl border-t pt-2 @min-[15rem]/kiosk-tile:border-t-0 @min-[15rem]/kiosk-tile:border-l @min-[15rem]/kiosk-tile:pt-0 @min-[15rem]/kiosk-tile:pl-3'
          style={{ backgroundColor: bg ?? undefined }}
        >
          <div
            className='pointer-events-none absolute inset-0 rounded-2xl opacity-90'
            style={{ background: gradientBackground }}
          />
          <div className='relative z-10 flex min-h-0 flex-col items-center justify-center gap-0.5 px-2 py-1 text-center sm:gap-1 sm:px-3 sm:py-2 md:px-4'>
            <p className={titleClass} style={fg ? { color: fg } : undefined}>
              {title}
            </p>
            {description ? <p className={descClass}>{description}</p> : null}
          </div>
        </div>
      </div>
    </Card>
  );
}
