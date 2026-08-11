import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExperienceTemplate } from '@quokkaq/shared-types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    const translations: Record<string, string> = {
      'stationRuntime.actions.continue': 'Continue',
      'stationRuntime.actions.startOver': 'Start over'
    };
    return String(values?.default ?? translations[key] ?? key);
  }
}));

import {
  ExperienceRenderer,
  resolveExperienceActivationValue,
  type ExperienceRuntimeAdapters,
  type ExperienceActivationEvent,
  type ExperienceRuntimeContext,
  type ExperienceRuntimeSession
} from './experience-renderer';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function variant(surface: ExperienceTemplate['surface']) {
  return {
    id: 'display',
    profile: {
      id: 'profile',
      name: 'Test display',
      width: surface === 'queue-display' ? 1920 : 820,
      height: surface === 'queue-display' ? 1080 : 1180,
      interactionMode:
        surface === 'queue-display'
          ? ('non-touch' as const)
          : ('touch' as const),
      viewingDistance:
        surface === 'queue-display' ? ('far' as const) : ('near' as const),
      safeArea: { top: 36, right: 48, bottom: 36, left: 48 }
    },
    grid: { columns: 12, rows: 8 }
  };
}

function navigationTemplate(): ExperienceTemplate {
  return {
    schemaVersion: 1,
    id: 'runtime-navigation',
    surface: 'ticket-station',
    startPageId: 'home',
    variants: [variant('ticket-station')],
    pages: [
      {
        id: 'home',
        name: 'Home',
        widgets: [
          {
            id: 'continue',
            type: 'rich-info',
            config: { label: 'Continue' },
            actions: [
              {
                type: 'set-session',
                key: 'selectedServiceId',
                value: { source: 'literal', value: 'service-7' }
              },
              { type: 'submit-ticket' },
              { type: 'navigate', toPageId: 'details' }
            ]
          }
        ],
        layouts: {
          display: {
            placements: {
              continue: { col: 1, row: 1, colSpan: 4, rowSpan: 2 }
            }
          }
        }
      },
      {
        id: 'details',
        name: 'Details',
        widgets: [
          {
            id: 'details-copy',
            type: 'rich-info',
            config: { label: 'Details content' },
            actions: []
          }
        ],
        layouts: {
          display: {
            placements: {
              'details-copy': { col: 1, row: 1, colSpan: 4, rowSpan: 2 }
            }
          }
        }
      }
    ]
  };
}

function addPage(
  template: ExperienceTemplate,
  id: string,
  label: string,
  actions: ExperienceTemplate['pages'][number]['widgets'][number]['actions'] = []
) {
  template.pages.push({
    id,
    name: label,
    widgets: [
      {
        id: `${id}-action`,
        type: 'rich-info',
        config: { label },
        actions
      }
    ],
    layouts: {
      display: {
        placements: {
          [`${id}-action`]: { col: 1, row: 1, colSpan: 4, rowSpan: 2 }
        }
      }
    }
  });
}

