'use client';

import { useEffect } from 'react';

const CLASS = 'doc-scroll-active';
const HIDE_MS = 1400;

/**
 * Показывает стилизованный ползунок (см. globals.css) на время и сразу после прокрутки.
 * Если страница без вертикального переполнения, скроллбара нет — ничего не «торчит».
 */
export function DocumentScrollHint() {
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    let hideTimer: number | undefined;

    const setActive = (active: boolean) => {
      root.classList.toggle(CLASS, active);
      body.classList.toggle(CLASS, active);
    };

    const show = () => {
      setActive(true);
      if (hideTimer !== undefined) window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => {
        setActive(false);
      }, HIDE_MS);
    };

    const onScroll = () => {
      show();
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    if (window.scrollY > 0) {
      show();
    }
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (hideTimer !== undefined) window.clearTimeout(hideTimer);
      setActive(false);
    };
  }, []);

  return null;
}
