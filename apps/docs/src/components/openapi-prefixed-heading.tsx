'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import { useId } from 'react';
import { Heading } from 'fumadocs-ui/components/heading';
import { useOperationContext } from 'fumadocs-openapi/operation-client';

type HeadingProps = HTMLAttributes<HTMLHeadingElement> & {
  id: string;
  children?: ReactNode;
};

const HEADING_AS = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6'
] as const;

/**
 * fumadocs-openapi reuses the same `id` for every operation
 * (`request-body`, `response-body`, `parameters-*`, …) and uses `id` as
 * the React `key` on <Heading />, so pages that list many operations
 * get duplicate key warnings. Prefix with the operation route (when the
 * OpenAPI OperationProvider is present) or with `useId` (webhooks / no provider).
 */
function pathToIdPrefix(route: string) {
  return route
    .replace(/^\//, '')
    .replaceAll(/[{}^[\]\\|]/g, '')
    .split('/')
    .filter(Boolean)
    .join('-')
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]+/g, '-')
    .replaceAll(/-+/g, '-')
    .replace(/(^-)|(-$)/g, '') || 'route';
}

export function OpenapiPrefixedHeading(
  hProps: HeadingProps & { depth: number }
): ReactNode {
  const { id: rawId, children, depth, ...rest } = hProps;
  const op = useOperationContext() as { route: string } | null;
  const inst = useId().replace(/[^a-zA-Z0-9]+/g, '');
  const route = op && typeof op.route === 'string' && op.route.length > 0 ? op.route : null;
  const prefix = route != null ? pathToIdPrefix(route) : `h-${inst}`;
  const id = rawId && rawId.length > 0 ? `${prefix}-${rawId}` : `h-${inst}`;

  const d = Math.min(6, Math.max(1, Math.floor(depth))) as 1 | 2 | 3 | 4 | 5 | 6;
  const as = HEADING_AS[d - 1];

  return (
    <Heading as={as} id={id} key={id} {...rest}>
      {children}
    </Heading>
  );
}
