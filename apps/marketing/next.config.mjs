import nextra from 'nextra';

const withNextra = nextra({
  contentDirBasePath: '/docs'
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  /**
   * Consumed by Nextra (`withNextra`) to set `NEXTRA_*` env for `nextra/locales`
   * proxy — must match app routes under `app/[locale]/` and `src/messages.ts` `locales`.
   * Nextra clears `nextConfig.i18n` on output; Next.js does not enable legacy i18n routing.
   */
  i18n: {
    locales: ['en', 'ru'],
    defaultLocale: 'en'
  }
};

export default withNextra(nextConfig);
