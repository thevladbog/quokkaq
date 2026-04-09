'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { platformApi } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { Link } from '@/src/i18n/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { formatAppDate, intlLocaleFromAppLocale } from '@/lib/format-datetime';

export default function PlatformCompaniesPage() {
  const t = useTranslations('platform.companies');
  const locale = useLocale();
  const intlLocale = useMemo(() => intlLocaleFromAppLocale(locale), [locale]);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search), 400);
    return () => clearTimeout(id);
  }, [search]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['platform-companies', debounced],
    queryFn: () =>
      platformApi.listCompanies({ search: debounced || undefined, limit: 100 })
  });

  return (
    <div>
      <h1 className='mb-6 text-3xl font-bold'>
        {t('title', { defaultValue: 'Companies' })}
      </h1>
      <div className='mb-4 flex max-w-md gap-2'>
        <Input
          placeholder={t('searchPlaceholder', {
            defaultValue: 'Search by name…'
          })}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button type='button' variant='secondary' onClick={() => setSearch('')}>
          {t('clear', { defaultValue: 'Clear' })}
        </Button>
      </div>
      {isLoading && (
        <div className='flex justify-center py-12'>
          <Spinner className='h-8 w-8' />
        </div>
      )}
      {error && (
        <p className='text-destructive'>
          {(error as Error).message || 'Failed to load'}
        </p>
      )}
      {data && data.items.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('name', { defaultValue: 'Name' })}</TableHead>
              <TableHead>{t('id', { defaultValue: 'ID' })}</TableHead>
              <TableHead>{t('created', { defaultValue: 'Created' })}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((c) => (
              <TableRow key={c.id}>
                <TableCell className='font-medium'>
                  <span className='inline-flex flex-wrap items-center gap-2'>
                    {c.name}
                    {c.isSaasOperator ? (
                      <Badge variant='secondary'>
                        {t('saasOperatorBadge', {
                          defaultValue: 'Operator'
                        })}
                      </Badge>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell className='text-muted-foreground font-mono text-xs'>
                  {c.id.slice(0, 8)}…
                </TableCell>
                <TableCell>{formatAppDate(c.createdAt, intlLocale)}</TableCell>
                <TableCell className='text-right'>
                  <Button variant='outline' size='sm' asChild>
                    <Link href={`/platform/companies/${c.id}`}>
                      {t('open', { defaultValue: 'Open' })}
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {data && data.items.length === 0 && !isLoading && (
        <p className='text-muted-foreground py-8'>
          {t('empty', { defaultValue: 'No companies found.' })}
        </p>
      )}
    </div>
  );
}
