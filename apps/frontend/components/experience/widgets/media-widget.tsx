'use client';

import { ImageOff } from 'lucide-react';
import { useEffect, useState } from 'react';

export type ExperienceMediaConfig = {
  src: string;
  alt: string;
  fit: 'cover' | 'contain';
  fallback: string;
};

function safeMediaSource(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const source = value.trim();
  if (source.startsWith('/')) return source;
  try {
    const protocol = new URL(source).protocol;
    return protocol === 'https:' || protocol === 'http:' ? source : undefined;
  } catch {
    return undefined;
  }
}

export function parseExperienceMediaConfig(
  value: Record<string, unknown>
): ExperienceMediaConfig {
  const src = safeMediaSource(value.src);
  return {
    src: src ?? '',
    alt: typeof value.alt === 'string' ? value.alt.trim() : '',
    fit: value.fit === 'cover' ? 'cover' : 'contain',
    fallback:
      typeof value.fallback === 'string' && value.fallback.trim() !== ''
        ? value.fallback.trim()
        : 'Media unavailable'
  };
}

export function MediaWidget({
  config,
  title
}: {
  config: Record<string, unknown>;
  title?: string;
}) {
  const media = parseExperienceMediaConfig(config);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [media.src]);

  if (!media.src || failed) {
    return (
      <div
        data-testid='experience-media-fallback'
        role='img'
        aria-label={media.alt || title || media.fallback}
        className='bg-muted text-muted-foreground flex h-full min-h-24 w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border p-5 text-center'
      >
        <ImageOff className='size-8' aria-hidden />
        <span className='text-sm font-medium'>{media.fallback}</span>
      </div>
    );
  }

  return (
    <figure
      data-testid='experience-media-widget'
      className='relative h-full min-h-24 w-full overflow-hidden rounded-xl border bg-black/5'
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={media.src}
        alt={media.alt}
        onError={() => setFailed(true)}
        className={`h-full w-full ${media.fit === 'cover' ? 'object-cover' : 'object-contain'}`}
        draggable={false}
      />
      {title ? (
        <figcaption className='absolute right-0 bottom-0 left-0 bg-black/60 px-3 py-2 text-sm text-white'>
          {title}
        </figcaption>
      ) : null}
    </figure>
  );
}
