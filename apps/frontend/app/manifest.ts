import type { MetadataRoute } from 'next';

/** PWA manifest for “Add to home screen” on /ticket and /queue visitor flows. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'QuokkaQ',
    short_name: 'QuokkaQ',
    description: 'Queue, tickets, and live wait updates',
    start_url: '/',
    display: 'standalone',
    background_color: '#0f172a',
    theme_color: '#0f172a',
    lang: 'en',
    scope: '/',
    orientation: 'portrait-primary',
    categories: ['business', 'productivity'],
    icons: [
      {
        src: '/logo-circle.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/logo-circle.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable'
      }
    ]
  };
}
