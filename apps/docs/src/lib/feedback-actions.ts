'use server';

import type {
  ActionResponse,
  BlockFeedback,
  PageFeedback
} from '@/components/feedback/schema';
import { blockFeedback } from '@/components/feedback/schema';

/**
 * Page-level docs feedback. Wire to PostHog, a private endpoint, or GitHub Discussions
 * (see https://www.fumadocs.dev/docs/integrations/feedback).
 */
export async function sendPageFeedback(
  feedback: PageFeedback
): Promise<ActionResponse> {
  if (process.env.NODE_ENV === 'development') {
    console.info('[QuokkaQ docs feedback]', feedback);
  }
  // Return {} so the UI does not show "View on GitHub" unless you set githubUrl from a real integration.
  return {};
}

/**
 * Per-paragraph comments (text anchor + `blockId` from the client). Same backend story as
 * `sendPageFeedback` — e.g. PostHog, internal API, or GitHub.
 */
export async function sendBlockFeedback(
  input: BlockFeedback
): Promise<ActionResponse> {
  const parsed = blockFeedback.safeParse(input);
  if (!parsed.success) {
    return {};
  }
  if (process.env.NODE_ENV === 'development') {
    console.info('[QuokkaQ docs block feedback]', parsed.data);
  }
  return {};
}
