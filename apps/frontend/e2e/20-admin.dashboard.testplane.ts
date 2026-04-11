import { loginAsSeededAdmin } from './helpers/loginAsSeededAdmin';

describe('Admin dashboard (E2E)', () => {
  it('shows seeded unit after login', async ({ browser }) => {
    await loginAsSeededAdmin(browser);

    await browser.url('/en/admin');

    const heading = await browser.$('h1');
    await expect(heading).toHaveTextContaining('Admin Panel', {
      wait: 20000
    });

    const unitsTable = await browser.$('[data-testid="e2e-admin-units-table"]');
    await expect(unitsTable).toBeDisplayed({ wait: 20000 });
    await expect(unitsTable).toHaveTextContaining('MAIN');
    await expect(unitsTable).toHaveTextContaining('Main Office');
  });
});
