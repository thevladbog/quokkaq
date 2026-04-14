/**
 * Guest survey question blocks stored on SurveyDefinition.questions.
 * - Legacy: JSON array of blocks → single-page counter layout.
 * - Wrapped: { displayMode, blocks } → optional stepped (one block per screen).
 * - scale: rating buttons (numeric range or fixed 1–5 icons)
 * - info: read-only hint text (no answer)
 */

export type GuestSurveyDisplayMode = 'single_page' | 'stepped';

export type GuestSurveyScalePresentation = 'numeric' | 'icons';

export type GuestSurveyIconPreset = 'stars_gold' | 'hearts_red';

export type GuestSurveyBlockDraft =
  | {
      kind: 'scale';
      id: string;
      labelEn: string;
      labelRu: string;
      min: number;
      max: number;
      presentation: GuestSurveyScalePresentation;
      iconPreset?: GuestSurveyIconPreset;
    }
  | {
      kind: 'info';
      id: string;
      labelEn: string;
      labelRu: string;
    };

export type GuestSurveyDisplayBlock =
  | {
      kind: 'scale';
      id: string;
      min: number;
      max: number;
      presentation?: GuestSurveyScalePresentation;
      iconPreset?: GuestSurveyIconPreset;
      label?: Record<string, string>;
    }
  | {
      kind: 'info';
      id: string;
      label?: Record<string, string>;
    };

export type ValidateDraftsErrorCode =
  | 'empty_blocks'
  | 'block_id_required'
  | 'duplicate_id'
  | 'scale_label_required'
  | 'info_label_required'
  | 'scale_range'
  | 'scale_icon_preset_required'
  | 'scale_presentation_invalid';

const ICON_PRESETS: readonly GuestSurveyIconPreset[] = [
  'stars_gold',
  'hearts_red'
];

export function isGuestSurveyIconPreset(
  v: unknown
): v is GuestSurveyIconPreset {
  return (
    typeof v === 'string' && (ICON_PRESETS as readonly string[]).includes(v)
  );
}

/** Scale block uses icon row (1–5); answers are still stored as numbers. */
export function isGuestSurveyIconScale(
  b: GuestSurveyDisplayBlock
): b is Extract<GuestSurveyDisplayBlock, { kind: 'scale' }> & {
  presentation: 'icons';
  iconPreset: GuestSurveyIconPreset;
} {
  return (
    b.kind === 'scale' &&
    b.presentation === 'icons' &&
    isGuestSurveyIconPreset(b.iconPreset)
  );
}

export function newGuestSurveyBlockId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 10);
  }
  return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultGuestSurveyDrafts(): GuestSurveyBlockDraft[] {
  return [
    {
      kind: 'scale',
      id: 'overall',
      labelEn: 'How would you rate this visit?',
      labelRu: 'Как вы оцениваете визит?',
      min: 1,
      max: 5,
      presentation: 'numeric'
    }
  ];
}

function readLabel(obj: Record<string, unknown>): { en: string; ru: string } {
  const label = obj.label;
  if (!label || typeof label !== 'object' || label === null) {
    return { en: '', ru: '' };
  }
  const l = label as Record<string, unknown>;
  return {
    en: typeof l.en === 'string' ? l.en : '',
    ru: typeof l.ru === 'string' ? l.ru : ''
  };
}

function readPresentation(
  o: Record<string, unknown>
): GuestSurveyScalePresentation {
  const p = o.presentation;
  if (p === 'icons') return 'icons';
  return 'numeric';
}

function readIconPreset(
  o: Record<string, unknown>
): GuestSurveyIconPreset | undefined {
  const raw = o.iconPreset;
  if (isGuestSurveyIconPreset(raw)) return raw;
  return undefined;
}

/** Normalize DB `questions` JSON: legacy array or wrapped `{ displayMode, blocks }`. */
export function unwrapGuestSurveyQuestionsJson(raw: unknown): {
  displayMode: GuestSurveyDisplayMode;
  blocksArray: unknown[];
} {
  if (Array.isArray(raw)) {
    return { displayMode: 'single_page', blocksArray: raw };
  }
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.blocks)) {
      const displayMode: GuestSurveyDisplayMode =
        o.displayMode === 'stepped' ? 'stepped' : 'single_page';
      return { displayMode, blocksArray: o.blocks };
    }
  }
  return { displayMode: 'single_page', blocksArray: [] };
}

