import { describe, expect, it } from 'vitest';
import {
  getGetInvoicesIdQueryKey,
  getGetInvoicesMeQueryKey,
  getGetInvoicesMeVendorQueryKey,
  getGetSubscriptionPlansQueryKey,
  getGetSubscriptionsMeQueryKey
} from '@/lib/api/generated/tenant-billing';

describe('tenant-billing query keys', () => {
  it('uses path-shaped keys so billing screens align with Orval invalidation', () => {
    expect(getGetInvoicesMeQueryKey()).toEqual(['/invoices/me']);
    expect(getGetInvoicesMeVendorQueryKey()).toEqual(['/invoices/me/vendor']);
    expect(getGetSubscriptionsMeQueryKey()).toEqual(['/subscriptions/me']);
    expect(getGetSubscriptionPlansQueryKey()).toEqual(['/subscriptions/plans']);
    expect(getGetInvoicesIdQueryKey('inv-1')).toEqual(['/invoices/inv-1']);
  });
});
