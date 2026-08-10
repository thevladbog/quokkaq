'use client';

import type {
  ConditionContext,
  ExperienceTemplate,
  ExperienceWidget,
  WidgetAction
} from '@quokkaq/shared-types';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import { evaluateCondition } from '@/lib/experience/condition-evaluator';
import {
  resolveOperationalState,
  type OperationalStateInput
} from '@/lib/experience/operational-state';
import { ExperienceOperationalOverlay } from './experience-operational-overlay';
import { ExperienceRuntimeShell } from './experience-runtime-shell';
import {
  ExperienceWidgetDiagnostic,
  ExperienceWidgetRegistry,
  isKnownExperienceWidget,
  type QueueDisplayCall,
  type QueueDisplayRuntimeData,
  supportsExperienceWidget
} from './experience-widget-registry';

export type ExperienceRuntimeSession = {
  id: string;
  values: Partial<
    Record<'selectedServiceId' | 'selectedCategoryId' | 'activeLocale', string>
  >;
};

export type ExperienceRuntimeContext = ConditionContext & {
  operational?: OperationalStateInput;
  display?: QueueDisplayRuntimeData;
  prefersReducedMotion?: boolean;
};

export type ExperienceRuntimeError =
  | { code: 'unknown-action'; widgetId: string }
  | { code: 'missing-page'; pageId: string }
  | { code: 'unsupported-widget'; widgetId: string };

export type ExperienceRuntimeAdapters = {
  createSession?: () => ExperienceRuntimeSession;
  submitTicket?: (session: ExperienceRuntimeSession) => void | Promise<void>;
  printTicket?: (session: ExperienceRuntimeSession) => void | Promise<void>;
  audioCall?: (ticket: QueueDisplayCall) => void;
  onRuntimeError?: (error: ExperienceRuntimeError) => void;
};

export type ExperienceRendererProps = {
  template: ExperienceTemplate;
  variantId: string;
  runtimeContext: ExperienceRuntimeContext;
  adapters: ExperienceRuntimeAdapters;
  initialPageId?: string;
  sessionTimeoutMs?: number;
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
  mode = 'deployed'
}: ExperienceRendererProps) {
  const t = useTranslations('experience.runtime.task12');
  const variant = template.variants.find(
    (candidate) => candidate.id === variantId
  );
  const createSession = useCallback(
    () => adapters.createSession?.() ?? defaultSession(),
    [adapters]
  );
  const [session, setSession] =
    useState<ExperienceRuntimeSession>(createSession);
  const initialId =
    initialPageId && template.pages.some((page) => page.id === initialPageId)
      ? initialPageId
      : template.startPageId;
  const [pageId, setPageId] = useState(initialId);
  const [history, setHistory] = useState<string[]>([]);
  const reset = useCallback(() => {
    setSession(createSession());
    setHistory([]);
    setPageId(template.startPageId);
  }, [createSession, template.startPageId]);

  useEffect(() => {
    if (!sessionTimeoutMs || sessionTimeoutMs <= 0) return;
    const timer = window.setTimeout(reset, sessionTimeoutMs);
    return () => window.clearTimeout(timer);
  }, [pageId, reset, session.id, sessionTimeoutMs]);

  const page = template.pages.find((candidate) => candidate.id === pageId);
  const operational = resolveOperationalState(runtimeContext.operational ?? {});

  const conditionContext = useMemo<ConditionContext>(
    () => ({
      identity: runtimeContext.identity,
      live: runtimeContext.live,
      session: {
        ...runtimeContext.session,
        selectedServiceId:
          session.values.selectedServiceId ??
          runtimeContext.session?.selectedServiceId ??
          null
      }
    }),
    [
      runtimeContext.identity,
      runtimeContext.live,
      runtimeContext.session,
      session.values.selectedServiceId
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
    (widget) => !supportsExperienceWidget(template.surface, widget.type)
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

  const navigate = (targetPageId: string) => {
    if (!template.pages.some((candidate) => candidate.id === targetPageId)) {
      adapters.onRuntimeError?.({ code: 'missing-page', pageId: targetPageId });
      return;
    }
    setHistory((current) => [...current, pageId]);
    setPageId(targetPageId);
  };

  const activateWidget = async (widget: ExperienceWidget) => {
    if (!actionsAreKnown(widget.actions)) {
      adapters.onRuntimeError?.({
        code: 'unknown-action',
        widgetId: widget.id
      });
      return;
    }

    let workingSession = session;
    for (const action of widget.actions) {
      switch (action.type) {
        case 'set-session': {
          const value =
            action.value.source === 'literal'
              ? action.value.value
              : String(widget.config[action.value.field] ?? '');
          workingSession = {
            ...workingSession,
            values: { ...workingSession.values, [action.key]: value }
          };
          setSession(workingSession);
          break;
        }
        case 'navigate':
          navigate(action.toPageId);
          break;
        case 'submit-ticket':
          await adapters.submitTicket?.(workingSession);
          break;
        case 'print-ticket':
          await adapters.printTicket?.(workingSession);
          break;
        case 'reset-session':
          workingSession = createSession();
          setSession(workingSession);
          setHistory([]);
          setPageId(template.startPageId);
          break;
      }
    }
  };

  return (
    <ExperienceRuntimeShell
      page={page}
      layout={layout}
      grid={variant.grid}
      profile={variant.profile}
      sessionId={session.id}
      showNavigation={
        variant.profile.interactionMode === 'touch' &&
        operational.state === 'normal'
      }
      canGoBack={history.length > 0}
      onBack={() => {
        const previous = history.at(-1);
        if (!previous) return;
        setHistory((current) => current.slice(0, -1));
        setPageId(previous);
      }}
      onHome={() => {
        setHistory([]);
        setPageId(template.startPageId);
      }}
      onReset={reset}
      overlay={<ExperienceOperationalOverlay resolved={operational} />}
      renderWidget={(widget) => {
        if (operational.state !== 'normal') return null;
        const matches =
          !widget.access ||
          evaluateCondition(widget.access.when, conditionContext);
        if (!matches && widget.access?.whenFalse === 'hide') return null;
        if (!supportsExperienceWidget(template.surface, widget.type)) {
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
            adapters={adapters}
            locked={!matches && widget.access?.whenFalse === 'lock'}
            onActivate={() => void activateWidget(widget)}
          />
        );
      }}
    />
  );
}
