import { expect, test } from '@playwright/test';

import { installExperienceApiFixtures } from './support';

test('creates a ticket-station experience and opens its real builder route', async ({
  page
}) => {
  await installExperienceApiFixtures(page);
  await page.goto('/en/settings/experiences');

  await page.getByRole('button', { name: 'Create experience' }).click();
  await page.locator('label').filter({ hasText: 'iPad 10.9 portrait' }).click();
  await page.getByRole('button', { name: 'Create experience' }).last().click();

  await expect(
    page.getByRole('main', { name: 'Experience builder' })
  ).toBeVisible();
  await expect(page.getByText('Ticket station')).toBeVisible();
  await expect(
    page.getByText('iPad 10.9 portrait', { exact: true })
  ).toBeVisible();
});

test('keeps the builder viewport bounded at the desktop acceptance size', async ({
  page
}) => {
  await installExperienceApiFixtures(page);
  await page.goto('/en/settings/experiences');
  await page.getByRole('button', { name: 'Create experience' }).click();
  await page.locator('label').filter({ hasText: 'iPad 10.9 portrait' }).click();
  await page.getByRole('button', { name: 'Create experience' }).last().click();

  const result = await page.locator('body').evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight
  }));
  expect(result.scrollWidth).toBeLessThanOrEqual(result.clientWidth);
  expect(result.scrollHeight).toBeLessThanOrEqual(result.clientHeight);
});
