import { redirect } from '@/src/i18n/navigation';

export default async function GridConfigurationRedirectPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: '/settings/units', locale });
}
