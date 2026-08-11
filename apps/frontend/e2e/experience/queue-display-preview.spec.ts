import { test } from '@playwright/test';

test.describe('queue-display preview matrix', () => {
  test('is reserved until the queue-display preview host is routed', async () => {
    test.skip(
      !process.env.E2E_QUEUE_DISPLAY_FIXTURE,
      'queue-display live route is explicitly deferred; preview fixture is not routed yet'
    );
  });
});
