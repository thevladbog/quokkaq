import { describe, expect, it } from 'vitest';
import {
  GuestSurveyIdleScreenSchema,
  GuestSurveyQuestionScaleBlockSchema,
  parseGuestSurveyIdleScreen,
  parseGuestSurveyIdleScreenForDisplay
} from './index';

const scopeUnit = 'scope-unit-aa';
const imageUUID = '550e8400-e29b-41d4-a716-446655440000';
const imageURLScope = `/api/units/${scopeUnit}/guest-survey/idle-media/${imageUUID}.png`;
const imageURLOther = `/api/units/other-unit/guest-survey/idle-media/${imageUUID}.png`;

describe('GuestSurveyIdleScreenSchema', () => {
  it('accepts empty slides with slideIntervalSec 0', () => {
    const r = GuestSurveyIdleScreenSchema.safeParse({
      slideIntervalSec: 0,
      slides: []
    });
    expect(r.success).toBe(true);
  });

  it('rejects non-empty slides when slideIntervalSec out of range', () => {
    const r = GuestSurveyIdleScreenSchema.safeParse({
      slideIntervalSec: 0,
      slides: [{ type: 'text', markdown: { en: 'x' } }]
    });
    expect(r.success).toBe(false);
  });

  it('accepts text slide with interval in range', () => {
    const r = GuestSurveyIdleScreenSchema.safeParse({
      slideIntervalSec: 8,
      slides: [{ type: 'text', markdown: { en: 'Hello' } }]
    });
    expect(r.success).toBe(true);
  });
});

describe('parseGuestSurveyIdleScreen', () => {
  it('returns data for valid text-only idle', () => {
    const raw = {
      slideIntervalSec: 5,
      slides: [{ type: 'text', markdown: { en: 'Hi', ru: 'Привет' } }]
    };
    expect(parseGuestSurveyIdleScreen(raw, scopeUnit)).toEqual(raw);
  });

  it('rejects image URL when unit id does not match scope', () => {
    const raw = {
      slideIntervalSec: 5,
      slides: [
        {
          type: 'image',
          url: imageURLOther
        }
      ]
    };
    expect(parseGuestSurveyIdleScreen(raw, scopeUnit)).toBeNull();
  });

  it('accepts image URL when unit matches scope', () => {
    const raw = {
      slideIntervalSec: 5,
      slides: [{ type: 'image', url: imageURLScope }]
    };
    const out = parseGuestSurveyIdleScreen(raw, scopeUnit);
    expect(out).not.toBeNull();
    expect(out?.slides[0]).toEqual(raw.slides[0]);
  });
});

describe('parseGuestSurveyIdleScreenForDisplay', () => {
  it('allows idle-media URL for a different unit than survey scope', () => {
    const raw = {
      slideIntervalSec: 5,
      slides: [{ type: 'image', url: imageURLOther }]
    };
    const out = parseGuestSurveyIdleScreenForDisplay(raw);
    expect(out).not.toBeNull();
    expect(out?.slides[0]).toEqual(raw.slides[0]);
  });

  it('rejects URL without idle-media marker', () => {
    const raw = {
      slideIntervalSec: 5,
      slides: [
        {
          type: 'image',
          url: `/api/units/other-unit/other-path/${imageUUID}.png`
        }
      ]
    };
    expect(parseGuestSurveyIdleScreenForDisplay(raw)).toBeNull();
  });
});

describe('GuestSurveyQuestionScaleBlockSchema', () => {
  it('accepts numeric scale without presentation', () => {
    const r = GuestSurveyQuestionScaleBlockSchema.safeParse({
      id: 'q',
      type: 'scale',
      min: 0,
      max: 10,
      label: { en: 'x' }
    });
    expect(r.success).toBe(true);
  });

  it('rejects icons presentation without iconPreset', () => {
    const r = GuestSurveyQuestionScaleBlockSchema.safeParse({
      id: 'q',
      type: 'scale',
      min: 1,
      max: 5,
      presentation: 'icons'
    });
    expect(r.success).toBe(false);
  });

  it('rejects icons when min/max not 1–5', () => {
    const r = GuestSurveyQuestionScaleBlockSchema.safeParse({
      id: 'q',
      type: 'scale',
      min: 1,
      max: 4,
      presentation: 'icons',
      iconPreset: 'stars_gold'
    });
    expect(r.success).toBe(false);
  });

  it('accepts valid icons block', () => {
    const r = GuestSurveyQuestionScaleBlockSchema.safeParse({
      id: 'q',
      type: 'scale',
      min: 1,
      max: 5,
      presentation: 'icons',
      iconPreset: 'hearts_red'
    });
    expect(r.success).toBe(true);
  });
});
