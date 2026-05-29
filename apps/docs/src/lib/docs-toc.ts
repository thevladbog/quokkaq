import type { ComponentProps } from 'react';
import { DocsPage } from 'fumadocs-ui/layouts/docs/page';

type DocsPageProps = ComponentProps<typeof DocsPage>;

type TocProps = Pick<DocsPageProps, 'tableOfContent' | 'tableOfContentPopover'>;

/**
 * Fumadocs sets `tableOfContent.enabled` to `false` when `full` is true, even if `toc` is non-empty.
 * Pass `true` to show the right-hand TOC (clerk: curved line + active dot) on `full` pages.
 */
export function quokkaqTocOnFull(
  hasToc: boolean,
  full: boolean | undefined
): TocProps {
  return {
    tableOfContent: {
      style: 'clerk',
      enabled: hasToc && full ? true : undefined
    },
    tableOfContentPopover: { style: 'clerk' }
  };
}
