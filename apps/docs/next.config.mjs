import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // Bare `/docs/...` has no `app` route (pages live under `/[locale]/docs/...`). `hideLocale: 'never'`.
  // `destination` must stay aligned with `defaultLanguage` in `src/lib/i18n.ts` (en).
  // Prefer config redirects over `proxy` for this — https://nextjs.org/docs/app/getting-started/proxy
  async redirects() {
    return [
      { source: '/docs', destination: '/en/docs', permanent: true },
      { source: '/docs/:path*', destination: '/en/docs/:path*', permanent: true }
    ];
  }
};

export default withMDX(config);
