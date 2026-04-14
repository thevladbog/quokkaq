'use client';

import { $createHeadingNode, $createQuoteNode } from '@lexical/rich-text';
import { usePublisher, useCellValue } from '@mdxeditor/gurx';
import type { ElementNode } from 'lexical';
import { $createParagraphNode } from 'lexical';
import { useMemo } from 'react';

import {
  activePlugins$,
  allowedHeadingLevels$,
  convertSelectionToNode$,
  currentBlockType$,
  useTranslation
} from '@mdxeditor/editor';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type BlockValue = 'paragraph' | 'quote' | `h${number}`;

function applyBlockType(
  convertSelectionToNode: (fn: () => ElementNode) => void,
  blockType: BlockValue
) {
  switch (blockType) {
    case 'quote':
      convertSelectionToNode(() => $createQuoteNode());
      break;
    case 'paragraph':
      convertSelectionToNode(() => $createParagraphNode());
      break;
    default:
      if (String(blockType).startsWith('h')) {
        convertSelectionToNode(() =>
          $createHeadingNode(
            blockType as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
          )
        );
      }
  }
}

type BtnProps = {
  value: BlockValue;
  label: string;
  title: string;
  current: string;
  readOnly?: boolean;
  onPick: (v: BlockValue) => void;
};

function BlockTypeButton({
  value,
  label,
  title,
  current,
  readOnly,
  onPick
}: BtnProps) {
  const active = current === value;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type='button'
          variant={active ? 'secondary' : 'ghost'}
          size='sm'
          disabled={readOnly}
          className={cn(
            'h-8 min-w-8 shrink-0 px-2 font-mono text-xs',
            active && 'bg-muted'
          )}
          onMouseDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            if (!readOnly) onPick(value);
          }}
          onKeyDown={(e) => {
            if (readOnly) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onPick(value);
            }
          }}
        >
          {label}
        </Button>
      </TooltipTrigger>
      <TooltipContent side='bottom'>{title}</TooltipContent>
    </Tooltip>
  );
}

type Props = {
  readOnly?: boolean;
};

/**
 * Paragraph / quote / heading controls without Radix Select (avoids dropdown portals
 * stacking under nested {@link Dialog}).
 */
export function GuestSurveyCompletionBlockTypeButtons({ readOnly }: Props) {
  const convertSelectionToNode = usePublisher(convertSelectionToNode$);
  const currentBlockType = useCellValue(currentBlockType$);
  const activePlugins = useCellValue(activePlugins$);
  const allowedHeadingLevels = useCellValue(allowedHeadingLevels$);
  const t = useTranslation();

  const hasQuote = activePlugins.includes('quote');
  const hasHeadings = activePlugins.includes('headings');

  const headingButtons = useMemo(
    () =>
      hasHeadings
        ? allowedHeadingLevels.map((n) => ({
            value: `h${n}` as const,
            label: `H${n}`,
            title: t('toolbar.blockTypes.heading', 'Heading {{level}}', {
              level: n
            })
          }))
        : [],
    [hasHeadings, allowedHeadingLevels, t]
  );

  if (!hasQuote && !hasHeadings) {
    return null;
  }

  const current = currentBlockType ?? '';

  const onPick = (v: BlockValue) => {
    applyBlockType(convertSelectionToNode, v);
  };

  return (
    <div
      className='border-border flex max-w-full flex-wrap items-center gap-1 border-r pr-2'
      role='group'
      aria-label={t(
        'toolbar.blockTypeSelect.selectBlockTypeTooltip',
        'Select block type'
      )}
    >
      <BlockTypeButton
        value='paragraph'
        label='P'
        title={t('toolbar.blockTypes.paragraph', 'Paragraph')}
        current={current}
        readOnly={readOnly}
        onPick={onPick}
      />
      {hasQuote ? (
        <BlockTypeButton
          value='quote'
          label='“'
          title={t('toolbar.blockTypes.quote', 'Quote')}
          current={current}
          readOnly={readOnly}
          onPick={onPick}
        />
      ) : null}
      {headingButtons.map((b) => (
        <BlockTypeButton
          key={b.value}
          value={b.value}
          label={b.label}
          title={b.title}
          current={current}
          readOnly={readOnly}
          onPick={onPick}
        />
      ))}
    </div>
  );
}
