'use client';

import type {
  ConditionContext,
  ExperienceTemplate,
  ExperienceWidget,
  WidgetAction
} from '@quokkaq/shared-types';
import { experienceWidgetSupportsSurface } from '@quokkaq/shared-types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { evaluateCondition } from '@/lib/experience/condition-evaluator';
import {
  resolveOperationalState,
  type OperationalStateInput
} from '@/lib/experience/operational-state';
import { ExperienceOperationalOverlay } from './experience-operational-overlay';
import { ExperienceRuntimeShell } from './experience-runtime-shell';
import { StationRuntimeStateView } from './station-runtime-state';
import type { StationRuntimeState } from '@/lib/experience/station-runtime-state';
import { useKioskSessionIdle } from '@/hooks/use-kiosk-session-idle';
import {
  ExperienceWidgetDiagnostic,
  ExperienceWidgetRegistry,
  isKnownExperienceWidget,
  type QueueDisplayCall,
  type QueueDisplayRuntimeData
} from './experience-widget-registry';

export type ExperienceRuntimeSession = {
  id: string;
  values: Record<string, unknown>;
};

export type ExperienceLiveSnapshot = NonNullable<ConditionContext['live']> &
  OperationalStateInput;

export type ExperienceRuntimeContext = Omit<ConditionContext, 'live'> & {
  live?: ExperienceLiveSnapshot;
  display?: QueueDisplayRuntimeData;
  prefersReducedMotion?: boolean;
  /** @deprecated Use `live`. */
  operational?: OperationalStateInput;
  /** @deprecated Use `live.isConnected`. */
  connected?: boolean;
  /** @deprecated Use `live.isOpen`. */
  open?: boolean;
  /** @deprecated Use `live.isConnected`. */
  isConnected?: boolean;
  /** @deprecated Use `live.isOpen`. */
  isOpen?: boolean;
};

export type ExperienceRuntimeError =
  | { code: 'unknown-action'; widgetId: string }
  | { code: 'missing-page'; pageId: string }
  | { code: 'unsupported-widget'; widgetId: string }
  | {
      code: 'activation-field-missing';
      widgetId: string;
      field: keyof ExperienceActivationEvent;
    }
  | {
      code: 'adapter-unavailable' | 'adapter-failed';
      adapter: ExperienceRuntimeAdapterName;
      widgetId?: string;
    }
  | {
      code: 'incomplete-service-flow';
      slot: string;
      widgetId?: string;
    };

export type ExperienceActivationEvent = Partial<
  Record<'serviceId' | 'categoryId' | 'locale', string>
> & { session?: Record<string, unknown> };

type ExperienceRuntimeAdapterName =
  | 'submitTicket'
  | 'printTicket'
  | 'audioCall';

export type ExperienceTicketStationAdapters = {
  identification?: import('./widgets/identify-widget').IdentificationAdapter;
};

export type ExperienceRuntimeAdapters = {
  createSession?: () => ExperienceRuntimeSession;
  submitTicket?: (session: ExperienceRuntimeSession) => void | Promise<void>;
  printTicket?: (session: ExperienceRuntimeSession) => void | Promise<void>;
  audioCall?: (ticket: QueueDisplayCall) => void | Promise<void>;
  ticketStation?: ExperienceTicketStationAdapters;
  audioAnnouncer?: ExperienceAudioAnnouncer;
  onRuntimeError?: (error: ExperienceRuntimeError) => void;
};

export type ExperienceAudioAnnouncementResult =
  | 'announced'
  | 'duplicate'
  | 'failed';

export type ExperienceAudioAnnouncer = {
  announce: (
    call: QueueDisplayCall,
    audioCall: NonNullable<ExperienceRuntimeAdapters['audioCall']>
  ) => Promise<ExperienceAudioAnnouncementResult>;
};

function audioAnnouncementKey(call: QueueDisplayCall): string {
  // QueueDisplayCall has no tenant or display identity, so this is the most
  // specific stable key available without relying on adapter wrapper identity.
  return JSON.stringify([call.id, call.queueNumber, call.counterName]);
}

export function createExperienceAudioAnnouncer(): ExperienceAudioAnnouncer {
  const announcedCallIds = new Set<string>();
  const inFlightCallIds = new Set<string>();
  return {
    async announce(call, audioCall) {
      const callKey = audioAnnouncementKey(call);
      if (announcedCallIds.has(callKey) || inFlightCallIds.has(callKey)) {
        return 'duplicate';
      }
      inFlightCallIds.add(callKey);
      try {
        await audioCall(call);
        announcedCallIds.add(callKey);
        return 'announced';
      } catch {
        return 'failed';
      } finally {
        inFlightCallIds.delete(callKey);
      }
    }
  };
}

const defaultAudioAnnouncers = new Map<string, ExperienceAudioAnnouncer>();

