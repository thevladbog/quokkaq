'use client';

import { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import StaffWorkstationDirectory from '@/components/staff/StaffWorkstationDirectory';
import { useAuthContext } from '@/contexts/AuthContext';
import { useActiveUnit } from '@/contexts/ActiveUnitContext';
import { isTenantSystemAdminSlug } from '@/lib/tenant-roles';

function StaffSelectionInner() {
  const searchParams = useSearchParams();
  const { user } = useAuthContext();
  const { activeUnitId, assignableUnitIds } = useActiveUnit();

  const restrictUnitId = useMemo(() => {
    const uid = searchParams.get('unitId')?.trim();
    if (uid && user?.units?.length) {
      const allowed = user.units.some(
        (u: { unitId: string }) => u.unitId === uid
      );
      if (allowed) return uid;
    }
    if (
      uid &&
      user?.tenantRoles?.some((r) => isTenantSystemAdminSlug(r.slug))
    ) {
      return uid;
    }
    if (activeUnitId && assignableUnitIds.includes(activeUnitId)) {
      return activeUnitId;
    }
    return null;
  }, [
    searchParams,
    user?.units,
    user?.tenantRoles,
    activeUnitId,
    assignableUnitIds
  ]);

  return (
    <div className='container mx-auto max-w-6xl p-4 md:p-6'>
      <StaffWorkstationDirectory restrictUnitId={restrictUnitId} />
    </div>
  );
}

export default function StaffSelectionPage() {
  return (
    <Suspense
      fallback={
        <div className='flex min-h-[40vh] items-center justify-center'>
          <Loader2 className='text-primary h-10 w-10 animate-spin' />
        </div>
      }
    >
      <StaffSelectionInner />
    </Suspense>
  );
}
