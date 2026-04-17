import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params
}: LayoutProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pageTitles' });
  return { title: t('help') };
}

export default function HelpLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <div className='bg-background min-h-screen'>
      <div className='mx-auto max-w-3xl px-4 py-10 sm:px-6'>{children}</div>
    </div>
  );
}
