import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'jest-axe';

/**
 * Smoke a11y check for patterns used on the kiosk a11y toolbar and related controls.
 */
describe('kiosk a11y patterns', () => {
  it('toolbar-like controls have no serious axe violations', async () => {
    const { container } = render(
      <div>
        <div role='toolbar' aria-label='Accessibility' className='flex gap-2'>
          <button type='button' aria-pressed='false' aria-label='Larger text'>
            A
          </button>
          <button
            type='button'
            aria-pressed='true'
            aria-label='High contrast'
            className='ring-2'
          >
            HC
          </button>
          <button
            type='button'
            aria-pressed='false'
            aria-label='Read aloud off'
          >
            TTS
          </button>
        </div>
        <p id='a11y-desc' className='sr-only'>
          Kiosk accessibility options
        </p>
      </div>
    );
    const results = await axe(container);
    expect(results.violations).toHaveLength(0);
  });
});
