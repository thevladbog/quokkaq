'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, usePathname } from '@/src/i18n/navigation';

export default function SystemStatusGuard({
  children
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);

  const checkStatus = useCallback(async () => {
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
        void router.push('/setup');
        setLoading(false);
        return;
      }
      if (isInitialized && isSetupPage) {
        void router.push('/login');
        setLoading(false);
        return;
      }
      setLoading(false);
    } catch (error) {
      console.error('Failed to check system status:', error);
      setLoading(false);
    } finally {
      clearTimeout(t);
    }
  }, [pathname, router]);

  useEffect(() => {
    void checkStatus();
  }, [checkStatus]);

  // BFCache restore (e.g. back from an external site): effects may not re-run; `loading` can stay
  // `true` with `return null` and the page stays blank until a full reload.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        void checkStatus();
      }
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, [checkStatus]);

  if (loading) {
    // You might want a loading spinner here
    return null;
  }

  return <>{children}</>;
}
