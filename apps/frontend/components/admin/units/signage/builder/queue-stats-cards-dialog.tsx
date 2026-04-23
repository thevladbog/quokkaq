'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Settings2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { CssColorField } from './css-color-field';
import type { QueueStatCardConfig } from '@/lib/queue-stats-config';
import { cn } from '@/lib/utils';

type SortableCardProps = {
  card: QueueStatCardConfig;
  index: number;
  canEdit: boolean;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
  onUpdate: (index: number, updated: QueueStatCardConfig) => void;
};

function SortableCard({
  card,
  index,
  canEdit,
  t,
  onUpdate
}: SortableCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: card.type, disabled: !canEdit });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'bg-card grid grid-cols-[28px_1fr_110px_48px_48px_100px_100px_60px] items-center gap-2 rounded-md border px-3 py-2',
        isDragging && 'opacity-50 shadow-lg'
      )}
    >
      <button
        type='button'
        className={cn(
          'text-muted-foreground hover:text-foreground cursor-grab touch-none',
          !canEdit && 'cursor-not-allowed opacity-50'
        )}
        {...attributes}
        {...listeners}
        aria-label={t('props.queueStatsCardDrag', {
          default: 'Drag to reorder'
        })}
      >
        <GripVertical className='h-4 w-4' />
      </button>

      <div className='min-w-0'>
        <span className='text-sm font-medium'>
          {t(
            `props.queueStatsCard${card.type.charAt(0).toUpperCase()}${card.type.slice(1)}` as 'props.queueStatsCardQueueLength'
          )}
        </span>
      </div>

      {card.enabled ? (
        <>
          <Select
            value={String(card.width)}
            disabled={!canEdit}
            onValueChange={(v) => {
              onUpdate(index, { ...card, width: Number(v) as 1 | 2 });
            }}
          >
            <SelectTrigger className='h-8 text-xs'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='1'>
                {t('props.queueStatsCardWidth1', { default: '1 блок' })}
              </SelectItem>
              <SelectItem value='2'>
                {t('props.queueStatsCardWidth2', { default: '2 блока' })}
              </SelectItem>
            </SelectContent>
          </Select>

          <div className='flex justify-center'>
            <CssColorField
              id={`card-bg-${card.type}`}
              label=''
              value={card.backgroundColor}
              disabled={!canEdit}
              pickerFallback='#0f172a'
              compact
              onValueChange={(v) => {
                onUpdate(index, {
                  ...card,
                  backgroundColor: v || undefined
                });
              }}
            />
          </div>

          <div className='flex justify-center'>
            <CssColorField
              id={`card-fg-${card.type}`}
              label=''
              value={card.textColor}
              disabled={!canEdit}
              pickerFallback='#f8fafc'
              compact
              onValueChange={(v) => {
                onUpdate(index, { ...card, textColor: v || undefined });
              }}
            />
          </div>

          <Input
            type='text'
            placeholder='1.25rem'
            className='h-8 text-xs'
            disabled={!canEdit}
            value={card.labelFontSize ?? ''}
            onChange={(e) => {
              onUpdate(index, {
                ...card,
                labelFontSize: e.target.value || undefined
              });
            }}
          />

          <Input
            type='text'
            placeholder='2rem'
            className='h-8 text-xs'
            disabled={!canEdit}
            value={card.valueFontSize ?? ''}
            onChange={(e) => {
              onUpdate(index, {
                ...card,
                valueFontSize: e.target.value || undefined
              });
            }}
          />
        </>
      ) : (
        <>
          <div />
          <div />
          <div />
          <div />
          <div />
        </>
      )}

      <div className='flex justify-center'>
        <Switch
          checked={card.enabled}
          disabled={!canEdit}
          onCheckedChange={(checked) => {
            onUpdate(index, { ...card, enabled: checked });
          }}
        />
      </div>
    </div>
  );
}

type Props = {
  cards: QueueStatCardConfig[];
  canEdit: boolean;
  onSave: (cards: QueueStatCardConfig[]) => void;
};

export function QueueStatsCardsDialog({ cards, canEdit, onSave }: Props) {
  const t = useTranslations('admin.screenBuilder');
  const [open, setOpen] = useState(false);
  const [localCards, setLocalCards] = useState<QueueStatCardConfig[]>(cards);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setLocalCards((items) => {
      const oldIndex = items.findIndex((item) => item.type === active.id);
      const newIndex = items.findIndex((item) => item.type === over.id);
      const reordered = arrayMove(items, oldIndex, newIndex);
      return reordered.map((item, idx) => ({ ...item, order: idx }));
    });
  }, []);

  const handleUpdate = useCallback(
    (index: number, updated: QueueStatCardConfig) => {
      setLocalCards((prev) => {
        const next = [...prev];
        next[index] = updated;
        return next;
      });
    },
    []
  );

  const handleSave = useCallback(() => {
    onSave(localCards);
    setOpen(false);
  }, [localCards, onSave]);

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (newOpen) {
        setLocalCards(cards);
      }
      setOpen(newOpen);
    },
    [cards]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type='button'
          variant='outline'
          size='sm'
          className='h-8 w-full gap-2 text-xs'
          disabled={!canEdit}
        >
          <Settings2 className='h-3.5 w-3.5' />
          {t('props.queueStatsEditCards', { default: 'Edit cards' })}
        </Button>
      </DialogTrigger>
      <DialogContent className='max-h-[90vh] w-full max-w-[calc(100%-2rem)] overflow-hidden sm:max-w-6xl'>
        <DialogHeader className='pb-2'>
          <DialogTitle className='text-base'>
            {t('props.queueStatsCardsDialogTitle', {
              default: 'Queue stat cards'
            })}
          </DialogTitle>
          <DialogDescription className='text-xs'>
            {t('props.queueStatsCardsDialogDesc', {
              default:
                'Drag cards to reorder, toggle to show/hide, and customize colors.'
            })}
          </DialogDescription>
        </DialogHeader>

        <div className='text-muted-foreground mb-2 grid grid-cols-[28px_1fr_110px_48px_48px_100px_100px_60px] items-center gap-2 border-b pb-2 text-xs font-medium'>
          <div />
          <div>{t('props.queueStatsCardColumn', { default: 'Card' })}</div>
          <div>{t('props.queueStatsCardWidth', { default: 'Width' })}</div>
          <div className='text-center'>
            {t('props.queueStatsCardBg', { default: 'Bg' })}
          </div>
          <div className='text-center'>
            {t('props.queueStatsCardFg', { default: 'Text' })}
          </div>
          <div>
            {t('props.queueStatsCardLabelSize', { default: 'Label size' })}
          </div>
          <div>
            {t('props.queueStatsCardValueSize', { default: 'Value size' })}
          </div>
          <div className='text-center'>
            {t('props.queueStatsCardEnabled', { default: 'On' })}
          </div>
        </div>

        <div className='max-h-[calc(90vh-14rem)] space-y-2 overflow-y-auto pr-1'>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={localCards.map((c) => c.type)}
              strategy={verticalListSortingStrategy}
            >
              {localCards.map((card, idx) => (
                <SortableCard
                  key={card.type}
                  card={card}
                  index={idx}
                  canEdit={canEdit}
                  t={t}
                  onUpdate={handleUpdate}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>

        <div className='flex justify-end gap-2 border-t pt-3'>
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() => setOpen(false)}
          >
            {t('props.cancel', { default: 'Cancel' })}
          </Button>
          <Button type='button' size='sm' onClick={handleSave}>
            {t('props.save', { default: 'Save' })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
