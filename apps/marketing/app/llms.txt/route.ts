import { NextResponse } from 'next/server';

import { marketingAppBaseUrl } from '@/lib/fetch-marketing-subscription-plans';
import { getMetadataBaseUrl } from '@/lib/marketing-site-url';

export function GET() {
  const origin = getMetadataBaseUrl().origin;
  const product = marketingAppBaseUrl();

  const lines = [
    '# QuokkaQ / КвоккаКю',
    '',
    '> Multi-branch queue management: kiosks, staff tools, public displays, and live analytics—bilingual marketing site and product documentation.',
    '',
    '## Public marketing pages',
    '',
    `- English landing: ${origin}/en`,
    `- Russian landing: ${origin}/ru`,
    '',
    '## Product documentation (Nextra)',
    '',
    `- Documentation (EN): ${origin}/en/docs`,
    `- Документация (RU): ${origin}/ru/docs`,
    '',
    '## Legal',
    '',
    `- Privacy Policy (EN): ${origin}/en/privacy`,
    `- Privacy Policy (RU): ${origin}/ru/privacy`,
    `- Terms of Service (EN): ${origin}/en/terms`,
    `- Terms of Service (RU): ${origin}/ru/terms`,
    '',
    '## Machine-readable indices',
    '',
    `- Sitemap: ${origin}/sitemap.xml`,
    `- Robots: ${origin}/robots.txt`,
    ''
  ];

  if (product) {
    lines.push('## Product web application', '', `- Signup / app base URL: ${product}`, '');
  }

  lines.push(
    '## Expanded overview',
    '',
    `For a longer single-file summary intended for LLM context, see: ${origin}/llms-full.txt`,
    ''
  );

  const body = lines.join('\n');

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400'
    }
  });
}
