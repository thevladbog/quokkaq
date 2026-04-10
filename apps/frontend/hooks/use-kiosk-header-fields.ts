'use client';

import { useState } from 'react';
import type { KioskConfig } from '@quokkaq/shared-types';

/** Shared kiosk header (unit title) state + save payload for admin sheet and full settings. */
export function useKioskHeaderFields(kiosk: KioskConfig | undefined | null) {
  const [showUnitInHeader, setShowUnitInHeader] = useState(
    () => kiosk?.showUnitInHeader !== false
  );
  const [kioskUnitLabelText, setKioskUnitLabelText] = useState(
    () => kiosk?.kioskUnitLabelText ?? ''
  );

  const headerKioskSaveFields = (): Pick<
    KioskConfig,
    'showUnitInHeader' | 'kioskUnitLabelText'
  > => ({
    showUnitInHeader,
    kioskUnitLabelText: kioskUnitLabelText.trim() || undefined
  });

  return {
    showUnitInHeader,
    setShowUnitInHeader,
    kioskUnitLabelText,
    setKioskUnitLabelText,
    headerKioskSaveFields
  };
}
