'use client';

import { useId, useMemo, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useVisitorTagDefinitions } from '@/lib/hooks';
import { visitorTagPillStyles } from '@/lib/visitor-tag-styles';
import { cn } from '@/lib/utils';

type TFn = (
  key: string,
  values?: Record<string, string | number | Date>
) => string;

export type VisitorTagsPickerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unitId: string;
  initialSelectedIds: string[];
  /** Ticket flow: reason is required and sent to the API. Profile flow: section hidden. */
  auditReasonRequired: boolean;
  isPending?: boolean;
  onSave: (args: {
    tagDefinitionIds: string[];
    operatorComment?: string;
  }) => Promise<void>;
  t: TFn;
  /** Overrides `staff.visitor_context.tags_title` when set */
  title?: string;
  /** Overrides `staff.visitor_context.tags_hint` when set */
  description?: string;
};

export function VisitorTagsPickerDialog(props: VisitorTagsPickerDialogProps) {
  const initialKey = useMemo(
    () => [...props.initialSelectedIds].sort().join(','),
    [props.initialSelectedIds]
  );
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className='max-h-[min(90vh,36rem)] gap-0 overflow-hidden p-0 sm:max-w-md'>
        {props.open ? (
          <VisitorTagsPickerDialogInner key={initialKey} {...props} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function VisitorTagsPickerDialogInner({
  open,
  onOpenChange,
  unitId,
  initialSelectedIds,
  auditReasonRequired,
  isPending = false,
  onSave,
  t,
  title,
  description
}: VisitorTagsPickerDialogProps) {
  const reasonFieldId = useId();
  const searchFieldId = useId();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState(
    () => new Set(initialSelectedIds)
  );
  const [reasonDraft, setReasonDraft] = useState('');

  const {
    data: tagDefinitions = [],
    isLoading: tagDefinitionsLoading,
    isError: tagDefinitionsError,
    error: tagDefinitionsErr
  } = useVisitorTagDefinitions(unitId, { enabled: open && !!unitId });

  const sortedTagDefinitions = useMemo(() => {
    return [...tagDefinitions].sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.label.localeCompare(b.label);
    });
  }, [tagDefinitions]);

  const filteredDefinitions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sortedTagDefinitions;
    return sortedTagDefinitions.filter((def) =>
      def.label.toLowerCase().includes(q)
    );
  }, [sortedTagDefinitions, searchQuery]);

  const selectedTagListSorted = useMemo(
    () => [...selectedTagIds].sort(),
    [selectedTagIds]
  );

  const appliedListSorted = useMemo(
    () => [...initialSelectedIds].sort(),
    [initialSelectedIds]
  );

  const visitorTagsDirty =
    JSON.stringify(selectedTagListSorted) !== JSON.stringify(appliedListSorted);

  const toggleVisitorTag = (definitionId: string) => {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(definitionId)) next.delete(definitionId);
      else next.add(definitionId);
      return next;
    });
  };

  const handleSave = async () => {
    if (auditReasonRequired) {
      const reason = reasonDraft.trim();
      if (!reason) {
        toast.error(t('visitor_context.tags_reason_required'));
        return;
      }
    }

    const reason = reasonDraft.trim();
    try {
      await onSave({
        tagDefinitionIds: selectedTagListSorted,
        operatorComment: auditReasonRequired ? reason : undefined
      });
      toast.success(t('visitor_context.tags_saved'));
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(t('visitor_context.tags_save_error'), {
        description: msg
      });
    }
  };

  const dialogTitle = title ?? t('visitor_context.tags_title');
  const dialogDescription = description ?? t('visitor_context.tags_hint');

  const saveDisabled =
    !visitorTagsDirty ||
    isPending ||
    tagDefinitionsLoading ||
    sortedTagDefinitions.length === 0 ||
    (auditReasonRequired && !reasonDraft.trim());

  return (
    <>
      <DialogHeader className='border-border/50 space-y-1 border-b px-4 py-3 text-left'>
        <DialogTitle className='text-base'>{dialogTitle}</DialogTitle>
        <DialogDescription className='text-xs'>
          {dialogDescription}
        </DialogDescription>
      </DialogHeader>
      <div className='flex max-h-[min(60vh,22rem)] flex-col gap-3 overflow-hidden px-4 py-3'>
        <div className='shrink-0'>
          <Label
            htmlFor={searchFieldId}
            className='text-muted-foreground mb-1.5 block text-[10px] font-semibold tracking-wide uppercase'
          >
            {t('visitor_context.tags_search_label')}
          </Label>
          <Input
            id={searchFieldId}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('visitor_context.tags_search_placeholder')}
            className='h-9 text-sm'
            autoComplete='off'
          />
        </div>
        <div className='min-h-0 flex-1 overflow-y-auto'>
          {tagDefinitionsLoading ? (
            <div className='text-muted-foreground flex items-center gap-2 py-4 text-xs'>
              <Loader2 className='h-3.5 w-3.5 animate-spin' />
              {t('visitor_context.tags_loading')}
            </div>
          ) : tagDefinitionsError ? (
            <p className='text-destructive text-sm'>
              {t('visitor_context.tags_definitions_load_error', {
                message:
                  tagDefinitionsErr instanceof Error
                    ? tagDefinitionsErr.message
                    : ''
              })}
            </p>
          ) : sortedTagDefinitions.length === 0 ? (
            <p className='text-muted-foreground text-sm'>
              {t('visitor_context.tags_no_definitions')}
            </p>
          ) : filteredDefinitions.length === 0 ? (
            <p className='text-muted-foreground text-sm'>
              {t('visitor_context.tags_search_empty')}
            </p>
          ) : (
            <div className='flex flex-wrap gap-2 pb-1'>
              {filteredDefinitions.map((def) => {
                const on = selectedTagIds.has(def.id);
                return (
                  <button
                    key={def.id}
                    type='button'
                    aria-pressed={on}
                    disabled={isPending}
                    onClick={() => toggleVisitorTag(def.id)}
                    className={cn(
                      'inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-left text-[11px] font-medium transition-shadow',
                      'focus-visible:ring-ring focus-visible:ring-offset-background focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
                      'disabled:pointer-events-none disabled:opacity-50',
                      on
                        ? 'shadow-sm'
                        : 'border-border bg-background text-foreground'
                    )}
                    style={on ? visitorTagPillStyles(def.color) : undefined}
                    title={def.label}
                  >
                    {on ? (
                      <Check
                        aria-hidden
                        className='h-3 w-3 shrink-0 opacity-90'
                        strokeWidth={2.5}
                      />
                    ) : null}
                    <span className='min-w-0 truncate'>{def.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {auditReasonRequired ? (
          <div className='border-border/50 shrink-0 border-t pt-3'>
            <Label
              htmlFor={reasonFieldId}
              className='text-muted-foreground mb-1 block text-[10px] font-semibold tracking-wide uppercase'
            >
              {t('visitor_context.tags_reason_label')}
            </Label>
            <Textarea
              id={reasonFieldId}
              value={reasonDraft}
              onChange={(e) => setReasonDraft(e.target.value)}
              rows={2}
              className='text-sm'
              placeholder={t('visitor_context.tags_reason_placeholder')}
            />
          </div>
        ) : null}
      </div>
      <DialogFooter className='border-border/50 gap-2 border-t px-4 py-3 sm:justify-end'>
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={() => onOpenChange(false)}
          disabled={isPending}
        >
          {t('visitor_context.cancel_modal')}
        </Button>
        <Button
          type='button'
          size='sm'
          disabled={saveDisabled}
          onClick={() => void handleSave()}
        >
          {isPending
            ? t('visitor_context.tags_saving')
            : t('visitor_context.tags_save')}
        </Button>
      </DialogFooter>
    </>
  );
}
