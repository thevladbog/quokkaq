import Image from 'next/image';

import type { AppLocale } from '@/src/messages';

type Props = {
  locale: AppLocale;
  className?: string;
  /** CSS height e.g. h-8 */
  heightClass?: string;
  /** Accessible name for the wordmark (defaults to product name). */
  alt?: string;
};

export function TextLogoImg({
  locale,
  className = 'h-8 w-auto',
  heightClass,
  alt
}: Props) {
  const resolvedAlt = alt ?? (locale === 'ru' ? 'КвоккаКю' : 'QuokkaQ');
  const src = locale === 'ru' ? '/logo-text-ru.svg' : '/logo-text.svg';
  const imageClassName = [className, heightClass].filter(Boolean).join(' ');

  return (
    <Image
      src={src}
      alt={resolvedAlt}
      width={160}
      height={40}
      className={imageClassName}
      style={{ width: 'auto' }}
      unoptimized
      priority
      loading='eager'
    />
  );
}
