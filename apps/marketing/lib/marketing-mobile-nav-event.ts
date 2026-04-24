/** Dispatched from the mobile nav dialog when it opens or closes. */
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
