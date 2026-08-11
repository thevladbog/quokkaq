'use client';

import { useMemo, type ReactNode } from 'react';
import { useLocale } from 'next-intl';
import type { Ticket, Unit } from '@/lib/api';
import { getUnitDisplayName } from '@/lib/unit-display';
import { formatAppTime } from '@/lib/format-datetime';
import {
  ExperienceRenderer,
  type ExperienceRuntimeContext
} from '@/components/experience/experience-renderer';
import type { QueueDisplayCall } from '@/components/experience/experience-widget-registry';
import { useQueueDisplayExperience } from '@/lib/experience/use-queue-display-experience';

interface QueueDisplayExperienceRuntimeProps {
  unitId: string;
  unit: Unit;
  calledTickets: Ticket[];
  currentTime: Date;
  legacy: ReactNode;
}

function toCall(ticket: Ticket): QueueDisplayCall {
  return {
    id: ticket.id,
    queueNumber: ticket.queueNumber,
    counterName: ticket.counter?.name?.trim() || '—'
  };
}

export function QueueDisplayExperienceRuntime({
  unitId,
  unit,
  calledTickets,
  currentTime,
  legacy
}: QueueDisplayExperienceRuntimeProps) {
  const locale = useLocale();
  const manifest = useQueueDisplayExperience(unitId);

  const runtimeContext = useMemo<ExperienceRuntimeContext>(() => {
    const calls = calledTickets.map(toCall);
    const display = {
      unitName: getUnitDisplayName(unit, locale),
      nowLabel: formatAppTime(currentTime, locale),
      primaryCall: calls[0],
      recentCalls: calls.slice(1)
    };
    return {
      identity: { isAuthenticated: false, isEmployee: false },
      live: { isConnected: true, isOpen: true, queueLength: 0 },
      display
    };
  }, [calledTickets, currentTime, locale, unit]);

  if (manifest.isPending || manifest.data?.kind !== 'experience') {
    return <>{legacy}</>;
  }

  return (
    <ExperienceRenderer
      template={manifest.data.template}
      variantId={manifest.data.variantId}
      runtimeContext={runtimeContext}
      adapters={{}}
      mode='deployed'
    />
  );
}