function audioAnnouncerFor(
  templateId: string,
  adapters: ExperienceRuntimeAdapters
): ExperienceAudioAnnouncer {
  if (adapters.audioAnnouncer) return adapters.audioAnnouncer;
  const existing = defaultAudioAnnouncers.get(templateId);
  if (existing) return existing;
  const created = createExperienceAudioAnnouncer();
  defaultAudioAnnouncers.set(templateId, created);
  return created;
}

export function normalizeExperienceLiveSnapshot(
  context: ExperienceRuntimeContext
): ExperienceLiveSnapshot {
  return {
    ...(context.operational ?? {}),
    ...(context.connected !== undefined
      ? { isConnected: context.connected }
      : {}),
    ...(context.open !== undefined ? { isOpen: context.open } : {}),
    ...(context.isConnected !== undefined
      ? { isConnected: context.isConnected }
      : {}),
    ...(context.isOpen !== undefined ? { isOpen: context.isOpen } : {}),
    ...(context.live ?? {})
  };
}

export type ExperienceRendererProps = {
  template: ExperienceTemplate;
  variantId: string;
  runtimeContext: ExperienceRuntimeContext;
  adapters: ExperienceRuntimeAdapters;
  initialPageId?: string;
  sessionTimeoutMs?: number;
  sessionIdle?: {
    beforeWarningSec: number;
    countdownSec: number;
  };
  stationState?: StationRuntimeState;
  onStationReset?: () => void;
  mode?: 'editor' | 'preview' | 'deployed';
};

let fallbackSessionCounter = 0;

function defaultSession(): ExperienceRuntimeSession {
  fallbackSessionCounter += 1;
  const randomId = globalThis.crypto?.randomUUID?.();
  return {
    id: randomId ?? `runtime-session-${fallbackSessionCounter}`,
    values: {}
  };
}

const knownActionTypes = new Set([
  'set-session',
  'navigate',
  'submit-ticket',
  'print-ticket',
  'reset-session'
]);

type SetSessionValue = Extract<WidgetAction, { type: 'set-session' }>['value'];

export function resolveExperienceActivationValue(
  value: SetSessionValue,
  event: ExperienceActivationEvent
): string | undefined {
  return value.source === 'literal' ? value.value : event[value.field];
}

function actionsAreKnown(actions: readonly WidgetAction[]): boolean {
  return actions.every(
    (action) =>
      typeof (action as { type?: unknown }).type === 'string' &&
      knownActionTypes.has((action as { type: string }).type)
  );
}

