'use client';

import '@mdxeditor/editor/style.css';

import { useMemo } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

import {
  BoldItalicUnderlineToggles,
  CreateLink,
  DiffSourceToggleWrapper,
  diffSourcePlugin,
  headingsPlugin,
  imagePlugin,
  InsertImage,
  InsertThematicBreak,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  ListsToggle,
  markdownShortcutPlugin,
  MDXEditor,
  quotePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  UndoRedo
} from '@mdxeditor/editor';

import { GuestSurveyCompletionBlockTypeButtons } from '@/components/admin/units/guest-survey-completion-block-type-buttons';
import { GuestSurveyCompletionImageDialog } from '@/components/admin/units/guest-survey-completion-image-dialog';
import { createGuestSurveyCompletionImagePreviewHandler } from '@/components/guest-survey/guest-survey-completion-markdown';
import { ApiHttpError } from '@/lib/api';
import { uploadCompletionImage as uploadCompletionImageRequest } from '@/lib/api/generated/surveys';

type Props = {
  unitId: string;
  markdown: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  readOnly?: boolean;
};

async function uploadCompletionImage(
  unitId: string,
  file: File
): Promise<string> {
  const res = await uploadCompletionImageRequest(unitId, {
    file
  });
  if (res.status !== 200 || !res.data?.url) {
    throw new Error('bad_response');
  }
  return res.data.url;
}

export function GuestSurveyCompletionEditorInner({
  unitId,
  markdown,
  onChange,
  placeholder,
  readOnly
}: Props) {
  const t = useTranslations('admin.guest_survey');

  const completionImagePreviewHandler = useMemo(
    () =>
      createGuestSurveyCompletionImagePreviewHandler(() =>
        typeof window === 'undefined'
          ? null
          : localStorage.getItem('access_token')
      ),
    []
  );

  return (
    <div className='guest-survey-mdx-editor border-input bg-background min-h-[200px] max-w-full min-w-0 rounded-md border'>
      <MDXEditor
        markdown={markdown}
        onChange={onChange}
        placeholder={placeholder}
        readOnly={readOnly}
        contentEditableClassName='prose prose-sm dark:prose-invert max-w-none min-w-0 break-words px-3 py-2 min-h-[180px] [&_h1]:mb-3 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_h4]:text-base [&_h4]:font-semibold [&_h5]:text-sm [&_h5]:font-semibold [&_h6]:text-xs [&_h6]:font-semibold'
        plugins={[
          headingsPlugin(),
          listsPlugin(),
          quotePlugin(),
          thematicBreakPlugin(),
          linkPlugin(),
          linkDialogPlugin(),
          imagePlugin({
            imageUploadHandler: async (file) => {
              try {
                return await uploadCompletionImage(unitId, file);
              } catch (err) {
                const message =
                  err instanceof ApiHttpError
                    ? err.message
                    : t('completion_upload_image_error');
                toast.error(message);
                throw err;
              }
            },
            imagePreviewHandler: completionImagePreviewHandler,
            ImageDialog: GuestSurveyCompletionImageDialog
          }),
          markdownShortcutPlugin(),
          toolbarPlugin({
            toolbarContents: () => (
              <DiffSourceToggleWrapper options={['rich-text', 'source']}>
                <UndoRedo />
                <GuestSurveyCompletionBlockTypeButtons readOnly={readOnly} />
                <BoldItalicUnderlineToggles />
                <ListsToggle />
                <InsertThematicBreak />
                <CreateLink />
                <InsertImage />
              </DiffSourceToggleWrapper>
            )
          }),
          diffSourcePlugin({ viewMode: 'rich-text', diffMarkdown: '' })
        ]}
      />
    </div>
  );
}
