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

  test('renders the configured employee identity widget', async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await installTicketStationApiFixtures(page, 'identity');
    await page.goto('/en/kiosk/kiosk-unit');

    await expect(
      page.getByText('Present your access badge to the reader.')
    ).toBeVisible();
  });

  test('unlocks an employee service, collects behavior data, and issues a ticket', async ({
    page
  }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await installTicketStationApiFixtures(page, 'employee-flow');
    await page.goto('/en/kiosk/kiosk-unit');

    const employeeService = page
      .getByRole('button', { name: 'Employee services' })
      .first();
    await expect(employeeService).toBeDisabled();

    const resolveEmployee = page.waitForRequest(
      (request) =>
        request.url().endsWith('/units/kiosk-unit/employee-idp/resolve') &&
        request.method() === 'POST'
    );
    await page.evaluate(() => {
      for (const key of 'badge-employee-1') {
        window.dispatchEvent(
          new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
        );
      }
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          bubbles: true,
          cancelable: true
        })
      );
    });
    await resolveEmployee;
    await expect(employeeService).toBeEnabled();

    await employeeService.click();
    await page.getByLabel('Reason for visit').fill('Access request');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('Ready to issue your ticket.')).toBeVisible();

    const createTicket = page.waitForRequest(
      (request) =>
        request.url().includes('/units/kiosk-unit/tickets') &&
        request.method() === 'POST'
    );
    await expect(
      page
        .getByTestId('rich-info-widget')
        .getByRole('button', { name: 'Continue' })
    ).toBeEnabled();
    await page
      .getByTestId('rich-info-widget')
      .getByRole('button', { name: 'Continue' })
      .click();
    const request = await createTicket;
    expect(request.postDataJSON()).toMatchObject({
      serviceId: 'employee-service',
      kioskIdentifiedUserId: '11111111-1111-4111-8111-111111111111',
      documentsData: { form: { request_reason: 'Access request' } }
    });
    await expect(page.getByText('E-042', { exact: true })).toBeVisible();
  });
});
