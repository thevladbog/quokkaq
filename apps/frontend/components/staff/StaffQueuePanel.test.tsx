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
  'queue.load_error': 'Could not load queue: {message}',
  'queue.no_name': 'No name on file',
  'queue.uncategorized': 'Other',
  'queue.waiting': 'Waiting',
  'queue.sla_waiting': 'Waiting SLA',
  'queue.sla_remaining': '{time} remaining',
  'queue.sla_over_by': '{time} over limit',
  'queue.max_label': 'Max',
  'queue.sla_warning': 'SLA warning',
  'queue.sla_overdue': 'SLA overdue',
  'queue.sla_label': 'SLA',
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
    conflictingActionPending: false,
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

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('StaffQueuePanel', () => {
  it('shows a normal snapshot SLA inside the dense timer', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-09T09:00:00.000Z'));
    renderPanel({
      waitingTickets: [
        ticket('7', {
          queueNumber: 'B007',
          client: {
            id: 'client-1',
            firstName: 'Ada',
            lastName: 'Lovelace'
          },
          createdAt: new Date(Date.now() - 878_000).toISOString(),
          maxWaitingTime: 1_000
        })
      ],
      scopedWaitingCount: 1
    });

    const row = screen.getByTestId('staff-queue-ticket-7');
    const timerValue = within(row).getByTestId('staff-queue-timer-value');

    expect(screen.getByText('B007')).toBeVisible();
    expect(screen.getByText('Ada Lovelace')).toBeVisible();
    expect(screen.getAllByText('Payments')).not.toHaveLength(0);
    expect(within(row).getByText('Waiting SLA')).toBeVisible();
    expect(timerValue).toHaveTextContent('14:38 / 16:40');
    expect(within(row).getByText('02:02 remaining')).toBeVisible();
    expect(row).toHaveClass('p-2', 'border-l-2', 'border-l-border');
    expect(row.style.background).toBe('');
    expect(timerValue).not.toHaveClass('text-amber-700', 'text-red-700');
    expect(within(row).getByRole('button', { name: 'Call' })).toHaveClass(
      'h-9'
    );
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByText('Max')).not.toBeInTheDocument();
    expect(screen.queryByText('SLA warning')).not.toBeInTheDocument();
    expect(screen.queryByText('SLA overdue')).not.toBeInTheDocument();
  });

  it('turns the compact timer amber at the start of the final ten percent', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-09T09:00:00.000Z'));
    renderPanel({
      waitingTickets: [
        ticket('1', {
          createdAt: new Date(Date.now() - 900_000).toISOString(),
          maxWaitingTime: 1_000
        }),
        ticket('2', {
          createdAt: new Date(Date.now() - 1_000_000).toISOString(),
          maxWaitingTime: 1_000
        })
      ],
      scopedWaitingCount: 2
    });

    const row = screen.getByTestId('staff-queue-ticket-1');
    const atLimitRow = screen.getByTestId('staff-queue-ticket-2');
    const timerValue = within(row).getByTestId('staff-queue-timer-value');
    const delta = within(row).getByText('01:40 remaining');

    expect(timerValue).toHaveTextContent('15:00 / 16:40');
    expect(timerValue).toHaveClass('text-amber-700', 'dark:text-amber-400');
    expect(delta).toHaveClass('text-amber-700', 'dark:text-amber-400');
    expect(row).toHaveClass('border-l-2', 'border-l-amber-500');
    expect(row).not.toHaveClass('border-l-red-500');
    expect(
      within(atLimitRow).getByTestId('staff-queue-timer-value')
    ).toHaveTextContent('16:40 / 16:40');
    expect(within(atLimitRow).getByText('00:00 remaining')).toHaveClass(
      'text-amber-700',
      'dark:text-amber-400'
    );
    expect(atLimitRow).toHaveClass('border-l-2', 'border-l-amber-500');
    expect(atLimitRow).not.toHaveClass('border-l-red-500');
  });

  it('turns the compact timer red only after the snapshot SLA is exceeded', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-09T09:00:00.000Z'));
    renderPanel({
      waitingTickets: [
        ticket('1', {
          createdAt: new Date(Date.now() - 1_001_000).toISOString(),
          maxWaitingTime: 1_000
        })
      ]
    });

    const row = screen.getByTestId('staff-queue-ticket-1');
    const timerValue = within(row).getByTestId('staff-queue-timer-value');
    const delta = within(row).getByText('00:01 over limit');

    expect(timerValue).toHaveTextContent('16:41 / 16:40');
    expect(timerValue).toHaveClass('text-red-700', 'dark:text-red-400');
    expect(delta).toHaveClass('text-red-700', 'dark:text-red-400');
    expect(row).toHaveClass('border-l-2', 'border-l-red-500');
    expect(row).not.toHaveClass('border-l-amber-500');
  });

  it.each([undefined, 0, -1])(
    'keeps a ticket with maxWaitingTime %s as an ordinary waiting row',
    (maxWaitingTime) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-09T09:00:00.000Z'));
      renderPanel({
        waitingTickets: [
          ticket('1', {
            createdAt: new Date(Date.now() - 65_000).toISOString(),
            maxWaitingTime
          })
        ]
      });

      const row = screen.getByTestId('staff-queue-ticket-1');

      expect(within(row).getByText('Waiting')).toBeVisible();
      expect(
        within(row).getByTestId('staff-queue-timer-value')
      ).toHaveTextContent('01:05');
      expect(within(row).queryByText('Waiting SLA')).not.toBeInTheDocument();
      expect(
        within(row).queryByText(/remaining|over limit/)
      ).not.toBeInTheDocument();
      expect(row).not.toHaveClass(
        'border-l-2',
        'border-l-border',
        'border-l-amber-500',
        'border-l-red-500'
      );
    }
  );

  it('does not fall back to the current Service SLA when the ticket has no snapshot', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-09T09:00:00.000Z'));
    renderPanel({
      waitingTickets: [
        ticket('1', {
          createdAt: new Date(Date.now() - 65_000).toISOString(),
          maxWaitingTime: undefined
        })
      ],
      services: [
        {
          id: 'service-a',
          unitId: 'unit-1',
          name: 'Payments',
          maxWaitingTime: 60
        }
      ]
    });

    const row = screen.getByTestId('staff-queue-ticket-1');
    expect(within(row).getByText('Waiting')).toBeVisible();
    expect(
      within(row).getByTestId('staff-queue-timer-value')
    ).toHaveTextContent('01:05');
    expect(within(row).queryByText('Waiting SLA')).not.toBeInTheDocument();
    expect(
      within(row).queryByText(/remaining|over limit/)
    ).not.toBeInTheDocument();
  });

  it('keeps oldest-first order when a later ticket crosses its SLA', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-09T09:00:00.000Z'));
    renderPanel({
      waitingTickets: [
        ticket('2', {
          createdAt: new Date(Date.now() - 1_001_000).toISOString(),
          maxWaitingTime: 1_000
        }),
        ticket('1', {
          createdAt: new Date(Date.now() - 1_200_000).toISOString(),
          maxWaitingTime: 2_000
        })
      ],
      scopedWaitingCount: 2
    });

    expect(screen.getAllByTestId(/^staff-queue-ticket-/)).toEqual([
      screen.getByTestId('staff-queue-ticket-1'),
      screen.getByTestId('staff-queue-ticket-2')
    ]);
  });

  it('keeps the header and renders five skeleton rows while loading', () => {
    renderPanel({ queuePending: true, waitingTickets: [] });

    expect(
      screen.getByRole('heading', { name: 'Waiting queue' })
    ).toBeVisible();
    expect(screen.getByText('Loading queue')).toBeVisible();
    expect(screen.getAllByTestId('staff-queue-skeleton')).toHaveLength(5);
  });

  it('keeps queue controls below the title with comfortable panel padding', () => {
    renderPanel({
      leafServicesForCreate: [{ id: 'service-a', label: 'Payments' }]
    });

    const header = screen.getByTestId('staff-queue-header');
    const layout = screen.getByTestId('staff-queue-header-layout');

    expect(header).toHaveClass('px-4', 'py-3', 'sm:px-5');
    expect(layout).toHaveClass('flex-col', 'gap-3');
    expect(
      within(layout).getByRole('heading', { name: 'Waiting queue' })
    ).toBeVisible();
    expect(
      within(layout).getByRole('button', { name: 'Services' })
    ).toBeVisible();
    expect(
      within(layout).getByRole('button', { name: 'Filters' })
    ).toBeVisible();
    expect(
      within(layout).getByRole('button', { name: 'New ticket' })
    ).toBeVisible();
  });

  it('keeps a permanent title refresh indicator without changing sorting geometry', () => {
    const { unmount } = renderPanel({ queueRefreshing: false });
    const idleIndicator = screen.getByTestId('staff-queue-refresh-indicator');
    const idleSorting = screen.getByText('Longest wait first');

    expect(idleIndicator).toHaveClass('size-1.5', 'opacity-0');
    expect(idleIndicator).not.toHaveClass('motion-safe:animate-pulse');
    expect(idleSorting).toHaveTextContent('Longest wait first');
    expect(screen.queryByText('Refreshing queue')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    unmount();
    renderPanel({ queueRefreshing: true });

    const refreshingIndicator = screen.getByTestId(
      'staff-queue-refresh-indicator'
    );

    expect(refreshingIndicator).toHaveClass(
      'size-1.5',
      'opacity-100',
      'motion-safe:animate-pulse'
    );
    expect(screen.getByText('Longest wait first')).toHaveTextContent(
      idleSorting.textContent ?? ''
    );
    expect(screen.getByText('Refreshing queue')).toHaveClass('sr-only');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText('Refreshing queue')).not.toHaveAttribute(
      'aria-live'
    );
  });

  it('renders an alert and retry action when the queue fails', () => {
    const onRetryQueue = vi.fn();
    renderPanel({
      queueError: new Error('Network unavailable'),
      waitingTickets: [],
      onRetryQueue
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not load queue: Network unavailable'
    );
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
  });

  it('names the selected services in the scoped empty state', () => {
    renderPanel({ waitingTickets: [], scopedWaitingCount: 0 });

    expect(screen.getByText('No tickets for Payments.')).toBeVisible();
  });

  it('uses a generic empty state while the temporary full list is shown', () => {
    renderPanel({
      waitingTickets: [],
      scopedWaitingCount: 0,
      showAllTicketsInQueue: true
    });

    expect(screen.getByText('No tickets waiting')).toBeVisible();
    expect(
      screen.queryByText('No tickets for Payments.')
    ).not.toBeInTheDocument();
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
    expect(
      screen
        .getByText(
          'Temporary full list: Call next still follows the selected services.'
        )
        .closest('[role="status"]')
    ).not.toBeNull();
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
      name: 'another conflicting workstation action',
      overrides: { conflictingActionPending: true }
    },
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

  it('keeps native switch geometry inside a 36px hit area', () => {
    const onShowAllTicketsInQueueChange = vi.fn();
    renderPanel({
      leafServicesForCreate: [{ id: 'service-a', label: 'Payments' }],
      onShowAllTicketsInQueueChange
    });

    for (const label of ['Services', 'Filters', 'New ticket']) {
      expect(screen.getByRole('button', { name: label })).toHaveClass('h-9');
    }

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    const showAllSwitch = screen.getByRole('switch', {
      name: 'Show all unit tickets'
    });
    const onlyMyZoneSwitch = screen.getByRole('switch', {
      name: 'Only my zone'
    });
    for (const control of [showAllSwitch, onlyMyZoneSwitch]) {
      expect(control).toHaveClass(
        'h-5',
        'w-9',
        'relative',
        'before:-inset-y-2',
        'before:inset-x-0'
      );
      expect(control.parentElement).toHaveClass(
        'flex',
        'size-9',
        'items-center',
        'justify-center'
      );
    }
    expect(screen.getByText('Show all unit tickets')).toHaveClass(
      'min-h-9',
      'flex-1'
    );
    expect(screen.getByText('Only my zone')).toHaveClass('min-h-9', 'flex-1');

    fireEvent.click(screen.getByText('Show all unit tickets'));
    expect(onShowAllTicketsInQueueChange).toHaveBeenCalledTimes(1);
    expect(onShowAllTicketsInQueueChange).toHaveBeenCalledWith(true);

    onShowAllTicketsInQueueChange.mockClear();
    fireEvent.click(showAllSwitch);
    expect(onShowAllTicketsInQueueChange).toHaveBeenCalledTimes(1);
    expect(onShowAllTicketsInQueueChange).toHaveBeenCalledWith(true);
  });
});
