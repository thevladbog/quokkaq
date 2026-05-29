import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { defineI18nUI } from 'fumadocs-ui/i18n';
import { AppWindow, Globe } from 'lucide-react';
import Image from 'next/image';
import { i18n } from '@/lib/i18n';
import { marketingSiteUrl, quokkaqAppUrl } from '@/lib/shared';

const ruPartial = {
  displayName: 'Русский',
  search: 'Поиск',
  searchNoResult: 'Ничего не найдено',
  toc: 'На этой странице',
  tocNoHeadings: 'Нет заголовков',
  lastUpdate: 'Обновлено',
  chooseLanguage: 'Язык',
  nextPage: 'Далее',
  previousPage: 'Назад',
  chooseTheme: 'Тема',
  editOnGithub: 'Править на GitHub'
};

const enPartial = {
  displayName: 'English',
  search: 'Search',
  searchNoResult: 'No results',
  toc: 'On this page',
  tocNoHeadings: 'No headings',
  lastUpdate: 'Last updated',
  chooseLanguage: 'Language',
  nextPage: 'Next',
  previousPage: 'Previous',
  chooseTheme: 'Theme',
  editOnGithub: 'Edit on GitHub'
};

export const i18nUI = defineI18nUI(i18n, {
  en: enPartial,
  ru: ruPartial
});

export function baseOptions(locale: string): BaseLayoutProps {
  const isRu = locale === 'ru';
  return {
    // Default `on` = both "nav" and "menu" in Fumadocs — `on: "nav"` alone never renders in
    // DocsLayout (only `menuItems` are shown in the sidebar; `navItems` are unused there).
    links: [
      {
        type: 'main',
        text: isRu ? 'Сайт' : 'Website',
        url: marketingSiteUrl(locale),
        external: true,
        icon: <Globe className='size-4' />
      },
      {
        type: 'main',
        text: isRu ? 'Приложение' : 'App',
        url: quokkaqAppUrl(locale),
        external: true,
        icon: <AppWindow className='size-4' />
      }
    ],
    nav: {
      // Fumadocs wraps `title` in a Link to `nav.url` — do not nest another <a> here.
      title: (
        <span className='inline-flex h-8 max-w-full items-center'>
          <Image
            src={isRu ? '/logo-text-ru.svg' : '/logo-text.svg'}
            alt='QuokkaQ'
            width={132}
            height={32}
            unoptimized
            className='h-full w-auto max-w-full min-w-0'
            priority
          />
        </span>
      ),
      url: `/${locale}/docs`
    },
    themeSwitch: {
      enabled: true
    }
  };
}
