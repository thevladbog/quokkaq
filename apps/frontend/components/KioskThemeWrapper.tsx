'use client';

import { ReactNode, useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';

export default function KioskThemeWrapper({
  children
}: {
  children: ReactNode;
}) {
  const { theme, setTheme } = useTheme();
  const previousTheme = useRef<string | undefined>(undefined);

  useEffect(() => {
    // Store the current theme before overriding
    previousTheme.current = theme;

    // Force light theme in kiosk
    setTheme('light');

    // Restore previous theme when leaving kiosk
    return () => {
      if (previousTheme.current) {
        setTheme(previousTheme.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className='light'>{children}</div>;
}
