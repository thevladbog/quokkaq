import Image from 'next/image';
import { CalendarRange, MessageSquare } from 'lucide-react';
import type { SimpleIcon } from 'simple-icons';
import { siGooglecalendar, siOpenid, siTwilio } from 'simple-icons';

import type { LandingIntegrationId } from '@/src/messages';

function SimpleBrandGlyph({ icon }: { icon: SimpleIcon }) {
  return (
    <svg viewBox='0 0 24 24' className='h-6 w-6 shrink-0' aria-hidden>
      <path fill={`#${icon.hex}`} d={icon.path} />
    </svg>
  );
}

export function LandingIntegrationBrandIcon({ id }: { id: LandingIntegrationId }) {
  switch (id) {
    case 'googleCalendar':
      return <SimpleBrandGlyph icon={siGooglecalendar} />;
    case 'twilio':
      return <SimpleBrandGlyph icon={siTwilio} />;
    case 'smsRu':
      return (
        <MessageSquare
          aria-hidden
          className='h-6 w-6 shrink-0 stroke-[#1E88D4] text-[#1E88D4]'
          strokeWidth={2}
        />
      );
    case 'caldav':
      return (
        <CalendarRange
          aria-hidden
          className='h-6 w-6 shrink-0 text-[color:var(--color-text-muted)]'
          strokeWidth={2}
        />
      );
    case 'oidcSaml':
      return <SimpleBrandGlyph icon={siOpenid} />;
    case 'yooKassa':
      return (
        <Image
          src='/logo-yukassa.svg'
          alt=''
          width={96}
          height={64}
          className='h-6 w-auto shrink-0 object-contain object-left'
          unoptimized
        />
      );
  }
}
