import type { Browser } from '@testplane/webdriverio';

export type LoginLocale = 'en' | 'ru';

/**
 * Full login against seeded `seed-simple` admin (admin@quokkaq.com / admin123).
 */
export async function loginAsSeededAdmin(
  browser: Browser,
  options?: { locale?: LoginLocale }
): Promise<void> {
  const locale = options?.locale ?? 'en';
  await browser.url(`/${locale}/login`);

  if (locale === 'ru') {
    const body = await browser.$('body');
    await expect(body).toHaveTextContaining('Вход');
  }

  const email = await browser.$('#email');
  const password = await browser.$('#password');
  await email.setValue('admin@quokkaq.com');
  await password.setValue('admin123');
  const submit = await browser.$('button[type="submit"]');
  await submit.click();

  const adminEntry = await browser.$('a[href*="/admin"]');
  await expect(adminEntry).toBeDisplayed({ wait: 30000 });
}
