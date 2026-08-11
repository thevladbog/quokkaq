import { test } from '@playwright/test';

test.describe('ticket-station physical/runtime matrix', () => {
  test('is reserved for a paired deterministic station fixture', async () => {
    test.skip(
      !process.env.E2E_TICKET_STATION_FIXTURE,
      'requires a paired deterministic station fixture; physical kiosk acceptance is run separately'
    );
  });
});
