import { z } from 'zod';

/**
 * Configuration for individual stat cards in queue-stats widget
 */
export const QueueStatCardTypeSchema = z.enum([
  'queueLength',
  'activeCounters',
  'estimatedWait',
  'maxWait',
  'servedToday'
]);

export type QueueStatCardType = z.infer<typeof QueueStatCardTypeSchema>;

export const QueueStatCardConfigSchema = z.object({
  /** Card type identifier */
  type: QueueStatCardTypeSchema,
  /** Display order (0-based) */
  order: z.number().int().min(0),
  /** Width in grid blocks (1 or 2) */
  width: z.number().int().min(1).max(2).default(1),
  /** Whether this card is visible */
  enabled: z.boolean().default(true),
  /** Optional background color (CSS) */
  backgroundColor: z.string().optional(),
  /** Optional text color (CSS) */
  textColor: z.string().optional(),
  /** Optional label font size (CSS) */
  labelFontSize: z.string().optional(),
  /** Optional value font size (CSS) */
  valueFontSize: z.string().optional()
});

export type QueueStatCardConfig = z.infer<typeof QueueStatCardConfigSchema>;

/**
 * Widget config for queue-stats with customizable cards
 */
export const QueueStatsWidgetConfigSchema = z.object({
  /** Card configurations */
  cards: z.array(QueueStatCardConfigSchema).optional()
});

export type QueueStatsWidgetConfig = z.infer<
  typeof QueueStatsWidgetConfigSchema
>;

/**
 * Default card configurations
 */
export const DEFAULT_QUEUE_STAT_CARDS: QueueStatCardConfig[] = [
  {
    type: 'queueLength',
    order: 0,
    width: 1,
    enabled: true
  },
  {
    type: 'activeCounters',
    order: 1,
    width: 1,
    enabled: true
  },
  {
    type: 'estimatedWait',
    order: 2,
    width: 1,
    enabled: true
  },
  {
    type: 'maxWait',
    order: 3,
    width: 1,
    enabled: true
  },
  {
    type: 'servedToday',
    order: 4,
    width: 2,
    enabled: true
  }
];

/**
 * Get cards configuration with defaults for missing entries
 */
export function getQueueStatsCards(
  config?: QueueStatsWidgetConfig
): QueueStatCardConfig[] {
  if (!config?.cards || config.cards.length === 0) {
    return DEFAULT_QUEUE_STAT_CARDS;
  }

  // Merge with defaults to ensure all cards are present
  const configMap = new Map(config.cards.map((c) => [c.type, c]));

  return DEFAULT_QUEUE_STAT_CARDS.map((defaultCard) => {
    const userCard = configMap.get(defaultCard.type);
    return userCard ? { ...defaultCard, ...userCard } : defaultCard;
  }).sort((a, b) => a.order - b.order);
}
