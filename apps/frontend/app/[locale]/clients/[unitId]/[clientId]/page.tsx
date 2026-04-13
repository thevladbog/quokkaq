'use client';

import { use, useMemo, useState } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient
} from '@tanstack/react-query';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { ChevronLeft, Loader2, Tags } from 'lucide-react';
import { toast } from 'sonner';
import { getGetUnitsUnitIdVisitorTagDefinitionsQueryKey } from '@/lib/api/generated/units';
import { ApiHttpError, unitsApi, type UnitClient } from '@/lib/api';
import { ticketServiceDisplayName } from '@/lib/ticket-display';
import { visitorTagPillStyles } from '@/lib/visitor-tag-styles';
import { VisitorTagsPickerDialog } from '@/components/visitors/VisitorTagsPickerDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Link } from '@/src/i18n/navigation';
import { VisitTransferTrail } from '@/components/visitors/VisitTransferTrail';
import { ClientHistoryDetails } from './client-history-details';

const VISITS_PAGE = 20;
const HISTORY_PAGE = 20;

/** Detail layout: slightly wider than default prose width for forms + wide tables. */
const CLIENT_DETAIL_MAX_WIDTH = 'max-w-5xl';

function ClientDetailForm({
  unitId,
  clientId,
  initial
}: {
  unitId: string;
  clientId: string;
  initial: UnitClient;
}) {
  const t = useTranslations('clients');
  const tStaff = useTranslations('staff');
  const ticketStatusT = useTranslations('supervisor.activityTicketStatus');
  const locale = useLocale();
  const format = useFormatter();
  const queryClient = useQueryClient();

  const [firstName, setFirstName] = useState(initial.firstName);
  const [lastName, setLastName] = useState(initial.lastName);
  const [phone, setPhone] = useState(initial.phoneE164 ?? '');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(() =>
    (initial.definitions ?? []).map((d) => d.id)
  );
  const [tagsModalOpen, setTagsModalOpen] = useState(false);
  const [tagsSavePending, setTagsSavePending] = useState(false);

  const tagDefsQuery = useQuery({
    queryKey: getGetUnitsUnitIdVisitorTagDefinitionsQueryKey(unitId),
    queryFn: () => unitsApi.listVisitorTagDefinitions(unitId),
    staleTime: 60_000
  });
  const tagCatalogForProfile = useMemo(() => {
    if (tagDefsQuery.isError) {
      return initial.definitions ?? [];
    }
    return tagDefsQuery.data ?? initial.definitions ?? [];
  }, [tagDefsQuery.isError, tagDefsQuery.data, initial.definitions]);
  const noUnitTagDefinitions =
    tagDefsQuery.isSuccess && tagDefsQuery.data.length === 0;

  const visitsQuery = useInfiniteQuery({
    queryKey: ['client-visits', unitId, clientId],
    queryFn: ({ pageParam }) =>
      unitsApi.getClientVisits(unitId, clientId, {
        limit: VISITS_PAGE,
        cursor: pageParam
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(initial && !initial.isAnonymous)
  });

  const historyQuery = useInfiniteQuery({
    queryKey: ['client-history', unitId, clientId],
    queryFn: ({ pageParam }) =>
      unitsApi.getClientHistory(unitId, clientId, {
        limit: HISTORY_PAGE,
        cursor: pageParam
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(initial && !initial.isAnonymous)
  });

  const isPristine = useMemo(() => {
    const trimmedInitialFirst = (initial.firstName ?? '').trim();
    const trimmedInitialLast = (initial.lastName ?? '').trim();
    const tagIdsSorted = [...selectedTagIds].sort();
    const origTagIds = (initial.definitions ?? []).map((d) => d.id).sort();
    const tagsEqual =
      tagIdsSorted.length === origTagIds.length &&
      tagIdsSorted.every((id, i) => id === origTagIds[i]);
    return (
      firstName.trim() === trimmedInitialFirst &&
      lastName.trim() === trimmedInitialLast &&
      phone.trim() === (initial.phoneE164 ?? '').trim() &&
      tagsEqual
    );
  }, [
    firstName,
    lastName,
    phone,
    selectedTagIds,
    initial.firstName,
    initial.lastName,
    initial.phoneE164,
    initial.definitions
  ]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const trimmedInitialFirst = (initial.firstName ?? '').trim();
      const trimmedInitialLast = (initial.lastName ?? '').trim();
      const tagIdsSorted = [...selectedTagIds].sort();
      const origTagIds = (initial.definitions ?? []).map((d) => d.id).sort();
      const tagsChanged =
        tagIdsSorted.length !== origTagIds.length ||
        tagIdsSorted.some((id, i) => id !== origTagIds[i]);

      const body: {
        firstName?: string;
        lastName?: string;
        phone?: string;
        tagDefinitionIds?: string[];
      } = {};

      if (
        firstName.trim() !== trimmedInitialFirst ||
        lastName.trim() !== trimmedInitialLast
      ) {
        body.firstName = firstName.trim();
        body.lastName = lastName.trim();
      }
      const origPhone = (initial.phoneE164 ?? '').trim();
      const newPhone = phone.trim();
      if (newPhone !== origPhone) {
        body.phone = newPhone;
      }
      if (tagsChanged) {
        body.tagDefinitionIds = [...selectedTagIds];
      }

      if (Object.keys(body).length === 0) {
        return Promise.resolve(initial);
      }

      return unitsApi.patchUnitClient(unitId, clientId, body);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['unit-client', unitId, clientId], data);
      void queryClient.invalidateQueries({
        queryKey: ['unit-clients', unitId]
      });
      void queryClient.invalidateQueries({
        queryKey: ['client-history', unitId, clientId]
      });
    }
  });

  const visitsFlat = useMemo(
    () => visitsQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [visitsQuery.data?.pages]
  );

  const historyFlat = useMemo(
    () => historyQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [historyQuery.data?.pages]
  );

  const saveError =
    saveMutation.error instanceof ApiHttpError
      ? saveMutation.error.message
      : saveMutation.error?.message;

  const sortedProfileTags = useMemo(() => {
    const selected = new Set(selectedTagIds);
    const list = tagCatalogForProfile.filter((d) => selected.has(d.id));
    return [...list].sort((a, b) => {
      const ao = a.sortOrder ?? 0;
      const bo = b.sortOrder ?? 0;
      if (ao !== bo) return ao - bo;
      return a.label.localeCompare(b.label);
    });
  }, [tagCatalogForProfile, selectedTagIds]);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t('detailFormTitle')}</CardTitle>
          <CardDescription>{t('detailFormDescription')}</CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='space-y-2'>
              <Label htmlFor='c-fn'>{t('fieldFirstName')}</Label>
              <Input
                id='c-fn'
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='c-ln'>{t('fieldLastName')}</Label>
              <Input
                id='c-ln'
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>
          <div className='space-y-2'>
            <Label htmlFor='c-ph'>{t('fieldPhone')}</Label>
            <Input
              id='c-ph'
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t('fieldPhoneHint')}
            />
          </div>
          <div className='space-y-2'>
            <Label>{t('fieldTags')}</Label>
            {tagDefsQuery.isError ? (
              <>
                <p className='text-destructive text-sm'>
                  {t('tagDefinitionsLoadError', {
                    message:
                      tagDefsQuery.error instanceof Error
                        ? tagDefsQuery.error.message
                        : String(tagDefsQuery.error ?? '')
                  })}
                </p>
                <div className='border-destructive/25 bg-destructive/5 flex flex-wrap items-center gap-1.5 rounded-md border p-3'>
                  {sortedProfileTags.map((def) => (
                    <span
                      key={def.id}
                      className='inline-flex max-w-[10rem] shrink-0 truncate rounded-full border border-transparent px-2.5 py-0.5 text-[11px] font-medium shadow-sm'
                      style={visitorTagPillStyles(def.color)}
                      title={def.label}
                    >
                      {def.label}
                    </span>
                  ))}
                  <Button
                    type='button'
                    variant='outline'
                    size='icon'
                    className='text-muted-foreground h-7 w-7 shrink-0 cursor-not-allowed rounded-full opacity-60'
                    disabled
                    aria-label={tStaff('visitor_context.tags_edit_aria')}
                  >
                    <Tags className='h-3.5 w-3.5' />
                  </Button>
                </div>
              </>
            ) : noUnitTagDefinitions ? (
              <p className='text-muted-foreground text-sm'>
                {t('noTagDefinitions')}
              </p>
            ) : (
              <div className='flex flex-wrap items-center gap-1.5 rounded-md border p-3'>
                {sortedProfileTags.map((def) => (
                  <span
                    key={def.id}
                    className='inline-flex max-w-[10rem] shrink-0 truncate rounded-full border border-transparent px-2.5 py-0.5 text-[11px] font-medium shadow-sm'
                    style={visitorTagPillStyles(def.color)}
                    title={def.label}
                  >
                    {def.label}
                  </span>
                ))}
                <Button
                  type='button'
                  variant='outline'
                  size='icon'
                  className='text-muted-foreground hover:text-foreground h-7 w-7 shrink-0 rounded-full'
                  onClick={() => setTagsModalOpen(true)}
                  disabled={tagsSavePending}
                  aria-label={tStaff('visitor_context.tags_edit_aria')}
                >
                  <Tags className='h-3.5 w-3.5' />
                </Button>
              </div>
            )}
          </div>
          <VisitorTagsPickerDialog
            open={tagsModalOpen && !tagDefsQuery.isError}
            onOpenChange={setTagsModalOpen}
            unitId={unitId}
            initialSelectedIds={selectedTagIds}
            auditReasonRequired={false}
            isPending={tagsSavePending}
            title={t('tagsEditModalTitle')}
            description={t('tagsEditModalHint')}
            t={tStaff}
            skipBuiltInSaveErrorToast
            onSave={async ({ tagDefinitionIds }) => {
              const currentSorted = [...selectedTagIds].sort();
              const incomingSorted = [...tagDefinitionIds].sort();
              const tagsUnchanged =
                currentSorted.length === incomingSorted.length &&
                currentSorted.every((id, i) => id === incomingSorted[i]);
              if (tagsUnchanged) {
                return false;
              }
              setTagsSavePending(true);
              try {
                const updated = await unitsApi.patchUnitClient(
                  unitId,
                  clientId,
                  { tagDefinitionIds }
                );
                queryClient.setQueryData(
                  ['unit-client', unitId, clientId],
                  updated
                );
                setSelectedTagIds((updated.definitions ?? []).map((d) => d.id));
                void queryClient.invalidateQueries({
                  queryKey: ['unit-clients', unitId]
                });
                void queryClient.invalidateQueries({
                  queryKey: ['client-history', unitId, clientId]
                });
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                toast.error(t('tagsSaveError'), { description: msg });
                throw err;
              } finally {
                setTagsSavePending(false);
              }
            }}
          />
          {saveError ? (
            <p className='text-destructive text-sm'>{saveError}</p>
          ) : null}
          <Button
            type='button'
            disabled={saveMutation.isPending || isPristine}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? (
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
            ) : null}
            {t('save')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('historyTitle')}</CardTitle>
          <CardDescription>{t('historyDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          {historyQuery.isLoading ? (
            <div className='flex justify-center py-8'>
              <Loader2 className='text-muted-foreground h-8 w-8 animate-spin' />
            </div>
          ) : historyQuery.isError ? (
            <p className='text-destructive text-sm'>
              {t('historyError', {
                message: (historyQuery.error as Error)?.message ?? ''
              })}
            </p>
          ) : historyFlat.length === 0 ? (
            <p className='text-muted-foreground text-sm'>{t('historyEmpty')}</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className='whitespace-nowrap'>
                      {t('historyColWhen')}
                    </TableHead>
                    <TableHead>{t('historyColActor')}</TableHead>
                    <TableHead>{t('historyColWhat')}</TableHead>
                    <TableHead>{t('historyColDetails')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyFlat.map((hRow) => {
                    const when =
                      hRow.createdAt != null && hRow.createdAt !== ''
                        ? format.dateTime(new Date(hRow.createdAt), {
                            dateStyle: 'short',
                            timeStyle: 'medium'
                          })
                        : '—';
                    const actor =
                      (hRow.actorName ?? '').trim() ||
                      (hRow.actorUserId ?? '').trim();
                    const src =
                      typeof hRow.payload.source === 'string'
                        ? hRow.payload.source
                        : '';
                    const sourceLabel =
                      src && t.has(`historySource_${src}`)
                        ? t(`historySource_${src}`)
                        : src || null;
                    const actionKey = `historyAction_${hRow.action}`;
                    const actionLabel = t.has(actionKey)
                      ? t(actionKey)
                      : hRow.action;
                    return (
                      <TableRow key={hRow.id}>
                        <TableCell className='align-top whitespace-nowrap'>
                          {when}
                        </TableCell>
                        <TableCell className='align-top text-sm'>
                          {actor || t('historyActorUnknown')}
                        </TableCell>
                        <TableCell className='align-top text-sm'>
                          <div className='font-medium'>{actionLabel}</div>
                          {sourceLabel ? (
                            <div className='text-muted-foreground text-xs'>
                              {sourceLabel}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell className='align-top'>
                          <ClientHistoryDetails row={hRow} t={t} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {historyQuery.hasNextPage ? (
                <Button
                  type='button'
                  variant='outline'
                  className='mt-4'
                  disabled={historyQuery.isFetchingNextPage}
                  onClick={() => historyQuery.fetchNextPage()}
                >
                  {historyQuery.isFetchingNextPage ? (
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  ) : null}
                  {t('historyLoadMore')}
                </Button>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('visitsTitle')}</CardTitle>
          <CardDescription>{t('visitsDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          {visitsQuery.isLoading ? (
            <div className='flex justify-center py-8'>
              <Loader2 className='text-muted-foreground h-8 w-8 animate-spin' />
            </div>
          ) : visitsQuery.isError ? (
            <p className='text-destructive text-sm'>
              {t('visitsError', {
                message: (visitsQuery.error as Error)?.message ?? ''
              })}
            </p>
          ) : visitsFlat.length === 0 ? (
            <p className='text-muted-foreground text-sm'>{t('visitsEmpty')}</p>
          ) : (
            <>
              <div className='w-full overflow-x-auto'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('visitQueue')}</TableHead>
                      <TableHead>{t('visitStatus')}</TableHead>
                      <TableHead>{t('visitService')}</TableHead>
                      <TableHead>{t('visitTransfers')}</TableHead>
                      <TableHead>{t('visitOperator')}</TableHead>
                      <TableHead>{t('visitCreated')}</TableHead>
                      <TableHead>{t('visitComment')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visitsFlat.map((tk) => {
                      const statusLabel = ticketStatusT.has(tk.status)
                        ? ticketStatusT(tk.status)
                        : tk.status;
                      const created =
                        tk.createdAt != null && tk.createdAt !== ''
                          ? format.dateTime(new Date(tk.createdAt), {
                              dateStyle: 'short',
                              timeStyle: 'medium'
                            })
                          : '—';
                      const comment = (tk.operatorComment ?? '').trim();
                      const serviceName = ticketServiceDisplayName(tk, locale);
                      const operatorName = (tk.servedByName ?? '').trim();
                      return (
                        <TableRow key={tk.id}>
                          <TableCell className='align-top'>
                            {tk.queueNumber ?? tk.id.slice(0, 8)}
                          </TableCell>
                          <TableCell className='align-top'>
                            {statusLabel}
                          </TableCell>
                          <TableCell className='align-top'>
                            {serviceName}
                          </TableCell>
                          <TableCell className='max-w-[16rem] align-top text-sm'>
                            {tk.transferTrail?.length ? (
                              <VisitTransferTrail
                                trail={tk.transferTrail}
                                locale={locale}
                                embedded
                              />
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell className='max-w-[14rem] align-top text-sm'>
                            {operatorName ? operatorName : '—'}
                          </TableCell>
                          <TableCell className='align-top whitespace-nowrap'>
                            {created}
                          </TableCell>
                          <TableCell
                            className='max-w-xl min-w-[14rem] align-top text-sm break-words whitespace-pre-wrap'
                            title={comment || undefined}
                          >
                            {comment ? comment : '—'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {visitsQuery.hasNextPage ? (
                <Button
                  type='button'
                  variant='outline'
                  className='mt-4'
                  disabled={visitsQuery.isFetchingNextPage}
                  onClick={() => visitsQuery.fetchNextPage()}
                >
                  {visitsQuery.isFetchingNextPage ? (
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  ) : null}
                  {t('visitsLoadMore')}
                </Button>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}

export default function UnitClientDetailPage({
  params
}: {
  params: Promise<{ unitId: string; clientId: string }>;
}) {
  const { unitId, clientId } = use(params);
  const t = useTranslations('clients');

  const {
    data: client,
    isLoading,
    isError,
    error
  } = useQuery({
    queryKey: ['unit-client', unitId, clientId],
    queryFn: () => unitsApi.getUnitClient(unitId, clientId)
  });

  const listHref = `/clients/${unitId}`;

  if (isLoading) {
    return (
      <div className='flex min-h-[40vh] items-center justify-center p-8'>
        <Loader2 className='text-muted-foreground h-10 w-10 animate-spin' />
      </div>
    );
  }

  if (isError || !client) {
    return (
      <div className={`container mx-auto ${CLIENT_DETAIL_MAX_WIDTH} p-4`}>
        <p className='text-destructive text-sm'>
          {t('detailLoadError', {
            message: (error as Error)?.message ?? ''
          })}
        </p>
        <Link
          href={listHref}
          className='text-primary mt-4 inline-block text-sm underline'
        >
          {t('backToList')}
        </Link>
      </div>
    );
  }

  return (
    <div
      className={`container mx-auto ${CLIENT_DETAIL_MAX_WIDTH} space-y-8 p-4`}
    >
      <div>
        <Button variant='ghost' size='sm' className='mb-2 -ml-2' asChild>
          <Link href={listHref}>
            <ChevronLeft className='mr-1 h-4 w-4' />
            {t('backToList')}
          </Link>
        </Button>
        <h1 className='text-2xl font-bold'>{t('detailTitle')}</h1>
      </div>

      <ClientDetailForm
        key={`${client.id}-${client.updatedAt ?? ''}`}
        unitId={unitId}
        clientId={clientId}
        initial={client}
      />
    </div>
  );
}
