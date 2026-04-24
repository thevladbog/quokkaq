'use client';

import Image from 'next/image';
import { Play } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import type { HomeMessages } from '@/src/messages';

type Props = {
  item: HomeMessages['interfaceShowcase']['items'][number];
  walkthroughCopy: HomeMessages['interfaceWalkthrough'];
  videoEmbedSrc: string;
};

export function InterfaceWalkthroughTrigger({
  item,
  walkthroughCopy,
  videoEmbedSrc
}: Props) {
  const [open, setOpen] = useState(false);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const onClose = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = requestAnimationFrame(() => closeBtnRef.current?.focus());
    return () => {
      cancelAnimationFrame(t);
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  /** Keep Tab cycling inside the dialog (close + iframe). */
  useEffect(() => {
    if (!open || !panelRef.current) {
      return;
    }
    const panel = panelRef.current;
    const focusables = () =>
      Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), iframe[tabindex="0"], [data-walkthrough-focus-loop-end]'
        )
      );
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') {
        return;
      }
      const list = focusables();
      if (list.length < 2) {
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    panel.addEventListener('keydown', onKeyDown);
    return () => panel.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <>
      <div className='relative aspect-[16/10] overflow-hidden rounded-t-2xl border-b border-[color:var(--color-border)] bg-[color:var(--color-surface-elevated)]'>
        <Image
          src={item.image}
          alt={item.imageAlt}
          fill
          priority
          className='object-cover object-top transition duration-300 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100'
          sizes='(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 600px'
        />
        <div className='absolute inset-0 flex items-center justify-center bg-black/25 transition group-hover:bg-black/35'>
          <button
            type='button'
            className='focus-ring inline-flex items-center gap-2 rounded-full bg-white/95 px-5 py-2.5 text-sm font-semibold text-neutral-900 shadow-lg transition hover:bg-white'
            onClick={() => setOpen(true)}
            aria-haspopup='dialog'
            aria-expanded={open}
          >
            <Play
              className='h-4 w-4 fill-current text-[color:var(--color-primary)]'
              aria-hidden
            />
            {walkthroughCopy.playLabel}
          </button>
        </div>
      </div>

      {open ? (
        <div
          className='fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm'
          role='presentation'
          onClick={onClose}
        >
          <div
            ref={panelRef}
            role='dialog'
            aria-modal
            aria-labelledby={titleId}
            className='relative flex max-h-[min(90dvh,720px)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] shadow-2xl'
            onClick={(e) => e.stopPropagation()}
          >
            <div className='flex items-center justify-between border-b border-[color:var(--color-border)] px-4 py-3'>
              <h3
                id={titleId}
                className='text-base font-semibold text-[color:var(--color-text)]'
              >
                {walkthroughCopy.dialogTitle}
              </h3>
              <button
                ref={closeBtnRef}
                type='button'
                className='focus-ring rounded-lg px-3 py-1.5 text-sm font-medium text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-surface-elevated)]'
                onClick={onClose}
              >
                {walkthroughCopy.closeLabel}
              </button>
            </div>
            <div className='relative min-h-0 flex-1 bg-black'>
              <iframe
                tabIndex={0}
                src={videoEmbedSrc}
                title={walkthroughCopy.dialogTitle}
                className='aspect-video h-auto min-h-[12rem] w-full sm:min-h-[20rem]'
                allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen'
                allowFullScreen
              />
              {/* Tab from cross-origin iframe does not bubble here — sentinel returns focus to the dialog. */}
              <div
                tabIndex={0}
                data-walkthrough-focus-loop-end
                className='h-px w-px overflow-hidden opacity-0'
                aria-hidden
                onFocus={(e) => {
                  e.preventDefault();
                  closeBtnRef.current?.focus();
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
