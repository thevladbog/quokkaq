import { getPageMarkdownUrl, getLLMText, source } from '@/lib/source';
import { isAppLocale } from '@/lib/i18n';
import { notFound } from 'next/navigation';

export const revalidate = false;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ locale: string; slug?: string[] }> }
) {
  const { locale, slug } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  const page = source.getPage(slug?.slice(0, -1), locale);
  if (!page) {
    notFound();
  }

  const body = await getLLMText(page);
  return new Response(body, {
    headers: {
      'Content-Type':
        page.type === 'openapi'
          ? 'application/json; charset=utf-8'
          : 'text/markdown; charset=utf-8'
    }
  });
}

export function generateStaticParams() {
  return source.getPages().map((page) => ({
    locale: page.locale,
    slug: getPageMarkdownUrl(page).segments
  }));
}
