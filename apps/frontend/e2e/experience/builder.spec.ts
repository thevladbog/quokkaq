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

test('persists a draft and publishes it through the real experience flow', async ({
  page
}) => {
  await installExperienceApiFixtures(page);
  await page.goto('/en/settings/experiences');
  await page.getByRole('button', { name: 'Create experience' }).click();
  await page.locator('label').filter({ hasText: 'iPad 10.9 portrait' }).click();
  await page.getByRole('button', { name: 'Create experience' }).last().click();

  page.once('dialog', (dialog) => dialog.accept('Start renamed'));
  await page.getByRole('button', { name: 'Open Start actions' }).click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  const saveResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' &&
      response.url().includes('/screen-layout-templates/e2e-ticket-station')
  );
  await page.getByRole('button', { name: 'Save draft' }).click();
  expect((await saveResponse).status()).toBe(200);

  await page
    .getByRole('button', { name: /^Publish$/ })
    .first()
    .click();
  const publishResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response
        .url()
        .endsWith('/screen-layout-templates/e2e-ticket-station/publish')
  );
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^Publish$/ })
    .click();
  expect((await publishResponse).status()).toBe(201);

  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Cancel' })
    .click();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.reload();
  await expect(
    page.getByRole('button', { name: /ticket-station/ })
  ).toBeVisible();
});
