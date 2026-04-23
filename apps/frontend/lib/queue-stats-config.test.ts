import { describe, it, expect } from 'vitest';
import {
  getQueueStatsCards,
  DEFAULT_QUEUE_STAT_CARDS,
  type QueueStatsWidgetConfig
} from './queue-stats-config';

describe('queue-stats-config', () => {
  it('returns default cards when config is undefined', () => {
    const cards = getQueueStatsCards(undefined);
    expect(cards).toEqual(DEFAULT_QUEUE_STAT_CARDS);
  });

  it('returns default cards when config.cards is empty', () => {
    const cards = getQueueStatsCards({ cards: [] });
    expect(cards).toEqual(DEFAULT_QUEUE_STAT_CARDS);
  });

  it('merges custom card configuration with defaults', () => {
    const config: QueueStatsWidgetConfig = {
      cards: [
        {
          type: 'queueLength',
          order: 0,
          width: 2,
          enabled: true,
          backgroundColor: '#ff0000'
        }
      ]
    };

    const cards = getQueueStatsCards(config);

    const queueLengthCard = cards.find((c) => c.type === 'queueLength');
    expect(queueLengthCard).toBeDefined();
    expect(queueLengthCard?.width).toBe(2);
    expect(queueLengthCard?.backgroundColor).toBe('#ff0000');
    expect(queueLengthCard?.enabled).toBe(true);
  });

  it('sorts cards by order', () => {
    const config: QueueStatsWidgetConfig = {
      cards: [
        {
          type: 'servedToday',
          order: 0,
          width: 2,
          enabled: true
        },
        {
          type: 'queueLength',
          order: 1,
          width: 1,
          enabled: true
        },
        {
          type: 'activeCounters',
          order: 2,
          width: 1,
          enabled: true
        }
      ]
    };

    const cards = getQueueStatsCards(config);

    expect(cards[0].type).toBe('servedToday');
    expect(cards[1].type).toBe('queueLength');
    expect(cards[2].type).toBe('activeCounters');
  });

  it('preserves enabled/disabled state', () => {
    const config: QueueStatsWidgetConfig = {
      cards: [
        {
          type: 'maxWait',
          order: 3,
          width: 1,
          enabled: false
        }
      ]
    };

    const cards = getQueueStatsCards(config);
    const maxWaitCard = cards.find((c) => c.type === 'maxWait');

    expect(maxWaitCard?.enabled).toBe(false);
  });

  it('applies custom colors to individual cards', () => {
    const config: QueueStatsWidgetConfig = {
      cards: [
        {
          type: 'estimatedWait',
          order: 2,
          width: 1,
          enabled: true,
          backgroundColor: '#00ff00',
          textColor: '#ffffff'
        }
      ]
    };

    const cards = getQueueStatsCards(config);
    const etaCard = cards.find((c) => c.type === 'estimatedWait');

    expect(etaCard?.backgroundColor).toBe('#00ff00');
    expect(etaCard?.textColor).toBe('#ffffff');
  });

  it('ensures all default cards are present even with partial config', () => {
    const config: QueueStatsWidgetConfig = {
      cards: [
        {
          type: 'queueLength',
          order: 0,
          width: 2,
          enabled: false
        }
      ]
    };

    const cards = getQueueStatsCards(config);

    expect(cards).toHaveLength(5);
    expect(cards.map((c) => c.type)).toContain('queueLength');
    expect(cards.map((c) => c.type)).toContain('activeCounters');
    expect(cards.map((c) => c.type)).toContain('estimatedWait');
    expect(cards.map((c) => c.type)).toContain('maxWait');
    expect(cards.map((c) => c.type)).toContain('servedToday');
  });
});
