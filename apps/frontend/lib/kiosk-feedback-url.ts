/**
 * Shown as the input placeholder in kiosk / admin when editing feedback URL.
 * Not in i18n: `{{` `}}` are special in ICU message files and break `t()`.
 * The runtime still substitutes `{{ticketId}}` (see `kiosk-ticket-escpos` and ticket page).
 */
export const KIOSK_FEEDBACK_URL_EXAMPLE =
  'https://example.com/survey?ticket={{ticketId}}' as const;
