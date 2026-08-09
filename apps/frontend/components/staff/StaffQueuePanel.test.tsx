import {
  cleanup,
  fireEvent,
  render,
  screen,
  within
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { axe } from 'jest-axe';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Ticket } from '@/lib/api';
import { StaffQueuePanel, type StaffQueuePanelProps } from './StaffQueuePanel';

const messages: Record<string, string> = {
  'queue.title': 'Waiting queue',
  'queue.description': 'Tickets waiting to be called',
  'queue.sorted_by_wait': 'Longest wait first',
  'queue.create_ticket_menu': 'New ticket',
  'queue.filters': 'Filters',
  'queue.list_show_all': 'Show all unit tickets',
  'queue.list_scoped_hint': 'Only scoped tickets',
  'queue.list_show_all_hint': 'All unit tickets',
  'queue.only_my_zone': 'Only my zone',
  'queue.only_my_zone_hint_on': 'My zone only',
  'queue.only_my_zone_hint_off': 'Every zone',
  'queue.temporary_all_warning':
    'Temporary full list: Call next still follows the selected services.',
  'queue.noTickets': 'No tickets waiting',
  'queue.empty_scoped': 'No tickets for {scope}.',
  'queue.loading': 'Loading queue',
  'queue.refreshing': 'Refreshing queue',
  'queue.retry': 'Retry',
  'queue.no_name': 'No name on file',
  'queue.uncategorized': 'Other',
  'queue.waiting': 'Waiting',
  'queue.max_label': 'Max',
  'queue.sla_warning': 'SLA warning',
  'queue.sla_overdue': 'SLA overdue',
  'scope.title': 'Service scope',
  'scope.hint': 'Choose services',
  'scope.configure': 'Services',
  'scope.modal_title': 'Services at this counter',
  'scope.select_all': 'Select all',
  'scope.done': 'Done',
  'scope.all_services': 'All services',
  'scope.selected_one': '{service}',
  'scope.selected_many': '{service} +{count}',
  'scope.matching_count': '{count} waiting',
  'actions.call': 'Call',
  'current.anonymous_visitor': 'Walk-in guest',
  'current.unknown_visitor': 'Unknown visitor',
  'pre_registration.details_title': 'Pre-registration details',
  'user_data_queue.details_label': 'Kiosk data',
  'ticket_user_data.ocr_failed_preview': 'OCR failed',
  'ticket_user_data.custom_skipped_preview': 'Skipped',
  'ticket_user_data.id_document_ocr': 'Document'
};

function t(key: string, values?: Record<string, string | number | Date>) {
  return (messages[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) =>
    String(values?.[name] ?? '')
  );
}

function ticket(id: string, overrides: Partial<Ticket> = {}): Ticket {
  return {
    id,
    queueNumber: `A${id.padStart(3, '0')}`,
    unitId: 'unit-1',
    serviceId: 'service-a',
    status: 'waiting',
    createdAt: new Date(Date.now() - 65_000).toISOString(),
    maxWaitingTime: 1_000,
    ...overrides
  };
}

function renderPanel(overrides: Partial<StaffQueuePanelProps> = {}) {
  const props: StaffQueuePanelProps = {
    t,
    unitId: 'unit-1',
    canReadUserData: false,
    counterOnBreak: false,
    waitingTickets: [ticket('1')],
    scopedWaitingCount: 1,
    queuePending: false,
    queueRefreshing: false,
    queueError: null,
    onRetryQueue: vi.fn(),
    showAllTicketsInQueue: false,
    onShowAllTicketsInQueueChange: vi.fn(),
    onlyMyZone: true,
    onOnlyMyZoneChange: vi.fn(),
    serviceNames: { 'service-a': 'Payments' },
    leafServicesForCreate: [],
    createTicketPending: false,
    onCreateTicket: vi.fn(async () => undefined),
    scopeLeaves: [
      { id: 'service-a', label: 'Payments' },
      { id: 'service-b', label: 'Documents' }
    ],
    selectedScopeIds: ['service-a'],
    scopeSummary: {
      kind: 'single',
      labels: ['Payments'],
      count: 1
    },
    onScopeChange: vi.fn(),
    pickPending: false,
    inProgressTicketId: null,
    setInProgressTicketId: vi.fn(),
    currentTicket: undefined,
    onPickTicket: vi.fn(async () => undefined),
    onShowDetails: vi.fn(),
    services: [],
    ...overrides
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });

  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <StaffQueuePanel {...props} />
      </QueryClientProvider>
    ),
    props
  };
}

afterEach(cleanup);

