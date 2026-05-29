import { redirect } from 'next/navigation';
import { i18n } from '@/lib/i18n';

/**
 * `GET /` is outside `[locale]`. Fumadocs/edge adds the locale, but a root redirect keeps
 * `/` working if the proxy is skipped and mirrors `createI18nMiddleware` (default language).
 */
export default function HomeRedirect() {
  redirect(`/${i18n.defaultLanguage}`);
}
