import { loginAsSeededAdmin } from './helpers/loginAsSeededAdmin';

describe('Admin dashboard (E2E)', () => {
  it('shows seeded unit after login', async ({ browser }) => {
    await loginAsSeededAdmin(browser);

    await browser.url('/en/admin');

    const heading = await browser.$('h1');
    await expect(heading).toHaveTextContaining('Admin Panel', {
      wait: 20000
    });

    const body = await browser.$('body');
    await expect(body).toHaveTextContaining('MAIN');
    await expect(body).toHaveTextContaining('Main Office');
  });
});
