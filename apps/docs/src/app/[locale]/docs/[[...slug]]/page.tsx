import { getPageImage, getPageMarkdownUrl, source } from '@/lib/source';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  MarkdownCopyButton,
  ViewOptionsPopover
} from 'fumadocs-ui/layouts/docs/page';
import { APIPage } from '@/components/api-page';
import { Feedback } from '@/components/feedback/client';
import { notFound } from 'next/navigation';
import { getMDXComponents } from '@/components/mdx';
import type { Metadata } from 'next';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { sendBlockFeedback, sendPageFeedback } from '@/lib/feedback-actions';
import { DocBlockFeedbackProvider } from '@/components/feedback/doc-paragraph-provider';
import { DocParagraphWithFeedback } from '@/components/feedback/paragraph-block';
import { githubBlobBase, appName } from '@/lib/shared';
import { isAppLocale } from '@/lib/i18n';
import { quokkaqTocOnFull } from '@/lib/docs-toc';

type PageParams = { locale: string; slug?: string[] };

export default async function Page(props: { params: Promise<PageParams> }) {
  const { locale, slug } = await props.params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  const page = source.getPage(slug, locale);
  if (!page) {
    notFound();
  }
  if (page.type === 'openapi') {
    return (
      <DocsPage
        full
        toc={page.data.toc}
        {...quokkaqTocOnFull(page.data.toc.length > 0, true)}
      >
        <DocsTitle>{page.data.title}</DocsTitle>
        <DocsDescription className='mb-0'>
          {page.data.description}
        </DocsDescription>
        <DocsBody>
          <APIPage {...page.data.getAPIPageProps()} />
          <div className='not-prose border-fd-border mt-10 border-t pt-6'>
            <Feedback locale={locale} onSendAction={sendPageFeedback} />
          </div>
        </DocsBody>
      </DocsPage>
    );
  }
  const MDX = page.data.body;
  const markdownUrl = getPageMarkdownUrl(page).url;
  const githubUrl =
    githubBlobBase && page.path
      ? `${githubBlobBase}/content/docs/${page.path.replace(/^\/+/, '')}`
      : undefined;
  return (
    <DocsPage
      full={page.data.full}
      toc={page.data.toc}
      {...quokkaqTocOnFull(page.data.toc.length > 0, page.data.full === true)}
    >
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription className='mb-0'>
        {page.data.description}
      </DocsDescription>
      {githubUrl ? (
        <div className='flex flex-row items-center gap-2 border-b pb-6'>
          <MarkdownCopyButton markdownUrl={markdownUrl} />
          <ViewOptionsPopover githubUrl={githubUrl} markdownUrl={markdownUrl} />
        </div>
      ) : (
        <div className='flex flex-row items-center gap-2 border-b pb-6'>
          <MarkdownCopyButton markdownUrl={markdownUrl} />
        </div>
      )}
      <DocsBody>
        <DocBlockFeedbackProvider
          locale={locale}
          onBlockFeedback={sendBlockFeedback}
        >
          <MDX
            components={getMDXComponents({
              a: createRelativeLink(source, page),
              p: DocParagraphWithFeedback
            })}
          />
        </DocBlockFeedbackProvider>
        <div className='not-prose border-fd-border mt-10 border-t pt-6'>
          <Feedback locale={locale} onSendAction={sendPageFeedback} />
        </div>
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return source.generateParams('slug', 'locale');
}

export async function generateMetadata(props: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { locale, slug } = await props.params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  const page = source.getPage(slug, locale);
  if (!page) {
    notFound();
  }
  return {
    title: page.data.title,
    description: page.data.description,
    openGraph: {
      images: getPageImage(page).url,
      siteName: appName
    }
  };
}
