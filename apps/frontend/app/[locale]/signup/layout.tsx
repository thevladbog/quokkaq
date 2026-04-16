import { ReactNode } from 'react';

import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pageTitles' });

  return {
    title: t('register')
  };
}

export default function SignupLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
