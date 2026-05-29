import { isAppLocale } from '@/lib/i18n';
import { notFound } from 'next/navigation';
import { source } from '@/lib/source';
import { llms } from 'fumadocs-core/source';

export const revalidate = false;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ locale: string }> }
) {
  const { locale } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  return new Response(llms(source).index(locale), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}
