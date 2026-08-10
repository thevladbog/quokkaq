import type { DeviceProfile } from '@quokkaq/shared-types';

/** Hardware dimensions are reusable profile data, never a surface classification. */
export const EXPERIENCE_DEVICE_PROFILES = {
  ipadPortrait: {
    id: 'ipad-10-9-portrait',
    name: 'iPad 10.9 portrait',
    width: 820,
    height: 1180,
    interactionMode: 'touch',
    viewingDistance: 'near',
    safeArea: { top: 24, right: 24, bottom: 24, left: 24 }
  },
  ipadLandscape: {
    id: 'ipad-10-9-landscape',
    name: 'iPad 10.9 landscape',
    width: 1180,
    height: 820,
    interactionMode: 'touch',
    viewingDistance: 'near',
    safeArea: { top: 24, right: 24, bottom: 24, left: 24 }
  },
  kioskPortrait: {
    id: 'kiosk-1080x1920',
    name: 'Kiosk 1080×1920',
    width: 1080,
    height: 1920,
    interactionMode: 'touch',
    viewingDistance: 'standing',
    safeArea: { top: 0, right: 0, bottom: 0, left: 0 }
  },
  kioskLandscape: {
    id: 'kiosk-1920x1080',
    name: 'Kiosk 1920×1080',
    width: 1920,
    height: 1080,
    interactionMode: 'touch',
    viewingDistance: 'standing',
    safeArea: { top: 0, right: 0, bottom: 0, left: 0 }
  },
  signagePortrait: {
    id: 'signage-1080x1920',
    name: 'Signage 1080×1920',
    width: 1080,
    height: 1920,
    interactionMode: 'non-touch',
    viewingDistance: 'far',
    safeArea: { top: 0, right: 0, bottom: 0, left: 0 }
  },
  signageLandscape: {
    id: 'signage-1920x1080',
    name: 'Signage 1920×1080',
    width: 1920,
    height: 1080,
    interactionMode: 'non-touch',
    viewingDistance: 'far',
    safeArea: { top: 0, right: 0, bottom: 0, left: 0 }
  }
} satisfies Record<string, DeviceProfile>;
