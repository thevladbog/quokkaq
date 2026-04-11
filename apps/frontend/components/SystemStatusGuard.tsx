'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from '@/src/i18n/navigation';

export default function SystemStatusGuard({
  children
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkStatus = async () => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      try {
        // Same-origin /api/* is proxied by app/api/[[...path]]/route.ts. Avoids browser
        // cross-origin fetches to backend:3001 in Docker E2E (Chromium local-network / CORS issues).
        const res = await fetch('/api/system/status', { signal: ctrl.signal });
        if (!res.ok) {
          // If status check fails, assume initialized to avoid locking out,
          // or handle error appropriately. For now, just proceed.
          setLoading(false);
          return;
        }
        const data = await res.json();
        const isInitialized = data.initialized;
        const isSetupPage = pathname.includes('/setup');

        if (!isInitialized && !isSetupPage) {
          router.push('/setup');
        } else if (isInitialized && isSetupPage) {
          router.push('/login');
        } else {
          setLoading(false);
        }
      } catch (error) {
        console.error('Failed to check system status:', error);
        setLoading(false);
      } finally {
        clearTimeout(t);
      }
    };

    checkStatus();
  }, [pathname, router]);

  if (loading) {
    // You might want a loading spinner here
    return null;
  }

  return <>{children}</>;
}
