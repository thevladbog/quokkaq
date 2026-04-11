describe('Login visual (E2E)', () => {
  it('login card EN matches snapshot', async ({ browser }) => {
    await browser.url('/en/login');
    const card = await browser.$('[data-testid="e2e-login-card"]');
    await expect(card).toBeDisplayed({ wait: 15000 });
    await card.assertView('login-card-en', {
      screenshotDelay: 400
    });
  });

  it('login card RU matches snapshot', async ({ browser }) => {
    await browser.url('/ru/login');
    const card = await browser.$('[data-testid="e2e-login-card"]');
    await expect(card).toBeDisplayed({ wait: 15000 });
    await card.assertView('login-card-ru', {
      screenshotDelay: 400
    });
  });
});
