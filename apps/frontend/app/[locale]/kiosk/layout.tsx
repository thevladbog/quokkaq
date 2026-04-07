import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import KioskThemeWrapper from '@/components/KioskThemeWrapper';

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pageTitles' });

  return {
    title: t('kiosk.selection')
  };
}

export default function KioskLayout({ children }: Props) {
  return <KioskThemeWrapper>{children}</KioskThemeWrapper>;
}
