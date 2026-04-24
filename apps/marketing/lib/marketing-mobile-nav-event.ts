/**
 * Dispatched when the compact header “More” overflow menu opens or closes
 * (see `landing-top-bar.tsx` — not only the full-screen mobile nav sheet).
 */
export const MARKETING_MOBILE_NAV_OPEN_EVENT = 'marketing-mobile-nav-open';

export type MarketingMobileNavOpenDetail = { open: boolean };

export function dispatchMarketingMobileNavOpen(open: boolean) {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(
    new CustomEvent<MarketingMobileNavOpenDetail>(
      MARKETING_MOBILE_NAV_OPEN_EVENT,
      { detail: { open } }
    )
  );
}
