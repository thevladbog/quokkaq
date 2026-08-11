import { expect, test } from '@playwright/test';

import {
  installQueueDisplayApiFixtures,
  type QueueDisplayFixtureMode
} from './support';

test.describe('queue-display experience acceptance', () => {
  for (const [profile, viewport] of [
    ['landscape', { width: 1920, height: 1080 }],
    ['portrait', { width: 1080, height: 1920 }]
  ] as const) {
    test(`renders the assigned experience in ${profile}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await installQueueDisplayApiFixtures(page);
      await page.goto('/en/screen/queue-unit');

      await expect(page.getByTestId('queue-display-calls')).toBeVisible();
      await expect(page.getByTestId('primary-called-ticket')).toContainText(
        'A-039'
      );
      await expect(page.getByText('Main hall')).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(viewport.width);
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollHeight))
        .toBeLessThanOrEqual(viewport.height);
    });
  }

  for (const mode of ['legacy', 'invalid'] as QueueDisplayFixtureMode[]) {
    test(`keeps the legacy screen usable for ${mode} manifest`, async ({
      page
    }) => {
      await page.setViewportSize({ width: 1180, height: 820 });
      await installQueueDisplayApiFixtures(page, mode);
      await page.goto('/en/screen/queue-unit');

      await expect(page.getByTestId('queue-display-calls')).toHaveCount(0);
      await expect(page.getByText('A-039', { exact: true })).toBeVisible();
    });
  }
});
