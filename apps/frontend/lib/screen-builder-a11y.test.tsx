import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

/**
 * Smoke a11y check for patterns used in the screen template builder (status
 * region, separator, etc.). Not a full page test.
 */
describe('screen builder a11y patterns', () => {
  it('status + live region markup has no serious axe violations', async () => {
    const { container } = render(
      <div>
        <div className='sr-only' role='status' aria-live='polite'>
          Layout updated
        </div>
        <div
          role='slider'
          tabIndex={0}
          aria-orientation='vertical'
          aria-label='Resize'
          aria-valuemin={280}
          aria-valuemax={640}
          aria-valuenow={400}
        />
      </div>
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
