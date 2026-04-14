'use client';

import { useEffect, useRef, useState, type ComponentProps } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';

const completionSanitizeSchema = {
  ...defaultSchema,
  tagNames: Array.from(
    new Set([
      ...(defaultSchema.tagNames ?? []),
      'img',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'del'
    ])
  ),
  attributes: {
    ...defaultSchema.attributes,
    img: [
      ...(defaultSchema.attributes?.img ?? []),
      'src',
      'alt',
      'title',
      'width',
      'height'
    ],
    a: [
      ...(defaultSchema.attributes?.a ?? []),
      'href',
      'title',
      'target',
      'rel'
    ]
  }
};

/** Markdown stores these after upload (authorized GET, not public S3). */
export function isGuestSurveyCompletionApiImageSrc(
  src: string | undefined
): boolean {
  if (!src || typeof src !== 'string') return false;
  const path =
    src.startsWith('http://') || src.startsWith('https://')
      ? (() => {
          try {
            return new URL(src).pathname;
          } catch {
            return '';
          }
        })()
      : src.split('?')[0];
  return /\/api\/units\/[^/]+\/guest-survey\/completion-images\//.test(path);
}

function isHttpsImageSrc(src: string | undefined): boolean {
  if (!src || typeof src !== 'string') return false;
  try {
    const u = new URL(src, 'https://example.com');
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Same-origin resolution for `/api/units/.../guest-survey/completion-images/...`. */
export function resolveGuestSurveyCompletionImageFetchUrl(src: string): string {
  if (src.startsWith('http://') || src.startsWith('https://')) return src;
  if (typeof window !== 'undefined') {
    return `${window.location.origin}${src.startsWith('/') ? src : `/${src}`}`;
  }
  return src;
}

/**
 * MDXEditor `imagePreviewHandler`: a normal img request cannot send Bearer auth, so we fetch the
 * completion image with the staff JWT and return a blob URL for preview.
 */
export function createGuestSurveyCompletionImagePreviewHandler(
  getAccessToken: () => string | null | undefined
): (src: string) => Promise<string> {
  return async (src: string) => {
    if (!isGuestSurveyCompletionApiImageSrc(src)) return src;
    const token = getAccessToken();
    if (!token) return src;
    try {
      const res = await fetch(resolveGuestSurveyCompletionImageFetchUrl(src), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return src;
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    } catch {
      return src;
    }
  };
}

function GuestSurveyCompletionAuthedImg({
  src,
  alt,
  bearerToken,
  className
}: {
  src: string;
  alt?: string;
  bearerToken: string;
  className?: string;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const createdObjectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();

    (async () => {
      try {
        const res = await fetch(
          resolveGuestSurveyCompletionImageFetchUrl(src),
          {
            signal: ac.signal,
            headers: { Authorization: `Bearer ${bearerToken}` }
          }
        );
        if (!res.ok) return;
        const blob = await res.blob();
        if (ac.signal.aborted) return;
        const u = URL.createObjectURL(blob);
        if (ac.signal.aborted) {
          URL.revokeObjectURL(u);
          return;
        }
        createdObjectUrlRef.current = u;
        setBlobUrl(u);
      } catch {
        /* network / abort */
      }
    })();

    return () => {
      ac.abort();
      if (createdObjectUrlRef.current) {
        URL.revokeObjectURL(createdObjectUrlRef.current);
        createdObjectUrlRef.current = null;
      }
    };
  }, [src, bearerToken]);

  if (!blobUrl) {
    return (
      <span className='text-muted-foreground my-4 inline-block text-sm'>…</span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={blobUrl} alt={alt ?? ''} className={className} />
  );
}

type Props = {
  markdown: string;
  className?: string;
  /** Terminal or staff JWT for `/api/units/.../guest-survey/completion-images/...`. */
  imageBearerToken?: string | null;
};

export function GuestSurveyCompletionMarkdown({
  markdown,
  className,
  imageBearerToken
}: Props) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={
          [rehypeRaw, rehypeSanitize(completionSanitizeSchema)] as NonNullable<
            ComponentProps<typeof ReactMarkdown>['rehypePlugins']
          >
        }
        components={{
          img: ({ node, src, alt, ...rest }) => {
            void node;
            if (!src || typeof src !== 'string') return null;

            if (isGuestSurveyCompletionApiImageSrc(src)) {
              if (!imageBearerToken) {
                return null;
              }
              return (
                <GuestSurveyCompletionAuthedImg
                  key={src}
                  src={src}
                  alt={alt}
                  bearerToken={imageBearerToken}
                  className='my-4 max-h-64 max-w-full rounded-lg object-contain'
                />
              );
            }

            if (!isHttpsImageSrc(src)) {
              return null;
            }
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                {...rest}
                src={src}
                alt={alt ?? ''}
                className='my-4 max-h-64 max-w-full rounded-lg object-contain'
              />
            );
          },
          a: ({ node, href, children, ...rest }) => {
            void node;
            return (
              <a
                {...rest}
                href={href}
                target='_blank'
                rel='noopener noreferrer'
                className='text-primary underline'
              >
                {children}
              </a>
            );
          }
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
