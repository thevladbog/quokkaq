/**
 * Shape of next-intl `useTranslations()` when passing `t` into presentational
 * components without fixing a specific message namespace.
 */
export type TFn = (
  key: string,
  values?: Record<string, string | number | Date>
) => string;
