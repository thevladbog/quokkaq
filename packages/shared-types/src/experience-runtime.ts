import { z } from 'zod';

/** Typed runtime state owned by the kiosk renderer, not an editable page flow. */
export const LegacyAttractCompatibilitySchema = z
  .object({
    mode: z.enum(['session_then_attract', 'attract_only', 'off']),
    sessionIdleBeforeWarningSec: z.number().int().positive().max(3_600),
    sessionIdleCountdownSec: z.number().int().positive().max(300),
    showAttractAfterSessionEnd: z.boolean(),
    attractIdleSec: z.number().int().min(10).max(600),
    showQueueDepthOnAttract: z.boolean(),
    signage: z
      .object({
        mode: z.enum(['inherit', 'playlist', 'materials']),
        playlistId: z.string().optional(),
        materialIds: z.array(z.string()).optional(),
        slideDurationSec: z.number().int().min(1).max(300).optional()
      })
      .strict()
  })
  .strict();

export type LegacyAttractCompatibility = z.infer<
  typeof LegacyAttractCompatibilitySchema
>;
