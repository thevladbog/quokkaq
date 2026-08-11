import type { Page } from '@playwright/test';
import type { ModelsScreenLayoutTemplate } from '@/lib/api/generated/auth';

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
  const templates = new Map<string, ModelsScreenLayoutTemplate>();
  const publishedVersions = new Map<
    string,
    {
      id: string;
      templateId: string;
      version: number;
      publishedAt: string;
      definition: unknown;
    }
  >();

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
        body: JSON.stringify([...templates.values()])
      });
      return;
    }
    if (request.method() === 'POST' && request.url().endsWith('/publish')) {
      const templateID = request.url().split('/').at(-2);
      const template = templateID ? templates.get(templateID) : undefined;
      if (!template || !template.id || !template.definition) {
        await route.fulfill({ status: 404, body: '{}' });
        return;
      }
      const version = (publishedVersions.get(template.id)?.version ?? 0) + 1;
      const published = {
        id: `e2e-version-${version}`,
        templateId: template.id,
        version,
        publishedAt: new Date(0).toISOString(),
        definition: template.definition
      };
      publishedVersions.set(template.id, published);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(published)
      });
      return;
    }
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as {
        definition: Record<string, unknown>;
        name: string;
      };
      const template = {
        id: 'e2e-ticket-station',
        name: body.name,
        surface: 'ticket-station',
        definition: body.definition
      } satisfies ModelsScreenLayoutTemplate;
      templates.set(template.id, template);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(template)
      });
      return;
    }
    if (request.method() === 'PUT') {
      const body = request.postDataJSON() as {
        definition: Record<string, unknown>;
      };
      const templateID = request.url().split('/').at(-1);
      const current = templateID ? templates.get(templateID) : undefined;
      if (!current || !templateID) {
        await route.fulfill({ status: 404, body: '{}' });
        return;
      }
      const template = { ...current, definition: body.definition };
      templates.set(templateID, template);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(template)
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
