import { redirect } from '@/src/i18n/navigation';

/** Canonical journal lives under `/journal/{unitId}`; keep this route for bookmarks. */
export default async function SupervisorJournalRedirectPage({
  params
}: {
  params: Promise<{ locale: string; unitId: string }>;
}) {
  const { locale, unitId } = await params;
  redirect({ href: `/journal/${unitId}`, locale });
}
