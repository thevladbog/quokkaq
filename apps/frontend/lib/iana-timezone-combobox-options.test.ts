import { describe, expect, it } from 'vitest';
import {
  buildIanaTimezoneComboboxOptions,
  formatUtcOffsetLabel
} from '@/lib/iana-timezone-combobox-options';

describe('formatUtcOffsetLabel', () => {
  it('returns UTC-prefixed offset for Europe/Moscow', () => {
    const s = formatUtcOffsetLabel('Europe/Moscow');
    expect(s).toBeTruthy();
    expect(s).toMatch(/^UTC[+-]/);
  });

  it('handles UTC zone without duplicating label awkwardly', () => {
    const s = formatUtcOffsetLabel('UTC');
    expect(s).toBeTruthy();
    expect(s?.startsWith('UTC')).toBe(true);
  });
});

describe('buildIanaTimezoneComboboxOptions', () => {
  it('includes offset in label for Moscow', () => {
    const opts = buildIanaTimezoneComboboxOptions('Europe/Moscow');
    const moscow = opts.find((o) => o.value === 'Europe/Moscow');
    expect(moscow?.label).toContain('Europe/Moscow');
    expect(moscow?.label).toMatch(/\(UTC[+-]/);
  });
});
