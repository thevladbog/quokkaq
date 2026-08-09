import { Suspense } from 'react';
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiHttpError,
  ServiceModelSchema,
  TicketModelSchema,
  type Service,
  type Ticket
} from '@/lib/api';
import StaffWorkspacePage from './page';

const state = vi.hoisted(() => ({
  ticketsQuery: {
    data: undefined as Ticket[] | undefined,
    error: null as Error | null,
    isPending: false,
    isFetching: false,
    refetch: vi.fn()
  },
  servicesQuery: {
    data: [] as Service[] | undefined,
    error: null as Error | null,
    isPending: false,
    isFetching: false,
    refetch: vi.fn()
  },
  clientVisits: {
    data: undefined as { items: Ticket[] } | undefined,
    isLoading: false
  },
  clientVisitCalls: [] as unknown[][],
  counterOnBreak: false,
  counterServiceZoneId: 'zone-1' as string | null | undefined,
  complete: { mutateAsync: vi.fn(), isPending: false },
  noShow: { mutateAsync: vi.fn(), isPending: false },
  callNext: { mutateAsync: vi.fn(), isPending: false },
  transfer: { mutateAsync: vi.fn(), isPending: false },
  pick: { mutateAsync: vi.fn(), isPending: false },
  confirmArrival: { mutateAsync: vi.fn(), isPending: false },
  returnToQueue: { mutateAsync: vi.fn(), isPending: false },
  recall: { mutateAsync: vi.fn(), isPending: false },
  updateComment: { mutate: vi.fn(), isPending: false },
  updateVisitor: { mutate: vi.fn(), isPending: false },
  api: {
    getUnit: vi.fn(),
    getCounters: vi.fn(),
    getChildUnits: vi.fn(),
    createTicket: vi.fn(),
    searchClients: vi.fn(),
    startBreak: vi.fn(),
    endBreak: vi.fn(),
    release: vi.fn()
  },
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn()
  },
  socket: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    onTicketCreated: vi.fn(),
    onTicketUpdated: vi.fn(),
    onTicketCalled: vi.fn(),
    onKioskSurveyLow: vi.fn(),
    off: vi.fn(),
    offKioskSurveyLow: vi.fn()
  }
}));

vi.mock('next-intl', () => ({
  useTranslations: () => translate
}));

vi.mock('@/src/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn() })
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuthContext: () => ({
    user: { isPlatformAdmin: true, name: 'Ada Operator' }
  })
}));

vi.mock('@/contexts/ActiveUnitContext', () => ({
  useSyncActiveUnit: vi.fn()
}));

vi.mock('@/components/ui/sidebar', () => ({
  useSidebar: () => ({ setOpen: vi.fn() })
}));

vi.mock('@/components/staff/StaffVisitorTagsEditModal', () => ({
  StaffVisitorTagsEditModal: () => null
}));

vi.mock('@/components/visitors/VisitTransferTrail', () => ({
  VisitTransferTrail: () => null
}));

vi.mock('@/lib/socket', () => ({ socketClient: state.socket }));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() }
}));

vi.mock('sonner', () => ({ toast: state.toast }));

vi.mock('@/lib/use-live-elapsed-since', () => ({
  useLiveElapsedSecondsSince: () => 65
}));

vi.mock('@/lib/hooks', () => ({
  useTickets: () => state.ticketsQuery,
  useUnitServices: () => state.servicesQuery,
  useCompleteTicket: () => state.complete,
  useNoShowTicket: () => state.noShow,
  useCallNextTicket: () => state.callNext,
  useTransferTicket: () => state.transfer,
  usePickTicket: () => state.pick,
  useConfirmArrivalTicket: () => state.confirmArrival,
  useReturnToQueueTicket: () => state.returnToQueue,
  useRecallTicket: () => state.recall,
  useUpdateOperatorComment: () => state.updateComment,
  useUpdateTicketVisitor: () => state.updateVisitor,
  useClientVisits: (...args: unknown[]) => {
    state.clientVisitCalls.push(args);
    return state.clientVisits;
  }
}));

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    unitsApi: {
      ...actual.unitsApi,
      getById: state.api.getUnit,
      getChildUnits: state.api.getChildUnits,
      createTicket: state.api.createTicket,
      searchClients: state.api.searchClients
    },
    countersApi: {
      ...actual.countersApi,
      getByUnitId: state.api.getCounters,
      startBreak: state.api.startBreak,
      endBreak: state.api.endBreak,
      release: state.api.release
    }
  };
});

