import en from './messages/en.json';
import ru from './messages/ru.json';

export const locales = ['en', 'ru'] as const;
export type Locale = (typeof locales)[number];

export const messages = {
  en,
  ru
} as const;

export const defaultLocale: Locale = 'en';
