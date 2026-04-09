import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  /* config options here */
  output: 'standalone',
  typedRoutes: false, // Updated to use new property name
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '9000',
        pathname: '/**'
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
        port: '9000',
        pathname: '/**'
      }
    ]
  }
  // API is proxied by app/api/[[...path]]/route.ts (reliable with Turbopack; rewrites alone were flaky).
};

export default withNextIntl(nextConfig);