const messages: Record<string, string> = {
  'workstation.break': 'Take break',
  'workstation.resume': 'Resume work',
  'workstation.status_active': 'Active',
  'workstation.break_started': 'Break started',
  'workstation.break_ended': 'Break ended',
  'workstation.break_error': 'Could not change break',
  'workstation.break_needs_no_ticket':
    'Finish or transfer the active ticket before taking a break.',
  logout: 'Release counter',
  logout_failed: 'Could not release counter',
  'current.title': 'Current ticket',
  'current.description': 'Active visit at this counter',
  'current.complete': 'Complete',
  'current.loading': 'Loading current ticket',
  'current.load_error': 'Could not refresh tickets: {message}',
  'current.retry': 'Retry current ticket',
  'current.scope_empty_hint': '{count} tickets match the selected services.',
  'current.visitor_section': 'Visitor',
  'current.anonymous_visitor': 'Walk-in guest',
  'current.unknown_visitor': 'Unknown visitor',
  'current.no_visitor_profile': 'No visitor profile',
  'current.visitor_portrait_aria': 'Visitor portrait',
  'current.service': 'Service',
  'current.called_time': 'Time since call',
  'current.idle_portrait_aria': 'Counter idle state',
  'current.idle_badge': 'Ready',
  'current.idle_title': 'Waiting for the next visitor',
  'current.idle_subtitle': 'Call the next ticket when ready.',
  'current.break_title': 'You are on a break',
  'current.break_subtitle': 'Queue actions stay unavailable.',
  'current.break_duration': 'Break duration',
  'actions.callNext': 'Call next',
  'actions.startService': 'Start service',
  'actions.transfer': 'Transfer',
  'actions.noShow': 'No show',
  'actions.returnToQueue': 'Back to queue',
  'actions.returnToQueue_hint': 'Return this ticket to the queue.',
  'actions.recall': 'Re-call',
  'actions.recall_hint': 'Announce the ticket again.',
  'actions.call': 'Call',
  'actions.call_next_empty_reason': 'No tickets are waiting.',
  'actions.disabled_on_break_reason': 'Resume work to manage the queue.',
  'actions.action_error': 'Action failed: {message}',
  'actions.processing_action': 'Processing action…',
  'actions.unavailable_status':
    'This ticket status is not supported. Refresh before continuing.',
  'queue.title': 'Waiting queue',
  'queue.description': 'Tickets waiting to be called',
  'queue.number': 'Number',
  'queue.waiting': 'Waiting',
  'queue.service_time': 'Service time',
  'queue.max_label': 'Max',
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
    'The full list is temporary; call next remains scoped.',
  'queue.noTickets': 'No tickets waiting',
  'queue.empty_scoped': 'No tickets for {scope}.',
  'queue.loading': 'Loading queue',
  'queue.refreshing': 'Refreshing queue',
  'queue.retry': 'Retry queue',
  'queue.load_error': 'Could not load queue: {message}',
  'queue.no_name': 'No name on file',
  'queue.uncategorized': 'Other',
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
  'statuses.called': 'Called',
  'statuses.in_service': 'In service',
  'visitor_context.open_details': 'Visitor details',
  'visitor_context.details_title': 'Visitor details',
  'visitor_context.details_description': 'Notes and recent visits.',
  'visitor_context.title': 'Visitor notes & history',
  'visitor_context.last_transfer': 'Last transfer',
  'visitor_context.transfer_show_all': 'Show all transfers',
  'visitor_context.transferred_at': 'Transferred {time}',
  'visitor_context.transfer_service_flow': '{from} → {to}',
  'visitor_context.comment_label': 'Operator notes',
  'visitor_context.comment_placeholder': 'Notes',
  'visitor_context.save': 'Save',
  'visitor_context.history_title': 'Recent visits',
  'visitor_context.history_needs_visitor': 'Link a visitor to see history.',
  'visitor_context.visitor_on_ticket': 'Visitor on ticket',
  'visitor_context.change_visitor_hint': 'Change the linked visitor.',
  'visitor_context.current_visitor': 'Current:',
  'visitor_context.change_visitor': 'Change visitor',
  'visitor_context.attach_visitor': 'Link visitor',
  'messages.failed': 'Could not {action}',
  'messages.called': 'Called {number}',
  'messages.serviceStarted': 'Started {number}',
  'messages.completed': 'Completed {number}',
  'messages.noShow': 'No show {number}',
  'messages.returnedToQueue': 'Returned {number}',
  'messages.recalled': 'Re-called {number}',
  'messages.transferred': 'Transferred {number}'
};

