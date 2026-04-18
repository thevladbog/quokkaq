import { redirect } from '@/src/i18n/navigation';

export default async function SettingsIndexRedirectPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: '/settings/organization', locale });
}
