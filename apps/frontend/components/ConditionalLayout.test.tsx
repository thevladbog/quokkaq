import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/ui/sidebar', () => ({ SidebarProvider: 'div' }));
vi.mock('@/components/SidebarInsetShell', () => ({
  SidebarInsetShell: 'main'
}));
vi.mock('@/components/AppSidebar', () => ({ default: 'aside' }));
vi.mock('@/components/PlatformSidebar', () => ({ default: 'aside' }));
vi.mock('@/components/SettingsSidebar', () => ({ default: 'aside' }));
vi.mock('@/components/ProtectedSidebarLayout', () => ({ default: 'main' }));
vi.mock('next/image', () => ({ default: 'img' }));

import {
  isStaffWorkstationPath,
  STAFF_WORKSTATION_CONTENT_CLASS
} from './ConditionalLayout';

describe('isStaffWorkstationPath', () => {
  it.each([
    { path: '/staff/unit-1/counter-2', expected: true },
    { path: '/staff', expected: false },
    { path: '/staff/support', expected: false },
    { path: '/staff/support/example-id', expected: false },
    { path: '/staff/unit-1', expected: false },
    { path: '/staff/unit-1/counter-2/details', expected: false }
  ])('returns $expected for $path', ({ path, expected }) => {
    expect(isStaffWorkstationPath(path)).toBe(expected);
  });

  it('starts fixed-height workstation behavior at the desktop acceptance width', () => {
    expect(STAFF_WORKSTATION_CONTENT_CLASS).toBe(
      'min-[1366px]:h-dvh min-[1366px]:min-h-0 min-[1366px]:overflow-hidden min-[1366px]:p-3'
    );
  });
});
