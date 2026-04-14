'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ApiHttpError } from '@/lib/api';
import {
  createSurveyDefinition,
  getUnitsUnitIdSurveys,
  patchUnitsUnitIdSurveysSurveyId,
  postUnitsUnitIdSurveysSurveyIdActivate,
  type HandlersCreateSurveyRequestDisplayTheme,
  type HandlersCreateSurveyRequestIdleScreen,
  type HandlersCreateSurveyRequestQuestions,
  type HandlersPatchSurveyRequestDisplayTheme,
  type HandlersPatchSurveyRequestIdleScreen,
  type HandlersPatchSurveyRequestQuestions,
  type ModelsSurveyDefinition
} from '@/lib/api/generated/surveys';
import {
  GuestSurveyTerminalThemeFields,
  defaultGuestSurveyTerminalThemeDraft,
  themeDraftFromDisplayThemeRaw
} from '@/components/admin/units/guest-survey-terminal-theme-fields';
import { terminalThemeDraftToApiPayload } from '@/lib/guest-survey-terminal-theme-payload';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Link } from '@/src/i18n/navigation';
import { GuestSurveyBlocksEditor } from '@/components/admin/units/guest-survey-blocks-editor';
import { GuestSurveyCompletionEditor } from '@/components/admin/units/guest-survey-completion-editor';
import { GuestSurveyIdleScreenFields } from '@/components/admin/units/guest-survey-idle-screen-fields';
import {
  buildCompletionMessagePayload,
  parseCompletionMessageFromRow
} from '@/lib/guest-survey-completion';
import {
  defaultGuestSurveyDrafts,
  draftsToQuestionsPayload,
  parseDraftsFromQuestionsJson,
  validateDrafts,
  type GuestSurveyBlockDraft,
  type GuestSurveyDisplayMode,
  type ValidateDraftsErrorCode
} from '@/lib/guest-survey-blocks';
import {
  defaultIdleScreenDraft,
  idleScreenDraftFromRow,
  idleScreenDraftToApiPayload,
  validateIdleScreenDraft,
  type IdleScreenDraft,
  type IdleScreenDraftValidationError
} from '@/lib/guest-survey-idle-draft';

function isFeatureLockedError(e: unknown): boolean {
  return (
    e instanceof ApiHttpError &&
    (e.status === 403 || e.code === 'FEATURE_LOCKED')
  );
}

