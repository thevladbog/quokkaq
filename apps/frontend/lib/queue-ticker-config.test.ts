import { describe, expect, it } from 'vitest';
import {
  parseQueueTickerDirection,
  parseQueueTickerDurationSeconds,
  queueTickerConfigFromRecord,
  resolveQueueTickerLabel
} from './queue-ticker-config';

describe('parseQueueTickerDirection', () => {
  it('defaults to left', () => {
    expect(parseQueueTickerDirection(undefined)).toBe('left');
    expect(parseQueueTickerDirection('left')).toBe('left');
    expect(parseQueueTickerDirection('')).toBe('left');
  });
  it('accepts right', () => {
    expect(parseQueueTickerDirection('right')).toBe('right');
  });
});

describe('parseQueueTickerDurationSeconds', () => {
  it('clamps and rounds', () => {
    expect(parseQueueTickerDurationSeconds(24)).toBe(24);
    expect(parseQueueTickerDurationSeconds(3)).toBe(8);
    expect(parseQueueTickerDurationSeconds(200)).toBe(120);
    expect(parseQueueTickerDurationSeconds(15.4)).toBe(15);
  });
  it('defaults on invalid', () => {
    expect(parseQueueTickerDurationSeconds(undefined)).toBe(24);
    expect(parseQueueTickerDurationSeconds('x')).toBe(24);
  });
});

describe('queueTickerConfigFromRecord', () => {
  it('reads known keys', () => {
    expect(
      queueTickerConfigFromRecord({
        labelRu: 'Ждут',
        labelEn: 'Wait',
        direction: 'right',
        durationSeconds: 40
      })
    ).toEqual({
      labelRu: 'Ждут',
      labelEn: 'Wait',
      direction: 'right',
      durationSeconds: 40
    });
  });
  it('defaults when empty', () => {
    expect(queueTickerConfigFromRecord(undefined)).toEqual({
      labelRu: '',
      labelEn: '',
      direction: 'left',
      durationSeconds: 24
    });
  });
});

describe('resolveQueueTickerLabel', () => {
  const fb = 'Wait:';
  it('prefers matching locale', () => {
    expect(resolveQueueTickerLabel('ru', 'Ждут', 'Wait', fb).text).toBe('Ждут');
    expect(resolveQueueTickerLabel('en', 'Ждут', 'Wait', fb).text).toBe('Wait');
  });
  it('falls back to other phrase then default', () => {
    expect(resolveQueueTickerLabel('ru', '', 'Wait', fb).text).toBe('Wait');
    expect(resolveQueueTickerLabel('en', 'Ждут', '', fb).text).toBe('Ждут');
    expect(resolveQueueTickerLabel('de', '', '', fb).text).toBe('Wait:');
  });
  it('marks custom', () => {
    expect(resolveQueueTickerLabel('en', '', 'Hi', fb).isCustom).toBe(true);
    expect(resolveQueueTickerLabel('en', '', '', fb).isCustom).toBe(false);
  });
});
