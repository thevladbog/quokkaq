import { createAPIPage } from 'fumadocs-openapi/ui';
import { openapi } from '@/lib/openapi';
import { OpenapiPrefixedHeading } from './openapi-prefixed-heading';

/** OpenAPI may use a wildcard request-body media type; fumadocs-openapi only registers concrete types. */
const catchAllMedia = {
  encode(data: { body: unknown }) {
    return JSON.stringify(data.body ?? null);
  },
  generateExample(data: { body: unknown }, ctx: { lang: string }) {
    if (ctx.lang === 'js') {
      return `const body = JSON.stringify(${JSON.stringify(data.body, null, 2)})`;
    }
    return undefined;
  }
};

export const APIPage = createAPIPage(openapi, {
  mediaAdapters: {
    '*/*': catchAllMedia
  },
  renderHeading: (hProps, depth) => {
    const id = hProps.id ?? 'heading';
    return <OpenapiPrefixedHeading {...hProps} id={id} depth={depth} />;
  }
});
