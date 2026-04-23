'use client';

type Props = {
  showPreview: boolean;
  canvas: React.ReactNode;
  belowCanvas: React.ReactNode;
  preview: React.ReactNode;
};

/**
 * Canvas column with optional live preview stacked **below** the canvas (and belowCanvas slot).
 */
export function BuilderCanvasPreviewSplit({
  showPreview,
  canvas,
  belowCanvas,
  preview
}: Props) {
  return (
    <div className='min-w-0 space-y-0'>
      <div className='min-w-0'>{canvas}</div>
      {belowCanvas}
      {showPreview ? (
        <div className='mt-2 min-w-0 shrink-0'>{preview}</div>
      ) : null}
    </div>
  );
}
