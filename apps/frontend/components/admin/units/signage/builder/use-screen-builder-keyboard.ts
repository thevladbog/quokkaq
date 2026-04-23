'use client';

import { useEffect } from 'react';
import { useScreenBuilderStore } from '@/lib/stores/screen-builder-store';

type Opts = {
  enabled: boolean;
  onSave: () => void;
  onDeleteWidget: (id: string | null) => void;
  onDuplicate: () => void;
  onNudge: (dx: number, dy: number) => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onSelectNone?: () => void;
};

/**
 * Keyboard: Cmd/Ctrl+S, Cmd+Z / Shift+Z (undo/redo), Delete, arrows (nudge), Cmd+D,
 * +/- zoom, Escape to clear selection
 */
export function useScreenBuilderKeyboard({
  enabled,
  onSave,
  onDeleteWidget,
  onDuplicate,
  onNudge,
  onZoomIn,
  onZoomOut,
  onSelectNone
}: Opts) {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === 'Escape') {
        if (
          t.isContentEditable ||
          t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA'
        ) {
          return;
        }
        e.preventDefault();
        onSelectNone?.();
        return;
      }
      if (e.key === '+' || e.key === '=') {
        if (
          t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.isContentEditable
        ) {
          return;
        }
        e.preventDefault();
        onZoomIn?.();
        return;
      }
      if (e.key === '-' || e.key === '_') {
        if (
          t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.isContentEditable
        ) {
          return;
        }
        e.preventDefault();
        onZoomOut?.();
        return;
      }
      const m = e.metaKey || e.ctrlKey;
      if (m && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        onSave();
        return;
      }
      if (m && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        const t = e.target as HTMLElement;
        if (
          t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.isContentEditable
        ) {
          return;
        }
        e.preventDefault();
        useScreenBuilderStore.getState().undo();
        return;
      }
      if (
        (m && e.key === 'z' && e.shiftKey) ||
        (m && (e.key === 'y' || e.key === 'Y'))
      ) {
        const t = e.target as HTMLElement;
        if (
          t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.isContentEditable
        ) {
          return;
        }
        e.preventDefault();
        useScreenBuilderStore.getState().redo();
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        const t = e.target as HTMLElement;
        if (
          t.isContentEditable ||
          t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT'
        ) {
          return;
        }
        e.preventDefault();
        onDeleteWidget(null);
        return;
      }
      if (m && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        onDuplicate();
        return;
      }
      if (e.key.startsWith('Arrow')) {
        const t = e.target as HTMLElement;
        if (
          t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT'
        ) {
          return;
        }
        e.preventDefault();
        const s = e.shiftKey ? 10 : 1;
        if (e.key === 'ArrowLeft') onNudge(-s, 0);
        if (e.key === 'ArrowRight') onNudge(s, 0);
        if (e.key === 'ArrowUp') onNudge(0, -s);
        if (e.key === 'ArrowDown') onNudge(0, s);
      }
    };
    window.addEventListener('keydown', h);
    return () => {
      window.removeEventListener('keydown', h);
    };
  }, [
    enabled,
    onSave,
    onDeleteWidget,
    onDuplicate,
    onNudge,
    onZoomIn,
    onZoomOut,
    onSelectNone
  ]);
}
