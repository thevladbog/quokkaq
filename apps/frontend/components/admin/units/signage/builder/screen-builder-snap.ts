import { createSnapModifier, restrictToWindowEdges } from '@dnd-kit/modifiers';
import type { Modifier } from '@dnd-kit/core';

/** Aligned to canvas dotted background (16px) in the builder. */
const GRID = 16;

/**
 * Snaps the drag overlay to a 16px grid (reduces “floaty” drag feel).
 */
export const screenBuilderSnap = createSnapModifier(GRID);

export const GRID_PX = GRID;

/**
 * `restrictToWindowEdges` — keep the overlay inside the viewport.
 * `screenBuilderSnap` — 16px grid snap.
 */
export const screenBuilderDndModifiers: Modifier[] = [
  restrictToWindowEdges,
  screenBuilderSnap
];
