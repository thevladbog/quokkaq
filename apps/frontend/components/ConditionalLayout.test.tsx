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

import { isStaffWorkstationPath } from './ConditionalLayout';

describe('isStaffWorkstationPath', () => {
  it.each([
    ['/staff/unit-1/counter-2', true],
    ['/staff', false],
    ['/staff/support', false],
    ['/staff/support/example-id', false],
    ['/staff/unit-1', false],
    ['/staff/unit-1/counter-2/details', false]
  ])('returns %s for %s', (path, expected) => {
    expect(isStaffWorkstationPath(path)).toBe(expected);
  });
});
