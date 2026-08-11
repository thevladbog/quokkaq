'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  fetchQueueDisplayManifest,
  type QueueDisplayProfile,
  type QueueDisplayManifestResult
} from './queue-display-manifest';

function viewportProfile(): QueueDisplayProfile {
  if (typeof window === 'undefined') return 'landscape';
  return window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait';
}

export function useQueueDisplayExperience(unitId: string) {
  const [profile, setProfile] = useState<QueueDisplayProfile>(viewportProfile);

  useEffect(() => {
    const update = () => setProfile(viewportProfile());
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const query = useQuery<QueueDisplayManifestResult>({
    queryKey: ['queue-display-experience', unitId, profile],
    queryFn: () => fetchQueueDisplayManifest(unitId, profile),
    enabled: Boolean(unitId),
    staleTime: 60_000,
    retry: false
  });

  return { profile, ...query };
}
