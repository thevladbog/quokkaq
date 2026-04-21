'use client';

import '@mdxeditor/editor/style.css';

import {
  BoldItalicUnderlineToggles,
  CreateLink,
  DiffSourceToggleWrapper,
  diffSourcePlugin,
  headingsPlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  ListsToggle,
  markdownShortcutPlugin,
  MDXEditor,
  type MDXEditorMethods,
  quotePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  UndoRedo
} from '@mdxeditor/editor';
import { useEffect, useRef } from 'react';

type Props = {
  markdown: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  readOnly?: boolean;
};

/** Markdown editor for invoice payment terms (no image upload). */
export function PlatformInvoicePaymentTermsMdx({
  markdown,
  onChange,
  placeholder,
  readOnly
}: Props) {
  const editorRef = useRef<MDXEditorMethods>(null);

  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;
    if (ed.getMarkdown() === markdown) return;
    ed.setMarkdown(markdown);
  }, [markdown]);

  return (
    <div className='border-input bg-background min-h-[220px] max-w-full min-w-0 rounded-md border'>
      <MDXEditor
        ref={editorRef}
        markdown={markdown}
        onChange={onChange}
        placeholder={placeholder}
        readOnly={readOnly}
        contentEditableClassName='prose prose-sm dark:prose-invert max-w-none min-w-0 break-words px-3 py-2 min-h-[200px] [&_h1]:mb-3 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_h4]:text-base [&_h4]:font-semibold [&_h5]:text-sm [&_h5]:font-semibold [&_h6]:text-xs [&_h6]:font-semibold'
        plugins={[
          headingsPlugin(),
          listsPlugin(),
          quotePlugin(),
          thematicBreakPlugin(),
          linkPlugin(),
          linkDialogPlugin(),
          markdownShortcutPlugin(),
          toolbarPlugin({
            toolbarContents: () => (
              <DiffSourceToggleWrapper options={['rich-text', 'source']}>
                <UndoRedo />
                <BoldItalicUnderlineToggles />
                <ListsToggle />
                <CreateLink />
              </DiffSourceToggleWrapper>
            )
          }),
          diffSourcePlugin({ viewMode: 'rich-text', diffMarkdown: '' })
        ]}
      />
    </div>
  );
}
