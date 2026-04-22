'use client';

/**
 * Pill-style discount badge on plan cards (annual billing mode).
 */

type BubbleProps = {
  percent: number;
  labelTemplate: string;
};

export function AnnualPrepayDiscountBubble({
  percent,
  labelTemplate
}: BubbleProps) {
  const inner = labelTemplate.replaceAll('{percent}', String(percent));

  return (
    <div
      className='landing-annual-bubble pointer-events-none absolute -top-1 right-0 z-[4] sm:-right-1'
      aria-hidden
    >
      <div className='landing-annual-bubble__body font-display text-[0.7rem] font-black leading-none tracking-tight sm:text-xs'>
        {inner}
      </div>
    </div>
  );
}
