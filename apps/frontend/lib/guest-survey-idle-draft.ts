import { parseGuestSurveyIdleScreen } from '@quokkaq/shared-types';

export type IdleTextSlideDraft = {
  key: string;
  type: 'text';
  markdownEn: string;
  markdownRu: string;
};

export type IdleImageSlideDraft = {
  key: string;
  type: 'image';
  url: string;
};

export type IdleVideoSlideDraft = {
  key: string;
  type: 'video';
  url: string;
};

export type IdleSlideDraft =
  | IdleTextSlideDraft
  | IdleImageSlideDraft
  | IdleVideoSlideDraft;

export type IdleScreenDraft = {
  slideIntervalSec: number;
  slides: IdleSlideDraft[];
};

export function newIdleSlideKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `idle-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function defaultIdleScreenDraft(): IdleScreenDraft {
  return { slideIntervalSec: 8, slides: [] };
}

export function idleScreenDraftFromRow(
  raw: unknown,
  unitId: string
): IdleScreenDraft {
  const parsed = parseGuestSurveyIdleScreen(raw, unitId);
  if (!parsed) {
    return defaultIdleScreenDraft();
  }
  return {
    slideIntervalSec:
      parsed.slides.length > 0
        ? parsed.slideIntervalSec
        : defaultIdleScreenDraft().slideIntervalSec,
    slides: parsed.slides.map((s) => {
      const key = newIdleSlideKey();
      if (s.type === 'text') {
        const m = s.markdown as Record<string, string>;
        return {
          key,
          type: 'text',
          markdownEn: typeof m.en === 'string' ? m.en : '',
          markdownRu: typeof m.ru === 'string' ? m.ru : ''
        };
      }
      if (s.type === 'image') {
        return { key, type: 'image', url: s.url };
      }
      return { key, type: 'video', url: s.url };
    })
  };
}

export type IdleScreenDraftValidationError =
  | 'idle_interval'
  | 'idle_text_empty'
  | 'idle_media_missing';

export function validateIdleScreenDraft(
  d: IdleScreenDraft
): IdleScreenDraftValidationError | null {
  if (d.slides.length > 0) {
    if (d.slideIntervalSec < 1 || d.slideIntervalSec > 300) {
      return 'idle_interval';
    }
  }
  for (const s of d.slides) {
    if (s.type === 'text') {
      if (!s.markdownEn.trim() && !s.markdownRu.trim()) {
        return 'idle_text_empty';
      }
    } else if (!s.url.trim()) {
      return 'idle_media_missing';
    }
  }
  return null;
}

/** API-relative path after `/api` for authenticated fetch (e.g. `/units/…/guest-survey/idle-media/…`). */
export function idleMediaPathForAuthenticatedFetch(
  apiRelativeUrl: string
): string | null {
  const u = apiRelativeUrl.trim();
  if (!u) return null;
  const withoutApi = u.startsWith('/api/') ? u.slice('/api'.length) : u;
  if (!withoutApi.startsWith('/units/')) return null;
  if (!withoutApi.includes('/guest-survey/idle-media/')) return null;
  return withoutApi;
}

export function idleMediaFileNameFromApiUrl(
  apiRelativeUrl: string
): string | null {
  const marker = '/guest-survey/idle-media/';
  const u = apiRelativeUrl.trim();
  const i = u.indexOf(marker);
  if (i === -1) return null;
  const rest = u.slice(i + marker.length);
  const fn = rest.split('/')[0]?.split('?')[0];
  return fn || null;
}

export function idleScreenDraftToApiPayload(d: IdleScreenDraft): {
  slideIntervalSec: number;
  slides: unknown[];
} {
  const interval = d.slides.length > 0 ? d.slideIntervalSec : 0;
  const slides = d.slides.map((s) => {
    if (s.type === 'text') {
      const markdown: Record<string, string> = {};
      if (s.markdownEn.trim()) markdown.en = s.markdownEn;
      if (s.markdownRu.trim()) markdown.ru = s.markdownRu;
      return { type: 'text', markdown };
    }
    return { type: s.type, url: s.url.trim() };
  });
  return { slideIntervalSec: interval, slides };
}
