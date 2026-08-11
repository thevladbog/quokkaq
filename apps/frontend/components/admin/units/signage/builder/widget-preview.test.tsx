import { describe, expect, it } from 'vitest';
import { widgetShortLabel } from './widget-preview';

const defaultTranslator = (key: string, values?: { default: string }) =>
  values?.default ?? key;

describe('widgetShortLabel composable widget compatibility', () => {
  it.each([
    ['service-picker', 'Service picker'],
    ['rich-info', 'Rich information'],
    ['ticket-form', 'Ticket form'],
    ['identify', 'Identification'],
    ['language-switch', 'Language switch'],
    ['ticket-success', 'Ticket success'],
    ['media', 'Media']
  ] as const)('provides a human-readable default for %s', (type, expected) => {
    expect(widgetShortLabel(defaultTranslator, type)).toBe(expected);
  });
});
