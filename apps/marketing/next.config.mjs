import nextra from 'nextra';

const withNextra = nextra({
  contentDirBasePath: '/docs'
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  i18n: {
    locales: ['en', 'ru'],
    defaultLocale: 'en'
  }
};

export default withNextra(nextConfig);
