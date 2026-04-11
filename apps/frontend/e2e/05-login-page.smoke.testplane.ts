describe('Login page smoke (E2E)', () => {
  it('renders the sign-in form', async ({ browser }) => {
    await browser.url('/en/login');

    await expect(await browser.$('#email')).toBeDisplayed({ wait: 15000 });
    await expect(await browser.$('#password')).toBeDisplayed();
    await expect(await browser.$('button[type="submit"]')).toHaveTextContaining(
      'Sign in'
    );
  });
});
