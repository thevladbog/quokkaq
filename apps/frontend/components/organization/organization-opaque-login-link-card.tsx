'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Copy, KeyRound } from 'lucide-react';
import { companiesMeLoginLinkPost } from '@/lib/api/generated/auth';
import { resolvePublicAppBase } from '@/components/organization/organization-auth-shared';

/** Shape of `res.data` for a 200 from `companiesMeLoginLinkPost` (derived so Orval renames do not break imports). */
type CompaniesMeLoginLinkData = NonNullable<
  Extract<
    Awaited<ReturnType<typeof companiesMeLoginLinkPost>>,
    { status: 200 }
  >['data']
>;

type OrganizationOpaqueLoginLinkCardProps = {
  publicAppUrl?: string | null;
};

export function OrganizationOpaqueLoginLinkCard({
  publicAppUrl
}: OrganizationOpaqueLoginLinkCardProps) {
  const t = useTranslations('organization.loginSecurity');

  const [opaqueLink, setOpaqueLink] = useState<{
    token: string;
    exampleUrl: string;
  } | null>(null);

  const createLink = useMutation({
    mutationFn: async () => {
      const res = await companiesMeLoginLinkPost();
      if (res.status !== 200 || !res.data) {
        throw new Error(t('linkError'));
      }
      const data: CompaniesMeLoginLinkData = res.data;
      const token = data.token ?? '';
      const example =
        data.exampleUrl ??
        `${resolvePublicAppBase(publicAppUrl)}/login?login_token=${encodeURIComponent(token)}`;
      return { token, exampleUrl: example };
    },
    onSuccess: (data) => {
      setOpaqueLink(data);
      toast.success(t('linkCreated'));
    },
    onError: () => toast.error(t('linkError'))
  });

  const copyText = async (text: string, okMsg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(okMsg);
    } catch {
      toast.error(t('copyFailed'));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <KeyRound className='h-5 w-5' />
          {t('opaqueTitle')}
        </CardTitle>
        <CardDescription>{t('opaqueDescription')}</CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <Button
          type='button'
          variant='secondary'
          onClick={() => createLink.mutate()}
          disabled={createLink.isPending}
        >
          {createLink.isPending ? t('generating') : t('generateLink')}
        </Button>
        {opaqueLink ? (
          <div className='space-y-2 rounded-md border p-3'>
            <p className='text-muted-foreground text-xs'>{t('opaqueHint')}</p>
            <div className='flex flex-wrap items-start gap-2'>
              <code className='bg-muted max-w-full flex-1 rounded px-2 py-1 text-xs break-all'>
                {opaqueLink.exampleUrl}
              </code>
              <Button
                type='button'
                variant='outline'
                size='sm'
                aria-label={t('copyLink')}
                onClick={() =>
                  void copyText(opaqueLink.exampleUrl, t('copied'))
                }
              >
                <Copy className='size-4' />
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