export function UnitGuestSurveySettings({ unitId }: { unitId: string }) {
  const t = useTranslations('admin.guest_survey');
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [blocks, setBlocks] = useState<GuestSurveyBlockDraft[]>(() =>
    defaultGuestSurveyDrafts()
  );
  const [displayMode, setDisplayMode] =
    useState<GuestSurveyDisplayMode>('single_page');
  const [completionEn, setCompletionEn] = useState('');
  const [completionRu, setCompletionRu] = useState('');

  const [editOpen, setEditOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<ModelsSurveyDefinition | null>(
    null
  );
  const [editTitle, setEditTitle] = useState('');
  const [editBlocks, setEditBlocks] = useState<GuestSurveyBlockDraft[]>([]);
  const [editDisplayMode, setEditDisplayMode] =
    useState<GuestSurveyDisplayMode>('single_page');
  const [editCompletionEn, setEditCompletionEn] = useState('');
  const [editCompletionRu, setEditCompletionRu] = useState('');
  const [themeDraft, setThemeDraft] = useState(
    defaultGuestSurveyTerminalThemeDraft
  );
  const [editThemeDraft, setEditThemeDraft] = useState(
    defaultGuestSurveyTerminalThemeDraft
  );
  const [createIdleDraft, setCreateIdleDraft] = useState(
    defaultIdleScreenDraft
  );
  const [editIdleDraft, setEditIdleDraft] = useState(defaultIdleScreenDraft);

  const listKey = useMemo(() => ['surveys', unitId] as const, [unitId]);

  const {
    data: rows,
    isLoading,
    error
  } = useQuery({
    queryKey: listKey,
    queryFn: async () => {
      const res = await getUnitsUnitIdSurveys(unitId);
      return res.data ?? [];
    }
  });

  const runValidation = (
    drafts: GuestSurveyBlockDraft[]
  ): ValidateDraftsErrorCode | null => validateDrafts(drafts);

  const runIdleValidation = (
    d: IdleScreenDraft
  ): IdleScreenDraftValidationError | null => validateIdleScreenDraft(d);

  const createMut = useMutation({
    mutationFn: async () => {
      const err = runValidation(blocks);
      if (err) throw new Error(err);
      const idleErr = runIdleValidation(createIdleDraft);
      if (idleErr) throw new Error(idleErr);
      const themePayload = terminalThemeDraftToApiPayload(themeDraft);
      if (themePayload === null) throw new Error('theme_invalid');
      const questions = draftsToQuestionsPayload(blocks, displayMode);
      const cm = buildCompletionMessagePayload(completionEn, completionRu);
      const idlePayload =
        createIdleDraft.slides.length > 0
          ? idleScreenDraftToApiPayload(createIdleDraft)
          : undefined;
      return createSurveyDefinition(unitId, {
        title: title.trim(),
        questions: questions as HandlersCreateSurveyRequestQuestions,
        displayTheme: themePayload as HandlersCreateSurveyRequestDisplayTheme,
        ...(cm ? { completionMessage: cm } : {}),
        ...(idlePayload
          ? {
              idleScreen:
                idlePayload as unknown as HandlersCreateSurveyRequestIdleScreen
            }
          : {})
      });
    },
    onSuccess: () => {
      toast.success(t('create'));
      setTitle('');
      setBlocks(defaultGuestSurveyDrafts());
      setDisplayMode('single_page');
      setCompletionEn('');
      setCompletionRu('');
      setThemeDraft(defaultGuestSurveyTerminalThemeDraft());
      setCreateIdleDraft(defaultIdleScreenDraft());
      qc.invalidateQueries({ queryKey: listKey });
    },
    onError: (e: unknown) => {
      if (e instanceof Error && e.message !== 'save_error') {
        const code = e.message as ValidateDraftsErrorCode;
        if (
          [
            'empty_blocks',
            'block_id_required',
            'duplicate_id',
            'scale_label_required',
            'info_label_required',
            'scale_range',
            'scale_icon_preset_required',
            'scale_presentation_invalid'
          ].includes(code)
        ) {
          toast.error(t(`validation_${code}` as Parameters<typeof t>[0]));
          return;
        }
        const idleCode = e.message as IdleScreenDraftValidationError;
        if (
          idleCode === 'idle_interval' ||
          idleCode === 'idle_text_empty' ||
          idleCode === 'idle_media_missing'
        ) {
          toast.error(t(`validation_${idleCode}` as Parameters<typeof t>[0]));
          return;
        }
      }
      if (e instanceof Error && e.message === 'theme_invalid') {
        toast.error(t('terminal_theme_invalid'));
        return;
      }
      if (isFeatureLockedError(e)) {
        toast.error(t('feature_locked'));
        return;
      }
      toast.error(t('save_error'));
    }
  });

  const patchMut = useMutation({
    mutationFn: async () => {
      if (!editingRow?.id) throw new Error('no_row');
      const err = runValidation(editBlocks);
      if (err) throw new Error(err);
      const idleErr = runIdleValidation(editIdleDraft);
      if (idleErr) throw new Error(idleErr);
      const themePayload = terminalThemeDraftToApiPayload(editThemeDraft);
      if (themePayload === null) throw new Error('theme_invalid');
      const questions = draftsToQuestionsPayload(editBlocks, editDisplayMode);
      const cm =
        buildCompletionMessagePayload(editCompletionEn, editCompletionRu) ?? {};
      const idlePayload = idleScreenDraftToApiPayload(editIdleDraft);
      await patchUnitsUnitIdSurveysSurveyId(unitId, editingRow.id, {
        title: editTitle.trim(),
        questions: questions as HandlersPatchSurveyRequestQuestions,
        completionMessage: cm,
        displayTheme: themePayload as HandlersPatchSurveyRequestDisplayTheme,
        idleScreen:
          idlePayload as unknown as HandlersPatchSurveyRequestIdleScreen
      });
    },
    onSuccess: () => {
      toast.success(t('save_changes'));
      setEditOpen(false);
      setEditingRow(null);
      qc.invalidateQueries({ queryKey: listKey });
    },
    onError: (e: unknown) => {
      if (e instanceof Error && e.message !== 'save_error') {
        const code = e.message as ValidateDraftsErrorCode;
        if (
          [
            'empty_blocks',
            'block_id_required',
            'duplicate_id',
            'scale_label_required',
            'info_label_required',
            'scale_range',
            'scale_icon_preset_required',
            'scale_presentation_invalid'
          ].includes(code)
        ) {
          toast.error(t(`validation_${code}` as Parameters<typeof t>[0]));
          return;
        }
        const idleCode = e.message as IdleScreenDraftValidationError;
        if (
          idleCode === 'idle_interval' ||
          idleCode === 'idle_text_empty' ||
          idleCode === 'idle_media_missing'
        ) {
          toast.error(t(`validation_${idleCode}` as Parameters<typeof t>[0]));
          return;
        }
      }
      if (e instanceof Error && e.message === 'theme_invalid') {
        toast.error(t('terminal_theme_invalid'));
        return;
      }
      if (isFeatureLockedError(e)) {
        toast.error(t('feature_locked'));
        return;
      }
      toast.error(t('save_error'));
    }
  });

  const activateMut = useMutation({
    mutationFn: (surveyId: string) =>
      postUnitsUnitIdSurveysSurveyIdActivate(unitId, surveyId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listKey });
    },
    onError: (e: unknown) => {
      if (isFeatureLockedError(e)) {
        toast.error(t('feature_locked'));
        return;
      }
      toast.error(t('activate_error'));
    }
  });

  const openEdit = (row: ModelsSurveyDefinition) => {
    const parsed = parseDraftsFromQuestionsJson(row.questions);
    const { en, ru } = parseCompletionMessageFromRow(row.completionMessage);
    setEditingRow(row);
    setEditTitle(row.title ?? '');
    setEditDisplayMode(parsed.displayMode);
    setEditBlocks(
      parsed.drafts.length > 0 ? parsed.drafts : defaultGuestSurveyDrafts()
    );
    setEditCompletionEn(en);
    setEditCompletionRu(ru);
    setEditThemeDraft(themeDraftFromDisplayThemeRaw(row.displayTheme));
    setEditIdleDraft(idleScreenDraftFromRow(row.idleScreen, unitId));
    setEditOpen(true);
  };

  const handleCreateClick = () => {
    if (!title.trim()) return;
    const err = runValidation(blocks);
    if (err) {
      toast.error(t(`validation_${err}` as Parameters<typeof t>[0]));
      return;
    }
    if (terminalThemeDraftToApiPayload(themeDraft) === null) {
      toast.error(t('terminal_theme_invalid'));
      return;
    }
    const idleErr = runIdleValidation(createIdleDraft);
    if (idleErr) {
      toast.error(t(`validation_${idleErr}` as Parameters<typeof t>[0]));
      return;
    }
    createMut.mutate();
  };

  const handleSaveEdit = () => {
    if (!editTitle.trim()) {
      toast.error(t('validation_title_required'));
      return;
    }
    const err = runValidation(editBlocks);
    if (err) {
      toast.error(t(`validation_${err}` as Parameters<typeof t>[0]));
      return;
    }
    if (terminalThemeDraftToApiPayload(editThemeDraft) === null) {
      toast.error(t('terminal_theme_invalid'));
      return;
    }
    const idleErr = runIdleValidation(editIdleDraft);
    if (idleErr) {
      toast.error(t(`validation_${idleErr}` as Parameters<typeof t>[0]));
      return;
    }
    patchMut.mutate();
  };

  if (error && isFeatureLockedError(error)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('feature_locked')}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className='space-y-8'>
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <p className='text-muted-foreground text-sm'>
            <Link
              href='/settings/desktop-terminals'
              className='text-primary underline'
            >
              {t('desktop_terminals_link_label')}
            </Link>{' '}
            {t('counter_pairing_hint')}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('create')}</CardTitle>
          <CardDescription>{t('builder_hint')}</CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid gap-2'>
            <Label htmlFor='sv-title'>{t('title_label')}</Label>
            <Input
              id='sv-title'
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('title_placeholder')}
            />
          </div>
          <div className='border-border flex flex-col gap-2 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between'>
            <div className='space-y-1'>
              <Label
                htmlFor='sv-display-stepped'
                className='text-sm font-medium'
              >
                {t('display_mode_stepped_label')}
              </Label>
              <p className='text-muted-foreground text-xs'>
                {t('display_mode_stepped_hint')}
              </p>
            </div>
            <Switch
              id='sv-display-stepped'
              checked={displayMode === 'stepped'}
              onCheckedChange={(on) =>
                setDisplayMode(on ? 'stepped' : 'single_page')
              }
              className='shrink-0'
            />
          </div>
          <div className='grid gap-2'>
            <Label>{t('blocks_label')}</Label>
            <GuestSurveyBlocksEditor blocks={blocks} onChange={setBlocks} />
          </div>
          <div className='grid gap-2'>
            <Label>{t('completion_section_label')}</Label>
            <p className='text-muted-foreground text-xs'>
              {t('completion_hint')}
            </p>
            <p className='text-muted-foreground text-xs'>
              {t('completion_images_hint')}
            </p>
            <Tabs defaultValue='en' className='w-full'>
              <TabsList>
                <TabsTrigger value='en'>{t('completion_tab_en')}</TabsTrigger>
                <TabsTrigger value='ru'>{t('completion_tab_ru')}</TabsTrigger>
              </TabsList>
              <TabsContent value='en' className='mt-3'>
                <GuestSurveyCompletionEditor
                  unitId={unitId}
                  markdown={completionEn}
                  onChange={setCompletionEn}
                  placeholder={t('completion_placeholder')}
                />
              </TabsContent>
              <TabsContent value='ru' className='mt-3'>
                <GuestSurveyCompletionEditor
                  unitId={unitId}
                  markdown={completionRu}
                  onChange={setCompletionRu}
                  placeholder={t('completion_placeholder')}
                />
              </TabsContent>
            </Tabs>
          </div>
          <GuestSurveyIdleScreenFields
            unitId={unitId}
            draft={createIdleDraft}
            onChange={setCreateIdleDraft}
            idPrefix='sv-create-idle'
            t={t}
            onUploadError={(key) =>
              toast.error(t(key as Parameters<typeof t>[0]))
            }
          />
          <GuestSurveyTerminalThemeFields
            idPrefix='sv-create'
            draft={themeDraft}
            onChange={setThemeDraft}
            t={t}
          />
          <Button
            disabled={!title.trim() || createMut.isPending}
            onClick={handleCreateClick}
          >
            {createMut.isPending ? '…' : t('create')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('list_title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className='text-destructive text-sm'>{t('load_error')}</p>
          ) : isLoading ? (
            <p className='text-muted-foreground text-sm'>…</p>
          ) : (rows?.length ?? 0) === 0 ? (
            <p className='text-muted-foreground text-sm'>{t('empty')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('title_label')}</TableHead>
                  <TableHead>{t('table_status')}</TableHead>
                  <TableHead className='text-right'>
                    {t('table_actions')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(rows ?? []).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className='font-medium'>{r.title}</TableCell>
                    <TableCell>
                      {r.isActive ? (
                        <Badge>{t('active_badge')}</Badge>
                      ) : (
                        <span className='text-muted-foreground text-sm'>—</span>
                      )}
                    </TableCell>
                    <TableCell className='text-right'>
                      <div className='flex flex-wrap justify-end gap-2'>
                        <Button
                          variant='outline'
                          size='sm'
                          onClick={() => openEdit(r)}
                        >
                          {t('edit_survey')}
                        </Button>
                        {!r.isActive && r.id && (
                          <Button
                            variant='outline'
                            size='sm'
                            disabled={activateMut.isPending}
                            onClick={() => activateMut.mutate(r.id!)}
                          >
                            {t('activate')}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={editOpen}
        onOpenChange={(o) => {
          if (!o) {
            setEditOpen(false);
            setEditingRow(null);
          }
        }}
      >
        <DialogContent
          overlayClassName='z-[200]'
          className='z-[200] flex max-h-[90vh] flex-col gap-4 overflow-hidden sm:max-w-3xl'
        >
          <DialogHeader>
            <DialogTitle>{t('edit_survey')}</DialogTitle>
          </DialogHeader>
          <div className='min-h-0 flex-1 overflow-y-auto pr-1'>
            <div className='grid gap-4 py-2'>
              <div className='grid gap-2'>
                <Label htmlFor='sv-edit-title'>{t('title_label')}</Label>
                <Input
                  id='sv-edit-title'
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                />
              </div>
              <div className='border-border flex flex-col gap-2 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between'>
                <div className='space-y-1'>
                  <Label
                    htmlFor='sv-edit-display-stepped'
                    className='text-sm font-medium'
                  >
                    {t('display_mode_stepped_label')}
                  </Label>
                  <p className='text-muted-foreground text-xs'>
                    {t('display_mode_stepped_hint')}
                  </p>
                </div>
                <Switch
                  id='sv-edit-display-stepped'
                  checked={editDisplayMode === 'stepped'}
                  onCheckedChange={(on) =>
                    setEditDisplayMode(on ? 'stepped' : 'single_page')
                  }
                  className='shrink-0'
                />
              </div>
              <GuestSurveyBlocksEditor
                blocks={editBlocks}
                onChange={setEditBlocks}
                idPrefix='sv-edit'
              />
              <div className='grid gap-2'>
                <Label>{t('completion_section_label')}</Label>
                <p className='text-muted-foreground text-xs'>
                  {t('completion_hint')}
                </p>
                <p className='text-muted-foreground text-xs'>
                  {t('completion_images_hint')}
                </p>
                <Tabs defaultValue='en' className='w-full'>
                  <TabsList>
                    <TabsTrigger value='en'>
                      {t('completion_tab_en')}
                    </TabsTrigger>
                    <TabsTrigger value='ru'>
                      {t('completion_tab_ru')}
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value='en' className='mt-3'>
                    <GuestSurveyCompletionEditor
                      unitId={unitId}
                      markdown={editCompletionEn}
                      onChange={setEditCompletionEn}
                      placeholder={t('completion_placeholder')}
                    />
                  </TabsContent>
                  <TabsContent value='ru' className='mt-3'>
                    <GuestSurveyCompletionEditor
                      unitId={unitId}
                      markdown={editCompletionRu}
                      onChange={setEditCompletionRu}
                      placeholder={t('completion_placeholder')}
                    />
                  </TabsContent>
                </Tabs>
              </div>
              <GuestSurveyIdleScreenFields
                unitId={unitId}
                draft={editIdleDraft}
                onChange={setEditIdleDraft}
                idPrefix='sv-edit-idle'
                t={t}
                onUploadError={(key) =>
                  toast.error(t(key as Parameters<typeof t>[0]))
                }
              />
              <GuestSurveyTerminalThemeFields
                idPrefix='sv-edit'
                draft={editThemeDraft}
                onChange={setEditThemeDraft}
                t={t}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => {
                setEditOpen(false);
                setEditingRow(null);
              }}
            >
              {t('cancel_edit')}
            </Button>
            <Button
              disabled={patchMut.isPending || !editTitle.trim()}
              onClick={handleSaveEdit}
            >
              {patchMut.isPending ? '…' : t('save_changes')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
