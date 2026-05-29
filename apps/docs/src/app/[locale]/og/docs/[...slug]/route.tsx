import { getPageImage, source } from '@/lib/source';
import { notFound } from 'next/navigation';
import { ImageResponse } from 'next/og';
import { generate as OGDocsImage } from 'fumadocs-ui/og';
import { appName } from '@/lib/shared';
import { isAppLocale } from '@/lib/i18n';

export const revalidate = false;

export async function GET(
  _req: Request,
  context: { params: Promise<{ locale: string; slug: string[] }> }
) {
  const { locale, slug: slugParam } = await context.params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  const page = source.getPage(slugParam?.slice(0, -1), locale);
  if (!page) {
    notFound();
  }

  return new ImageResponse(
    <OGDocsImage
      description={page.data.description}
      site={appName}
      title={page.data.title}
    />,
    {
      height: 630,
      width: 1200
    }
  );
}

export function generateStaticParams() {
  return source.getPages().map((p) => ({
    locale: p.locale,
    slug: getPageImage(p).segments
  }));
}
