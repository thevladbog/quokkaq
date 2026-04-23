/**
 * Maps widget type to localization key for schematic preview.
 * Used in screen preset schematic displays (admin.signage.schematicWidget.*).
 */
export function widgetSchematicKey(
  type: string
):
  | 'tickets'
  | 'clock'
  | 'weather'
  | 'eta'
  | 'queueStats'
  | 'joinQueueQr'
  | 'announcements'
  | 'content'
  | 'rss'
  | 'queueTicker'
  | 'customHtml' {
  switch (type) {
    case 'called-tickets':
      return 'tickets';
    case 'clock':
    case 'screen-header':
      return 'clock';
    case 'weather':
      return 'weather';
    case 'eta-display':
      return 'eta';
    case 'queue-stats':
    case 'screen-footer-qr':
      return 'queueStats';
    case 'join-queue-qr':
      return 'joinQueueQr';
    case 'announcements':
      return 'announcements';
    case 'content-player':
      return 'content';
    case 'rss-feed':
      return 'rss';
    case 'queue-ticker':
      return 'queueTicker';
    case 'custom-html':
      return 'customHtml';
    default:
      return 'tickets';
  }
}

/**
 * Maps widget type to localization key for builder UI.
 * Used in visual builder (admin.screenBuilder.widget.*).
 * Matches the keys used in widget-library-panel.
 */
export function widgetBuilderKey(
  type: string
):
  | 'calledTickets'
  | 'clock'
  | 'weather'
  | 'eta'
  | 'queueStats'
  | 'joinQueueQr'
  | 'announcements'
  | 'content'
  | 'rss'
  | 'ticker'
  | 'customHtml'
  | 'screenHeader'
  | 'screenFooterQr'
  | 'unknown' {
  switch (type) {
    case 'called-tickets':
      return 'calledTickets';
    case 'clock':
      return 'clock';
    case 'screen-header':
      return 'screenHeader';
    case 'weather':
      return 'weather';
    case 'eta-display':
      return 'eta';
    case 'queue-stats':
      return 'queueStats';
    case 'screen-footer-qr':
      return 'screenFooterQr';
    case 'join-queue-qr':
      return 'joinQueueQr';
    case 'announcements':
      return 'announcements';
    case 'content-player':
      return 'content';
    case 'rss-feed':
      return 'rss';
    case 'queue-ticker':
      return 'ticker';
    case 'custom-html':
      return 'customHtml';
    default:
      return 'unknown';
  }
}
