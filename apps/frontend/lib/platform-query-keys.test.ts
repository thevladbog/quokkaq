import { describe, expect, it } from 'vitest';
import {
  getGetCompanyQueryKey,
  getListCompaniesQueryKey,
  getListInvoicesQueryKey,
  getListSubscriptionPlansQueryKey,
  getListSubscriptionsQueryKey,
  getPlatformGetPlatformInvoiceQueryKey
} from '@/lib/api/generated/platform';

describe('platform query keys', () => {
  it('uses path-shaped keys aligned with Orval invalidation', () => {
    expect(getListCompaniesQueryKey()).toEqual(['/platform/companies']);
    expect(getListCompaniesQueryKey({ limit: 10 })).toEqual([
      '/platform/companies',
      { limit: 10 }
    ]);

    expect(getListInvoicesQueryKey()).toEqual(['/platform/invoices']);
    expect(getListInvoicesQueryKey({ companyId: 'c1' })).toEqual([
      '/platform/invoices',
      { companyId: 'c1' }
    ]);

    expect(getListSubscriptionsQueryKey()).toEqual(['/platform/subscriptions']);
    expect(getListSubscriptionPlansQueryKey()).toEqual([
      '/platform/subscription-plans'
    ]);

    expect(getGetCompanyQueryKey('co-1')).toEqual(['/platform/companies/co-1']);
    expect(getPlatformGetPlatformInvoiceQueryKey('inv-1')).toEqual([
      '/platform/invoices/inv-1'
    ]);
  });
});
