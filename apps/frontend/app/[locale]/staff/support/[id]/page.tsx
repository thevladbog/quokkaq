'use client';

import { useEffect, useState, use } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/src/i18n/navigation';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import {
  getGetSupportReportByIDQueryKey,
  getListSupportReportCommentsQueryKey,
  getListSupportReportShareCandidatesQueryKey,
  getListSupportReportSharesQueryKey,
  getListSupportReportsQueryKey,
  useAddSupportReportShare,
  useGetSupportReportByID,
  useListSupportReportComments,
  useListSupportReportShareCandidates,
  useListSupportReportShares,
  useMarkSupportReportIrrelevant,
  usePostSupportReportComment,
  useRemoveSupportReportShare
} from '@/lib/api/generated/support';
import { isApiHttpError } from '@/lib/api-errors';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const YANDEX_TRACKER_BACKEND = 'yandex_tracker';

/** Tracker users that post portal/applicant messages on behalf of real users. */
const TRACKER_PORTAL_BOT_AUTHORS = new Set(['cerberus-bot']);

function isPortalTrackerBotAuthor(author: string | undefined): boolean {
  return TRACKER_PORTAL_BOT_AUTHORS.has((author ?? '').trim().toLowerCase());
}

function useDebouncedValue<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function shouldRetrySupportDetail(failureCount: number, err: unknown): boolean {
  if (isApiHttpError(err)) {
    const s = err.status;
    if (s >= 400 && s < 500) return false;
  }
  return failureCount < 3;
}

function shouldRetrySupportSubresource(
  failureCount: number,
  err: unknown
): boolean {
  if (isApiHttpError(err)) {
    const s = err.status;
    if (s >= 400 && s < 500) return false;
  }
  return failureCount < 2;
}

function formatDateTime(
  locale: string,
  iso: string | undefined,
  options: Intl.DateTimeFormatOptions
): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat(locale, options).format(d);
  } catch {
    return d.toISOString();
  }
}

