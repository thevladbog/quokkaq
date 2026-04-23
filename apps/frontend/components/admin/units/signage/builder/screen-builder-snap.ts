import { createSnapModifier, restrictToWindowEdges } from '@dnd-kit/modifiers';
import type { Modifier } from '@dnd-kit/core';

/** Aligned to canvas dotted background (16px) in the builder. */
const GRID = 16;

/**
 * Snaps the drag overlay to an 8px grid (reduces “floaty” drag feel).
 */
export const screenBuilderSnap = createSnapModifier(GRID);

export const GRID_PX = GRID;

/**
 * `restrictToWindowEdges` — keep the overlay inside the viewport.
 * `screenBuilderSnap` — 8px grid snap.
 */
export const screenBuilderDndModifiers: Modifier[] = [
  restrictToWindowEdges,
  screenBuilderSnap
];
