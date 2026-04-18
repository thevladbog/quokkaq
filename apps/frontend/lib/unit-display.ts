/** Localized unit title (subdivision / service_zone). Matches backend `models.UnitDisplayName`. */
export function getUnitDisplayName(
  unit: { name?: string; nameEn?: string | null },
  locale: string
): string {
  const lang = locale.split('-')[0]?.toLowerCase() ?? 'en';
  const en = (unit.nameEn ?? '').trim();
  if (lang === 'en' && en) return en;
  const primary = (unit.name ?? '').trim();
  return primary || en;
}
