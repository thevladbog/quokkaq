import { loginAsSeededAdmin } from './helpers/loginAsSeededAdmin';

describe('Auth locale RU (E2E)', () => {
  it('logs in from Russian login page', async ({ browser }) => {
    await loginAsSeededAdmin(browser, { locale: 'ru' });
  });
});
