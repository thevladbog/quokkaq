import { NextResponse } from 'next/server';

import { marketingAppBaseUrl } from '@/lib/fetch-marketing-subscription-plans';
import { getMetadataBaseUrl } from '@/lib/marketing-site-url';
import { messages } from '@/src/messages';

export function GET() {
  const origin = getMetadataBaseUrl().origin;
  const product = marketingAppBaseUrl();
  const en = messages.en.home;
  const ru = messages.ru.home;

  const sections = [
    '# QuokkaQ — expanded context for AI systems',
    '',
    'This file is a compact overview of the public marketing site. Prefer linked URLs for authoritative, up-to-date content.',
    '',
    `Canonical marketing origin: ${origin}`,
    '',
    '---',
    '',
    '## English',
    '',
    `**Product name:** QuokkaQ`,
    '',
    `**Positioning:** ${en.title}`,
    '',
    `**Summary:** ${en.description}`,
    '',
    '---',
    '',
    '## Russian / Русский',
    '',
    `**Название:** КвоккаКю`,
    '',
    `**Позиционирование:** ${ru.title}`,
    '',
    `**Кратко:** ${ru.description}`,
    '',
    '---',
    '',
    '## Where to read more',
    '',
    `- Marketing (EN): ${origin}/en`,
    `- Маркетинг (RU): ${origin}/ru`,
    `- Docs (EN): ${origin}/en/docs`,
    `- Документация (RU): ${origin}/ru/docs`
  ];

  if (product) {
    sections.push('', `- Product app URL: ${product}`);
  }

  sections.push('', '');

  const body = sections.join('\n');

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400'
    }
  });
}
