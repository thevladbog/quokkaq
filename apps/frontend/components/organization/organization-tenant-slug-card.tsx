'use client';

import { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Link2 } from 'lucide-react';
import type { Company } from '@quokkaq/shared-types';
import { companiesMeSlugPatch } from '@/lib/api/generated/auth';
import {
  normalizeTenantSlug,
  slugFormSchema,
  type SlugFormValues
} from '@/components/organization/organization-auth-shared';

type OrganizationTenantSlugCardProps = {
  company: Company;
};

export function OrganizationTenantSlugCard({
  company
}: OrganizationTenantSlugCardProps) {
  const t = useTranslations('organization.loginSecurity');
  const qc = useQueryClient();

  const slugForm = useForm<SlugFormValues>({
    resolver: zodResolver(slugFormSchema),
    defaultValues: { slug: company.slug ?? '' }
  });

  useEffect(() => {
    slugForm.reset({ slug: company.slug ?? '' });
  }, [company.slug, slugForm]);

  const patchSlug = useMutation({
    mutationFn: async (slug: string) => {
      const res = await companiesMeSlugPatch({ slug: slug.trim() });
      if (res.status !== 200) {
        throw new Error(t('saveError'));
      }
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['company-me'] });
      toast.success(t('slugSaved'));
    },
    onError: (e: Error) => toast.error(e.message || t('saveError'))
  });

  const onSubmitSlug = slugForm.handleSubmit((values) => {
    patchSlug.mutate(normalizeTenantSlug(values.slug));
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Link2 className='h-5 w-5' />
          {t('slugTitle')}
        </CardTitle>
        <CardDescription>{t('slugDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...slugForm}>
          <form onSubmit={onSubmitSlug} className='space-y-4'>
            <FormField
              control={slugForm.control}
              name='slug'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('slugLabel')}</FormLabel>
                  <FormControl>
                    <Input autoComplete='off' {...field} />
                  </FormControl>
                  <FormDescription>{t('slugHint')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type='submit'
              disabled={patchSlug.isPending || !slugForm.formState.isDirty}
            >
              {patchSlug.isPending ? t('saving') : t('saveSlug')}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
