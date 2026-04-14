import { GuestSurveyCounterDisplayThemeSchema } from '@quokkaq/shared-types';

export type TerminalThemeDraftLike = {
  enabled: boolean;
  headerColor: string;
  bodyColor: string;
  foregroundColor: string;
  mutedForegroundColor: string;
  primaryColor: string;
  primaryForegroundColor: string;
  borderColor: string;
};

/** Build API `displayTheme` object; returns null if enabled theme fails Zod (invalid hex). */
export function terminalThemeDraftToApiPayload(
  draft: TerminalThemeDraftLike
): Record<string, unknown> | null {
  if (!draft.enabled) {
    return { isCustomColorsEnabled: false };
  }
  const raw = {
    isCustomColorsEnabled: true as const,
    headerColor: draft.headerColor,
    bodyColor: draft.bodyColor,
    foregroundColor: draft.foregroundColor,
    mutedForegroundColor: draft.mutedForegroundColor,
    primaryColor: draft.primaryColor,
    primaryForegroundColor: draft.primaryForegroundColor,
    borderColor: draft.borderColor
  };
  const z = GuestSurveyCounterDisplayThemeSchema.safeParse(raw);
  return z.success ? (z.data as Record<string, unknown>) : null;
}
