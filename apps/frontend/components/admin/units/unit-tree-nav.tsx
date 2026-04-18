'use client';

import { Badge } from '@/components/ui/badge';
import { Building2, FolderOpen } from 'lucide-react';
import { Link } from '@/src/i18n/navigation';
import { useLocale, useTranslations } from 'next-intl';
import type { UnitTreeNode } from '@/lib/unit-tree';
import { unitKindBadgeClassName } from '@/components/admin/units/unit-kind-badge-styles';
import { cn } from '@/lib/utils';
import { getUnitDisplayName } from '@/lib/unit-display';

function UnitKindBadge({ unit }: { unit: { kind?: string | null } }) {
  const t = useTranslations('admin');
  const label =
    unit.kind === 'subdivision'
      ? t('units.kind_subdivision')
      : unit.kind === 'service_zone'
        ? t('units.kind_service_zone')
        : unit.kind === 'workplace'
          ? t('units.kind_unknown', { kind: 'workplace' })
          : t('units.kind_unknown', {
              kind: String(unit.kind ?? '').trim() || '—'
            });
  return (
    <Badge
      variant='outline'
      className={cn('text-xs', unitKindBadgeClassName(unit.kind))}
    >
      {label}
    </Badge>
  );
}

function NavBranch({ nodes, depth }: { nodes: UnitTreeNode[]; depth: number }) {
  const locale = useLocale();
  return (
    <ul
      className={cn(
        'space-y-1',
        depth > 0 && 'border-muted mt-1 ml-3 border-l pl-3'
      )}
    >
      {nodes.map(({ unit, children }) => (
        <li key={unit.id}>
          <div className='flex flex-wrap items-center gap-2 py-1.5'>
            {unit.kind === 'service_zone' ? (
              <FolderOpen
                className='text-muted-foreground h-4 w-4 shrink-0'
                aria-hidden
              />
            ) : (
              <Building2
                className='text-muted-foreground h-4 w-4 shrink-0'
                aria-hidden
              />
            )}
            <Link
              href={`/settings/units/${unit.id}`}
              className='text-primary font-medium hover:underline'
            >
              {getUnitDisplayName(unit, locale)}
            </Link>
            <span className='text-muted-foreground text-sm'>{unit.code}</span>
            <UnitKindBadge unit={unit} />
          </div>
          {children.length > 0 ? (
            <NavBranch nodes={children} depth={depth + 1} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** Hierarchical list of units (company scope) with links to unit settings. */
export function UnitTreeNavList({ nodes }: { nodes: UnitTreeNode[] }) {
  if (nodes.length === 0) return null;
  return (
    <div data-testid='e2e-settings-units-tree'>
      <NavBranch nodes={nodes} depth={0} />
    </div>
  );
}
