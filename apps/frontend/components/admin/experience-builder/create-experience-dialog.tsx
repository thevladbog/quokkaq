'use client';

import { useMemo, useState } from 'react';
import {
  type DeviceProfile,
  type ExperienceSurface,
  type ExperienceTemplate
} from '@quokkaq/shared-types';
import { Check, MonitorSmartphone, Ticket, UsersRound } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { EXPERIENCE_DEVICE_PROFILES } from '@/lib/experience/device-profiles';

export type ExperienceProfilePreset = DeviceProfile & {
  supportedSurfaces: readonly ExperienceSurface[];
};

export const EXPERIENCE_PROFILE_PRESETS: readonly ExperienceProfilePreset[] = [
  {
    ...EXPERIENCE_DEVICE_PROFILES.ipadPortrait,
    supportedSurfaces: ['ticket-station', 'visitor-mobile']
  },
  {
    ...EXPERIENCE_DEVICE_PROFILES.ipadLandscape,
    supportedSurfaces: ['ticket-station', 'visitor-mobile']
  },
  {
    ...EXPERIENCE_DEVICE_PROFILES.kioskPortrait,
    supportedSurfaces: ['ticket-station']
  },
  {
    ...EXPERIENCE_DEVICE_PROFILES.signageLandscape,
    supportedSurfaces: ['queue-display', 'counter-display']
  }
];

const SURFACES: ReadonlyArray<{
  id: ExperienceSurface;
  icon: typeof Ticket;
  titleKey: string;
  descriptionKey: string;
  title: string;
  description: string;
}> = [
  {
    id: 'ticket-station',
    icon: Ticket,
    titleKey: 'create.surfaces.ticketStation.title',
    descriptionKey: 'create.surfaces.ticketStation.description',
    title: 'Ticket station',
    description: 'Touch-first ticket and identity flows.'
  },
  {
    id: 'queue-display',
    icon: MonitorSmartphone,
    titleKey: 'create.surfaces.queueDisplay.title',
    descriptionKey: 'create.surfaces.queueDisplay.description',
    title: 'Queue display',
    description: 'Public queue calls and operational information.'
  },
  {
    id: 'counter-display',
    icon: MonitorSmartphone,
    titleKey: 'create.surfaces.counterDisplay.title',
    descriptionKey: 'create.surfaces.counterDisplay.description',
    title: 'Counter display',
    description: 'Focused information at a service counter.'
  },
  {
    id: 'visitor-mobile',
    icon: UsersRound,
    titleKey: 'create.surfaces.visitorMobile.title',
    descriptionKey: 'create.surfaces.visitorMobile.description',
    title: 'Visitor mobile',
    description: 'A responsive experience for a visitor device.'
  }
];

function safeDraftId(surface: ExperienceSurface): string {
  const suffix =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `experience-${surface}-${suffix}`;
}

function variantId(profile: DeviceProfile): string {
  return profile.width < profile.height ? 'portrait' : 'landscape';
}

function gridFor(profile: DeviceProfile): { columns: number; rows: number } {
  return profile.width < profile.height
    ? { columns: 12, rows: 18 }
    : { columns: 18, rows: 12 };
}

function canonicalDeviceProfile(profile: DeviceProfile): DeviceProfile {
  return {
    id: profile.id,
    name: profile.name,
    width: profile.width,
    height: profile.height,
    interactionMode: profile.interactionMode,
    viewingDistance: profile.viewingDistance,
    safeArea: { ...profile.safeArea }
  };
}

function isExactProfile(
  profile: DeviceProfile,
  surface: ExperienceSurface
): boolean {
  return EXPERIENCE_PROFILE_PRESETS.some(
    (preset) =>
      preset.id === profile.id &&
      preset.supportedSurfaces.includes(surface) &&
      preset.name === profile.name &&
      preset.width === profile.width &&
      preset.height === profile.height &&
      preset.interactionMode === profile.interactionMode &&
      preset.viewingDistance === profile.viewingDistance &&
      preset.safeArea.top === profile.safeArea.top &&
      preset.safeArea.right === profile.safeArea.right &&
      preset.safeArea.bottom === profile.safeArea.bottom &&
      preset.safeArea.left === profile.safeArea.left
  );
}

export function createExperienceDraft(
  surface: ExperienceSurface,
  profiles: readonly DeviceProfile[]
): ExperienceTemplate {
  if (profiles.length === 0 || profiles.length > 2) {
    throw new Error('Select one or two device profiles');
  }
  if (new Set(profiles.map((profile) => profile.id)).size !== profiles.length) {
    throw new Error('Device profiles must be unique');
  }
  if (!profiles.every((profile) => isExactProfile(profile, surface))) {
    throw new Error('The device profile is not available for this surface');
  }

  const variants = profiles.map((profile, index) => ({
    id: index === 0 ? variantId(profile) : `${variantId(profile)}-${index + 1}`,
    profile: canonicalDeviceProfile(profile),
    grid: gridFor(profile)
  }));
  const firstVariant = variants[0];
  if (!firstVariant) throw new Error('At least one device profile is required');

  return {
    schemaVersion: 1,
    id: safeDraftId(surface),
    surface,
    startPageId: 'start',
    variants,
    pages: [
      {
        id: 'start',
        name: 'Start',
        widgets: [],
        layouts: Object.fromEntries(
          variants.map((variant) => [variant.id, { placements: {} }])
        )
      }
    ]
  };
}

