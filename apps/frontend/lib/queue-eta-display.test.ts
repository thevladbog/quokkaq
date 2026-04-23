import { describe, expect, it } from 'vitest';
import {
  displayEstimateToCallMinutes,
  displayMaxWaitInQueueMinutes
} from './queue-eta-display';

describe('queue-eta-display', () => {
  it('rounds up sub-minute estimate to at least 1', () => {
    expect(displayEstimateToCallMinutes(0.31)).toBe(1);
    expect(displayEstimateToCallMinutes(0.9)).toBe(1);
  });
  it('rounds whole minutes for estimate', () => {
    expect(displayEstimateToCallMinutes(2.3)).toBe(2);
  });
  it('rounds max wait in queue to whole minutes', () => {
    expect(displayMaxWaitInQueueMinutes(19.7)).toBe(20);
  });
});
