import { loginAsSeededAdmin } from './helpers/loginAsSeededAdmin';

describe('Auth (E2E)', () => {
  it('logs in with seeded admin and shows home', async ({ browser }) => {
    await loginAsSeededAdmin(browser);
  });
});
