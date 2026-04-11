/**
 * Full login against seeded `seed-simple` admin (admin@quokkaq.com / admin123).
 */
export async function loginAsSeededAdmin(browser: {
  url: (path: string) => Promise<void>;
  $: (selector: string) => Promise<{
    setValue: (v: string) => Promise<void>;
    click: () => Promise<void>;
  }>;
}): Promise<void> {
  await browser.url('/en/login');
  const email = await browser.$('#email');
  const password = await browser.$('#password');
  await email.setValue('admin@quokkaq.com');
  await password.setValue('admin123');
  const submit = await browser.$('button[type="submit"]');
  await submit.click();

  const adminEntry = await browser.$('a[href*="/admin"]');
  await expect(adminEntry).toBeDisplayed({ wait: 30000 });
}
