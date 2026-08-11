import { expect, test } from '@playwright/test';

import { installTicketStationApiFixtures } from './support';

test.describe('ticket-station browser acceptance', () => {
  test('renders the assigned service picker on the kiosk route', async ({
    page
  }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await installTicketStationApiFixtures(page);
    await page.goto('/en/kiosk/kiosk-unit');

    await expect(page.getByTestId('service-picker')).toBeVisible();
    await expect(page.getByTestId('service-picker-option')).toContainText(
      'General service'
    );
    await expect(page.getByTestId('service-picker')).toHaveAttribute(
      'data-layout',
      'portrait'
    );
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(820);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollHeight))
      .toBeLessThanOrEqual(1180);
  });
});
