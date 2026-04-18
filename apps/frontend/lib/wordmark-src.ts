/** Public wordmark asset path for the app locale (extend when adding localized SVGs). */
export function getWordmarkSrc(locale: string): string {
  const loc = locale.trim().toLowerCase();
  if (loc === 'ru') {
    return '/logo-text-ru.svg';
  }
  return '/logo-text.svg';
}
