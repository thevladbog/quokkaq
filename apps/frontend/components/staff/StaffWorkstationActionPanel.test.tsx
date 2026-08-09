import { render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { describe, expect, it, vi } from 'vitest';
import { TicketModelSchema, type Ticket } from '@/lib/api';
import {
  StaffWorkstationActionPanel,
  type StaffWorkstationActionPanelProps
} from './StaffWorkstationActionPanel';

const messages: Record<string, string> = {
  'actions.callNext': 'Call next',
  'actions.startService': 'Start service',
  'current.complete': 'Complete',
  'actions.transfer': 'Transfer',
  'actions.noShow': 'No show',
  'actions.returnToQueue': 'Back to queue',
  'actions.recall': 'Re-call',
  'workstation.resume': 'Resume work',
  'actions.call_next_empty_reason': 'No tickets are waiting.',
  'actions.disabled_on_break_reason': 'Resume work to manage the queue.',
  'actions.unavailable_status':
    'This ticket status is not supported. Refresh before continuing.',
  'actions.action_error': 'Action failed: {message}',
  'actions.processing_action': 'Processing action…'
};

function t(key: string, values?: Record<string, string | number | Date>) {
  return (messages[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) =>
    String(values?.[name] ?? '')
  );
}

function ticket(status: string): Ticket {
  return TicketModelSchema.parse({
    id: 'ticket-1',
    queueNumber: 'A001',
    unitId: 'unit-1',
    serviceId: 'service-1',
    status
  });
}

function renderPanel(
  overrides: Partial<StaffWorkstationActionPanelProps> = {}
) {
  const props: StaffWorkstationActionPanelProps = {
    t,
    currentTicket: undefined,
    waitingCount: 1,
    conflictingActionPending: false,
    callNextPending: false,
    confirmArrivalPending: false,
    completePending: false,
    transferPending: false,
    noShowPending: false,
    returnToQueuePending: false,
    recallPending: false,
    onResume: vi.fn(),
    onCallNext: vi.fn(),
    onConfirmArrival: vi.fn(),
    onComplete: vi.fn(),
    onOpenTransfer: vi.fn(),
    onNoShow: vi.fn(),
    onReturnToQueue: vi.fn(),
    onRecall: vi.fn(),
    ...overrides
  };

  return { ...render(<StaffWorkstationActionPanel {...props} />), props };
}

const workflowActionLabels = [
  'Call next',
  'Start service',
  'Complete',
  'Transfer',
  'No show',
  'Back to queue',
  'Re-call',
  'Resume work'
];

describe('StaffWorkstationActionPanel', () => {
  it.each([
    {
      name: 'without a current ticket',
      currentTicket: undefined,
      workstationOnBreak: false,
      primary: 'Call next',
      visible: ['Call next']
    },
    {
      name: 'for a called ticket',
      currentTicket: ticket('called'),
      workstationOnBreak: false,
      primary: 'Start service',
      visible: [
        'Start service',
        'Re-call',
        'No show',
        'Back to queue',
        'Transfer'
      ]
    },
    {
      name: 'for an in-service ticket',
      currentTicket: ticket('in_service'),
      workstationOnBreak: false,
      primary: 'Complete',
      visible: ['Complete', 'Transfer', 'Back to queue']
    },
    {
      name: 'while the workstation is on break',
      currentTicket: undefined,
      workstationOnBreak: true,
      primary: 'Resume work',
      visible: ['Resume work']
    }
  ])(
    'renders one status-specific primary action $name',
    ({ currentTicket, workstationOnBreak, primary, visible }) => {
      const { container } = renderPanel({ currentTicket, workstationOnBreak });
      const panel = within(container);

      const primaryActions = container.querySelectorAll(
        '[data-variant="primary-workflow"]'
      );
      expect(primaryActions).toHaveLength(1);
      expect(primaryActions[0]).toHaveTextContent(primary);

      for (const label of visible) {
        expect(panel.getByRole('button', { name: label })).toBeVisible();
      }
      for (const label of workflowActionLabels.filter(
        (label) => !visible.includes(label)
      )) {
        expect(
          panel.queryByRole('button', { name: label })
        ).not.toBeInTheDocument();
      }
    }
  );

  it('marks a pending primary action busy and ignores repeated activation', async () => {
    const user = userEvent.setup();
    const onCallNext = vi.fn();

    const { container } = renderPanel({ callNextPending: true, onCallNext });
    const panel = within(container);

    const callNext = panel.getByRole('button', { name: 'Processing action…' });
    expect(callNext).toHaveAttribute('aria-busy', 'true');
    await user.click(callNext);
    await user.click(callNext);
    expect(onCallNext).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'call next',
      label: 'Call next',
      buildOverrides: (handler: () => void) => ({ onCallNext: handler })
    },
    {
      name: 'start service',
      label: 'Start service',
      buildOverrides: (handler: () => void) => ({
        currentTicket: ticket('called'),
        onConfirmArrival: handler
      })
    },
    {
      name: 'complete',
      label: 'Complete',
      buildOverrides: (handler: () => void) => ({
        currentTicket: ticket('in_service'),
        onComplete: handler
      })
    },
    {
      name: 'resume',
      label: 'Resume work',
      buildOverrides: (handler: () => void) => ({
        workstationOnBreak: true,
        onResume: handler
      })
    }
  ])(
    'runs the enabled $name primary action once',
    async ({ label, buildOverrides }) => {
      const user = userEvent.setup();
      const handler = vi.fn();
      const { container } = renderPanel(buildOverrides(handler));

      await user.click(within(container).getByRole('button', { name: label }));

      expect(handler).toHaveBeenCalledTimes(1);
    }
  );

  it('blocks workflow mutations for an unsupported active ticket status', () => {
    const { container } = renderPanel({
      currentTicket: ticket('unexpected_active_status')
    });
    const panel = within(container);

    expect(
      panel.getByText(
        'This ticket status is not supported. Refresh before continuing.'
      )
    ).toBeVisible();
    expect(
      container.querySelectorAll('[data-variant="primary-workflow"]')
    ).toHaveLength(0);
  });

  it.each([
    {
      name: 'no-show',
      overrides: {
        currentTicket: ticket('called'),
        noShowPending: true
      }
    },
    {
      name: 'transfer',
      overrides: {
        currentTicket: ticket('in_service'),
        transferPending: true
      }
    }
  ])('shows processing feedback while $name is pending', ({ overrides }) => {
    const { container } = renderPanel(overrides);

    expect(
      within(container).getByRole('button', { name: 'Processing action…' })
    ).toBeDisabled();
  });

  it('locks every conflicting action while preserving the pending action label', () => {
    const { container } = renderPanel({
      currentTicket: ticket('called'),
      conflictingActionPending: true,
      recallPending: true
    });
    const panel = within(container);

    for (const name of [
      'Start service',
      'Processing action…',
      'No show',
      'Back to queue',
      'Transfer'
    ]) {
      expect(panel.getByRole('button', { name })).toBeDisabled();
    }
  });

  it('explains why call next is unavailable when the scoped queue is empty', () => {
    const { container } = renderPanel({ waitingCount: 0 });
    const panel = within(container);

    expect(panel.getByRole('button', { name: 'Call next' })).toBeDisabled();
    expect(panel.getByText('No tickets are waiting.')).toBeVisible();
  });

  it('renders an action failure as an inline alert', () => {
    const { container } = renderPanel({ actionError: 'Network unavailable' });

    expect(within(container).getByRole('alert')).toHaveTextContent(
      'Action failed: Network unavailable'
    );
  });

  it.each([
    { name: 'idle', props: {} },
    { name: 'called', props: { currentTicket: ticket('called') } },
    { name: 'break', props: { workstationOnBreak: true } }
  ])('has no axe violations while $name', async ({ props }) => {
    const { container } = renderPanel(props);

    expect((await axe(container)).violations).toHaveLength(0);
  });
});
