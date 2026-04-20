import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { isAppLocale } from '@/src/messages';

/** `/` has no `[locale]` segment; send users to a concrete locale (cookie or default `en`). */
export default async function RootPage() {
  const cookieStore = await cookies();
  const raw = cookieStore.get('NEXT_LOCALE')?.value;
  const locale = isAppLocale(raw ?? '') ? raw : 'en';
  redirect(`/${locale}`);
}
