import { z } from 'zod';
import { toast } from 'sonner';
import {
  ExternalFeedSchema,
  PlaylistItemInputSchema,
  PlaylistSchema,
  PlaylistScheduleSchema,
  ScreenAnnouncementSchema,
  ScreenTemplateSchema
} from '@quokkaq/shared-types';

type SchemaResult<T> = { success: true; data: T } | { success: false };

/** Validate signage-related payloads; show first Zod issue in a toast. */
export function safeParseSignageWithToast<T>(
  label: string,
  schema: z.ZodType<T>,
  data: unknown
): SchemaResult<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const first = r.error.issues[0];
    const msg = first
      ? `${label}: ${first.path.join('.') || 'value'} — ${first.message}`
      : `${label}: invalid data`;
    toast.error(msg);
    return { success: false };
  }
  return { success: true, data: r.data };
}

export const createPlaylistRequestSchema = z.object({
  name: z.string().min(1, 'name'),
  isDefault: z.boolean().optional(),
  items: z.array(PlaylistItemInputSchema).min(1, 'at least one item')
});

export const createAnnouncementRequestSchema = z.object({
  text: z.string().min(1),
  style: z.string().min(1),
  isActive: z.boolean()
});

export const signageZod = {
  playlist: PlaylistSchema,
  createPlaylist: createPlaylistRequestSchema,
  schedule: PlaylistScheduleSchema,
  feed: ExternalFeedSchema,
  announcement: ScreenAnnouncementSchema,
  createAnnouncement: createAnnouncementRequestSchema,
  screenTemplate: ScreenTemplateSchema
} as const;
