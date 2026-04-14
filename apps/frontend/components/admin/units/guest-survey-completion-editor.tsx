'use client';

import dynamic from 'next/dynamic';

const Inner = dynamic(
  () =>
    import('./guest-survey-completion-editor-inner').then((m) => ({
      default: m.GuestSurveyCompletionEditorInner
    })),
  {
    ssr: false,
    loading: () => (
      <div className='bg-muted min-h-[200px] animate-pulse rounded-md border' />
    )
  }
);

type Props = {
  unitId: string;
  markdown: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  readOnly?: boolean;
};

export function GuestSurveyCompletionEditor(props: Props) {
  return <Inner {...props} />;
}