export default function StaffSupportDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const locale = useLocale();
  const t = useTranslations('staff.support');
  const queryClient = useQueryClient();
  const dateTimeOpts: Intl.DateTimeFormatOptions = {
    dateStyle: 'medium',
    timeStyle: 'short'
  };
  const q = useGetSupportReportByID(id, {
    query: {
      enabled: Boolean(id),
      retry: shouldRetrySupportDetail
    }
  });

  const markMutation = useMarkSupportReportIrrelevant({
    mutation: {
      onSuccess: (res) => {
        if (res.status !== 200) {
          toast.error(t('markIrrelevantError'));
          return;
        }
        toast.success(t('markIrrelevantSuccess'));
        void queryClient.invalidateQueries({
          queryKey: getGetSupportReportByIDQueryKey(id)
        });
        void queryClient.invalidateQueries({
          queryKey: getListSupportReportsQueryKey()
        });
      },
      onError: (err) => {
        if (isApiHttpError(err) && err.status === 502) {
          toast.error(t('markIrrelevantUnavailable'));
          return;
        }
        toast.error(t('markIrrelevantError'));
      }
    }
  });

  const res = q.data;
  const r = res?.status === 200 ? res.data : undefined;
  const isYandex =
    (r?.ticketBackend ?? '').toLowerCase() === YANDEX_TRACKER_BACKEND;

  const commentsQ = useListSupportReportComments(
    id,
    { audience: 'staff' },
    {
      query: {
        enabled: Boolean(id) && Boolean(r) && isYandex,
        retry: shouldRetrySupportSubresource
      }
    }
  );

  const sharesQ = useListSupportReportShares(id, {
    query: {
      enabled: Boolean(id) && Boolean(r) && isYandex,
      retry: shouldRetrySupportSubresource
    }
  });

  const [shareSearch, setShareSearch] = useState('');
  const debouncedShareSearch = useDebouncedValue(shareSearch, 350);
  const candidatesQ = useListSupportReportShareCandidates(
    id,
    { q: debouncedShareSearch },
    {
      query: {
        enabled:
          Boolean(id) &&
          Boolean(r) &&
          isYandex &&
          debouncedShareSearch.trim().length >= 2,
        retry: shouldRetrySupportSubresource
      }
    }
  );

  const [commentText, setCommentText] = useState('');
  const [markIrrelevantDialogOpen, setMarkIrrelevantDialogOpen] =
    useState(false);

  const postComment = usePostSupportReportComment({
    mutation: {
      onSuccess: (out) => {
        if (out.status !== 204) {
          toast.error(t('commentSubmitError'));
          return;
        }
        toast.success(t('commentSubmitSuccess'));
        setCommentText('');
        void queryClient.invalidateQueries({
          queryKey: getListSupportReportCommentsQueryKey(id, {
            audience: 'staff'
          })
        });
      },
      onError: () => toast.error(t('commentSubmitError'))
    }
  });

  const addShare = useAddSupportReportShare({
    mutation: {
      onSuccess: (out) => {
        if (out.status !== 200) {
          toast.error(t('shareAddError'));
          return;
        }
        toast.success(t('shareAddSuccess'));
        setShareSearch('');
        void queryClient.invalidateQueries({
          queryKey: getListSupportReportSharesQueryKey(id)
        });
        void queryClient.invalidateQueries({
          queryKey: getListSupportReportShareCandidatesQueryKey(id, {
            q: debouncedShareSearch
          })
        });
      },
      onError: () => toast.error(t('shareAddError'))
    }
  });

  const removeShare = useRemoveSupportReportShare({
    mutation: {
      onSuccess: (out) => {
        if (out.status !== 200) {
          toast.error(t('shareRemoveError'));
          return;
        }
        toast.success(t('shareRemoveSuccess'));
        void queryClient.invalidateQueries({
          queryKey: getListSupportReportSharesQueryKey(id)
        });
      },
      onError: () => toast.error(t('shareRemoveError'))
    }
  });

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t('detailCopied'));
    } catch {
      toast.error(t('detailCopyError'));
    }
  };

  if (q.isLoading) {
    return (
      <div className='flex min-h-[40vh] items-center justify-center p-4'>
        <Loader2 className='text-primary h-10 w-10 animate-spin' />
      </div>
    );
  }

  if (q.isError) {
    const err = q.error;
    if (isApiHttpError(err)) {
      if (err.status === 404) {
        return (
          <div className='container mx-auto max-w-2xl p-4 md:p-6'>
            <p className='text-muted-foreground'>{t('detailNotFound')}</p>
            <Button variant='outline' className='mt-4' asChild>
              <Link href='/staff/support'>{t('myReports')}</Link>
            </Button>
          </div>
        );
      }
      if (err.status === 403) {
        return (
          <div className='container mx-auto max-w-2xl p-4 md:p-6'>
            <p className='text-destructive'>{t('detailForbidden')}</p>
            <Button variant='outline' className='mt-4' asChild>
              <Link href='/staff/support'>{t('myReports')}</Link>
            </Button>
          </div>
        );
      }
    }
    return (
      <div className='container mx-auto max-w-2xl p-4 md:p-6'>
        <p className='text-destructive'>{t('detailLoadError')}</p>
        <Button variant='outline' className='mt-4' asChild>
          <Link href='/staff/support'>{t('myReports')}</Link>
        </Button>
      </div>
    );
  }

  if (!res || res.status !== 200 || r == null) {
    return (
      <div className='container mx-auto max-w-2xl p-4 md:p-6'>
        <p className='text-destructive'>{t('detailLoadError')}</p>
        <Button variant='outline' className='mt-4' asChild>
          <Link href='/staff/support'>{t('myReports')}</Link>
        </Button>
      </div>
    );
  }

  const canMarkIrrelevant = !r.markedIrrelevantAt;

  const commentsOk =
    commentsQ.data?.status === 200 ? (commentsQ.data.data ?? []) : [];
  const commentsErr =
    commentsQ.isError ||
    (commentsQ.data &&
      commentsQ.data.status !== 200 &&
      commentsQ.data.status !== 501);
  const comments501 =
    commentsQ.data?.status === 501 ||
    (isApiHttpError(commentsQ.error) && commentsQ.error.status === 501);

  const sharesOk =
    sharesQ.data?.status === 200 ? (sharesQ.data.data ?? []) : [];
  const sharesErr =
    sharesQ.isError ||
    (sharesQ.data &&
      sharesQ.data.status !== 200 &&
      sharesQ.data.status !== 501);
  const shares501 =
    sharesQ.data?.status === 501 ||
    (isApiHttpError(sharesQ.error) && sharesQ.error.status === 501);

  const candidatesOk =
    candidatesQ.data?.status === 200 ? (candidatesQ.data.data ?? []) : [];

  const commentKindLabel = (kind: string | undefined) => {
    switch (kind) {
      case 'public':
        return t('commentKindPublic');
      case 'email':
        return t('commentKindEmail');
      default:
        return t('commentKindInternal');
    }
  };

  const commentBodyText = (c: (typeof commentsOk)[number]) => {
    const raw = c.displayText ?? c.text ?? '';
    if (c.kind === 'email' && raw.trim() === '') {
      return t('commentEmailEmptyBody');
    }
    return raw;
  };

  const portalApplicantDisplayName = (r.createdByName ?? '').trim();

  const commentAuthorLine = (c: (typeof commentsOk)[number]) => {
    if (isPortalTrackerBotAuthor(c.author)) {
      return portalApplicantDisplayName || t('commentAuthorUnknown');
    }
    return (c.author ?? '').trim() || t('commentAuthorUnknown');
  };

  const commentBodyRendered = (c: (typeof commentsOk)[number]) => {
    const body = commentBodyText(c);
    if (isPortalTrackerBotAuthor(c.author) && portalApplicantDisplayName) {
      return `${portalApplicantDisplayName}: ${body}`;
    }
    return body;
  };

  const bubbleClass = (kind: string | undefined) => {
    switch (kind) {
      case 'public':
        return 'border-emerald-500/40 bg-emerald-500/5';
      case 'email':
        return 'border-sky-500/40 bg-sky-500/5';
      default:
        return 'border-border bg-muted/30';
    }
  };

  return (
    <div className='container mx-auto max-w-6xl space-y-6 p-4 md:p-6'>
      <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <h1 className='text-3xl font-bold tracking-tight'>
            {t('detailTitle')}
          </h1>
          <p className='text-muted-foreground mt-1 text-sm'>
            {t('detailSubtitle')}
          </p>
        </div>
        <div className='flex flex-wrap gap-2'>
          {canMarkIrrelevant ? (
            <Button
              type='button'
              variant='secondary'
              disabled={markMutation.isPending}
              onClick={() => setMarkIrrelevantDialogOpen(true)}
            >
              {markMutation.isPending ? (
                <>
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' aria-hidden />
                  {t('submitting')}
                </>
              ) : (
                t('markIrrelevant')
              )}
            </Button>
          ) : null}
          <Button variant='outline' asChild>
            <Link href='/staff/support'>{t('myReports')}</Link>
          </Button>
          <Button variant='outline' asChild>
            <Link href='/staff'>{t('backToStaff')}</Link>
          </Button>
        </div>
      </div>

      <div className='grid gap-6 lg:grid-cols-[1fr_minmax(280px,360px)] lg:items-start'>
        <div className='min-w-0 space-y-6'>
          <Card>
            <CardHeader>
              <CardTitle className='text-lg'>
                {t('appealSectionTitle')}
              </CardTitle>
              <CardDescription className='sr-only'>{r.title}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className='bg-card rounded-xl border p-4 text-sm leading-relaxed whitespace-pre-wrap'>
                {r.description?.trim() ? r.description : t('appealEmpty')}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className='text-lg'>
                {t('commentsSectionTitle')}
              </CardTitle>
              {!isYandex ? (
                <CardDescription>{t('commentsUnavailable')}</CardDescription>
              ) : null}
            </CardHeader>
            <CardContent className='space-y-4'>
              {isYandex ? (
                <>
                  {commentsQ.isLoading ? (
                    <div className='flex justify-center py-8'>
                      <Loader2 className='text-muted-foreground h-8 w-8 animate-spin' />
                    </div>
                  ) : comments501 ? (
                    <p className='text-muted-foreground text-sm'>
                      {t('commentsUnavailable')}
                    </p>
                  ) : commentsErr ? (
                    <p className='text-destructive text-sm'>
                      {t('commentsLoadError')}
                    </p>
                  ) : commentsOk.length === 0 ? (
                    <p className='text-muted-foreground text-sm'>
                      {t('commentsEmpty')}
                    </p>
                  ) : (
                    <ScrollArea className='max-h-[min(60vh,520px)] pr-3'>
                      <div className='relative space-y-4 pl-4'>
                        <div
                          className='bg-border absolute top-1 bottom-1 left-1 w-px'
                          aria-hidden
                        />
                        {commentsOk.map((c) => {
                          const portalBot = isPortalTrackerBotAuthor(c.author);
                          return (
                            <div
                              key={c.id ?? `${c.createdAt}-${c.displayText}`}
                              className={cn(
                                'relative pl-4',
                                'flex w-full min-w-0',
                                portalBot ? 'justify-start' : 'justify-end'
                              )}
                            >
                              <div
                                className={cn(
                                  'max-w-[min(36rem,94%)] rounded-lg border p-3 text-sm shadow-sm',
                                  bubbleClass(c.kind)
                                )}
                              >
                                <div className='text-muted-foreground mb-1 flex flex-wrap items-center gap-2 text-xs'>
                                  <span className='text-foreground font-medium'>
                                    {commentKindLabel(c.kind)}
                                  </span>
                                  <span>·</span>
                                  <span>
                                    {formatDateTime(
                                      locale,
                                      c.createdAt,
                                      dateTimeOpts
                                    )}
                                  </span>
                                  <span>·</span>
                                  <span>{commentAuthorLine(c)}</span>
                                </div>
                                <p className='whitespace-pre-wrap'>
                                  {commentBodyRendered(c)}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  )}

                  <div className='space-y-3 border-t pt-4'>
                    <Label htmlFor='support-new-comment'>
                      {t('commentFormLabel')}
                    </Label>
                    <Textarea
                      id='support-new-comment'
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder={t('commentFormPlaceholder')}
                      rows={4}
                      disabled={postComment.isPending}
                    />
                    <Button
                      type='button'
                      disabled={postComment.isPending || !commentText.trim()}
                      onClick={() =>
                        postComment.mutate({
                          id,
                          data: { text: commentText }
                        })
                      }
                    >
                      {postComment.isPending ? (
                        <>
                          <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                          {t('submitting')}
                        </>
                      ) : (
                        t('commentSubmit')
                      )}
                    </Button>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <aside className='space-y-6 lg:sticky lg:top-6'>
          <Card>
            <CardHeader>
              <CardTitle className='text-lg'>{r.title}</CardTitle>
              <CardDescription>
                {t('sidebarMetaTitle')} · {t('detailStatus')}:{' '}
                {r.planeStatus?.trim() || '—'}
                {r.markedIrrelevantAt ? (
                  <span className='text-muted-foreground'>
                    {' '}
                    · {t('badgeIrrelevant')}
                  </span>
                ) : null}
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4 text-sm'>
              <dl className='grid gap-3 sm:grid-cols-1'>
                <div>
                  <dt className='text-muted-foreground'>{t('detailSeq')}</dt>
                  <dd className='font-mono tabular-nums'>
                    {r.planeSequenceId ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className='text-muted-foreground'>
                    {t('detailCreated')}
                  </dt>
                  <dd>{formatDateTime(locale, r.createdAt, dateTimeOpts)}</dd>
                </div>
                <div>
                  <dt className='text-muted-foreground'>
                    {t('detailUpdated')}
                  </dt>
                  <dd>{formatDateTime(locale, r.updatedAt, dateTimeOpts)}</dd>
                </div>
                <div>
                  <dt className='text-muted-foreground'>
                    {t('detailLastSync')}
                  </dt>
                  <dd>
                    {formatDateTime(locale, r.lastSyncedAt, dateTimeOpts)}
                  </dd>
                </div>
                {r.markedIrrelevantAt ? (
                  <div>
                    <dt className='text-muted-foreground'>
                      {t('badgeIrrelevant')}
                    </dt>
                    <dd className='text-muted-foreground'>
                      {formatDateTime(
                        locale,
                        r.markedIrrelevantAt,
                        dateTimeOpts
                      )}
                      {r.markedIrrelevantByUserId ? (
                        <span className='ml-1 font-mono text-xs'>
                          ({r.markedIrrelevantByUserId})
                        </span>
                      ) : null}
                    </dd>
                  </div>
                ) : null}
                {r.unitId ? (
                  <div>
                    <dt className='text-muted-foreground'>
                      {t('detailUnitId')}
                    </dt>
                    <dd className='font-mono text-xs break-all'>{r.unitId}</dd>
                  </div>
                ) : null}
                {r.traceId ? (
                  <div>
                    <dt className='text-muted-foreground'>
                      {t('detailTraceId')}
                    </dt>
                    <dd className='flex flex-wrap items-center gap-2'>
                      <span className='font-mono text-xs break-all'>
                        {r.traceId}
                      </span>
                      <Button
                        type='button'
                        variant='ghost'
                        size='sm'
                        className='h-7 shrink-0'
                        onClick={() => void copy(r.traceId!)}
                      >
                        {t('detailCopy')}
                      </Button>
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt className='text-muted-foreground'>
                    {t('detailExternalTicketId')}
                  </dt>
                  <dd className='flex flex-wrap items-center gap-2'>
                    <span className='font-mono text-xs break-all'>
                      {r.planeWorkItemId ?? '—'}
                    </span>
                    {r.planeWorkItemId ? (
                      <Button
                        type='button'
                        variant='ghost'
                        size='sm'
                        className='h-7 shrink-0'
                        onClick={() => void copy(r.planeWorkItemId!)}
                      >
                        {t('detailCopy')}
                      </Button>
                    ) : null}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {isYandex ? (
            <Card>
              <CardHeader>
                <CardTitle className='text-lg'>
                  {t('shareSectionTitle')}
                </CardTitle>
                <CardDescription>{t('shareSectionHint')}</CardDescription>
              </CardHeader>
              <CardContent className='space-y-4 text-sm'>
                {shares501 ? (
                  <p className='text-muted-foreground'>
                    {t('shareUnavailable')}
                  </p>
                ) : sharesErr ? (
                  <p className='text-destructive'>{t('shareLoadError')}</p>
                ) : (
                  <>
                    {sharesOk.length === 0 ? (
                      <p className='text-muted-foreground'>
                        {t('shareListEmpty')}
                      </p>
                    ) : (
                      <ul className='space-y-2'>
                        {sharesOk.map((s) => (
                          <li
                            key={s.userId}
                            className='flex items-center justify-between gap-2 rounded-md border px-2 py-1.5'
                          >
                            <span className='min-w-0 truncate'>
                              {s.displayName?.trim() || s.userId}
                            </span>
                            <Button
                              type='button'
                              variant='ghost'
                              size='icon'
                              className='text-destructive h-8 w-8 shrink-0'
                              disabled={removeShare.isPending}
                              onClick={() =>
                                removeShare.mutate({
                                  id,
                                  sharedWithUserId: s.userId ?? ''
                                })
                              }
                              aria-label={t('shareRemove')}
                            >
                              <Trash2 className='h-4 w-4' />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className='space-y-2 border-t pt-3'>
                      <Label htmlFor='share-search'>
                        {t('shareSearchHint')}
                      </Label>
                      <Input
                        id='share-search'
                        value={shareSearch}
                        onChange={(e) => setShareSearch(e.target.value)}
                        placeholder={t('shareSearchPlaceholder')}
                        autoComplete='off'
                      />
                      {debouncedShareSearch.trim().length >= 2 ? (
                        candidatesQ.isLoading ? (
                          <div className='flex justify-center py-4'>
                            <Loader2 className='text-muted-foreground h-6 w-6 animate-spin' />
                          </div>
                        ) : candidatesQ.data?.status === 501 ? (
                          <p className='text-muted-foreground text-xs'>
                            {t('shareUnavailable')}
                          </p>
                        ) : candidatesQ.data &&
                          candidatesQ.data.status !== 200 ? (
                          <p className='text-destructive text-xs'>
                            {t('shareLoadError')}
                          </p>
                        ) : candidatesOk.length === 0 ? (
                          <p className='text-muted-foreground text-xs'>
                            {t('shareCandidatesEmpty')}
                          </p>
                        ) : (
                          <ul className='max-h-48 space-y-1 overflow-y-auto rounded-md border p-1'>
                            {candidatesOk.map((u) => (
                              <li
                                key={u.userId}
                                className='hover:bg-muted/60 flex items-center justify-between gap-2 rounded-sm px-2 py-1'
                              >
                                <div className='min-w-0'>
                                  <div className='truncate font-medium'>
                                    {u.name || u.userId}
                                  </div>
                                  {u.email ? (
                                    <div className='text-muted-foreground truncate text-xs'>
                                      {u.email}
                                    </div>
                                  ) : null}
                                </div>
                                <Button
                                  type='button'
                                  size='sm'
                                  variant='secondary'
                                  className='shrink-0'
                                  disabled={addShare.isPending}
                                  onClick={() =>
                                    addShare.mutate({
                                      id,
                                      data: { userId: u.userId ?? '' }
                                    })
                                  }
                                >
                                  {t('shareAdd')}
                                </Button>
                              </li>
                            ))}
                          </ul>
                        )
                      ) : (
                        <p className='text-muted-foreground text-xs'>
                          {t('shareSearchPlaceholder')}
                        </p>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className='text-lg'>
                  {t('shareSectionTitle')}
                </CardTitle>
                <CardDescription>{t('shareUnavailable')}</CardDescription>
              </CardHeader>
            </Card>
          )}
        </aside>
      </div>

      <AlertDialog
        open={markIrrelevantDialogOpen}
        onOpenChange={setMarkIrrelevantDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('markIrrelevantConfirmTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription className='sr-only'>
              {t('markIrrelevantConfirmDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t('markIrrelevantConfirmCancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={markMutation.isPending}
              onClick={() => markMutation.mutate({ id })}
            >
              {t('markIrrelevantConfirmContinue')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
