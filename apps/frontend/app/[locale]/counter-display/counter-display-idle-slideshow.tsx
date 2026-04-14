'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { GuestSurveyIdleScreen } from '@quokkaq/shared-types';
import { GuestSurveyCompletionMarkdown } from '@/components/guest-survey/guest-survey-completion-markdown';
import { pickCompletionMarkdown } from '@/lib/guest-survey-completion';

function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const fn = () => setReduce(mq.matches);
    fn();
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return reduce;
}

function idleMediaFetchPath(apiRelativeUrl: string): string | null {
  const u = apiRelativeUrl.trim();
  if (!u.startsWith('/api/')) return null;
  return u.slice('/api'.length);
}

function IdleSlideContent({
  slide,
  bearerToken,
  locale,
  reduceMotion,
  onVideoEnded,
  videoLoop
}: {
  slide: GuestSurveyIdleScreen['slides'][number];
  bearerToken: string;
  locale: string;
  reduceMotion: boolean;
  onVideoEnded: () => void;
  /** Единственный слайд — видео крутится по кругу без остановки. */
  videoLoop: boolean;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isVideo, setIsVideo] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- load authenticated blob URL for slide */
  useEffect(() => {
    if (slide.type !== 'image' && slide.type !== 'video') {
      setBlobUrl(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    const path = idleMediaFetchPath(slide.url);
    if (!path) {
      setBlobUrl(null);
      return () => {};
    }
    setMediaReady(false);
    (async () => {
      try {
        const res = await fetch(`/api${path}`, {
          headers: { Authorization: `Bearer ${bearerToken}` }
        });
        if (!res.ok || cancelled) return;
        const ct = res.headers.get('content-type') ?? '';
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setIsVideo(ct.startsWith('video/'));
        setBlobUrl(objectUrl);
      } catch {
        if (!cancelled) setBlobUrl(null);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [slide, bearerToken]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const transitionMs = reduceMotion ? 0 : 280;
  const wrapStyle: CSSProperties = {
    transitionProperty: 'opacity, transform',
    transitionDuration: `${transitionMs}ms`,
    transitionTimingFunction: 'ease-out',
    opacity: 1,
    transform: reduceMotion ? undefined : 'translateY(0)'
  };

  if (slide.type === 'text') {
    const md =
      pickCompletionMarkdown(slide.markdown, locale) ??
      pickCompletionMarkdown(slide.markdown, 'en');
    if (!md) {
      return (
        <div
          className='text-muted-foreground text-center text-xl'
          style={wrapStyle}
        >
          …
        </div>
      );
    }
    return (
      <div
        className='text-foreground [&_a]:text-primary mx-auto flex max-h-full w-full max-w-3xl flex-col items-center justify-center overflow-auto px-2 text-center [&_h1]:mb-4 [&_h1]:text-3xl [&_h1]:font-semibold md:[&_h1]:text-4xl [&_h2]:mb-3 [&_h2]:text-2xl [&_h2]:font-semibold [&_img]:mx-auto [&_img]:max-h-[50dvh] [&_img]:object-contain [&_ol]:mx-auto [&_ol]:inline-block [&_ol]:max-w-xl [&_ol]:text-left [&_p]:text-lg [&_p]:leading-relaxed md:[&_p]:text-xl [&_ul]:mx-auto [&_ul]:inline-block [&_ul]:max-w-xl [&_ul]:text-left'
        style={wrapStyle}
      >
        <GuestSurveyCompletionMarkdown
          markdown={md}
          imageBearerToken={bearerToken}
        />
      </div>
    );
  }

  if (!blobUrl) {
    return (
      <div
        className='bg-muted/30 h-[min(50dvh,calc(100dvh-6rem))] w-full animate-pulse rounded-none md:rounded-lg'
        style={wrapStyle}
      />
    );
  }

  const mediaClassName =
    'h-auto w-full max-h-[min(88dvh,calc(100dvh-5.5rem))] object-contain';

  const mediaReveal: CSSProperties = {
    opacity: mediaReady ? 1 : 0,
    transitionProperty: 'opacity',
    transitionDuration: reduceMotion ? '0ms' : '220ms',
    transitionTimingFunction: 'ease-out'
  };

  if (isVideo) {
    return (
      <video
        src={blobUrl}
        className={mediaClassName}
        style={{ ...wrapStyle, ...mediaReveal }}
        muted
        playsInline
        autoPlay
        loop={videoLoop}
        onEnded={videoLoop ? undefined : onVideoEnded}
        onLoadedData={() => setMediaReady(true)}
        onError={() => setMediaReady(true)}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- private blob URL from API
    <img
      src={blobUrl}
      alt=''
      className={mediaClassName}
      style={{ ...wrapStyle, ...mediaReveal }}
      onLoad={() => setMediaReady(true)}
      onError={() => setMediaReady(true)}
    />
  );
}

export function CounterDisplayIdleSlideshow({
  idle,
  bearerToken,
  locale
}: {
  idle: GuestSurveyIdleScreen;
  bearerToken: string;
  locale: string;
}) {
  const reduceMotion = usePrefersReducedMotion();
  const slides = idle.slides;
  const n = slides.length;
  const [index, setIndex] = useState(0);

  /* eslint-disable react-hooks/set-state-in-effect -- reset carousel when idle config changes */
  useEffect(() => {
    setIndex(0);
  }, [idle]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const goNext = useCallback(() => {
    if (n <= 1) return;
    setIndex((i) => (i + 1) % n);
  }, [n]);

  const safeIndex = n === 0 ? 0 : index % n;
  const current = n > 0 ? slides[safeIndex] : undefined;
  const intervalSec = idle.slideIntervalSec;

  useEffect(() => {
    if (!current || n <= 1) return;
    if (current.type === 'video') return;
    const ms = Math.max(1, intervalSec) * 1000;
    const t = window.setTimeout(goNext, ms);
    return () => window.clearTimeout(t);
  }, [n, current, intervalSec, goNext, safeIndex]);

  if (!current || n === 0) {
    return null;
  }

  const singleVideoLoop = n === 1 && current.type === 'video';

  const slideMotionKey =
    current.type === 'text'
      ? `t-${safeIndex}`
      : current.type === 'image'
        ? `i-${safeIndex}-${current.url}`
        : `v-${safeIndex}-${current.url}`;

  const fadeDuration = reduceMotion ? 0.05 : 0.34;
  const fadeEase: [number, number, number, number] = [0.22, 1, 0.36, 1];

  return (
    <div className='relative flex min-h-0 w-full flex-1 flex-col items-center justify-center px-0'>
      <AnimatePresence mode='sync' initial={false}>
        <motion.div
          key={slideMotionKey}
          className='absolute inset-0 flex min-h-0 flex-col items-center justify-center overflow-hidden'
          initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -5 }}
          transition={{
            duration: fadeDuration,
            ease: fadeEase
          }}
        >
          <IdleSlideContent
            slide={current}
            bearerToken={bearerToken}
            locale={locale}
            reduceMotion={reduceMotion}
            onVideoEnded={goNext}
            videoLoop={singleVideoLoop}
          />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
