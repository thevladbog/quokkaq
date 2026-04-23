import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitizes a fragment of user/admin-provided HTML for safe `dangerouslySetInnerHTML` use
 * (blocks scripts, on* handlers, and other common XSS vectors).
 */
export function sanitizeHtml(html: string): string {
  if (!html) return '';
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true }
  });
}
