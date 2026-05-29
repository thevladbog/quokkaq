import { docs } from 'collections/server';
import { loader } from 'fumadocs-core/source';
import { lucideIconsPlugin } from 'fumadocs-core/source/lucide-icons';
import { openapiPlugin, openapiSource } from 'fumadocs-openapi/server';
import { i18n } from '@/lib/i18n';
import { docsContentRoutePrefix, docsImageRoutePrefix } from './shared';
import { buildOpenApiRootOverviewFile } from './openapi-root-overview';
import { openapi, openApiJsonPath } from './openapi';

const openapiData = await openapiSource(openapi, {
  baseDir: 'api',
  meta: true,
  // Folders in the sidebar: `{tag}/…`. `openapi.ts` merges tag definitions in
  // memory from operations so the generated `openapi.json` is never hand-edited.
  groupBy: 'tag'
});

const openApiRootOverview = await buildOpenApiRootOverviewFile(
  openapi,
  openApiJsonPath,
  'api'
);

function patchOpenApiLayoutTabs(
  files: (typeof openapiData)['files']
): (typeof openapiData)['files'] {
  return files.map((file) => {
    if (
      file.type === 'meta' &&
      file.path === 'api/meta.json' &&
      'data' in file
    ) {
      const d = file.data as {
        title?: string;
        description?: string;
        pages: string[];
      };
      const pages = d.pages.includes('index')
        ? d.pages
        : ['index', ...d.pages];
      return {
        ...file,
        data: {
          ...d,
          root: true,
          title: d.title ?? 'QuokkaQ API',
          description: d.description ?? 'REST API reference (OpenAPI 3)',
          pages
        }
      };
    }
    return file;
  });
}

/**
 * Virtual paths like `api/...` (no `en/`, `ru/`) are assigned only to
 * `defaultLanguage` in the content parser; RU is meant to inherit EN storage,
 * but that can break OpenAPI registration in some setups. Prefix `$/` marks
 * files as shared for every locale (`fumadocs-core` i18n storage parser).
 * @see https://fumadocs.dev (i18n — `$` folder)
 */
function prefixDollarI18nApiPaths(
  files: (typeof openapiData)['files']
): (typeof openapiData)['files'] {
  return files.map((file) => {
    if (file.path.startsWith('$/')) {
      return file;
    }
    const p = file.path.replace(/^\//, '');
    return { ...file, path: '$/' + p };
  });
}

const openApiFiles: (typeof openapiData)['files'] = prefixDollarI18nApiPaths([
  openApiRootOverview,
  ...patchOpenApiLayoutTabs(openapiData.files)
]);

export const source = loader({
  baseUrl: '/docs',
  i18n,
  source: {
    docs: docs.toFumadocsSource(),
    openapi: { files: openApiFiles }
  },
  plugins: [openapiPlugin(), lucideIconsPlugin()]
});

export function getPageImage(page: (typeof source)['$inferPage']) {
  const segments = [...page.slugs, 'image.png'];
  const locale = page.locale ?? i18n.defaultLanguage;

  return {
    segments,
    url: `${docsImageRoutePrefix(locale)}/${segments.join('/')}`
  };
}

export function getPageMarkdownUrl(page: (typeof source)['$inferPage']) {
  const segments = [...page.slugs, 'content.md'];
  const locale = page.locale ?? i18n.defaultLanguage;

  return {
    segments,
    url: `${docsContentRoutePrefix(locale)}/${segments.join('/')}`
  };
}

export async function getLLMText(page: (typeof source)['$inferPage']) {
  if (page.type === 'openapi') {
    const s = page.data.getSchema();
    return JSON.stringify(s.bundled, null, 2);
  }
  const processed = await page.data.getText('processed');
  return `# ${page.data.title} (${page.url})
${processed}`;
}
