import { KioskAccessibilityProvider } from '@/contexts/kiosk-accessibility-context';

export default function KioskUnitLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return <KioskAccessibilityProvider>{children}</KioskAccessibilityProvider>;
}
