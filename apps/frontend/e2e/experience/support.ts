import type { Page } from '@playwright/test';

export const stationTemplate = {
  schemaVersion: 1,
  id: 'e2e-ticket-station',
  surface: 'ticket-station',
  startPageId: 'start',
  variants: [
    {
      id: 'portrait',
      profile: {
        id: 'ipad-10-9-portrait',
        name: 'iPad 10.9 portrait',
        width: 820,
        height: 1180,
        interactionMode: 'touch',
        viewingDistance: 'near',
        safeArea: { top: 24, right: 24, bottom: 24, left: 24 }
      },
      grid: { columns: 12, rows: 18 }
    }
  ],
  pages: [
    {
      id: 'start',
      name: 'Start',
      widgets: [],
      layouts: { portrait: { placements: {} } }
    }
  ]
} as const;

export async function installExperienceApiFixtures(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('access_token', 'e2e-access-token');
  });

  await page.route('**/api/system/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ initialized: true })
    });
  });

  await page.route('**/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'e2e-user',
        name: 'E2E Admin',
        email: 'e2e@example.test',
        isActive: true,
        roles: ['admin'],
        unitIds: []
      })
    });
  });

  const templateRoute = async (
    route: Parameters<Parameters<Page['route']>[1]>[0]
  ) => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
      return;
    }
    if (request.method() === 'POST' && request.url().endsWith('/publish')) {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'e2e-version-1',
          templateId: 'e2e-ticket-station',
          version: 1,
          publishedAt: new Date(0).toISOString(),
          definition: stationTemplate
        })
      });
      return;
    }
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as {
        definition: object;
        name: string;
      };
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'e2e-ticket-station',
          name: body.name,
          surface: 'ticket-station',
          definition: body.definition
        })
      });
      return;
    }
    if (request.method() === 'PUT') {
      const body = request.postDataJSON() as { definition: object };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'e2e-ticket-station',
          name: 'e2e-ticket-station',
          surface: 'ticket-station',
          definition: body.definition
        })
      });
      return;
    }
    await route.fulfill({ status: 404, body: '{}' });
  };

  await page.route(
    '**/api/companies/me/screen-layout-templates**',
    templateRoute
  );
  await page.route('**/companies/me/screen-layout-templates**', templateRoute);
}
