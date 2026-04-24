import type { AppLocale } from '@/src/messages';

type Props = {
  locale: AppLocale;
  className?: string;
  /** CSS height e.g. h-8 */
  heightClass?: string;
  /** Accessible name for the wordmark (defaults to product name). */
  alt?: string;
};

/**
 * Local SVG wordmark — use `<img>` so Tailwind height-only sizing (`h-8 w-auto`)
 * does not trigger Next/Image “set width or height to auto” dev warnings.
 */
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
    // eslint-disable-next-line @next/next/no-img-element -- SVG from /public; avoids next/image aspect-ratio warning with h-* + w-auto
    <img
      src={src}
      alt={resolvedAlt}
      width={160}
      height={40}
      className={imageClassName}
      loading='eager'
      decoding='async'
      fetchPriority='high'
    />
  );
}
