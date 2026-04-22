import type { Service } from '@quokkaq/shared-types';

import { serviceTitleForLocale } from '@/lib/utils';

export type ServiceNode = Service & { children: ServiceNode[] };

function sortNodesByTitle(nodes: ServiceNode[], locale: string): void {
  const collator = new Intl.Collator(locale, { sensitivity: 'base' });
  nodes.sort((a, b) =>
    collator.compare(
      serviceTitleForLocale(a, locale),
      serviceTitleForLocale(b, locale)
    )
  );
  for (const n of nodes) {
    if (n.children.length) sortNodesByTitle(n.children, locale);
  }
}

/** Build a forest from flat services using `parentId`. Orphans (missing parent) are appended after roots. */
export function buildServiceTree(
  services: readonly Service[],
  locale: string
): ServiceNode[] {
  const byId = new Map<string, ServiceNode>();
  for (const s of services) {
    byId.set(s.id, { ...s, children: [] });
  }
  const roots: ServiceNode[] = [];
  const orphans: ServiceNode[] = [];
  for (const s of services) {
    const node = byId.get(s.id);
    if (!node) continue;
    const pid = s.parentId?.trim();
    if (!pid) {
      roots.push(node);
      continue;
    }
    const parent = byId.get(pid);
    if (parent) {
      parent.children.push(node);
    } else {
      orphans.push(node);
    }
  }
  sortNodesByTitle(roots, locale);
  sortNodesByTitle(orphans, locale);
  return [...roots, ...orphans];
}

export type ServiceZoneFilter = 'all' | '__unassigned__' | string;

function normalizeQuery(q: string): string {
  return q.trim().toLowerCase();
}

function serviceSearchBlob(s: Service, locale: string): string {
  const title = serviceTitleForLocale(s, locale);
  const prefix = (s.prefix ?? '').trim();
  const slot = (s.calendarSlotKey ?? '').trim();
  return `${title} ${prefix} ${slot} ${s.id}`.toLowerCase();
}

function leafMatchesZone(s: Service, zoneId: ServiceZoneFilter): boolean {
  if (zoneId === 'all') return true;
  const z = (s.restrictedServiceZoneId ?? '').trim();
  if (zoneId === '__unassigned__') return z === '';
  return z === zoneId;
}

function serviceMatchesQuery(
  s: Service,
  locale: string,
  normalizedQuery: string
): boolean {
  if (!normalizedQuery) return true;
  return serviceSearchBlob(s, locale).includes(normalizedQuery);
}

/** Prune tree: keep nodes that match filters or have a matching descendant. */
export function filterServiceTree(
  nodes: readonly ServiceNode[],
  locale: string,
  searchQuery: string,
  zoneId: ServiceZoneFilter
): ServiceNode[] {
  const q = normalizeQuery(searchQuery);
  const out: ServiceNode[] = [];
  for (const node of nodes) {
    const filteredChildren = filterServiceTree(
      node.children,
      locale,
      q,
      zoneId
    );
    const queryOk = serviceMatchesQuery(node, locale, q);
    if (node.isLeaf) {
      const zoneOk = leafMatchesZone(node, zoneId);
      if (queryOk && zoneOk) {
        out.push({ ...node, children: [] });
      }
      continue;
    }
    if (filteredChildren.length > 0 || (queryOk && q)) {
      out.push({ ...node, children: filteredChildren });
    }
  }
  return out;
}