describe('StaffQueuePanel', () => {
  it('shows the ticket number, visitor, service, live wait, SLA status and Call action', () => {
    renderPanel({
      waitingTickets: [
        ticket('7', {
          queueNumber: 'B007',
          client: {
            id: 'client-1',
            firstName: 'Ada',
            lastName: 'Lovelace'
          },
          createdAt: new Date(Date.now() - 95_000).toISOString(),
          maxWaitingTime: 100
        }),
        ticket('8', {
          queueNumber: 'B008',
          createdAt: new Date(Date.now() - 110_000).toISOString(),
          maxWaitingTime: 100
        })
      ],
      scopedWaitingCount: 2
    });

    expect(screen.getByText('B007')).toBeVisible();
    expect(screen.getByText('Ada Lovelace')).toBeVisible();
    expect(screen.getAllByText('Payments')).not.toHaveLength(0);
    expect(screen.getByText('01:35')).toBeVisible();
    expect(screen.getByText('SLA warning')).toBeVisible();
    expect(screen.getByText('SLA overdue')).toBeVisible();
    expect(screen.getByText('No name on file')).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Call' })).toHaveLength(2);
  });

  it('keeps the header and renders five skeleton rows while loading', () => {
    renderPanel({ queuePending: true, waitingTickets: [] });

    expect(
      screen.getByRole('heading', { name: 'Waiting queue' })
    ).toBeVisible();
    expect(screen.getByText('Loading queue')).toBeVisible();
    expect(screen.getAllByTestId('staff-queue-skeleton')).toHaveLength(5);
  });

  it('renders an alert and retry action when the queue fails', () => {
    const onRetryQueue = vi.fn();
    renderPanel({
      queueError: new Error('Network unavailable'),
      waitingTickets: [],
      onRetryQueue
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Network unavailable');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
  });

  it('names the selected services in the scoped empty state', () => {
    renderPanel({ waitingTickets: [], scopedWaitingCount: 0 });

    expect(screen.getByText('No tickets for Payments.')).toBeVisible();
  });

  it('keeps a long queue inside one internal scrolling region', () => {
    renderPanel({
      waitingTickets: Array.from({ length: 12 }, (_, index) =>
        ticket(String(index + 1))
      ),
      scopedWaitingCount: 12
    });

    const scrollRegions = screen.getAllByTestId('staff-queue-scroll');
    expect(scrollRegions).toHaveLength(1);
    expect(scrollRegions[0]).toHaveClass(
      'min-h-0',
      'flex-1',
      'overflow-y-auto'
    );
  });

  it('warns about the temporary full list without replacing the service scope', () => {
    renderPanel({ showAllTicketsInQueue: true });

    expect(
      screen.getByText(
        'Temporary full list: Call next still follows the selected services.'
      )
    ).toBeVisible();
    expect(screen.getAllByText('Payments')).not.toHaveLength(0);
    expect(screen.queryByText('All services')).not.toBeInTheDocument();
  });

  it.each([
    { name: 'an active ticket', overrides: { currentTicket: ticket('99') } },
    { name: 'a break', overrides: { counterOnBreak: true } }
  ])('keeps rows visible but blocks Call during $name', ({ overrides }) => {
    renderPanel(overrides);

    expect(screen.getByText('A001')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Call' })).toBeDisabled();
  });

  it.each([
    { name: 'a pending pick', overrides: { pickPending: true } },
    {
      name: 'another row being picked',
      overrides: { inProgressTicketId: 'ticket-in-progress' }
    }
  ])('blocks row Call during $name without hiding the row', ({ overrides }) => {
    const onPickTicket = vi.fn(async () => undefined);
    const setInProgressTicketId = vi.fn();
    renderPanel({ ...overrides, onPickTicket, setInProgressTicketId });

    expect(screen.getByText('A001')).toBeVisible();
    const call = screen.getByRole('button', { name: 'Call' });
    expect(call).toBeDisabled();
    fireEvent.click(call);
    expect(onPickTicket).not.toHaveBeenCalled();
    expect(setInProgressTicketId).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'populated', overrides: {} },
    {
      name: 'empty',
      overrides: { waitingTickets: [], scopedWaitingCount: 0 }
    },
    {
      name: 'error',
      overrides: {
        waitingTickets: [],
        queueError: new Error('Network unavailable')
      }
    }
  ])('has no axe violations in the $name state', async ({ overrides }) => {
    const { container } = renderPanel(overrides);

    expect((await axe(container)).violations).toHaveLength(0);
  });

  it('keeps queue filters in a compact control', () => {
    renderPanel();

    const header = screen
      .getByRole('heading', { name: 'Waiting queue' })
      .closest('[data-slot="card-header"]');
    expect(header).not.toBeNull();
    expect(
      within(header as HTMLElement).getByRole('button', { name: 'Filters' })
    ).toBeVisible();
  });

  it('gives queue header controls and filter switches a 36px floor', () => {
    const onShowAllTicketsInQueueChange = vi.fn();
    renderPanel({
      leafServicesForCreate: [{ id: 'service-a', label: 'Payments' }],
      onShowAllTicketsInQueueChange
    });

    for (const label of ['Services', 'Filters', 'New ticket']) {
      expect(screen.getByRole('button', { name: label })).toHaveClass('h-9');
    }

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    expect(
      screen.getByRole('switch', { name: 'Show all unit tickets' })
    ).toHaveClass('h-9');
    expect(screen.getByRole('switch', { name: 'Only my zone' })).toHaveClass(
      'h-9'
    );
    expect(screen.getByText('Show all unit tickets')).toHaveClass(
      'min-h-9',
      'flex-1'
    );
    expect(screen.getByText('Only my zone')).toHaveClass('min-h-9', 'flex-1');

    fireEvent.click(screen.getByText('Show all unit tickets'));
    expect(onShowAllTicketsInQueueChange).toHaveBeenCalledTimes(1);
    expect(onShowAllTicketsInQueueChange).toHaveBeenCalledWith(true);
  });
});
