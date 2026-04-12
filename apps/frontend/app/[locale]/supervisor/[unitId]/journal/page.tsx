'use client';

import { use } from 'react';
import { SupervisorJournalView } from '@/components/supervisor/SupervisorJournalView';

export default function SupervisorJournalPage({
  params
}: {
  params: Promise<{ unitId: string }>;
}) {
  const { unitId } = use(params);
  return <SupervisorJournalView routeUnitId={unitId} />;
}
