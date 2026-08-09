import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TicketModelSchema, type Ticket } from '@/lib/api';
import { StaffVisitorDetailsSheet } from './StaffVisitorDetailsSheet';

vi.mock('@/components/visitors/VisitTransferTrail', () => ({
  VisitTransferTrail: () => null
}));

vi.mock('next-intl', () => ({
  useTranslations: () => t
}));

vi.mock('@/lib/hooks', () => ({
  useClientVisits: () => ({ data: undefined, isLoading: false }),
  useUpdateOperatorComment: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateTicketVisitor: () => ({ mutate: vi.fn(), isPending: false })
}));

const messages: Record<string, string> = {
  'visitor_context.details_title': 'Visitor details',
  'visitor_context.details_description':
    'Review notes and recent visits for this ticket.',
  'visitor_context.title': 'Visitor notes & history',
  'visitor_context.comment_label': 'Operator notes for this visit',
  'visitor_context.comment_placeholder': 'Notes visible to your team',
  'visitor_context.save': 'Save notes',
  'visitor_context.history_title': 'Recent visits',
  'visitor_context.history_needs_visitor':
    'Link a visitor above to see their past visits here.'
};

function t(key: string, values?: Record<string, string | number | Date>) {
  return (messages[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) =>
    String(values?.[name] ?? '')
  );
}

const ticket: Ticket = TicketModelSchema.parse({
  id: 'ticket-1',
  queueNumber: 'A001',
  unitId: 'unit-1',
  serviceId: 'service-1',
  status: 'called'
});

function renderSheet(open = false, ...tickets: [Ticket | undefined] | []) {
  const currentTicket = tickets.length === 0 ? ticket : tickets[0];
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });

  function Harness() {
    const [isOpen, setIsOpen] = useState(open);

    return (
      <QueryClientProvider client={queryClient}>
        <button type='button' onClick={() => setIsOpen(true)}>
          Open visitor details
        </button>
        <StaffVisitorDetailsSheet
          open={isOpen}
          onOpenChange={setIsOpen}
          unitId='unit-1'
          ticket={currentTicket}
          locale='en'
          t={t}
        />
      </QueryClientProvider>
    );
  }

  return render(<Harness />);
}

afterEach(cleanup);

describe('StaffVisitorDetailsSheet', () => {
  it('does not render visitor context while closed', () => {
    renderSheet();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Visitor notes & history')
    ).not.toBeInTheDocument();
  });

  it('does not open without an active ticket', () => {
    renderSheet(true, undefined);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the title and visitor context when controlled open', () => {
    renderSheet(true);

    expect(
      screen.getByRole('heading', { name: 'Visitor details' })
    ).toBeVisible();
    expect(screen.getByText('Visitor notes & history')).toBeVisible();
    expect(
      screen.getByText('Review notes and recent visits for this ticket.')
    ).toBeVisible();
  });

  it('keeps the right sheet body internally scrollable', () => {
    renderSheet(true);

    expect(screen.getByRole('dialog')).toHaveClass(
      'right-0',
      'w-full',
      'overflow-hidden',
      'sm:max-w-xl'
    );
    expect(screen.getByTestId('staff-visitor-details-sheet-body')).toHaveClass(
      'min-h-0',
      'flex-1',
      'overflow-y-auto'
    );
  });

  it('closes on Escape and restores focus to the opener', async () => {
    const user = userEvent.setup();
    renderSheet();

    const opener = screen.getByRole('button', {
      name: 'Open visitor details'
    });
    await user.click(opener);
    expect(screen.getByRole('dialog')).toBeVisible();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('has no axe violations while open', async () => {
    renderSheet(true);

    expect((await axe(document.body)).violations).toHaveLength(0);
  });
});
