import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PlatformOverviewPage from '@/app/[locale]/platform/page';

const platformApi = vi.hoisted(() => ({
  listCompanies: vi.fn(),
  listSubscriptions: vi.fn(),
  listSubscriptionPlans: vi.fn(),
  listInvoices: vi.fn()
}));

vi.mock('@/lib/api/generated/platform', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/api/generated/platform')>();
  return {
    ...actual,
    listCompanies: platformApi.listCompanies,
    listSubscriptions: platformApi.listSubscriptions,
    listSubscriptionPlans: platformApi.listSubscriptionPlans,
    listInvoices: platformApi.listInvoices
  };
});

vi.mock('@/src/i18n/navigation', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  )
}));

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const labels: Record<string, string> = {
      title: 'Platform',
      subtitle: 'Manage organizations',
      companies: 'Companies',
      subscriptions: 'Subscriptions',
      plans: 'Plans',
      invoices: 'Invoices',
      loadErrorTitle: 'Failed to load',
      loadError: 'Could not load overview',
      retry: 'Retry'
    };
    const t = Object.assign((key: string) => labels[key] ?? key, {
      has: (key: string) => key in labels
    });
    return t;
  }
}));

function renderWithQuery(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false }
    }
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>
  );
}

describe('PlatformOverviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    platformApi.listCompanies.mockResolvedValue({
      data: { total: 2, items: [] }
    });
    platformApi.listSubscriptions.mockResolvedValue({
      data: { total: 3, items: [] }
    });
    platformApi.listSubscriptionPlans.mockResolvedValue({
      data: [{ id: 'p1' }]
    });
    platformApi.listInvoices.mockResolvedValue({
      data: { total: 5, items: [] }
    });
  });

  it('renders metric cards after data loads', async () => {
    renderWithQuery(<PlatformOverviewPage />);

    expect(
      await screen.findByRole('heading', { name: 'Platform' })
    ).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Companies/i })).toHaveAttribute(
      'href',
      '/platform/companies'
    );
  });

  it('shows load error and refetches when Retry is clicked', async () => {
    platformApi.listCompanies.mockRejectedValueOnce(new Error('network'));
    renderWithQuery(<PlatformOverviewPage />);
    const user = userEvent.setup();

    expect(await screen.findByText('Failed to load')).toBeInTheDocument();
    expect(screen.getByText('Could not load overview')).toBeInTheDocument();

    platformApi.listCompanies.mockResolvedValue({
      data: { total: 9, items: [] }
    });
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(screen.queryByText('Failed to load')).not.toBeInTheDocument();
    });
    expect(screen.getByText('9')).toBeInTheDocument();
  });
});
