import type { Page } from '@playwright/test';
import type { ModelsScreenLayoutTemplate } from '@/lib/api/generated/auth';
import type { ExperienceTemplate } from '@quokkaq/shared-types';

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

export type QueueDisplayFixtureMode = 'experience' | 'legacy' | 'invalid';

export const queueDisplayTemplate: ExperienceTemplate = {
  schemaVersion: 1,
  id: 'e2e-queue-display',
  surface: 'queue-display',
  startPageId: 'queue',
  variants: [
    {
      id: 'landscape',
      profile: {
        id: 'e2e-landscape',
        name: 'Landscape display',
        width: 1920,
        height: 1080,
        interactionMode: 'non-touch',
        viewingDistance: 'far',
        safeArea: { top: 24, right: 24, bottom: 24, left: 24 }
      },
      grid: { columns: 12, rows: 8 }
    },
    {
      id: 'portrait',
      profile: {
        id: 'e2e-portrait',
        name: 'Portrait display',
        width: 1080,
        height: 1920,
        interactionMode: 'non-touch',
        viewingDistance: 'far',
        safeArea: { top: 24, right: 24, bottom: 24, left: 24 }
      },
      grid: { columns: 8, rows: 12 }
    }
  ],
  pages: [
    {
      id: 'queue',
      name: 'Queue',
      widgets: [
        { id: 'calls', type: 'called-tickets', config: {}, actions: [] }
      ],
      layouts: {
        landscape: {
          placements: {
            calls: { col: 1, row: 1, colSpan: 12, rowSpan: 8 }
          }
        },
        portrait: {
          placements: {
            calls: { col: 1, row: 1, colSpan: 8, rowSpan: 12 }
          }
        }
      }
    }
  ]
};

export async function installQueueDisplayApiFixtures(
  page: Page,
  mode: QueueDisplayFixtureMode = 'experience'
) {
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

  await page.route(
    '**/units/queue-unit/queue-display-experience**',
    async (route) => {
      const profile = new URL(route.request().url()).searchParams.get(
        'profile'
      );
      if (mode === 'legacy') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ mode: 'legacy' })
        });
        return;
      }
      if (mode === 'invalid') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            mode: 'experience',
            definition: { invalid: true }
          })
        });
        return;
      }
      const variantId = profile === 'portrait' ? 'portrait' : 'landscape';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          mode: 'experience',
          templateId: queueDisplayTemplate.id,
          versionId: 'e2e-queue-version-1',
          version: 1,
          variantId,
          definition: queueDisplayTemplate,
          publishedAt: '2026-01-01T00:00:00Z'
        })
      });
    }
  );

  await page.route('**/units/queue-unit', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'queue-unit',
        name: 'Main hall',
        nameEn: 'Main hall',
        code: 'MAIN',
        companyId: 'e2e-company',
        kind: 'subdivision',
        timezone: 'Europe/Moscow',
        config: {}
      })
    });
  });
  await page.route('**/units/queue-unit/tickets**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'ticket-a039',
          queueNumber: 'A-039',
          unitId: 'queue-unit',
          serviceId: 'service-1',
          status: 'called',
          calledAt: '2026-01-01T12:00:00Z',
          counter: { id: 'counter-1', name: 'Window 1' }
        }
      ])
    });
  });
  await page.route('**/units/queue-unit/queue-status**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        queueLength: 4,
        estimatedWaitMinutes: 12,
        maxWaitingInQueueMinutes: 18,
        activeCounters: 2,
        servedToday: 27,
        services: []
      })
    });
  });
  await page.route('**/units/queue-unit/materials**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '[]'
    });
  });
  await page.route('**/units/queue-unit/active-playlist**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ source: 'none' })
    });
  });
  await page.route(
    '**/units/queue-unit/public-screen-announcements**',
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '[]'
      });
    }
  );
}
