'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { KeyRound } from 'lucide-react';
import type { Company } from '@quokkaq/shared-types';
import {
  usePatchCompaniesMe,
  type ModelsCompanyPatchSsoAccessSource
} from '@/lib/api/generated/auth';

type OrganizationSsoAccessSourceCardProps = {
  company: Company;
};

export function OrganizationSsoAccessSourceCard({
  company
}: OrganizationSsoAccessSourceCardProps) {
  const t = useTranslations('admin.integrations.rbac');
  const qc = useQueryClient();

  const patch = usePatchCompaniesMe({
    mutation: {
      onSuccess: (res) => {
        if (res.status === 200) {
          void qc.invalidateQueries({ queryKey: ['company-me'] });
          toast.success(t('access_source_saved'));
        } else {
          toast.error(t('access_source_error'));
        }
      },
      onError: () => toast.error(t('access_source_error'))
    }
  });

  const value =
    company.ssoAccessSource === 'sso_groups' ? 'sso_groups' : 'manual';

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <KeyRound className='h-5 w-5' />
          {t('access_source_title')}
        </CardTitle>
        <CardDescription>{t('access_source_description')}</CardDescription>
      </CardHeader>
      <CardContent className='max-w-md space-y-2'>
        <Label htmlFor='sso-access-source'>{t('access_source_label')}</Label>
        <Select
          value={value}
          disabled={patch.isPending}
          onValueChange={(v) => {
            patch.mutate({
              data: {
                ssoAccessSource: v as ModelsCompanyPatchSsoAccessSource
              }
            });
          }}
        >
          <SelectTrigger id='sso-access-source'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='manual'>{t('access_source_manual')}</SelectItem>
            <SelectItem value='sso_groups'>
              {t('access_source_sso_groups')}
            </SelectItem>
          </SelectContent>
        </Select>
        <p className='text-muted-foreground text-xs'>
          {t('access_source_hint')}
        </p>
      </CardContent>
    </Card>
  );
}
