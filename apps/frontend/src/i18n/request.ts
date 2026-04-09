import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';
import { messages } from '../../i18n';

type AppLocale = keyof typeof messages;

export default getRequestConfig(async ({ requestLocale }) => {
  const awaitedLocale = await requestLocale;
  const raw = awaitedLocale || routing.defaultLocale;
  const locale = (
    routing.locales.includes(raw as AppLocale) ? raw : routing.defaultLocale
  ) as AppLocale;

  // Use static imports from ../../i18n (not dynamic import of JSON). Turbopack can omit
  // locale JSON from the server bundle when using import(`.../${locale}.json`), which
  // caused empty/missing messages for `ru` and MISSING_MESSAGE for nested namespaces.
  return {
    locale,
    messages: messages[locale]
  };
});
