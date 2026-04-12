'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ChevronLeft, Loader2, SlidersHorizontal } from 'lucide-react';
import { unitsApi, type UnitClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Link, useRouter } from '@/src/i18n/navigation';
import { cn } from '@/lib/utils';
import { visitorTagPillStyles } from '@/lib/visitor-tag-styles';

const PAGE_SIZE = 40;

function UnitClientsListContent({ unitId }: { unitId: string }) {
  const t = useTranslations('clients');
  const router = useRouter();

  const [searchDraft, setSearchDraft] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageCursors, setPageCursors] = useState<(string | undefined)[]>([
    undefined
  ]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setDebouncedQ(searchDraft.trim());
      setPageIndex(0);
      setPageCursors([undefined]);
    }, 400);
    return () => window.clearTimeout(id);
  }, [searchDraft]);

  const tagIdsKey = useMemo(
    () => [...selectedTagIds].sort().join(','),
    [selectedTagIds]
  );

  const cursorForApi = pageIndex === 0 ? undefined : pageCursors[pageIndex];
  const queryEnabled = pageIndex === 0 || Boolean(cursorForApi);

  const { data, isLoading, isFetching, isError, error } = useQuery({
    queryKey: [
      'unit-clients',
      unitId,
      debouncedQ,
      tagIdsKey,
      pageIndex,
      cursorForApi ?? '__first__'
    ],
    queryFn: () =>
      unitsApi.listUnitClients(unitId, {
        q: debouncedQ || undefined,
        tagIds: selectedTagIds.length ? selectedTagIds : undefined,
        limit: PAGE_SIZE,
        cursor: cursorForApi
      }),
    enabled: queryEnabled
  });

  const tagDefsQuery = useQuery({
    queryKey: ['visitor-tag-definitions', unitId, 'clients-list'],
    queryFn: () => unitsApi.listVisitorTagDefinitions(unitId),
    staleTime: 60_000
  });
  const tagDefsForFilter = tagDefsQuery.data ?? [];
  const noUnitTagDefinitionsForFilter =
    tagDefsQuery.isSuccess && tagDefsQuery.data.length === 0;

  const rows = data?.items ?? [];
  const nextCursor = data?.nextCursor ?? undefined;

  const goNextPage = () => {
    if (!nextCursor) return;
    setPageCursors((prev) => {
      const out = [...prev];
      const slot = pageIndex + 1;
      while (out.length <= slot) out.push(undefined);
      out[slot] = nextCursor;
      return out;
    });
    setPageIndex((i) => i + 1);
  };

  const goPrevPage = () => {
    setPageIndex((i) => Math.max(0, i - 1));
  };

  const toggleTag = (id: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
    setPageIndex(0);
    setPageCursors([undefined]);
  };

  const openRow = (c: UnitClient) => {
    router.push(`/clients/${unitId}/${c.id}`);
  };

  return (
    <>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-end'>
        <div className='min-w-0 flex-1 space-y-2'>
          <Label htmlFor='clients-search'>{t('searchLabel')}</Label>
          <Input
            id='clients-search'
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder={t('searchPlaceholder')}
            autoComplete='off'
          />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button type='button' variant='outline' className='shrink-0 gap-2'>
              <SlidersHorizontal className='h-4 w-4' />
              {t('tagsFilter')}
              {selectedTagIds.length > 0 ? (
                <Badge variant='secondary' className='ml-1'>
                  {selectedTagIds.length}
                </Badge>
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent className='w-72' align='end'>
            <p className='mb-2 text-sm font-medium'>{t('tagsFilterHint')}</p>
            <div className='max-h-64 space-y-2 overflow-y-auto'>
              {noUnitTagDefinitionsForFilter ? (
                <p className='text-muted-foreground text-xs'>
                  {t('noTagDefinitions')}
                </p>
              ) : (
                tagDefsForFilter.map((def) => (
                  <label
                    key={def.id}
                    className='flex cursor-pointer items-center gap-2 text-sm'
                  >
                    <Checkbox
                      checked={selectedTagIds.includes(def.id)}
                      onCheckedChange={() => toggleTag(def.id)}
                    />
                    <span
                      className='inline-block size-2.5 shrink-0 rounded-full border'
                      style={{ backgroundColor: def.color }}
                    />
                    <span>{def.label}</span>
                  </label>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className='rounded-md border'>
        {isLoading ? (
          <div className='flex justify-center py-16'>
            <Loader2 className='text-muted-foreground h-10 w-10 animate-spin' />
          </div>
        ) : isError ? (
          <p className='text-destructive p-6 text-sm'>
            {t('loadError', { message: (error as Error)?.message ?? '' })}
          </p>
        ) : rows.length === 0 ? (
          <p className='text-muted-foreground p-6 text-sm'>{t('empty')}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('colName')}</TableHead>
                <TableHead>{t('colPhone')}</TableHead>
                <TableHead>{t('colTags')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow
                  key={c.id}
                  role='button'
                  tabIndex={0}
                  className={cn(
                    'hover:bg-muted/50 focus-visible:ring-ring cursor-pointer focus-visible:ring-2 focus-visible:outline-none'
                  )}
                  onClick={() => openRow(c)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openRow(c);
                    }
                  }}
                  aria-label={t('openClientRowAria', {
                    name:
                      [c.firstName, c.lastName].filter(Boolean).join(' ') ||
                      c.phoneE164 ||
                      c.id
                  })}
                >
                  <TableCell className='font-medium'>
                    {[c.firstName, c.lastName].filter(Boolean).join(' ') || '—'}
                  </TableCell>
                  <TableCell>{c.phoneE164 ?? '—'}</TableCell>
                  <TableCell>
                    <div className='flex flex-wrap gap-1'>
                      {(c.definitions ?? []).map((d) => (
                        <Badge
                          key={d.id}
                          variant='outline'
                          className='text-xs font-normal shadow-sm'
                          style={visitorTagPillStyles(d.color)}
                        >
                          {d.label}
                        </Badge>
                      ))}
                      {!c.definitions?.length && (
                        <span className='text-muted-foreground'>—</span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {!isLoading && !isError && rows.length > 0 ? (
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <p className='text-muted-foreground text-sm'>
            {t('pageLabel', { page: pageIndex + 1 })}
          </p>
          <div className='flex gap-2'>
            <Button
              type='button'
              variant='outline'
              size='sm'
              disabled={pageIndex === 0 || isFetching}
              onClick={goPrevPage}
            >
              {t('prevPage')}
            </Button>
            <Button
              type='button'
              variant='outline'
              size='sm'
              disabled={!nextCursor || isFetching}
              onClick={goNextPage}
            >
              {t('nextPage')}
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default function UnitClientsListPage({
  params
}: {
  params: Promise<{ unitId: string }>;
}) {
  const { unitId } = use(params);
  const t = useTranslations('clients');

  return (
    <div className='container mx-auto max-w-5xl space-y-6 p-4'>
      <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <Button variant='ghost' size='sm' className='mb-2 -ml-2' asChild>
            <Link href='/'>
              <ChevronLeft className='mr-1 h-4 w-4' />
              {t('backHome')}
            </Link>
          </Button>
          <h1 className='text-2xl font-bold'>{t('listTitle')}</h1>
          <p className='text-muted-foreground mt-1 text-sm'>
            {t('listDescription')}
          </p>
        </div>
      </div>

      <UnitClientsListContent key={unitId} unitId={unitId} />
    </div>
  );
}
