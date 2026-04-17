import Image from 'next/image';

import type { AppLocale } from '@/src/messages';

type Props = {
  locale: AppLocale;
  className?: string;
  /** CSS height e.g. h-8 */
  heightClass?: string;
};

export function TextLogoImg({
  locale,
  className = 'h-8 w-auto',
  heightClass
}: Props) {
  const src = locale === 'ru' ? '/logo-text-ru.svg' : '/logo-text.svg';

  return (
    <Image
      src={src}
      alt=''
      width={160}
      height={40}
      className={heightClass ?? className}
      unoptimized
    />
  );
}
