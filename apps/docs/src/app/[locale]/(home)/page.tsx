import Image from 'next/image';
import Link from 'next/link';
import { isAppLocale } from '@/lib/i18n';
import { marketingSiteUrl, quokkaqAppUrl } from '@/lib/shared';
import { notFound } from 'next/navigation';

export default async function HomePage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isAppLocale(raw)) {
    notFound();
  }
  const locale = raw;
  const isRu = locale === 'ru';
  const toDocs = `/${locale}/docs`;
  const landing = marketingSiteUrl(locale);
  const app = quokkaqAppUrl(locale);
  return (
    <div className='text-fd-foreground flex flex-1 flex-col items-center justify-center gap-8 text-center'>
      <Image
        alt=''
        className='h-10 w-[min(100%,13.75rem)] object-contain object-center sm:h-12 dark:opacity-90'
        height={64}
        priority
        src={isRu ? '/logo-text-ru.svg' : '/logo-text.svg'}
        unoptimized
        width={220}
        sizes='(max-width: 640px) 85vw, 220px'
      />
      <h1 className='font-display text-3xl font-bold tracking-tight sm:text-4xl'>
        {isRu ? 'Документация QuokkaQ' : 'QuokkaQ documentation'}
      </h1>
      <p className='text-fd-muted-foreground max-w-2xl text-balance sm:text-lg'>
        {isRu
          ? 'Справка по интеграциям, HTTP API, цифровому табло и публичному виджету очереди. Для справки в продукте — раздел /help в приложении.'
          : 'Public help for integrations, the HTTP API, digital signage, and the embeddable queue widget. For the in-app help center, use /help in the product.'}
      </p>
      <div className='flex flex-col items-center gap-4 sm:gap-5'>
        <Link
          className='text-fd-primary-foreground bg-fd-primary focus-visible:ring-fd-ring rounded-xl px-5 py-2.5 text-sm font-medium underline-offset-4 transition hover:opacity-95 focus-visible:ring-2 focus-visible:outline-none'
          href={toDocs}
        >
          {isRu ? 'Перейти к разделу Documentation' : 'Open documentation'}
        </Link>
        <p className='text-fd-muted-foreground flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm'>
          <a
            className='text-fd-foreground/90 hover:text-fd-primary font-medium underline-offset-4 transition hover:underline'
            href={landing}
            rel='noopener noreferrer'
            target='_blank'
          >
            {isRu ? 'Сайт QuokkaQ' : 'QuokkaQ website'}
          </a>
          <span aria-hidden className='text-fd-border'>
            ·
          </span>
          <a
            className='text-fd-foreground/90 hover:text-fd-primary font-medium underline-offset-4 transition hover:underline'
            href={app}
            rel='noopener noreferrer'
            target='_blank'
          >
            {isRu ? 'Войти в приложение' : 'Open app'}
          </a>
        </p>
      </div>
    </div>
  );
}
