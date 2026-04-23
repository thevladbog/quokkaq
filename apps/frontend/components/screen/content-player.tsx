'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState, type ReactNode } from 'react';

export type ContentSlide = {
  id: string;
  type: string;
  url: string;
  /** Seconds; 0 = use `defaultImageSeconds` for images, or full video length */
  durationSec: number;
};

interface ContentPlayerProps {
  slides: ContentSlide[];
  /** Fallback image duration when slide.durationSec is 0 */
  defaultImageSeconds: number;
  /** When true, show a compact tickets strip at the bottom (media-focus template) */
  overlayMode?: boolean;
  overlay?: ReactNode;
}

export function ContentPlayer({
  slides,
  defaultImageSeconds,
  overlayMode,
  overlay
}: ContentPlayerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const reduceMotion = useReducedMotion();
  const fadeDuration = reduceMotion ? 0 : 0.5;
  const fadeEase = [0.22, 1, 0.36, 1] as const;
  const safeIndex =
    slides.length === 0 ? 0 : Math.min(currentIndex, slides.length - 1);

  useEffect(() => {
    if (slides.length === 0) return;
    const current = slides[safeIndex];
    if (!current) return;
    if (current.type === 'image') {
      const sec =
        current.durationSec > 0 ? current.durationSec : defaultImageSeconds;
      const timer = setTimeout(
        () => {
          setCurrentIndex((prev) => (prev + 1) % slides.length);
        },
        Math.max(1, sec) * 1000
      );
      return () => clearTimeout(timer);
    }
    // If `onEnded` / completion never runs (e.g. broken or stuck video), do not block rotation forever.
    const cap = 10 * 60_000;
    const timer = setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % slides.length);
    }, cap);
    return () => clearTimeout(timer);
  }, [safeIndex, slides, defaultImageSeconds]);

  const handleVideoEnded = () => {
    if (slides.length === 0) return;
    setCurrentIndex((prev) => (prev + 1) % slides.length);
  };

  if (slides.length === 0) {
    return (
      <div className='bg-muted/20 flex h-full w-full items-center justify-center rounded-lg'>
        <p className='text-muted-foreground text-xl'>No content</p>
      </div>
    );
  }

  const current = slides[safeIndex];
  if (!current) {
    return null;
  }

  return (
    <div
      className={`relative flex h-full w-full items-center justify-center overflow-hidden rounded-lg bg-black/20 ${
        overlayMode ? 'pb-24' : ''
      }`}
    >
      <AnimatePresence initial={false} mode='sync'>
        <motion.div
          key={current.id}
          className='absolute inset-0 flex items-center justify-center'
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0 }}
          transition={{ duration: fadeDuration, ease: fadeEase }}
        >
          {current.type === 'image' ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={current.url}
              alt=''
              className='max-h-full max-w-full object-contain'
              draggable={false}
            />
          ) : (
            <video
              src={current.url}
              autoPlay
              muted
              playsInline
              onEnded={handleVideoEnded}
              onError={handleVideoEnded}
              className='max-h-full max-w-full object-contain'
            />
          )}
        </motion.div>
      </AnimatePresence>
      {overlayMode && overlay ? (
        <div className='absolute right-0 bottom-0 left-0 flex justify-center p-4'>
          {overlay}
        </div>
      ) : null}
    </div>
  );
}
