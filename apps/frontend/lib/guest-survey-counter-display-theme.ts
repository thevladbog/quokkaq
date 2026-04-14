import type { AdScreenConfig } from '@quokkaq/shared-types';
import { parseGuestSurveyCounterDisplayTheme } from '@quokkaq/shared-types';

function pairToken(out: Record<string, string>, token: string, value?: string) {
  if (!value) return;
  out[`--${token}`] = value;
  out[`--color-${token}`] = value;
}

/**
 * Resolves counter-display backgrounds and shadcn/Tailwind CSS variables from
 * unit `adScreen` and optional per-survey `displayTheme` (guest session).
 */
export function resolveCounterDisplayAppearance(
  adScreen: Partial<AdScreenConfig> | undefined,
  surveyDisplayThemeRaw: unknown
): {
  bodyBackground?: string;
  headerBackground?: string;
  rootCssVariables: Record<string, string>;
} {
  const ad = adScreen ?? {};
  const surveyTheme = parseGuestSurveyCounterDisplayTheme(
    surveyDisplayThemeRaw
  );
  const surveyOn = surveyTheme?.isCustomColorsEnabled === true;
  const adOn = ad.isCustomColorsEnabled === true;

  let bodyBackground: string | undefined;
  let headerBackground: string | undefined;

  if (surveyOn) {
    bodyBackground =
      surveyTheme?.bodyColor ?? (adOn ? ad.bodyColor : undefined);
    headerBackground =
      surveyTheme?.headerColor ?? (adOn ? ad.headerColor : undefined);
  } else if (adOn) {
    bodyBackground = ad.bodyColor;
    headerBackground = ad.headerColor;
  }

  const rootCssVariables: Record<string, string> = {};

  if (surveyOn && surveyTheme) {
    if (surveyTheme.foregroundColor) {
      pairToken(rootCssVariables, 'foreground', surveyTheme.foregroundColor);
    }
    if (surveyTheme.mutedForegroundColor) {
      pairToken(
        rootCssVariables,
        'muted-foreground',
        surveyTheme.mutedForegroundColor
      );
    }
    if (surveyTheme.primaryColor) {
      pairToken(rootCssVariables, 'primary', surveyTheme.primaryColor);
    }
    if (surveyTheme.primaryForegroundColor) {
      pairToken(
        rootCssVariables,
        'primary-foreground',
        surveyTheme.primaryForegroundColor
      );
    }
    if (surveyTheme.borderColor) {
      pairToken(rootCssVariables, 'border', surveyTheme.borderColor);
      pairToken(rootCssVariables, 'input', surveyTheme.borderColor);
    }
  }

  if (bodyBackground) {
    pairToken(rootCssVariables, 'background', bodyBackground);
  }

  return { bodyBackground, headerBackground, rootCssVariables };
}