export type CreateExperienceDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (draft: ExperienceTemplate) => void;
};

export function CreateExperienceDialog({
  open,
  onOpenChange,
  onCreate
}: CreateExperienceDialogProps) {
  const t = useTranslations('experience.builder');
  const [surface, setSurface] = useState<ExperienceSurface>('ticket-station');
  const [profileIds, setProfileIds] = useState<string[]>([]);
  const availableProfiles = useMemo(
    () =>
      EXPERIENCE_PROFILE_PRESETS.filter((profile) =>
        profile.supportedSurfaces.includes(surface)
      ),
    [surface]
  );

  const selectSurface = (nextSurface: ExperienceSurface) => {
    setSurface(nextSurface);
    setProfileIds((current) =>
      current.filter((id) =>
        EXPERIENCE_PROFILE_PRESETS.some(
          (profile) =>
            profile.id === id && profile.supportedSurfaces.includes(nextSurface)
        )
      )
    );
  };

  const toggleProfile = (profileId: string) => {
    setProfileIds((current) =>
      current.includes(profileId)
        ? current.filter((id) => id !== profileId)
        : current.length < 2
          ? [...current, profileId]
          : current
    );
  };

  const selectedProfiles = availableProfiles.filter((profile) =>
    profileIds.includes(profile.id)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-3xl p-0 sm:max-w-3xl' showCloseButton>
        <DialogHeader className='border-b px-6 pt-6 pb-5'>
          <DialogTitle>
            {t('create.title', { default: 'Create experience' })}
          </DialogTitle>
          <DialogDescription>
            {t('create.description', {
              default:
                'Choose the fixed screen role and its real device profiles.'
            })}
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-6 p-6 md:grid-cols-[1fr_1.12fr]'>
          <fieldset className='space-y-3'>
            <legend className='text-sm font-semibold'>
              {t('create.surface', { default: 'Experience surface' })}
            </legend>
            <p className='text-muted-foreground text-xs'>
              {t('create.surfaceHint', {
                default: 'The surface is immutable after creation.'
              })}
            </p>
            <div className='grid gap-2'>
              {SURFACES.map((item) => {
                const Icon = item.icon;
                const selected = surface === item.id;
                const title = t(item.titleKey, { default: item.title });
                const description = t(item.descriptionKey, {
                  default: item.description
                });
                return (
                  <button
                    key={item.id}
                    type='button'
                    role='radio'
                    aria-checked={selected}
                    onClick={() => selectSurface(item.id)}
                    className={cn(
                      'focus-visible:ring-ring flex min-h-14 items-start gap-3 rounded-lg border p-3 text-left outline-none focus-visible:ring-2',
                      selected
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'hover:bg-muted/60 border-border'
                    )}
                  >
                    <Icon className='mt-0.5 size-4 shrink-0' aria-hidden />
                    <span className='min-w-0'>
                      <span className='block text-sm font-medium'>{title}</span>
                      <span className='text-muted-foreground block text-xs leading-5'>
                        {description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
          <fieldset className='space-y-3'>
            <legend className='text-sm font-semibold'>
              {t('create.profiles', { default: 'Device profiles' })}
            </legend>
            <p className='text-muted-foreground text-xs'>
              {t('create.profilesHint', {
                default:
                  'Select one or two concrete profiles. Layout is kept separately for each.'
              })}
            </p>
            <div className='space-y-2'>
              {availableProfiles.map((profile) => {
                const checked = profileIds.includes(profile.id);
                return (
                  <label
                    key={profile.id}
                    className={cn(
                      'focus-within:ring-ring flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border p-3 focus-within:ring-2',
                      checked
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted/60 border-border'
                    )}
                  >
                    <input
                      type='checkbox'
                      className='sr-only'
                      checked={checked}
                      onChange={() => toggleProfile(profile.id)}
                      aria-label={profile.name}
                    />
                    <span
                      className={cn(
                        'flex size-5 shrink-0 items-center justify-center rounded border',
                        checked
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input bg-background'
                      )}
                      aria-hidden
                    >
                      {checked ? <Check className='size-3' /> : null}
                    </span>
                    <span className='min-w-0'>
                      <span className='block text-sm font-medium'>
                        {profile.name}
                      </span>
                      <span className='text-muted-foreground block text-xs'>
                        {profile.width}×{profile.height} ·{' '}
                        {profile.interactionMode}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        </div>
        <DialogFooter className='border-t px-6 py-4'>
          <Button
            type='button'
            variant='outline'
            className='min-h-11'
            onClick={() => onOpenChange(false)}
          >
            {t('common.cancel', { default: 'Cancel' })}
          </Button>
          <Button
            type='button'
            className='min-h-11'
            disabled={selectedProfiles.length === 0}
            onClick={() => {
              onCreate(createExperienceDraft(surface, selectedProfiles));
              onOpenChange(false);
            }}
          >
            {t('create.submit', { default: 'Create experience' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