function queueDisplayTemplate(
  width = 1920,
  height = 1080,
  calledWidgetCount = 1
): ExperienceTemplate {
  const widgets = Array.from({ length: calledWidgetCount }, (_, index) => ({
    id: `calls-${index + 1}`,
    type: 'called-tickets' as const,
    config: {},
    actions: []
  }));
  return {
    schemaVersion: 1,
    id: `queue-display-${width}x${height}`,
    surface: 'queue-display',
    startPageId: 'queue',
    variants: [
      {
        ...variant('queue-display'),
        profile: {
          ...variant('queue-display').profile,
          width,
          height
        }
      }
    ],
    pages: [
      {
        id: 'queue',
        name: 'Queue',
        widgets,
        layouts: {
          display: {
            placements: Object.fromEntries(
              widgets.map((widget, index) => [
                widget.id,
                {
                  col: index === 0 ? 1 : 7,
                  row: 1,
                  colSpan: calledWidgetCount === 1 ? 12 : 6,
                  rowSpan: 8
                }
              ])
            )
          }
        }
      }
    ]
  };
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const baseContext: ExperienceRuntimeContext = {
  identity: { isAuthenticated: false, isEmployee: false, groups: [] },
  live: {
    queueLength: 4,
    isOpen: true,
    isConnected: true,
    activeCounters: 2,
    mediaFailed: false
  },
  display: {
    unitName: 'Presnensky office',
    nowLabel: '14:32'
  }
};

describe('ExperienceRenderer session and navigation', () => {
  it('executes actions in order and supports back, home, and reset with a fresh ephemeral session', async () => {
    const sessions: ExperienceRuntimeSession[] = [
      { id: 'session-1', values: {} },
      { id: 'session-2', values: {} }
    ];
    const createSession = vi.fn(() => sessions.shift()!);
    const submit = vi.fn(async (session: ExperienceRuntimeSession) => {
      expect(session.values.selectedServiceId).toBe('service-7');
    });
    const adapters: ExperienceRuntimeAdapters = {
      createSession,
      submitTicket: submit
    };

    render(
      <ExperienceRenderer
        template={navigationTemplate()}
        variantId='display'
        runtimeContext={baseContext}
        adapters={adapters}
      />
    );

    expect(screen.getByTestId('experience-runtime')).toHaveAttribute(
      'data-session-id',
      'session-1'
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Details content')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('button', { name: 'Continue' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Home' }));
    expect(screen.getByRole('button', { name: 'Continue' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Reset session' }));
    expect(screen.getByTestId('experience-runtime')).toHaveAttribute(
      'data-session-id',
      'session-2'
    );
    expect(createSession).toHaveBeenCalledTimes(2);
  });

  it('resets page and session on timeout without persisting runtime values', () => {
    vi.useFakeTimers();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    let sessionNumber = 0;
    const template = navigationTemplate();

    render(
      <ExperienceRenderer
        template={template}
        variantId='display'
        initialPageId='details'
        runtimeContext={baseContext}
        adapters={{
          createSession: () => ({
            id: `session-${++sessionNumber}`,
            values: { activeLocale: 'ru' }
          })
        }}
        sessionTimeoutMs={1_000}
      />
    );

    expect(screen.getByText('Details content')).toBeVisible();
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByRole('button', { name: 'Continue' })).toBeVisible();
    expect(screen.getByTestId('experience-runtime')).toHaveAttribute(
      'data-session-id',
      'session-2'
    );
    expect(setItem).not.toHaveBeenCalled();
  });

  it('shows an idle warning and can continue the current station session', () => {
    vi.useFakeTimers();
    render(
      <ExperienceRenderer
        template={navigationTemplate()}
        variantId='display'
        runtimeContext={baseContext}
        adapters={{}}
        sessionIdle={{ beforeWarningSec: 5, countdownSec: 10 }}
      />
    );

    act(() => vi.advanceTimersByTime(5_000));
    expect(screen.getByTestId('station-runtime-state')).toHaveAttribute(
      'data-state',
      'timeout-warning'
    );

    fireEvent.click(
      within(screen.getByTestId('station-runtime-state')).getByRole('button', {
        name: 'Continue'
      })
    );
    expect(screen.queryByTestId('station-runtime-state')).toBeNull();
  });

  it('closes the idle warning before delegating a custom station reset', () => {
    vi.useFakeTimers();
    const onStationReset = vi.fn();
    render(
      <ExperienceRenderer
        template={navigationTemplate()}
        variantId='display'
        runtimeContext={baseContext}
        adapters={{}}
        sessionIdle={{ beforeWarningSec: 5, countdownSec: 10 }}
        onStationReset={onStationReset}
      />
    );

    act(() => vi.advanceTimersByTime(5_000));
    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));

    expect(onStationReset).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('station-runtime-state')).toBeNull();
  });

  it('rejects an unknown action before applying later actions', async () => {
    const template = navigationTemplate();
    template.pages[0]!.widgets[0]!.actions = [
      { type: 'future-action' } as never,
      { type: 'navigate', toPageId: 'details' }
    ];
    const onRuntimeError = vi.fn();

    render(
      <ExperienceRenderer
        template={template}
        variantId='display'
        runtimeContext={baseContext}
        adapters={{ onRuntimeError }}
      />
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    });

    expect(onRuntimeError).toHaveBeenCalledWith({
      code: 'unknown-action',
      widgetId: 'continue'
    });
    expect(screen.queryByText('Details content')).toBeNull();
  });

  it('resolves event-sourced values from the typed activation payload', () => {
    const event: ExperienceActivationEvent = {
      serviceId: 'service-from-activation',
      categoryId: 'category-from-activation',
      locale: 'ru'
    };

    expect(
      resolveExperienceActivationValue(
        { source: 'event', field: 'serviceId' },
        event
      )
    ).toBe('service-from-activation');
    expect(
      resolveExperienceActivationValue(
        { source: 'event', field: 'categoryId' },
        event
      )
    ).toBe('category-from-activation');
    expect(
      resolveExperienceActivationValue(
        { source: 'event', field: 'locale' },
        event
      )
    ).toBe('ru');
  });

  it('does not mutate or continue when an event-sourced field is missing', async () => {
    const template = navigationTemplate();
    template.pages[0]!.widgets[0]!.actions = [
      {
        type: 'set-session',
        key: 'selectedServiceId',
        value: { source: 'event', field: 'serviceId' }
      },
      { type: 'submit-ticket' },
      { type: 'navigate', toPageId: 'details' }
    ];
    const submitTicket = vi.fn();
    const onRuntimeError = vi.fn();

    render(
      <ExperienceRenderer
        template={template}
        variantId='display'
        runtimeContext={baseContext}
        adapters={{ submitTicket, onRuntimeError }}
      />
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    });

    expect(onRuntimeError).toHaveBeenCalledWith({
      code: 'activation-field-missing',
      widgetId: 'continue',
      field: 'serviceId'
    });
    expect(submitTicket).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeVisible();
  });

  it('commits reset then navigate atomically and Back returns to the reset home', async () => {
    const template = navigationTemplate();
    template.pages[0]!.widgets[0]!.actions = [
      { type: 'navigate', toPageId: 'middle' }
    ];
    addPage(template, 'middle', 'Reset and continue', [
      { type: 'reset-session' },
      { type: 'navigate', toPageId: 'details' }
    ]);
    let nextSession = 0;

    render(
      <ExperienceRenderer
        template={template}
        variantId='display'
        runtimeContext={baseContext}
        adapters={{
          createSession: () => ({ id: `session-${++nextSession}`, values: {} })
        }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Reset and continue' })
      );
    });
    expect(screen.getByText('Details content')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByRole('button', { name: 'Continue' })).toBeVisible();
    expect(screen.queryByText('Reset and continue')).toBeNull();
    expect(screen.getByTestId('experience-runtime')).toHaveAttribute(
      'data-session-id',
      'session-2'
    );
  });

  it('uses each locally reduced page when two navigations precede Back', async () => {
    const template = navigationTemplate();
    template.pages[0]!.widgets[0]!.actions = [
      { type: 'navigate', toPageId: 'middle' },
      { type: 'navigate', toPageId: 'details' }
    ];
    addPage(template, 'middle', 'Middle page');

    render(
      <ExperienceRenderer
        template={template}
        variantId='display'
        runtimeContext={baseContext}
        adapters={{}}
      />
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByText('Middle page')).toBeVisible();
  });

  it('preflights missing adapters and never partially applies the chain', async () => {
    const template = navigationTemplate();
    const onRuntimeError = vi.fn();

    render(
      <ExperienceRenderer
        template={template}
        variantId='display'
        runtimeContext={baseContext}
        adapters={{ onRuntimeError }}
      />
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    });

    expect(onRuntimeError).toHaveBeenCalledWith({
      code: 'adapter-unavailable',
      adapter: 'submitTicket',
      widgetId: 'continue'
    });
    expect(screen.getByRole('button', { name: 'Continue' })).toBeVisible();
  });

  it('contains rejected adapters and does not continue the action chain', async () => {
    const template = navigationTemplate();
    const onRuntimeError = vi.fn();

    render(
      <ExperienceRenderer
        template={template}
        variantId='display'
        runtimeContext={baseContext}
        adapters={{
          submitTicket: () => Promise.reject(new Error('sensitive failure')),
          onRuntimeError
        }}
      />
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    });

    expect(onRuntimeError).toHaveBeenCalledWith({
      code: 'adapter-failed',
      adapter: 'submitTicket',
      widgetId: 'continue'
    });
    expect(screen.getByRole('button', { name: 'Continue' })).toBeVisible();
  });

  it('cancels a deferred action continuation after an explicit reset', async () => {
    const template = navigationTemplate();
    const submission = deferred();
    let nextSession = 0;

    render(
      <ExperienceRenderer
        template={template}
        variantId='display'
        runtimeContext={baseContext}
        adapters={{
          createSession: () => ({ id: `session-${++nextSession}`, values: {} }),
          submitTicket: () => submission.promise
        }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset session' }));
    await act(async () => submission.resolve());

    expect(screen.getByRole('button', { name: 'Continue' })).toBeVisible();
    expect(screen.getByTestId('experience-runtime')).toHaveAttribute(
      'data-session-id',
      'session-2'
    );
  });

  it('does not continue or report a deferred adapter after unmount', async () => {
    const template = navigationTemplate();
    const submission = deferred();
    const onRuntimeError = vi.fn();
    const { unmount } = render(
      <ExperienceRenderer
        template={template}
        variantId='display'
        runtimeContext={baseContext}
        adapters={{
          submitTicket: () => submission.promise,
          onRuntimeError
        }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    unmount();
    await act(async () => submission.reject(new Error('late failure')));

    expect(onRuntimeError).not.toHaveBeenCalled();
  });

  it('runs an async action chain single-flight on a double click', async () => {
    const template = navigationTemplate();
    const submission = deferred();
    const submitTicket = vi.fn(() => submission.promise);

    render(
      <ExperienceRenderer
        template={template}
        variantId='display'
        runtimeContext={baseContext}
        adapters={{ submitTicket }}
      />
    );
    const trigger = screen.getByRole('button', { name: 'Continue' });
    fireEvent.click(trigger);
    fireEvent.click(trigger);

    expect(submitTicket).toHaveBeenCalledTimes(1);
    await act(async () => submission.resolve());
  });

  it('does not postpone inactivity timeout when the parent only rerenders', () => {
    vi.useFakeTimers();
    let nextSession = 0;
    const createSession = () => ({
      id: `session-${++nextSession}`,
      values: {}
    });
    const { rerender } = render(
      <ExperienceRenderer
        template={navigationTemplate()}
        variantId='display'
        runtimeContext={baseContext}
        adapters={{ createSession }}
        sessionTimeoutMs={1_000}
      />
    );
    act(() => vi.advanceTimersByTime(600));
    rerender(
      <ExperienceRenderer
        template={navigationTemplate()}
        variantId='display'
        runtimeContext={{ ...baseContext }}
        adapters={{ createSession }}
        sessionTimeoutMs={1_000}
      />
    );
    act(() => vi.advanceTimersByTime(400));

    expect(screen.getByTestId('experience-runtime')).toHaveAttribute(
      'data-session-id',
      'session-2'
    );
    expect(nextSession).toBe(2);
  });

  it('postpones inactivity timeout after a user navigation action', () => {
    vi.useFakeTimers();
    let nextSession = 0;
    const template = navigationTemplate();
    template.pages[0]!.widgets[0]!.actions = [
      { type: 'navigate', toPageId: 'details' }
    ];

    render(
      <ExperienceRenderer
        template={template}
        variantId='display'
        runtimeContext={baseContext}
        adapters={{
          createSession: () => ({ id: `session-${++nextSession}`, values: {} })
        }}
        sessionTimeoutMs={1_000}
      />
    );
    act(() => vi.advanceTimersByTime(600));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    act(() => vi.advanceTimersByTime(999));
    expect(screen.getByTestId('experience-runtime')).toHaveAttribute(
      'data-session-id',
      'session-1'
    );
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByTestId('experience-runtime')).toHaveAttribute(
      'data-session-id',
      'session-2'
    );
  });

  it('hides inaccessible widgets and keeps locked widgets visible and inert', () => {
    const template = navigationTemplate();
    template.pages[0]!.widgets = [
      {
        ...template.pages[0]!.widgets[0]!,
        id: 'hidden',
        config: { label: 'Hidden employee action' },
        access: {
          when: {
            kind: 'rule',
            field: 'identity.isEmployee',
            operator: 'is-true'
          },
          whenFalse: 'hide'
        }
      },
      {
        ...template.pages[0]!.widgets[0]!,
        id: 'locked',
        config: { label: 'Employee action' },
        access: {
          when: {
            kind: 'rule',
            field: 'identity.isEmployee',
            operator: 'is-true'
          },
          whenFalse: 'lock'
        }
      }
    ];
    template.pages[0]!.layouts.display!.placements = {
      hidden: { col: 1, row: 1, colSpan: 4, rowSpan: 2 },
      locked: { col: 5, row: 1, colSpan: 4, rowSpan: 2 }
    };

    render(
      <ExperienceRenderer
        template={template}
        variantId='display'
        runtimeContext={baseContext}
        adapters={{}}
      />
    );

    expect(screen.queryByText('Hidden employee action')).toBeNull();
    const locked = screen.getByRole('button', { name: 'Employee action' });
    expect(locked).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(locked);
    expect(screen.queryByText('Details content')).toBeNull();
  });
});

describe('ExperienceRenderer registry and operational overrides', () => {
  it('renders configured service and category options and applies the selected service before navigation', async () => {
    const template = navigationTemplate();
    const submitTicket = vi.fn();
    template.pages[0]!.widgets[0] = {
      id: 'service-picker',
      type: 'service-picker',
      config: {
        catalog: {
          services: [
            { id: 'service-7', label: 'Passport services', categoryId: 'docs' },
            { id: 'service-8', label: 'Visa services', categoryId: 'travel' }
          ],
          categories: [{ id: 'docs', label: 'Documents' }]
        }
      },
      actions: [
        {
          type: 'set-session',
          key: 'selectedServiceId',
          value: { source: 'event', field: 'serviceId' }
        },
        {
          type: 'set-session',
          key: 'selectedCategoryId',
          value: { source: 'event', field: 'categoryId' }
        },
        { type: 'submit-ticket' },
        { type: 'navigate', toPageId: 'details' }
      ]
    };
    template.pages[0]!.layouts.display!.placements = {
      'service-picker': { col: 1, row: 1, colSpan: 8, rowSpan: 4 }
    };

    render(
      <ExperienceRenderer
        template={template}
        variantId='display'
        runtimeContext={baseContext}
        adapters={{ submitTicket }}
      />
    );

    expect(
      screen.getByRole('button', { name: 'Passport services' })
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Visa services' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Documents' })).toBeVisible();
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Passport services' })
      );
    });

    expect(submitTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.objectContaining({ selectedServiceId: 'service-7' })
      })
    );
    expect(submitTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.objectContaining({ selectedCategoryId: 'docs' })
      })
    );
    expect(screen.getByText('Details content')).toBeVisible();
  });

  it('diagnoses unknown or unsupported widgets in preview and rejects them in deployed mode', () => {
    const template = navigationTemplate();
    template.surface = 'queue-display';
    template.pages[0]!.widgets[0]!.type = 'service-picker';

    const { rerender } = render(
      <ExperienceRenderer
        template={template}
        variantId='display'
        runtimeContext={baseContext}
        adapters={{}}
        mode='preview'
      />
    );
    expect(
      screen.getByText('Widget is not available on this surface')
    ).toBeVisible();

    rerender(
      <ExperienceRenderer
        template={template}
        variantId='display'
        runtimeContext={baseContext}
        adapters={{}}
        mode='deployed'
      />
    );
    expect(screen.getByTestId('experience-runtime-rejected')).toBeVisible();
    expect(screen.queryByText('Continue')).toBeNull();
  });

  it('distinguishes an unknown widget from a known widget unsupported by the surface', () => {
    const template = navigationTemplate();
    template.pages[0]!.widgets[0]!.type = 'future-widget' as never;

    render(
      <ExperienceRenderer
        template={template}
        variantId='display'
        runtimeContext={baseContext}
        adapters={{}}
        mode='preview'
      />
    );

    expect(screen.getByText('Unknown widget type')).toBeVisible();
    expect(
      screen.queryByText('Widget is not available on this surface')
    ).toBeNull();
  });

  it('aligns runtime capability checks with a validated visitor-mobile display widget', () => {
    const template = navigationTemplate();
    template.surface = 'visitor-mobile';
    template.pages[0]!.widgets[0]!.type = 'eta-display';
    template.pages[0]!.widgets[0]!.config = {};
    template.pages[0]!.widgets[0]!.actions = [];

    render(
      <ExperienceRenderer
        template={template}
        variantId='display'
        runtimeContext={baseContext}
        adapters={{}}
        mode='preview'
      />
    );

    expect(screen.getByText('eta-display')).toBeVisible();
    expect(
      screen.queryByText('Widget is not available on this surface')
    ).toBeNull();
  });

  it('diagnoses action-forbidden widgets from the same capability contract as publish', () => {
    const template = queueDisplayTemplate();
    template.pages[0]!.widgets[0] = {
      id: 'forbidden-action',
      type: 'rich-info',
      config: { label: 'Unsafe submit' },
      actions: [{ type: 'submit-ticket' }]
    };
    template.pages[0]!.layouts.display!.placements = {
      'forbidden-action': { col: 1, row: 1, colSpan: 12, rowSpan: 8 }
    };

    const { rerender } = render(
      <ExperienceRenderer
        template={template}
        variantId='display'
        runtimeContext={baseContext}
        adapters={{ submitTicket: vi.fn() }}
        mode='preview'
      />
    );
    expect(
      screen.getByText('Widget is not available on this surface')
    ).toBeVisible();

    rerender(
      <ExperienceRenderer
        template={template}
        variantId='display'
        runtimeContext={baseContext}
        adapters={{ submitTicket: vi.fn() }}
        mode='deployed'
      />
    );
    expect(screen.getByTestId('experience-runtime-rejected')).toBeVisible();
  });

  it('keeps media failure visible without replacing a normal tenant page', () => {
    render(
      <ExperienceRenderer
        template={navigationTemplate()}
        variantId='display'
        runtimeContext={{
          ...baseContext,
          live: { ...baseContext.live, mediaFailed: true }
        }}
        adapters={{}}
      />
    );

    expect(screen.getByText('Media is temporarily unavailable')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeVisible();
  });

  it('feeds tenant conditions from the same authoritative live snapshot', () => {
    const template = navigationTemplate();
    template.pages[0]!.access = {
      when: {
        kind: 'rule',
        field: 'live.queueLength',
        operator: 'gte',
        value: 4
      },
      whenFalse: 'hide'
    };
    const { rerender } = render(
      <ExperienceRenderer
        template={template}
        variantId='display'
        runtimeContext={baseContext}
        adapters={{}}
      />
    );
    expect(screen.getByRole('button', { name: 'Continue' })).toBeVisible();

    rerender(
      <ExperienceRenderer
        template={template}
        variantId='display'
        runtimeContext={{
          ...baseContext,
          live: { ...baseContext.live, queueLength: 2 }
        }}
        adapters={{}}
      />
    );
    expect(screen.getByTestId('experience-runtime-rejected')).toBeVisible();
  });

  it.each([
    ['emergency', { emergency: true }, 'Attention'],
    [
      'temporarily-unavailable',
      { temporarilyUnavailable: true },
      'Temporarily unavailable'
    ],
    [
      'stale-offline',
      { isConnected: false, staleAgeMinutes: 17 },
      'Data is temporarily not updating'
    ],
    ['closed', { isOpen: false }, 'This location is closed'],
    [
      'no-active-counters',
      { activeCounters: 0 },
      'No service counters are active'
    ],
    ['empty', { queueLength: 0 }, 'The queue is currently empty']
  ] as const)(
    'renders distinguishable %s system state over tenant conditions',
    (_state, override, copy) => {
      const template = navigationTemplate();
      template.pages[0]!.access = {
        when: {
          kind: 'rule',
          field: 'identity.isEmployee',
          operator: 'is-true'
        },
        whenFalse: 'hide'
      };

      render(
        <ExperienceRenderer
          template={template}
          variantId='display'
          runtimeContext={{
            ...baseContext,
            live: {
              ...baseContext.live,
              ...override
            }
          }}
          adapters={{}}
        />
      );

      expect(screen.getByText(copy)).toBeVisible();
      expect(screen.getByText('Presnensky office')).toBeVisible();
      expect(screen.getByText('14:32')).toBeVisible();
      if (_state === 'stale-offline') {
        expect(screen.getByText(/17 minutes ago/i)).toBeVisible();
      }
      expect(
        screen.getByTestId('experience-runtime-safe-area')
      ).toContainElement(screen.getByTestId('experience-operational-overlay'));
      expect(screen.queryByText('Continue')).toBeNull();
      expect(screen.queryByRole('navigation')).toBeNull();
    }
  );
});

