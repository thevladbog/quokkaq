import { describe, expect, it } from 'vitest';
import {
  defaultGuestSurveyDrafts,
  draftsToQuestionsPayload,
  isGuestSurveyIconPreset,
  isGuestSurveyIconScale,
  parseDraftsFromQuestionsJson,
  parseGuestSurveyForDisplay,
  unwrapGuestSurveyQuestionsJson,
  validateDrafts,
  type GuestSurveyBlockDraft
} from './guest-survey-blocks';

describe('unwrapGuestSurveyQuestionsJson', () => {
  it('treats array as single_page', () => {
    const raw = [{ id: 'a', type: 'scale', min: 1, max: 3, label: {} }];
    expect(unwrapGuestSurveyQuestionsJson(raw)).toEqual({
      displayMode: 'single_page',
      blocksArray: raw
    });
  });

  it('reads stepped displayMode from wrapper', () => {
    const blocks = [{ id: 'x', type: 'info', label: { en: 'h' } }];
    expect(
      unwrapGuestSurveyQuestionsJson({ displayMode: 'stepped', blocks })
    ).toEqual({ displayMode: 'stepped', blocksArray: blocks });
  });

  it('defaults to single_page for unknown displayMode', () => {
    const blocks: unknown[] = [];
    expect(
      unwrapGuestSurveyQuestionsJson({ displayMode: 'other', blocks })
    ).toEqual({ displayMode: 'single_page', blocksArray: blocks });
  });
});

describe('parseDraftsFromQuestionsJson / draftsToQuestionsPayload', () => {
  it('round-trips numeric scale without presentation in JSON', () => {
    const drafts: GuestSurveyBlockDraft[] = [
      {
        kind: 'scale',
        id: 'q1',
        labelEn: 'E',
        labelRu: 'R',
        min: 2,
        max: 7,
        presentation: 'numeric'
      }
    ];
    const payload = draftsToQuestionsPayload(drafts, 'single_page');
    const back = parseDraftsFromQuestionsJson(payload);
    expect(back.displayMode).toBe('single_page');
    expect(back.drafts).toEqual(drafts);
  });

  it('serializes icons scale with min/max 1–5 and presets', () => {
    const drafts: GuestSurveyBlockDraft[] = [
      {
        kind: 'scale',
        id: 'stars',
        labelEn: 'Rate',
        labelRu: 'Оценка',
        min: 1,
        max: 5,
        presentation: 'icons',
        iconPreset: 'stars_gold'
      }
    ];
    const payload = draftsToQuestionsPayload(drafts) as Record<
      string,
      unknown
    >[];
    expect(Array.isArray(payload)).toBe(true);
    const block = payload[0] as Record<string, unknown>;
    expect(block.type).toBe('scale');
    expect(block.presentation).toBe('icons');
    expect(block.iconPreset).toBe('stars_gold');
    expect(block.min).toBe(1);
    expect(block.max).toBe(5);
  });

  it('normalizes icons min/max from stored JSON when wrong', () => {
    const raw = [
      {
        id: 'i',
        type: 'scale',
        min: 10,
        max: 99,
        presentation: 'icons',
        iconPreset: 'hearts_red',
        label: { en: 'x' }
      }
    ];
    const { drafts } = parseDraftsFromQuestionsJson(raw);
    const scale = drafts[0];
    expect(scale?.kind).toBe('scale');
    if (scale?.kind === 'scale') {
      expect(scale.min).toBe(1);
      expect(scale.max).toBe(5);
      expect(scale.presentation).toBe('icons');
      expect(scale.iconPreset).toBe('hearts_red');
    }
  });

  it('defaults iconPreset to stars_gold when icons without preset in JSON', () => {
    const raw = [
      {
        id: 'i',
        type: 'scale',
        presentation: 'icons',
        min: 1,
        max: 5,
        label: { en: 'x' }
      }
    ];
    const { drafts } = parseDraftsFromQuestionsJson(raw);
    const scale = drafts[0];
    expect(scale?.kind).toBe('scale');
    if (scale?.kind === 'scale') {
      expect(scale.iconPreset).toBe('stars_gold');
    }
  });

  it('wraps stepped payload object', () => {
    const drafts = defaultGuestSurveyDrafts();
    const payload = draftsToQuestionsPayload(drafts, 'stepped');
    expect(payload).toEqual({
      displayMode: 'stepped',
      blocks: expect.any(Array)
    });
    const parsed = parseDraftsFromQuestionsJson(payload);
    expect(parsed.displayMode).toBe('stepped');
    expect(parsed.drafts.length).toBeGreaterThan(0);
  });
});

describe('parseGuestSurveyForDisplay + isGuestSurveyIconScale', () => {
  it('marks numeric scale with presentation numeric', () => {
    const { blocks } = parseGuestSurveyForDisplay([
      {
        id: 'n',
        type: 'scale',
        min: 0,
        max: 10,
        label: { en: 'L' }
      }
    ]);
    const b = blocks[0];
    expect(b?.kind).toBe('scale');
    if (b?.kind === 'scale') {
      expect(b.presentation).toBe('numeric');
      expect(isGuestSurveyIconScale(b)).toBe(false);
    }
  });

  it('detects icon scale for terminal', () => {
    const { blocks } = parseGuestSurveyForDisplay([
      {
        id: 'n',
        type: 'scale',
        min: 1,
        max: 5,
        presentation: 'icons',
        iconPreset: 'stars_gold',
        label: { en: 'L' }
      }
    ]);
    const b = blocks[0];
    expect(b?.kind).toBe('scale');
    if (b?.kind === 'scale') {
      expect(isGuestSurveyIconScale(b)).toBe(true);
    }
  });
});

describe('validateDrafts', () => {
  it('returns empty_blocks for empty array', () => {
    expect(validateDrafts([])).toBe('empty_blocks');
  });

  it('requires icon preset for icons presentation', () => {
    const drafts: GuestSurveyBlockDraft[] = [
      {
        kind: 'scale',
        id: 'a',
        labelEn: 'e',
        labelRu: '',
        min: 1,
        max: 5,
        presentation: 'icons'
        // iconPreset missing — TS allows optional; runtime validation catches
      }
    ];
    expect(validateDrafts(drafts)).toBe('scale_icon_preset_required');
  });

  it('rejects icons when min/max not 1–5', () => {
    const drafts: GuestSurveyBlockDraft[] = [
      {
        kind: 'scale',
        id: 'a',
        labelEn: 'e',
        labelRu: '',
        min: 1,
        max: 4,
        presentation: 'icons',
        iconPreset: 'stars_gold'
      }
    ];
    expect(validateDrafts(drafts)).toBe('scale_range');
  });

  it('accepts valid icons draft', () => {
    const drafts: GuestSurveyBlockDraft[] = [
      {
        kind: 'scale',
        id: 'a',
        labelEn: 'e',
        labelRu: '',
        min: 1,
        max: 5,
        presentation: 'icons',
        iconPreset: 'hearts_red'
      }
    ];
    expect(validateDrafts(drafts)).toBe(null);
  });
});

describe('isGuestSurveyIconPreset', () => {
  it('accepts known presets only', () => {
    expect(isGuestSurveyIconPreset('stars_gold')).toBe(true);
    expect(isGuestSurveyIconPreset('hearts_red')).toBe(true);
    expect(isGuestSurveyIconPreset('other')).toBe(false);
    expect(isGuestSurveyIconPreset(null)).toBe(false);
  });
});