function translate(
  key: string,
  values?: Record<string, string | number | Date>
) {
  return (messages[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) =>
    String(values?.[name] ?? '')
  );
}

const services = [
  ServiceModelSchema.parse({
    id: 'service-a',
    unitId: 'unit-1',
    name: 'Payments',
    nameEn: 'Payments',
    isLeaf: true
  }),
  ServiceModelSchema.parse({
    id: 'service-b',
    unitId: 'unit-1',
    name: 'Documents',
    nameEn: 'Documents',
    isLeaf: true
  })
];

function ticket(
  id: string,
  status: string,
  overrides: Partial<Ticket> = {}
): Ticket {
  return TicketModelSchema.parse({
    id,
    queueNumber: id.toUpperCase(),
    unitId: 'unit-1',
    serviceId: 'service-a',
    serviceZoneId: 'zone-1',
    status,
    createdAt: '2026-08-09T08:00:00.000Z',
    ...overrides
  });
}

const routeParams = {
  unitId: 'unit-1',
  counterId: 'counter-1',
  locale: 'en'
};
const params = Object.assign(Promise.resolve(routeParams), {
  status: 'fulfilled',
  value: routeParams
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false }
    }
  });

  const createView = () => (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={<div>Route suspense</div>}>
        <StaffWorkspacePage params={params} />
      </Suspense>
    </QueryClientProvider>
  );
  const view = createView();

  return { ...render(view), queryClient, createView };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  localStorage.clear();
  state.ticketsQuery.data = [
    ticket('a001', 'waiting'),
    ticket('b002', 'waiting', { serviceId: 'service-b' })
  ];
  state.ticketsQuery.error = null;
  state.ticketsQuery.isPending = false;
  state.ticketsQuery.isFetching = false;
  state.ticketsQuery.refetch.mockReset().mockResolvedValue({ data: [] });
  state.servicesQuery.data = services;
  state.servicesQuery.error = null;
  state.servicesQuery.isPending = false;
  state.servicesQuery.isFetching = false;
  state.servicesQuery.refetch.mockReset().mockResolvedValue({ data: services });
  state.clientVisits.data = undefined;
  state.clientVisits.isLoading = false;
  state.clientVisitCalls.length = 0;
  state.counterOnBreak = false;
  state.counterServiceZoneId = 'zone-1';

  for (const mutation of [
    state.complete,
    state.noShow,
    state.callNext,
    state.transfer,
    state.pick,
    state.confirmArrival,
    state.returnToQueue,
    state.recall
  ]) {
    mutation.isPending = false;
    mutation.mutateAsync.mockReset().mockResolvedValue(undefined);
  }
  state.callNext.mutateAsync.mockResolvedValue({
    ok: true,
    ticket: ticket('a001', 'called')
  });

  for (const spy of [
    state.api.getUnit,
    state.api.getCounters,
    state.api.getChildUnits,
    state.api.createTicket,
    state.api.searchClients,
    state.api.startBreak,
    state.api.endBreak,
    state.api.release,
    state.toast.success,
    state.toast.error,
    state.toast.warning,
    state.socket.connect,
    state.socket.disconnect,
    state.socket.onTicketCreated,
    state.socket.onTicketUpdated,
    state.socket.onTicketCalled,
    state.socket.onKioskSurveyLow,
    state.socket.off,
    state.socket.offKioskSurveyLow
  ]) {
    spy.mockReset();
  }

  state.api.getUnit.mockResolvedValue({
    id: 'unit-1',
    name: 'Central office',
    nameEn: 'Central office'
  });
  state.api.getCounters.mockImplementation(async () => [
    {
      id: 'counter-1',
      unitId: 'unit-1',
      serviceZoneId: state.counterServiceZoneId,
      name: 'Counter 1',
      onBreak: state.counterOnBreak,
      breakStartedAt: state.counterOnBreak ? '2026-08-09T08:00:00.000Z' : null
    }
  ]);
  state.api.getChildUnits.mockResolvedValue([]);
  state.api.createTicket.mockResolvedValue(undefined);
  state.api.searchClients.mockResolvedValue([]);
  state.api.startBreak.mockResolvedValue(undefined);
  state.api.endBreak.mockResolvedValue(undefined);
  state.api.release.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
});

