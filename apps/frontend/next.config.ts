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
  },
  async redirects() {
    return [
      {
        source: '/:locale/admin/pre-registrations/:unitId',
        destination: '/:locale/pre-registrations/:unitId',
        permanent: true
      },
      {
        source: '/:locale/admin/pre-registrations',
        destination: '/:locale/pre-registrations',
        permanent: true
      },
      {
        source: '/:locale/admin',
        destination: '/:locale/settings',
        permanent: true
      },
      {
        source: '/:locale/admin/:path*',
        destination: '/:locale/settings/:path*',
        permanent: true
      },
      {
        source: '/:locale/organization',
        destination: '/:locale/settings/organization',
        permanent: true
      },
      {
        source: '/:locale/organization/:path*',
        destination: '/:locale/settings/organization/:path*',
        permanent: true
      },
      {
        source: '/:locale/pricing',
        destination: '/:locale/settings/pricing',
        permanent: true
      },
      {
        source: '/:locale/workstations',
        destination: '/:locale/staff',
        permanent: true
      }
    ];
  }
  // API is proxied by app/api/[[...path]]/route.ts (reliable with Turbopack; rewrites alone were flaky).
};

export default withNextIntl(nextConfig);
