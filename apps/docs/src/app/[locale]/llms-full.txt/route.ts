import { getLLMText, source } from '@/lib/source';
import { isAppLocale } from '@/lib/i18n';
import { notFound } from 'next/navigation';

export const revalidate = false;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ locale: string }> }
) {
  const { locale } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  const scan = source.getPages(locale).map((p) => getLLMText(p));
  const scanned = await Promise.all(scan);
  return new Response(scanned.join('\n\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}
