import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { WikiDocMarkdown } from '@/components/wiki/wiki-doc-markdown';
import { loadWikiPage } from '@/lib/wiki/load-wiki-page';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

type Props = {
  params: Promise<{ locale: string; slug?: string[] }>;
};

export default async function WikiHelpPage({ params }: Props) {
  const { locale, slug } = await params;
  const loaded = await loadWikiPage(locale, slug);
  if (!loaded) {
    notFound();
  }

  const t = await getTranslations({ locale, namespace: 'wiki' });
  const homeHref = `/${locale}/help`;

  return (
    <div className='space-y-6'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <Button variant='ghost' size='sm' asChild className='-ml-2 h-auto px-2'>
          <Link href={homeHref}>{t('homeLink')}</Link>
        </Button>
      </div>

      {loaded.fallbackFromLocale ? (
        <Alert>
          <AlertTitle>{t('fallbackTitle')}</AlertTitle>
          <AlertDescription>{t('fallbackNotice')}</AlertDescription>
        </Alert>
      ) : null}

      <WikiDocMarkdown markdown={loaded.markdown} />
    </div>
  );
}
