import { describe, expect, it } from 'vitest';
import {
  pathWithoutLocale,
  shouldShowOperationalSupportFab
} from '@/lib/operational-support-fab-path';

describe('pathWithoutLocale', () => {
  it.each([
    ['/en/staff', '/staff'],
    ['/ru/staff/support', '/staff/support'],
    ['/en', '/'],
    ['/ru', '/'],
    ['/staff', '/staff'],
    ['/', '/']
  ])('%s -> %s', (input, expected) => {
    expect(pathWithoutLocale(input)).toBe(expected);
  });
});

describe('shouldShowOperationalSupportFab', () => {
  it.each([
    ['/staff/support', true],
    ['/staff', true],
    ['/supervisor/u1', true],
    ['/statistics', true],
    ['/statistics/foo', true],
    ['/journal/x', true],
    ['/clients/x', true],
    ['/pre-registrations', true],
    ['/onboarding', true],
    ['/onboarding/step', true],
    ['/settings', false],
    ['/settings/organization', false],
    ['/settings/units', false],
    ['/platform', false],
    ['/platform/companies', false],
    ['/login', false],
    ['/kiosk', false]
  ])('%s -> %s', (path, expected) => {
    expect(shouldShowOperationalSupportFab(path)).toBe(expected);
  });
});
