/**
 * fumadocs-openapi `groupBy: 'tag'` uses `dereferenced.tags` to resolve display
 * names via `fromTagName`. Many generated specs list only a subset of tags (or
 * none) while operations still reference tag strings. We merge so the file on
 * disk stays the single source of truth from the generator; this runs in the
 * docs app only.
 */
const HTTP_VERBS = new Set([
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace'
]);

type TagObject = { name: string; description?: string; [k: string]: unknown };

function collectTagOrderAndUsage(spec: {
  paths?: Record<string, unknown>;
  webhooks?: Record<string, unknown>;
}): { order: string[]; used: Set<string> } {
  const used = new Set<string>();
  const order: string[] = [];
  const note = (tags: string[] | undefined) => {
    if (!tags) {
      return;
    }
    for (const t of tags) {
      used.add(t);
      if (!order.includes(t)) {
        order.push(t);
      }
    }
  };

  for (const pathItem of Object.values(spec.paths ?? {})) {
    if (!pathItem || typeof pathItem !== 'object') {
      continue;
    }
    const pi = pathItem as Record<string, unknown>;
    for (const [k, v] of Object.entries(pi)) {
      if (!HTTP_VERBS.has(k) || !v || typeof v !== 'object') {
        continue;
      }
      const op = v as { tags?: string[] };
      note(op.tags);
    }
  }

  for (const pathItem of Object.values(spec.webhooks ?? {})) {
    if (!pathItem || typeof pathItem !== 'object') {
      continue;
    }
    const pi = pathItem as Record<string, unknown>;
    for (const [k, v] of Object.entries(pi)) {
      if (!HTTP_VERBS.has(k) || !v || typeof v !== 'object') {
        continue;
      }
      const op = v as { tags?: string[] };
      note(op.tags);
    }
  }

  return { order, used };
}

export function mergeOpenApiTagDefinitionsFromOperations<T extends object>(raw: T): T {
  const { order, used } = collectTagOrderAndUsage(
    raw as { paths?: Record<string, unknown>; webhooks?: Record<string, unknown> }
  );
  const spec = raw as T & { tags?: TagObject[] };
  if (used.size === 0) {
    return raw;
  }

  const byName = new Map<string, TagObject>();
  for (const t of spec.tags ?? []) {
    if (t?.name) {
      byName.set(t.name, { ...t });
    }
  }
  for (const name of order) {
    if (!byName.has(name)) {
      byName.set(name, { name });
    }
  }

  const merged: TagObject[] = order
    .filter((n) => used.has(n))
    .map((n) => byName.get(n)!);

  return { ...raw, tags: merged } as T;
}
