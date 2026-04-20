import type { MetadataRoute } from 'next';

import { getMetadataBaseUrl } from '@/lib/marketing-site-url';

const aiAndSearchBots = [
  'GPTBot',
  'ChatGPT-User',
  'ClaudeBot',
  'PerplexityBot',
  'Google-Extended',
  'CCBot'
] as const;

export default function robots(): MetadataRoute.Robots {
  const origin = getMetadataBaseUrl();
  const sitemap = `${origin.origin}/sitemap.xml`;

  const rules: MetadataRoute.Robots['rules'] = [
    ...aiAndSearchBots.map((userAgent) => ({
      userAgent,
      allow: '/'
    })),
    {
      userAgent: '*',
      allow: '/'
    }
  ];

  return {
    rules,
    sitemap
  };
}
