'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import type { VisitorTagDefinition } from '@/lib/api';
import {
  useCreateVisitorTagDefinition,
  useDeleteVisitorTagDefinition,
  usePatchVisitorTagDefinition,
  useVisitorTagDefinitions
} from '@/lib/hooks';
import {
  isSafeVisitorTagHex,
  normalizeHex6,
  visitorTagPillStyles
} from '@/lib/visitor-tag-styles';

const DEFAULT_NEW_COLOR = '#6B7280';

interface UnitVisitorTagsSettingsProps {
  unitId: string;
}

type UnitsT = ReturnType<typeof useTranslations<'admin.units'>>;

function VisitorTagRow({
  unitId,
  tag,
  t,
  onRequestDelete,
  isDeleting
}: {
  unitId: string;
  tag: VisitorTagDefinition;
  t: UnitsT;
  onRequestDelete: (tag: VisitorTagDefinition) => void;
  isDeleting: boolean;
}) {
  const [label, setLabel] = useState(tag.label);
  const [color, setColor] = useState(tag.color);
  const [sortOrder, setSortOrder] = useState(String(tag.sortOrder));

  const patchMutation = usePatchVisitorTagDefinition();

  const dirty =
    label.trim() !== tag.label ||
    normalizeHex6(color) !== normalizeHex6(tag.color) ||
    Number(sortOrder) !== tag.sortOrder;

  const colorOk = isSafeVisitorTagHex(color);
  const pickerValue = colorOk ? normalizeHex6(color) : '#000000';

  const saving =
    patchMutation.isPending && patchMutation.variables?.definitionId === tag.id;

  const handleSave = () => {
    const l = label.trim();
    if (!l) {
      toast.error(t('visitor_tags.label_required'));
      return;
    }
    if (!isSafeVisitorTagHex(color)) {
      toast.error(t('visitor_tags.invalid_color'));
      return;
    }
    const so = Number.parseInt(sortOrder, 10);
    if (Number.isNaN(so)) {
      toast.error(t('visitor_tags.sort_invalid'));
      return;
    }
    patchMutation.mutate(
      {
        unitId,
        definitionId: tag.id,
        label: l,
        color: normalizeHex6(color),
        sortOrder: so
      },
      {
        onSuccess: () => toast.success(t('visitor_tags.updated')),
        onError: (err) => {
          const msg = err instanceof Error ? err.message : String(err);
          toast.error(t('visitor_tags.error'), { description: msg });
        }
      }
    );
  };

  return (
    <TableRow>
      <TableCell className='w-[140px] align-middle'>
        <span
          className='inline-flex max-w-[8rem] truncate rounded-full border px-2.5 py-0.5 text-xs font-medium'
          style={visitorTagPillStyles(colorOk ? color : tag.color)}
        >
          {label.trim() || tag.label}
        </span>
      </TableCell>
      <TableCell>
        <Label htmlFor={`vt-label-${tag.id}`} className='sr-only'>
          {t('visitor_tags.label')}
        </Label>
        <Input
          id={`vt-label-${tag.id}`}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className='max-w-xs'
        />
      </TableCell>
      <TableCell>
        <div className='flex max-w-xs items-center gap-2'>
          <input
            type='color'
            aria-label={t('visitor_tags.color')}
            className='border-input h-9 w-10 cursor-pointer rounded-md border bg-transparent p-0.5'
            value={pickerValue}
            onChange={(e) => setColor(e.target.value)}
          />
          <Input
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className='font-mono text-sm'
            spellCheck={false}
          />
        </div>
      </TableCell>
      <TableCell className='w-28'>
        <Input
          type='number'
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          className='font-mono text-sm'
        />
      </TableCell>
      <TableCell className='w-40 text-right'>
        <div className='flex justify-end gap-1'>
          <Button
            type='button'
            size='sm'
            variant='secondary'
            disabled={!dirty || !colorOk || saving}
            onClick={handleSave}
          >
            {saving ? (
              <Loader2 className='h-3.5 w-3.5 animate-spin' />
            ) : (
              t('visitor_tags.save')
            )}
          </Button>
          <Button
            type='button'
            size='icon'
            variant='ghost'
            className='text-destructive hover:text-destructive h-8 w-8'
            disabled={isDeleting}
            onClick={() => onRequestDelete(tag)}
            aria-label={t('visitor_tags.delete')}
          >
            {isDeleting ? (
              <Loader2 className='h-3.5 w-3.5 animate-spin' />
            ) : (
              <Trash2 className='h-3.5 w-3.5' />
            )}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function UnitVisitorTagsSettings({
  unitId
}: UnitVisitorTagsSettingsProps) {
  const t = useTranslations('admin.units');
  const {
    data: tags = [],
    isLoading,
    isError,
    error
  } = useVisitorTagDefinitions(unitId);
  const createMutation = useCreateVisitorTagDefinition();
  const deleteMutation = useDeleteVisitorTagDefinition();

  const [deleteTarget, setDeleteTarget] = useState<VisitorTagDefinition | null>(
    null
  );
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState(DEFAULT_NEW_COLOR);
  const [newSortOrder, setNewSortOrder] = useState('0');

  const sortedTags = useMemo(() => {
    return [...tags].sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.label.localeCompare(b.label);
    });
  }, [tags]);

  const newColorOk = isSafeVisitorTagHex(newColor);
  const newPicker = newColorOk ? normalizeHex6(newColor) : '#000000';

  const handleCreate = () => {
    const l = newLabel.trim();
    if (!l) {
      toast.error(t('visitor_tags.label_required'));
      return;
    }
    if (!isSafeVisitorTagHex(newColor)) {
      toast.error(t('visitor_tags.invalid_color'));
      return;
    }
    const so = Number.parseInt(newSortOrder, 10);
    if (Number.isNaN(so)) {
      toast.error(t('visitor_tags.sort_invalid'));
      return;
    }
    createMutation.mutate(
      {
        unitId,
        label: l,
        color: normalizeHex6(newColor),
        sortOrder: so
      },
      {
        onSuccess: () => {
          toast.success(t('visitor_tags.created'));
          setNewLabel('');
          setNewColor(DEFAULT_NEW_COLOR);
          setNewSortOrder('0');
        },
        onError: (err) => {
          const msg = err instanceof Error ? err.message : String(err);
          toast.error(t('visitor_tags.error'), { description: msg });
        }
      }
    );
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(
      { unitId, definitionId: deleteTarget.id },
      {
        onSuccess: () => {
          toast.success(t('visitor_tags.deleted'));
          setDeleteTarget(null);
        },
        onError: (err) => {
          const msg = err instanceof Error ? err.message : String(err);
          toast.error(t('visitor_tags.error'), { description: msg });
        }
      }
    );
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t('visitor_tags.title')}</CardTitle>
          <CardDescription>{t('visitor_tags.description')}</CardDescription>
        </CardHeader>
        <CardContent className='space-y-6'>
          {isLoading ? (
            <div className='text-muted-foreground flex items-center gap-2 text-sm'>
              <Loader2 className='h-4 w-4 animate-spin' />
              {t('visitor_tags.loading')}
            </div>
          ) : isError ? (
            <p className='text-destructive text-sm'>
              {t('visitor_tags.load_error', {
                message:
                  error instanceof Error ? error.message : String(error ?? '')
              })}
            </p>
          ) : sortedTags.length === 0 ? (
            <p className='text-muted-foreground text-sm'>
              {t('visitor_tags.empty')}
            </p>
          ) : (
            <div className='rounded-md border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className='w-[140px]'>
                      {t('visitor_tags.preview')}
                    </TableHead>
                    <TableHead>{t('visitor_tags.label')}</TableHead>
                    <TableHead>{t('visitor_tags.color')}</TableHead>
                    <TableHead className='w-28'>
                      {t('visitor_tags.sort_order')}
                    </TableHead>
                    <TableHead className='w-40 text-right'>
                      {t('visitor_tags.actions')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedTags.map((tag) => (
                    <VisitorTagRow
                      key={`${tag.id}-${tag.updatedAt ?? ''}-${tag.label}-${tag.color}-${tag.sortOrder}`}
                      unitId={unitId}
                      tag={tag}
                      t={t}
                      onRequestDelete={setDeleteTarget}
                      isDeleting={
                        deleteMutation.isPending &&
                        deleteMutation.variables?.definitionId === tag.id
                      }
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className='border-border space-y-4 rounded-lg border p-4'>
            <h4 className='text-sm font-medium'>
              {t('visitor_tags.add_section')}
            </h4>
            <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
              <div className='space-y-2'>
                <Label htmlFor='new-vt-label'>{t('visitor_tags.label')}</Label>
                <Input
                  id='new-vt-label'
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder={t('visitor_tags.label_placeholder')}
                />
              </div>
              <div className='space-y-2'>
                <Label>{t('visitor_tags.color')}</Label>
                <div className='flex items-center gap-2'>
                  <input
                    type='color'
                    aria-label={t('visitor_tags.color')}
                    className='border-input h-9 w-10 cursor-pointer rounded-md border bg-transparent p-0.5'
                    value={newPicker}
                    onChange={(e) => setNewColor(e.target.value)}
                  />
                  <Input
                    value={newColor}
                    onChange={(e) => setNewColor(e.target.value)}
                    className='font-mono text-sm'
                    spellCheck={false}
                  />
                </div>
              </div>
              <div className='space-y-2'>
                <Label htmlFor='new-vt-sort'>
                  {t('visitor_tags.sort_order')}
                </Label>
                <Input
                  id='new-vt-sort'
                  type='number'
                  value={newSortOrder}
                  onChange={(e) => setNewSortOrder(e.target.value)}
                  className='font-mono text-sm'
                />
              </div>
              <div className='flex items-end'>
                <Button
                  type='button'
                  onClick={handleCreate}
                  disabled={
                    createMutation.isPending || !newLabel.trim() || !newColorOk
                  }
                >
                  {createMutation.isPending ? (
                    <Loader2 className='h-4 w-4 animate-spin' />
                  ) : (
                    t('visitor_tags.create')
                  )}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('visitor_tags.delete_confirm_title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? t('visitor_tags.delete_confirm_desc', {
                    label: deleteTarget.label
                  })
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              {t('visitor_tags.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
            >
              {deleteMutation.isPending ? (
                <Loader2 className='h-4 w-4 animate-spin' />
              ) : (
                t('visitor_tags.delete')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