export function ExperienceRenderer({
  template,
  variantId,
  runtimeContext,
  adapters,
  initialPageId,
  sessionTimeoutMs,
  sessionIdle,
  stationState = 'active',
  onStationReset,
  mode = 'deployed'
}: ExperienceRendererProps) {
  const t = useTranslations('experience.runtime.task12');
  const variant = template.variants.find(
    (candidate) => candidate.id === variantId
  );
  const sessionFactory = adapters.createSession;
  const createSession = useCallback(
    () => sessionFactory?.() ?? defaultSession(),
    [sessionFactory]
  );
  const initialId =
    initialPageId && template.pages.some((page) => page.id === initialPageId)
      ? initialPageId
      : template.startPageId;
  type RuntimeState = {
    session: ExperienceRuntimeSession;
    pageId: string;
    history: string[];
  };
  const [runtime, setRuntime] = useState<RuntimeState>(() => ({
    session: createSession(),
    pageId: initialId,
    history: []
  }));
  const runtimeRef = useRef(runtime);
  const mountedRef = useRef(false);
  const generationRef = useRef(0);
  const inFlightRef = useRef(false);
  const [activityEpoch, setActivityEpoch] = useState(0);
  const commitRuntime = useCallback((next: RuntimeState) => {
    runtimeRef.current = next;
    setRuntime(next);
  }, []);
  const markActivity = useCallback(() => {
    setActivityEpoch((current) => current + 1);
  }, []);
  const reset = useCallback(() => {
    generationRef.current += 1;
    inFlightRef.current = false;
    commitRuntime({
      session: createSession(),
      pageId: template.startPageId,
      history: []
    });
    markActivity();
  }, [commitRuntime, createSession, markActivity, template.startPageId]);

  const idle = useKioskSessionIdle({
    enabled: stationState === 'active' && sessionIdle !== undefined,
    beforeWarningSec: sessionIdle?.beforeWarningSec ?? 0,
    countdownSec: sessionIdle?.countdownSec ?? 0,
    onSessionEnd: reset
  });
  const { continueSession, showWarning } = idle;
  const resetStation = useCallback(() => {
    if (showWarning) continueSession();
    (onStationReset ?? reset)();
  }, [continueSession, onStationReset, reset, showWarning]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      inFlightRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (sessionIdle || !sessionTimeoutMs || sessionTimeoutMs <= 0) return;
    const timer = window.setTimeout(reset, sessionTimeoutMs);
    return () => window.clearTimeout(timer);
  }, [activityEpoch, reset, sessionIdle, sessionTimeoutMs]);

  const page = template.pages.find(
    (candidate) => candidate.id === runtime.pageId
  );
  const liveSnapshot = normalizeExperienceLiveSnapshot(runtimeContext);
  const operational = resolveOperationalState(liveSnapshot);
  const effectiveStationState: StationRuntimeState = showWarning
    ? 'timeout-warning'
    : stationState;
  const reportRuntimeError = adapters.onRuntimeError;
  const audioAnnouncer = audioAnnouncerFor(template.id, adapters);

  useEffect(() => {
    const primaryCall = runtimeContext.display?.primaryCall;
    const audioCall = adapters.audioCall;
    if (
      !primaryCall ||
      !audioCall ||
      operational.state !== 'normal' ||
      liveSnapshot.isConnected === false
    ) {
      return;
    }
    void (async () => {
      try {
        const result = await audioAnnouncer.announce(primaryCall, audioCall);
        if (result !== 'failed' || !mountedRef.current) return;
        reportRuntimeError?.({
          code: 'adapter-failed',
          adapter: 'audioCall'
        });
      } catch {
        if (mountedRef.current) {
          reportRuntimeError?.({
            code: 'adapter-failed',
            adapter: 'audioCall'
          });
        }
      }
    })();
  }, [
    adapters.audioCall,
    audioAnnouncer,
    liveSnapshot.isConnected,
    operational.state,
    reportRuntimeError,
    runtimeContext.display?.primaryCall
  ]);

  const conditionContext = useMemo<ConditionContext>(
    () => ({
      identity:
        runtime.session.values.identity &&
        typeof runtime.session.values.identity === 'object'
          ? (runtime.session.values.identity as ConditionContext['identity'])
          : runtimeContext.identity,
      live: liveSnapshot,
      session: {
        ...runtimeContext.session,
        selectedServiceId:
          (typeof runtime.session.values.selectedServiceId === 'string'
            ? runtime.session.values.selectedServiceId
            : undefined) ??
          runtimeContext.session?.selectedServiceId ??
          null
      }
    }),
    [
      runtimeContext.identity,
      runtimeContext.session,
      liveSnapshot,
      runtime.session.values.selectedServiceId,
      runtime.session.values.identity
    ]
  );

  if (!variant || !page) {
    return (
      <div data-testid='experience-runtime-rejected' role='alert'>
        {t('rejected', { default: 'This experience cannot run safely.' })}
      </div>
    );
  }

  const layout = page.layouts[variant.id];
  if (!layout) {
    return (
      <div data-testid='experience-runtime-rejected' role='alert'>
        {t('rejected', { default: 'This experience cannot run safely.' })}
      </div>
    );
  }

  const unsupportedWidget = page.widgets.find(
    (widget) =>
      !experienceWidgetSupportsSurface(
        template.surface,
        widget.type,
        widget.actions
      )
  );
  if (mode === 'deployed' && unsupportedWidget) {
    return (
      <div data-testid='experience-runtime-rejected' role='alert'>
        {t('rejected', { default: 'This experience cannot run safely.' })}
      </div>
    );
  }

  const pageAccessible =
    !page.access || evaluateCondition(page.access.when, conditionContext);
  if (operational.state === 'normal' && !pageAccessible) {
    return (
      <div data-testid='experience-runtime-rejected' role='alert'>
        {t('pageUnavailable', { default: 'This page is not available.' })}
      </div>
    );
  }

  const preflightActions = (
    widget: ExperienceWidget,
    event: ExperienceActivationEvent
  ): ExperienceRuntimeError | undefined => {
    if (!actionsAreKnown(widget.actions)) {
      return {
        code: 'unknown-action',
        widgetId: widget.id
      };
    }
    for (const action of widget.actions) {
      switch (action.type) {
        case 'set-session':
          if (
            action.value.source === 'event' &&
            event[action.value.field] === undefined
          ) {
            return {
              code: 'activation-field-missing',
              widgetId: widget.id,
              field: action.value.field
            };
          }
          break;
        case 'navigate': {
          if (
            !template.pages.some(
              (candidate) => candidate.id === action.toPageId
            )
          ) {
            return { code: 'missing-page', pageId: action.toPageId };
          }
          break;
        }
        case 'submit-ticket':
          if (!adapters.submitTicket) {
            return {
              code: 'adapter-unavailable',
              adapter: 'submitTicket',
              widgetId: widget.id
            };
          }
          break;
        case 'print-ticket':
          if (!adapters.printTicket) {
            return {
              code: 'adapter-unavailable',
              adapter: 'printTicket',
              widgetId: widget.id
            };
          }
          break;
        case 'reset-session':
          break;
      }
    }
    return undefined;
  };

  const activateWidget = async (
    widget: ExperienceWidget,
    event: ExperienceActivationEvent
  ) => {
    if (inFlightRef.current) return;
    const preflightError = preflightActions(widget, event);
    if (preflightError) {
      adapters.onRuntimeError?.(preflightError);
      return;
    }

    markActivity();
    inFlightRef.current = true;
    const generation = generationRef.current;
    let working: RuntimeState = {
      session: {
        ...runtimeRef.current.session,
        values: {
          ...runtimeRef.current.session.values,
          ...(event.session ?? {})
        }
      },
      pageId: runtimeRef.current.pageId,
      history: [...runtimeRef.current.history]
    };
    const isCurrent = () =>
      mountedRef.current && generationRef.current === generation;

    try {
      for (const action of widget.actions) {
        switch (action.type) {
          case 'set-session': {
            const value = resolveExperienceActivationValue(action.value, event);
            if (value === undefined) return;
            working = {
              ...working,
              session: {
                ...working.session,
                values: { ...working.session.values, [action.key]: value }
              }
            };
            break;
          }
          case 'navigate':
            working = {
              ...working,
              history: [...working.history, working.pageId],
              pageId: action.toPageId
            };
            break;
          case 'submit-ticket':
            try {
              await adapters.submitTicket!(working.session);
            } catch {
              if (isCurrent()) {
                adapters.onRuntimeError?.({
                  code: 'adapter-failed',
                  adapter: 'submitTicket',
                  widgetId: widget.id
                });
              }
              return;
            }
            if (!isCurrent()) return;
            break;
          case 'print-ticket':
            try {
              await adapters.printTicket!(working.session);
            } catch {
              if (isCurrent()) {
                adapters.onRuntimeError?.({
                  code: 'adapter-failed',
                  adapter: 'printTicket',
                  widgetId: widget.id
                });
              }
              return;
            }
            if (!isCurrent()) return;
            break;
          case 'reset-session':
            working = {
              session: createSession(),
              pageId: template.startPageId,
              history: []
            };
            break;
        }
      }
      if (isCurrent()) commitRuntime(working);
    } finally {
      if (generationRef.current === generation) {
        inFlightRef.current = false;
      }
    }
  };

  return (
    <ExperienceRuntimeShell
      page={page}
      layout={layout}
      grid={variant.grid}
      profile={variant.profile}
      sessionId={runtime.session.id}
      showNavigation={
        variant.profile.interactionMode === 'touch' &&
        operational.state === 'normal'
      }
      canGoBack={runtime.history.length > 0}
      onBack={() => {
        markActivity();
        const current = runtimeRef.current;
        const previous = current.history.at(-1);
        if (!previous) return;
        commitRuntime({
          ...current,
          history: current.history.slice(0, -1),
          pageId: previous
        });
      }}
      onHome={() => {
        markActivity();
        commitRuntime({
          ...runtimeRef.current,
          history: [],
          pageId: template.startPageId
        });
      }}
      onReset={reset}
      overlay={
        <>
          <ExperienceOperationalOverlay
            resolved={operational}
            display={runtimeContext.display}
            profile={variant.profile}
          />
          {operational.state === 'normal' &&
          effectiveStationState !== 'active' ? (
            <StationRuntimeStateView
              state={effectiveStationState}
              onContinue={continueSession}
              onReset={resetStation}
            />
          ) : null}
        </>
      }
      renderWidget={(widget) => {
        if (operational.state !== 'normal') return null;
        const matches =
          !widget.access ||
          evaluateCondition(widget.access.when, conditionContext);
        if (!matches && widget.access?.whenFalse === 'hide') return null;
        if (
          !experienceWidgetSupportsSurface(
            template.surface,
            widget.type,
            widget.actions
          )
        ) {
          return mode !== 'deployed' ? (
            <ExperienceWidgetDiagnostic
              reason={
                isKnownExperienceWidget(widget.type) ? 'unsupported' : 'unknown'
              }
            />
          ) : null;
        }
        return (
          <ExperienceWidgetRegistry
            widget={widget}
            surface={template.surface}
            context={runtimeContext}
            profile={variant.profile}
            locked={!matches && widget.access?.whenFalse === 'lock'}
            onActivate={(event) => void activateWidget(widget, event)}
            session={runtime.session}
            ticketStation={adapters.ticketStation}
            flowPages={template.flowPages}
            onFlowError={(slot) =>
              adapters.onRuntimeError?.({
                code: 'incomplete-service-flow',
                slot,
                widgetId: widget.id
              })
            }
          />
        );
      }}
    />
  );
}
