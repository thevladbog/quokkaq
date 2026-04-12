import { redirect } from '@/src/i18n/navigation';

function searchParamsToQueryString(
  sp: Record<string, string | string[] | undefined>
): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) qs.append(key, v);
    } else {
      qs.set(key, value);
    }
  }
  return qs.toString();
}

/** Canonical journal lives under `/journal/{unitId}`; keep this route for bookmarks. */
export default async function SupervisorJournalRedirectPage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string; unitId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, unitId } = await params;
  const sp = searchParams ? await searchParams : {};
  const q = searchParamsToQueryString(sp);
  const href = q.length > 0 ? `/journal/${unitId}?${q}` : `/journal/${unitId}`;
  redirect({ href, locale });
}
