'use client';

export function LanguageSwitchWidget({
  locales,
  activeLocale,
  onChange
}: {
  locales: readonly string[];
  activeLocale?: string;
  onChange: (locale: string) => void;
}) {
  return (
    <nav
      aria-label='Language'
      className='flex h-full items-center gap-2 overflow-hidden'
    >
      {locales.map((locale) => (
        <button
          key={locale}
          type='button'
          className='min-h-14 min-w-14 rounded-lg border px-4 font-semibold'
          aria-pressed={locale === activeLocale}
          onClick={() => onChange(locale)}
        >
          {locale.toUpperCase()}
        </button>
      ))}
    </nav>
  );
}
