import { defineI18n } from 'fumadocs-core/i18n';

export const i18n = defineI18n({
  defaultLanguage: 'en',
  languages: ['en', 'ru'],
  // Show /en/... in the URL (aligns with product app defaultLocale + explicit prefix for RU)
  hideLocale: 'never',
  // `content/docs/{en,ru}/...` — strip language folder from slugs (see fumadocs-core storage parser)
  parser: 'dir'
});

export type AppLocale = (typeof i18n)['languages'][number];

export function isAppLocale(value: string): value is AppLocale {
  return (i18n.languages as readonly string[]).includes(value);
}