describe('queue display preview', () => {
  it('keeps the primary call dominant, bounds recent calls, honors safe area and reduced motion, and announces audio', () => {
    const template: ExperienceTemplate = {
      schemaVersion: 1,
      id: 'queue-display-preview',
      surface: 'queue-display',
      startPageId: 'queue',
      variants: [variant('queue-display')],
      pages: [
        {
          id: 'queue',
          name: 'Queue',
          widgets: [
            {
              id: 'calls',
              type: 'called-tickets',
              config: {},
              actions: []
            }
          ],
          layouts: {
            display: {
              placements: {
                calls: { col: 1, row: 1, colSpan: 12, rowSpan: 8 }
              }
            }
          }
        }
      ]
    };
    const audioCall = vi.fn();

    render(
      <ExperienceRenderer
        template={template}
        variantId='display'
        runtimeContext={{
          ...baseContext,
          prefersReducedMotion: true,
          display: {
            unitName: 'Presnensky office',
            nowLabel: '14:32',
            primaryCall: {
              id: 'call-primary',
              queueNumber: 'A-039',
              counterName: 'A very long service window name that must truncate'
            },
            recentCalls: [
              { id: 'c1', queueNumber: 'A-038', counterName: 'Window 01' },
              { id: 'c2', queueNumber: 'B-112', counterName: 'Window 05' },
              { id: 'c3', queueNumber: 'A-040', counterName: 'Next' },
              { id: 'c4', queueNumber: 'C-200', counterName: 'Hidden overflow' }
            ]
          }
        }}
        adapters={{ audioCall }}
        mode='preview'
      />
    );

    const surface = screen.getByTestId('experience-runtime-surface');
    const safeArea = screen.getByTestId('experience-runtime-safe-area');
    expect(surface).not.toHaveStyle({ padding: '36px 48px' });
    expect(safeArea).toHaveStyle({
      position: 'absolute',
      top: '36px',
      right: '48px',
      bottom: '36px',
      left: '48px'
    });
    expect(screen.getByTestId('primary-called-ticket')).toHaveTextContent(
      'A-039'
    );
    expect(screen.getByTestId('primary-called-ticket')).toHaveAttribute(
      'data-motion',
      'reduced'
    );
    expect(screen.getAllByTestId('recent-called-ticket')).toHaveLength(3);
    expect(screen.queryByText('C-200')).toBeNull();
    expect(screen.getByText(/very long service window/i)).toHaveClass(
      'truncate'
    );
    expect(audioCall).toHaveBeenCalledWith({
      id: 'call-primary',
      queueNumber: 'A-039',
      counterName: 'A very long service window name that must truncate'
    });
  });

  it.each([
    [1920, 1080, 'landscape', 'grid-cols-[minmax(0,2fr)_minmax(15rem,1fr)]'],
    [1080, 1920, 'portrait', 'grid-rows-[minmax(0,2fr)_minmax(0,1fr)]']
  ] as const)(
    'uses deliberate %s×%s %s hierarchy without overflow semantics',
    (width, height, layout, layoutClass) => {
      render(
        <ExperienceRenderer
          template={queueDisplayTemplate(width, height)}
          variantId='display'
          runtimeContext={{
            ...baseContext,
            display: {
              unitName: 'Office',
              nowLabel: '14:32',
              primaryCall: {
                id: 'primary',
                queueNumber: 'A-039',
                counterName: 'A deliberately long counter name to truncate'
              },
              recentCalls: [
                { id: 'r1', queueNumber: 'A-038', counterName: 'Window 1' },
                { id: 'r2', queueNumber: 'A-037', counterName: 'Window 2' },
                { id: 'r3', queueNumber: 'A-036', counterName: 'Window 3' },
                { id: 'r4', queueNumber: 'A-035', counterName: 'Overflow' }
              ]
            }
          }}
          adapters={{}}
        />
      );

      const calls = screen.getByTestId('queue-display-calls');
      const hierarchy = screen.getByTestId('queue-display-call-hierarchy');
      const primary = screen.getByTestId('primary-called-ticket');
      const recent = screen.getByRole('list', {
        name: 'Next and recent calls'
      });
      expect(calls).toHaveAttribute('data-layout', layout);
      expect(calls).toHaveAttribute('data-profile-size', `${width}x${height}`);
      expect(calls).toHaveClass('overflow-hidden', 'min-h-0');
      expect(hierarchy).toHaveClass(layoutClass, 'overflow-hidden', 'min-h-0');
      expect(primary.compareDocumentPosition(recent)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING
      );
      expect(screen.getAllByTestId('recent-called-ticket')).toHaveLength(3);
      expect(screen.queryByText('Overflow')).toBeNull();
      expect(screen.getByText(/deliberately long counter/i)).toHaveClass(
        'truncate'
      );
    }
  );

  it('uses far-view, nonblocking media failure feedback', () => {
    render(
      <ExperienceRenderer
        template={queueDisplayTemplate()}
        variantId='display'
        runtimeContext={{
          ...baseContext,
          live: { ...baseContext.live, mediaFailed: true }
        }}
        adapters={{}}
      />
    );

    expect(screen.getByText('Media is temporarily unavailable')).toHaveClass(
      'pointer-events-none',
      'text-xl'
    );
    expect(
      screen.getByText('Media is temporarily unavailable')
    ).toHaveAttribute('data-viewing-distance', 'far');
  });

  it('deduplicates audio across duplicate widgets and page remounts, then announces a new call', async () => {
    const template = queueDisplayTemplate(1920, 1080, 2);
    const audioCall = vi.fn();
    const adapters = { audioCall };
    const context = (
      id: string,
      live: ExperienceRuntimeContext['live'] = baseContext.live
    ): ExperienceRuntimeContext => ({
      ...baseContext,
      live,
      display: {
        unitName: 'Office',
        nowLabel: '14:32',
        primaryCall: { id, queueNumber: 'A-039', counterName: 'Window 03' }
      }
    });
    const { rerender } = render(
      <ExperienceRenderer
        template={template}
        variantId='display'
        runtimeContext={context('call-1')}
        adapters={adapters}
      />
    );
    expect(audioCall).toHaveBeenCalledTimes(1);

    rerender(
      <ExperienceRenderer
        template={template}
        variantId='display'
        runtimeContext={context('call-2', {
          ...baseContext.live,
          isConnected: false
        })}
        adapters={adapters}
      />
    );
    expect(audioCall).toHaveBeenCalledTimes(1);
    rerender(
      <ExperienceRenderer
        template={template}
        variantId='display'
        runtimeContext={context('call-2')}
        adapters={adapters}
      />
    );
    await waitFor(() => expect(audioCall).toHaveBeenCalledTimes(2));
  });

  it('deduplicates audio across duplicate widgets and a true remount without a caller-owned announcer', async () => {
    const audioCall = vi.fn();
    const template = queueDisplayTemplate(1920, 1080, 2);
    const context: ExperienceRuntimeContext = {
      ...baseContext,
      display: {
        unitName: 'Office',
        nowLabel: '14:32',
        primaryCall: {
          id: 'call-remount',
          queueNumber: 'A-040',
          counterName: 'Window 04'
        }
      }
    };
    const first = render(
      <ExperienceRenderer
        template={template}
        variantId='display'
        runtimeContext={context}
        adapters={{ audioCall }}
      />
    );
    expect(audioCall).toHaveBeenCalledTimes(1);
    first.unmount();

    render(
      <ExperienceRenderer
        template={template}
        variantId='display'
        runtimeContext={context}
        adapters={{ audioCall }}
      />
    );
    expect(audioCall).toHaveBeenCalledTimes(1);
  });

  it('deduplicates fallback audio across a remount with a new adapter wrapper', async () => {
    const announce = vi.fn();
    const template = queueDisplayTemplate(1920, 1080, 2);
    const context: ExperienceRuntimeContext = {
      ...baseContext,
      display: {
        unitName: 'Office',
        nowLabel: '14:32',
        primaryCall: {
          id: 'call-wrapper-remount',
          queueNumber: 'A-042',
          counterName: 'Window 06'
        }
      }
    };
    const first = render(
      <ExperienceRenderer
        template={template}
        variantId='display'
        runtimeContext={context}
        adapters={{ audioCall: (call) => announce(call) }}
      />
    );
    expect(announce).toHaveBeenCalledTimes(1);
    first.unmount();

    render(
      <ExperienceRenderer
        template={template}
        variantId='display'
        runtimeContext={context}
        adapters={{ audioCall: (call) => announce(call) }}
      />
    );

    expect(announce).toHaveBeenCalledTimes(1);
  });

  it('retries a rejected audio announcement after remount without permanently marking the call', async () => {
    const audioCall = vi
      .fn()
      .mockRejectedValueOnce(new Error('speaker offline'))
      .mockResolvedValueOnce(undefined);
    const onRuntimeError = vi.fn();
    const context: ExperienceRuntimeContext = {
      ...baseContext,
      display: {
        unitName: 'Office',
        nowLabel: '14:32',
        primaryCall: {
          id: 'call-retry',
          queueNumber: 'A-041',
          counterName: 'Window 05'
        }
      }
    };
    const first = render(
      <ExperienceRenderer
        template={queueDisplayTemplate()}
        variantId='display'
        runtimeContext={context}
        adapters={{ audioCall, onRuntimeError }}
      />
    );
    await waitFor(() =>
      expect(onRuntimeError).toHaveBeenCalledWith({
        code: 'adapter-failed',
        adapter: 'audioCall'
      })
    );
    first.unmount();

    render(
      <ExperienceRenderer
        template={queueDisplayTemplate()}
        variantId='display'
        runtimeContext={context}
        adapters={{ audioCall, onRuntimeError }}
      />
    );
    await waitFor(() => expect(audioCall).toHaveBeenCalledTimes(2));
  });

  it('normalizes deprecated top-level operational aliases while live remains authoritative', () => {
    const template = queueDisplayTemplate();
    const { rerender } = render(
      <ExperienceRenderer
        template={template}
        variantId='display'
        runtimeContext={{
          ...baseContext,
          live: undefined,
          operational: { isOpen: false },
          connected: true,
          open: false
        }}
        adapters={{}}
      />
    );

    expect(
      screen.getByTestId('experience-operational-overlay')
    ).toHaveAttribute('data-operational-state', 'closed');

    rerender(
      <ExperienceRenderer
        template={template}
        variantId='display'
        runtimeContext={{
          ...baseContext,
          live: { ...baseContext.live, isOpen: true, isConnected: false },
          operational: { isOpen: false },
          connected: true,
          open: false
        }}
        adapters={{}}
      />
    );

    expect(
      screen.getByTestId('experience-operational-overlay')
    ).toHaveAttribute('data-operational-state', 'stale-offline');
  });

  it('contains audio adapter exceptions as a bounded runtime error', async () => {
    const onRuntimeError = vi.fn();
    render(
      <ExperienceRenderer
        template={queueDisplayTemplate()}
        variantId='display'
        runtimeContext={{
          ...baseContext,
          display: {
            unitName: 'Office',
            nowLabel: '14:32',
            primaryCall: {
              id: 'call-audio-error',
              queueNumber: 'A-039',
              counterName: 'Window 03'
            }
          }
        }}
        adapters={{
          audioCall: () => {
            throw new Error('speaker details must stay private');
          },
          onRuntimeError
        }}
      />
    );

    await waitFor(() =>
      expect(onRuntimeError).toHaveBeenCalledWith({
        code: 'adapter-failed',
        adapter: 'audioCall'
      })
    );
  });

  it('announces a call once per call id across ordinary rerenders', () => {
    const template: ExperienceTemplate = {
      schemaVersion: 1,
      id: 'audio-deduplication',
      surface: 'queue-display',
      startPageId: 'queue',
      variants: [variant('queue-display')],
      pages: [
        {
          id: 'queue',
          name: 'Queue',
          widgets: [
            { id: 'calls', type: 'called-tickets', config: {}, actions: [] }
          ],
          layouts: {
            display: {
              placements: {
                calls: { col: 1, row: 1, colSpan: 12, rowSpan: 8 }
              }
            }
          }
        }
      ]
    };
    const audioCall = vi.fn();
    const adapters = { audioCall };
    const context = (id: string): ExperienceRuntimeContext => ({
      ...baseContext,
      display: {
        unitName: 'Office',
        nowLabel: '14:32',
        primaryCall: { id, queueNumber: 'A-039', counterName: 'Window 03' }
      }
    });
    const { rerender } = render(
      <ExperienceRenderer
        template={template}
        variantId='display'
        runtimeContext={context('call-1')}
        adapters={adapters}
      />
    );

    rerender(
      <ExperienceRenderer
        template={template}
        variantId='display'
        runtimeContext={context('call-1')}
        adapters={adapters}
      />
    );
    expect(audioCall).toHaveBeenCalledTimes(1);

    rerender(
      <ExperienceRenderer
        template={template}
        variantId='display'
        runtimeContext={context('call-2')}
        adapters={adapters}
      />
    );
    expect(audioCall).toHaveBeenCalledTimes(2);
  });
});
