import type { AppLocale } from '@/src/messages';

const LIMIT_ROW_KEYS = new Set([
  'features.units',
  'features.users',
  'features.tickets',
  'features.services',
  'features.counters',
  'features.zonesPerUnit'
]);

function ruPluralCategory(n: number): 'one' | 'few' | 'many' {
  const sel = new Intl.PluralRules('ru').select(n);
  if (sel === 'one' || sel === 'few' || sel === 'many') return sel;
  return 'many';
}

/** Mirrors `pricing.features` ICU in apps/frontend/messages/ru.json (marketing “До …”). */
function formatRuLimitRow(key: string, n: number): string {
  const p = ruPluralCategory(n);
  switch (key) {
    case 'features.units':
      if (p === 'one') return `До ${n} подразделения`;
      return `До ${n} подразделений`;
    case 'features.users':
      if (p === 'one') return `До ${n} пользователя`;
      return `До ${n} пользователей`;
    case 'features.tickets':
      if (p === 'one') return `До ${n} талона в месяц`;
      return `До ${n} талонов в месяц`;
    case 'features.services':
      if (p === 'one') return `До ${n} услуги`;
      if (p === 'few') return `До ${n} услуг`;
      return `До ${n} услуг`;
    case 'features.counters':
      if (p === 'one') return `До ${n} окна обслуживания`;
      if (p === 'few') return `До ${n} окон обслуживания`;
      return `До ${n} окон обслуживания`;
    case 'features.zonesPerUnit':
      if (p === 'one') return `До ${n} сервисной зоны на подразделение`;
      if (p === 'few') return `До ${n} сервисных зон на подразделение`;
      return `До ${n} сервисных зон на подразделение`;
    default:
      return '';
  }
}

/** Mirrors `pricing.features` ICU in apps/frontend/messages/en.json. */
function formatEnLimitRow(key: string, n: number): string {
  const one = n === 1;
  switch (key) {
    case 'features.units':
      return one ? `Up to ${n} unit` : `Up to ${n} units`;
    case 'features.users':
      return one ? `Up to ${n} user` : `Up to ${n} users`;
    case 'features.tickets':
      return one
        ? `Up to ${n} ticket per month`
        : `Up to ${n} tickets per month`;
    case 'features.services':
      return one ? `Up to ${n} service` : `Up to ${n} services`;
    case 'features.counters':
      return one ? `Up to ${n} service counter` : `Up to ${n} service counters`;
    case 'features.zonesPerUnit':
      return one
        ? `Up to ${n} service zone per unit`
        : `Up to ${n} service zones per unit`;
    default:
      return '';
  }
}

/**
 * Label for a pricing row from `buildPricingRowsFromApiPlan`.
 * Applies proper plural forms for numeric limit rows (RU/EN); other keys use static labels.
 */
export function formatPricingRowLabel(
  locale: AppLocale,
  translationKey: string,
  count: number | undefined,
  labels: Record<string, string>
): string {
  if (
    count !== undefined &&
    LIMIT_ROW_KEYS.has(translationKey) &&
    Number.isFinite(count)
  ) {
    const n = Math.trunc(count);
    if (locale === 'ru') {
      const s = formatRuLimitRow(translationKey, n);
      if (s) return s;
    } else {
      const s = formatEnLimitRow(translationKey, n);
      if (s) return s;
    }
  }

  const tpl = labels[translationKey];
  if (!tpl) return translationKey;
  if (tpl.includes('{count}')) {
    return tpl.replace(/\{count\}/g, String(count ?? ''));
  }
  return tpl;
}
