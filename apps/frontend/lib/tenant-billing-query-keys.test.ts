import { describe, expect, it } from 'vitest';
import {
  getGetInvoicesIdQueryKey,
  getGetMyInvoicesQueryKey,
  getGetInvoicesMeVendorQueryKey,
  getGetSubscriptionPlansQueryKey,
  getGetMySubscriptionPlansQueryKey,
  getGetMySubscriptionQueryKey
} from '@/lib/api/generated/tenant-billing';

describe('tenant-billing query keys', () => {
  it('uses path-shaped keys so billing screens align with Orval invalidation', () => {
    expect(getGetMyInvoicesQueryKey()).toEqual(['/invoices/me']);
    expect(getGetInvoicesMeVendorQueryKey()).toEqual(['/invoices/me/vendor']);
    expect(getGetMySubscriptionQueryKey()).toEqual(['/subscriptions/me']);
    expect(getGetMySubscriptionPlansQueryKey()).toEqual([
      '/subscriptions/me/plans'
    ]);
    expect(getGetSubscriptionPlansQueryKey()).toEqual(['/subscriptions/plans']);
    expect(getGetInvoicesIdQueryKey('inv-1')).toEqual(['/invoices/inv-1']);
  });
});