function parseBlockItemsToDrafts(
  blocksArray: unknown[]
): GuestSurveyBlockDraft[] {
  const drafts: GuestSurveyBlockDraft[] = [];
  for (const item of blocksArray) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    if (typeof o.id !== 'string' || o.id.trim() === '') continue;
    const { en, ru } = readLabel(o);
    if (o.type === 'info') {
      drafts.push({
        kind: 'info',
        id: o.id.trim(),
        labelEn: en,
        labelRu: ru
      });
      continue;
    }
    if (o.type === 'scale') {
      const presentation = readPresentation(o);
      let min =
        typeof o.min === 'number' && Number.isFinite(o.min)
          ? Math.round(o.min)
          : 1;
      let max =
        typeof o.max === 'number' && Number.isFinite(o.max)
          ? Math.round(o.max)
          : 5;
      if (presentation === 'icons') {
        min = 1;
        max = 5;
      }
      let iconPreset = readIconPreset(o);
      if (presentation === 'icons' && iconPreset === undefined) {
        iconPreset = 'stars_gold';
      }
      drafts.push({
        kind: 'scale',
        id: o.id.trim(),
        labelEn: en,
        labelRu: ru,
        min,
        max,
        presentation,
        ...(presentation === 'icons' ? { iconPreset } : {})
      });
    }
  }
  return drafts;
}

function draftsToDisplayBlocks(
  drafts: GuestSurveyBlockDraft[]
): GuestSurveyDisplayBlock[] {
  const out: GuestSurveyDisplayBlock[] = [];
  for (const d of drafts) {
    const label: Record<string, string> = {};
    if (d.labelEn.trim()) label.en = d.labelEn.trim();
    if (d.labelRu.trim()) label.ru = d.labelRu.trim();
    if (d.kind === 'info') {
      out.push({ kind: 'info', id: d.id, label });
    } else {
      const base: Extract<GuestSurveyDisplayBlock, { kind: 'scale' }> = {
        kind: 'scale',
        id: d.id,
        min: d.min,
        max: d.max,
        label
      };
      if (d.presentation === 'icons' && d.iconPreset) {
        base.presentation = 'icons';
        base.iconPreset = d.iconPreset;
      } else {
        base.presentation = 'numeric';
      }
      out.push(base);
    }
  }
  return out;
}

export function parseDraftsFromQuestionsJson(raw: unknown): {
  drafts: GuestSurveyBlockDraft[];
  displayMode: GuestSurveyDisplayMode;
} {
  const { displayMode, blocksArray } = unwrapGuestSurveyQuestionsJson(raw);
  return {
    drafts: parseBlockItemsToDrafts(blocksArray),
    displayMode
  };
}

export function parseGuestSurveyForDisplay(raw: unknown): {
  displayMode: GuestSurveyDisplayMode;
  blocks: GuestSurveyDisplayBlock[];
} {
  const { displayMode, blocksArray } = unwrapGuestSurveyQuestionsJson(raw);
  const drafts = parseBlockItemsToDrafts(blocksArray);
  return { displayMode, blocks: draftsToDisplayBlocks(drafts) };
}

export function parseOrderedBlocksForDisplay(
  raw: unknown
): GuestSurveyDisplayBlock[] {
  return parseGuestSurveyForDisplay(raw).blocks;
}

export function draftsToQuestionsPayload(
  drafts: GuestSurveyBlockDraft[],
  displayMode: GuestSurveyDisplayMode = 'single_page'
): unknown {
  const blocks = drafts.map((d) => {
    const label: Record<string, string> = {};
    if (d.labelEn.trim()) label.en = d.labelEn.trim();
    if (d.labelRu.trim()) label.ru = d.labelRu.trim();
    if (d.kind === 'info') {
      return { id: d.id, type: 'info', label };
    }
    if (d.presentation === 'icons') {
      return {
        id: d.id,
        type: 'scale',
        min: 1,
        max: 5,
        presentation: 'icons',
        iconPreset: d.iconPreset,
        label
      };
    }
    return {
      id: d.id,
      type: 'scale',
      min: d.min,
      max: d.max,
      label
    };
  });
  if (displayMode === 'stepped') {
    return { displayMode: 'stepped', blocks };
  }
  return blocks;
}

export function validateDrafts(
  drafts: GuestSurveyBlockDraft[]
): ValidateDraftsErrorCode | null {
  if (drafts.length === 0) return 'empty_blocks';
  const ids = new Set<string>();
  for (const d of drafts) {
    const id = d.id.trim();
    if (!id) return 'block_id_required';
    if (ids.has(id)) return 'duplicate_id';
    ids.add(id);
    const hasLabel = d.labelEn.trim().length > 0 || d.labelRu.trim().length > 0;
    if (!hasLabel) {
      return d.kind === 'info' ? 'info_label_required' : 'scale_label_required';
    }
    if (d.kind === 'scale') {
      if (d.presentation !== 'numeric' && d.presentation !== 'icons') {
        return 'scale_presentation_invalid';
      }
      if (d.presentation === 'icons') {
        if (!isGuestSurveyIconPreset(d.iconPreset)) {
          return 'scale_icon_preset_required';
        }
        if (d.min !== 1 || d.max !== 5) {
          return 'scale_range';
        }
      } else {
        const { min, max } = d;
        if (
          !Number.isInteger(min) ||
          !Number.isInteger(max) ||
          min >= max ||
          min < 0 ||
          max > 20
        ) {
          return 'scale_range';
        }
      }
    }
  }
  return null;
}
