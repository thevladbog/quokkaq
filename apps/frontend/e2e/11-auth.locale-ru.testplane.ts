describe('Auth locale RU (E2E)', () => {
  it('logs in from Russian login page', async ({ browser }) => {
    await browser.url('/ru/login');

    const body = await browser.$('body');
    await expect(body).toHaveTextContaining('Вход');

    const email = await browser.$('#email');
    const password = await browser.$('#password');
    await email.setValue('admin@quokkaq.com');
    await password.setValue('admin123');
    const submit = await browser.$('button[type="submit"]');
    await submit.click();

    const adminEntry = await browser.$('a[href*="/admin"]');
    await expect(adminEntry).toBeDisplayed({ wait: 30000 });
  });
});
