'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';

const wikiSanitizeSchema = {
  ...defaultSchema,
  tagNames: Array.from(
    new Set([
      ...(defaultSchema.tagNames ?? []),
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td'
    ])
  )
};

type Props = {
  markdown: string;
};

/**
 * Renders trusted-in-repo wiki markdown with GFM and sanitization (no raw HTML).
 */
export function WikiDocMarkdown({ markdown }: Props) {
  return (
    <div className='prose prose-sm dark:prose-invert max-w-none [&_h1]:mb-4 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_table]:text-sm [&_th]:whitespace-nowrap'>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, wikiSanitizeSchema]]}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
