'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';

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
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/system/status`
        );
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