describe('StaffWorkspacePage integration', () => {
  it('renders the scoped idle queue and uses Call next as the primary action', async () => {
    state.ticketsQuery.isFetching = true;
    const rendered = renderPage();

    expect(await screen.findByTestId('staff-workstation-shell')).toBeVisible();
    expect(screen.getByText('Ada Operator')).toBeVisible();
    expect(screen.getByText('A001')).toBeVisible();
    expect(screen.getByText('B002')).toBeVisible();
    expect(
      screen.getByText('2 tickets match the selected services.')
    ).toBeVisible();
    expect(screen.getByText('Refreshing queue')).toBeVisible();
    expect(screen.getByText('Active')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Call next' })).toHaveAttribute(
      'data-variant',
      'primary-workflow'
    );
    expect(state.socket.connect).toHaveBeenCalledWith('unit-1');
    expect(state.socket.onTicketCreated).toHaveBeenCalledTimes(1);
    expect(state.socket.onTicketUpdated).toHaveBeenCalledTimes(1);
    expect(state.socket.onTicketCalled).toHaveBeenCalledTimes(1);

    rendered.unmount();
    expect(state.socket.disconnect).toHaveBeenCalledTimes(1);
    expect(state.socket.off).toHaveBeenCalledWith(
      'ticket.created',
      expect.any(Function)
    );
  });

  it('uses the selected service scope for both visible rows and call-next payload', async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      'staff-service-scope:unit-1:counter-1',
      JSON.stringify(['service-a'])
    );
    localStorage.setItem('staff-queue-only-my-zone:unit-1:counter-1', '1');
    state.ticketsQuery.data = [
      ticket('a001', 'waiting'),
      ticket('b002', 'waiting', { serviceId: 'service-b' }),
      ticket('a003', 'waiting', { serviceZoneId: 'zone-2' })
    ];
    renderPage();

    await screen.findByText('A001');
    await waitFor(() => {
      expect(screen.queryByText('B002')).not.toBeInTheDocument();
      expect(screen.queryByText('A003')).not.toBeInTheDocument();
    });
    expect(screen.getByText('1 waiting')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Call next' }));

    expect(state.callNext.mutateAsync).toHaveBeenCalledWith({
      counterId: 'counter-1',
      serviceIds: ['service-a']
    });
  });

  it('fails the queue and call-next closed while the service catalog is loading', async () => {
    const user = userEvent.setup();
    state.servicesQuery.data = undefined;
    state.servicesQuery.isPending = true;
    renderPage();

    expect(await screen.findByText('Loading queue')).toBeVisible();
    expect(screen.queryByText('A001')).not.toBeInTheDocument();
    const callNext = screen.getByRole('button', { name: 'Call next' });
    expect(callNext).toBeDisabled();
    await user.click(callNext);
    expect(state.callNext.mutateAsync).not.toHaveBeenCalled();
  });

  it('fails the queue and call-next closed when the service catalog query errors', async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      'staff-service-scope:unit-1:counter-1',
      JSON.stringify(['service-a'])
    );
    state.servicesQuery.data = undefined;
    state.servicesQuery.error = new Error('Services unavailable');
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Services unavailable'
    );
    expect(screen.queryByText('A001')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Call next' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Retry queue' }));
    expect(state.servicesQuery.refetch).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('staff-service-scope:unit-1:counter-1')).toBe(
      JSON.stringify(['service-a'])
    );
  });

  it('shows queue refresh feedback while services refresh in the background', async () => {
    state.servicesQuery.isFetching = true;
    renderPage();

    expect(await screen.findByText('Refreshing queue')).toBeVisible();
  });

  it('keeps normal all-services behavior for a genuinely loaded empty catalog', async () => {
    const user = userEvent.setup();
    state.servicesQuery.data = [];
    renderPage();

    expect(await screen.findByText('A001')).toBeVisible();
    expect(screen.getByText('B002')).toBeVisible();
    const callNext = screen.getByRole('button', { name: 'Call next' });
    expect(callNext).toBeEnabled();

    await user.click(callNext);
    expect(state.callNext.mutateAsync).toHaveBeenCalledWith({
      counterId: 'counter-1',
      serviceIds: undefined
    });
  });

  it('locks call-next, every row call and break controls during a deferred row pick', async () => {
    const user = userEvent.setup();
    const pendingPick = deferred<void>();
    state.pick.mutateAsync.mockReturnValueOnce(pendingPick.promise);
    renderPage();

    const rowCalls = await screen.findAllByRole('button', { name: 'Call' });
    await user.click(rowCalls[0]);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Call next' })).toBeDisabled();
      for (const rowCall of screen.getAllByRole('button', { name: 'Call' })) {
        expect(rowCall).toBeDisabled();
      }
      expect(screen.getByRole('button', { name: 'Take break' })).toBeDisabled();
      expect(
        screen.getByRole('button', { name: 'Release counter' })
      ).toBeDisabled();
    });

    await act(async () => {
      pendingPick.resolve();
      await pendingPick.promise;
    });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Call next' })).toBeEnabled()
    );
  });

  it('aligns the unzoned queue count and call-next for an unzoned counter', async () => {
    const user = userEvent.setup();
    state.counterServiceZoneId = null;
    localStorage.setItem('staff-queue-only-my-zone:unit-1:counter-1', '1');
    state.ticketsQuery.data = [
      ticket('u001', 'waiting', { serviceZoneId: null }),
      ticket('z002', 'waiting', { serviceZoneId: 'zone-1' })
    ];
    renderPage();

    expect(await screen.findByText('U001')).toBeVisible();
    await waitFor(() => {
      expect(screen.queryByText('Z002')).not.toBeInTheDocument();
      expect(screen.getByText('1 waiting')).toBeVisible();
    });

    await user.click(screen.getByRole('button', { name: 'Call next' }));
    expect(state.callNext.mutateAsync).toHaveBeenCalledWith({
      counterId: 'counter-1',
      serviceIds: undefined
    });
  });

  it('temporarily shows all zone rows without changing the scoped call-next payload', async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      'staff-service-scope:unit-1:counter-1',
      JSON.stringify(['service-a'])
    );
    renderPage();

    await screen.findByText('A001');
    await waitFor(() =>
      expect(screen.queryByText('B002')).not.toBeInTheDocument()
    );
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await user.click(screen.getByText('Show all unit tickets'));
    expect(await screen.findByText('B002')).toBeVisible();
    expect(
      screen.getByText('The full list is temporary; call next remains scoped.')
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Call next' }));
    expect(state.callNext.mutateAsync).toHaveBeenCalledWith({
      counterId: 'counter-1',
      serviceIds: ['service-a']
    });
  });

  it('renders Start service primary with called-ticket secondary actions', async () => {
    const user = userEvent.setup();
    state.ticketsQuery.data = [ticket('a001', 'called')];
    renderPage();

    expect(
      await screen.findByRole('button', { name: 'Start service' })
    ).toHaveAttribute('data-variant', 'primary-workflow');
    for (const name of ['Re-call', 'No show', 'Back to queue', 'Transfer']) {
      expect(screen.getByRole('button', { name })).toBeVisible();
    }

    await user.click(screen.getByRole('button', { name: 'Start service' }));
    await user.click(screen.getByRole('button', { name: 'Re-call' }));
    await user.click(screen.getByRole('button', { name: 'No show' }));
    await user.click(screen.getByRole('button', { name: 'Back to queue' }));
    await user.click(screen.getByRole('button', { name: 'Transfer' }));

    expect(state.confirmArrival.mutateAsync).toHaveBeenCalledWith('a001');
    expect(state.recall.mutateAsync).toHaveBeenCalledWith('a001');
    expect(state.noShow.mutateAsync).toHaveBeenCalledWith('a001');
    expect(state.returnToQueue.mutateAsync).toHaveBeenCalledWith('a001');
    expect(screen.getByRole('dialog')).toBeVisible();
  });

  it('wires localized service and elapsed-since-call context into the active hero', async () => {
    state.ticketsQuery.data = [
      ticket('a001', 'called', {
        calledAt: new Date(Date.now() - 65_000).toISOString()
      })
    ];
    renderPage();

    const currentTitle = await screen.findByText('Current ticket');
    const currentCard = currentTitle.closest('[data-slot="card"]');
    expect(currentCard).not.toBeNull();
    const hero = within(currentCard as HTMLElement);
    expect(hero.getByText('Service')).toBeVisible();
    expect(hero.getByText('Payments')).toBeVisible();
    expect(hero.getByText('Time since call')).toBeVisible();
    expect(hero.getByText('01:05')).toBeVisible();
  });

  it('renders Complete primary with transfer and return secondary actions in service', async () => {
    const user = userEvent.setup();
    state.ticketsQuery.data = [ticket('a001', 'in_service')];
    renderPage();

    expect(
      await screen.findByRole('button', { name: 'Complete' })
    ).toHaveAttribute('data-variant', 'primary-workflow');
    expect(screen.getByRole('button', { name: 'Transfer' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Back to queue' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'No show' })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Complete' }));
    await user.click(screen.getByRole('button', { name: 'Back to queue' }));
    await user.click(screen.getByRole('button', { name: 'Transfer' }));

    expect(state.complete.mutateAsync).toHaveBeenCalledWith('a001');
    expect(state.returnToQueue.mutateAsync).toHaveBeenCalledWith('a001');
    expect(screen.getByRole('dialog')).toBeVisible();
  });

  it('keeps the queue visible and disabled while break exposes one Resume primary', async () => {
    const user = userEvent.setup();
    state.counterOnBreak = true;
    renderPage();

    expect(await screen.findByText('A001')).toBeVisible();
    expect(
      await screen.findAllByRole('button', { name: 'Resume work' })
    ).toHaveLength(1);
    for (const callButton of screen.getAllByRole('button', { name: 'Call' })) {
      expect(callButton).toBeDisabled();
    }

    await user.click(screen.getByRole('button', { name: 'Resume work' }));
    await waitFor(() => expect(state.api.endBreak).toHaveBeenCalledTimes(1));
  });

  it('shows a localized inline fallback when starting a break fails without detail', async () => {
    const user = userEvent.setup();
    state.api.startBreak.mockRejectedValueOnce(new Error(''));
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Take break' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Action failed: Could not change break'
    );
    expect(state.toast.error).toHaveBeenCalledWith('Could not change break', {
      description: undefined
    });
  });

  it('preserves non-empty start-break toast detail exactly', async () => {
    const user = userEvent.setup();
    state.api.startBreak.mockRejectedValueOnce(
      new Error('  Start backend detail  ')
    );
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Take break' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Action failed: Could not change break'
    );
    expect(state.toast.error).toHaveBeenCalledWith('Could not change break', {
      description: '  Start backend detail  '
    });
  });

  it('uses one active-ticket break message for inline and toast feedback when the API provides a stable code', async () => {
    const user = userEvent.setup();
    state.api.startBreak.mockRejectedValueOnce(
      new ApiHttpError('Conflict', 409, 'counter_break_active_ticket')
    );
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Take break' }));

    const message =
      'Finish or transfer the active ticket before taking a break.';
    expect(await screen.findByRole('alert')).toHaveTextContent(
      `Action failed: ${message}`
    );
    expect(state.toast.error).toHaveBeenCalledWith(message, {
      description: 'Conflict'
    });
  });

  it('blocks workflow actions for an unsupported ticket status assigned to this counter', async () => {
    state.ticketsQuery.data = [
      ticket('a001', 'unexpected_active_status', {
        counter: { id: 'counter-1', name: 'Counter 1' }
      })
    ];
    renderPage();

    expect(
      await screen.findByText(
        'This ticket status is not supported. Refresh before continuing.'
      )
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Call next' })
    ).not.toBeInTheDocument();
  });

  it('shows a localized inline fallback while keeping end-break detail in the toast', async () => {
    const user = userEvent.setup();
    state.counterOnBreak = true;
    state.api.endBreak.mockRejectedValueOnce(
      new Error('  Backend unavailable  ')
    );
    renderPage();

    await user.click(
      await screen.findByRole('button', { name: 'Resume work' })
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Action failed: Could not change break'
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent(
      'Backend unavailable'
    );
    expect(state.toast.error).toHaveBeenCalledWith('Could not change break', {
      description: '  Backend unavailable  '
    });
  });

  it('keeps stable current-card and queue skeletons while tickets are pending', async () => {
    state.ticketsQuery.data = undefined;
    state.ticketsQuery.isPending = true;
    state.ticketsQuery.isFetching = true;
    renderPage();

    expect(
      await screen.findByTestId('staff-current-ticket-skeleton')
    ).toBeVisible();
    expect(screen.getByText('Loading current ticket')).toBeVisible();
    expect(screen.getAllByTestId('staff-queue-skeleton')).toHaveLength(5);
  });

  it('preserves a cached active ticket and offers inline retry after refetch failure', async () => {
    const user = userEvent.setup();
    state.ticketsQuery.data = [ticket('a001', 'called')];
    state.ticketsQuery.error = new Error('Network unavailable');
    renderPage();

    expect(await screen.findByText('A001')).toBeVisible();
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent(
      'Could not refresh tickets: Network unavailable'
    );
    await user.click(
      screen.getByRole('button', { name: 'Retry current ticket' })
    );
    await user.click(screen.getByRole('button', { name: 'Retry queue' }));
    expect(state.ticketsQuery.refetch).toHaveBeenCalled();
  });

  it('shows action failure inline and keeps the existing error toast', async () => {
    const user = userEvent.setup();
    state.callNext.mutateAsync.mockRejectedValueOnce(
      new Error('Network unavailable')
    );
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Call next' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Action failed: Could not Call next'
    );
    expect(state.toast.error).toHaveBeenCalledWith('Could not Call next');
  });

  it('queries one linked active visitor and passes that ticket transfer trail to the hero', async () => {
    const active = ticket('a001', 'called', {
      client: {
        id: 'client-1',
        firstName: 'Ada',
        lastName: 'Lovelace',
        isAnonymous: false
      }
    });
    state.ticketsQuery.data = [active, ticket('b002', 'waiting')];
    state.clientVisits.data = {
      items: [
        ticket('old-visit', 'completed', {
          client: active.client,
          transferTrail: [
            {
              at: '2026-08-08T08:00:00.000Z',
              fromServiceNameEn: 'Wrong old service',
              toServiceNameEn: 'Wrong old destination'
            }
          ]
        }),
        ticket('a001', 'called', {
          client: active.client,
          transferTrail: [
            {
              at: '2026-08-09T09:00:00.000Z',
              fromServiceNameEn: 'Payments',
              toServiceNameEn: 'Documents'
            }
          ]
        })
      ]
    };
    renderPage();

    expect(await screen.findByText('Last transfer')).toBeVisible();
    expect(screen.getByText('Payments → Documents')).toBeVisible();
    expect(screen.queryByText(/Wrong old/)).not.toBeInTheDocument();
    expect(state.clientVisitCalls.length).toBeGreaterThan(0);
    expect(
      new Set(
        state.clientVisitCalls.map(([unitId, clientId, options]) =>
          JSON.stringify([unitId, clientId, options])
        )
      )
    ).toEqual(
      new Set([JSON.stringify(['unit-1', 'client-1', { enabled: true }])])
    );
  });

  it.each([
    {
      name: 'anonymous visitor',
      client: {
        id: 'anonymous-1',
        firstName: '',
        lastName: '',
        isAnonymous: true
      }
    },
    { name: 'no linked visitor', client: undefined }
  ])(
    'disables client visits and omits transfer summary for $name',
    async ({ client }) => {
      state.ticketsQuery.data = [ticket('a001', 'called', { client })];
      renderPage();

      expect(await screen.findByText('A001')).toBeVisible();
      expect(screen.queryByText('Last transfer')).not.toBeInTheDocument();
      expect(state.clientVisitCalls.length).toBeGreaterThan(0);
      expect(
        state.clientVisitCalls.every(
          ([unitId, clientId, options]) =>
            unitId === 'unit-1' &&
            clientId === undefined &&
            JSON.stringify(options) === JSON.stringify({ enabled: false })
        )
      ).toBe(true);
    }
  );

  it('opens visitor details from the hero and closes stale details when active ticket changes', async () => {
    const user = userEvent.setup();
    state.ticketsQuery.data = [
      ticket('a001', 'called', {
        client: {
          id: 'client-1',
          firstName: 'Ada',
          lastName: 'Lovelace',
          isAnonymous: false
        }
      })
    ];
    const rendered = renderPage();

    await user.click(
      await screen.findByRole('button', { name: 'Visitor details' })
    );
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(screen.getByText('Visitor notes & history')).toBeVisible();

    state.ticketsQuery.data = [
      ticket('b002', 'called', {
        client: {
          id: 'client-2',
          firstName: 'Grace',
          lastName: 'Hopper',
          isAnonymous: false
        }
      })
    ];
    rendered.rerender(rendered.createView());

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    expect(screen.getByText('B002')).toBeVisible();
  });
});
