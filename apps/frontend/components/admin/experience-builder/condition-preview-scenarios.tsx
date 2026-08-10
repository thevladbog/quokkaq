'use client';

import type { AccessPolicy, ConditionContext } from '@quokkaq/shared-types';
import { ShieldCheck, WifiOff } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { evaluateConditionResult } from '@/lib/experience/condition-evaluator';

export type ConditionPreviewScenario = {
  id:
    | 'anonymous'
    | 'employee'
    | 'employee-group'
    | 'queue-empty'
    | 'queue-active'
    | 'offline';
  label: string;
  context: ConditionContext;
};

/** Preview contexts are intentionally synthetic: never identity values, visitor data, or terminal credentials. */
export const CONDITION_PREVIEW_SCENARIOS: readonly ConditionPreviewScenario[] =
  [
    {
      id: 'anonymous',
      label: 'Anonymous',
      context: {
        identity: { isAuthenticated: false, isEmployee: false, groups: [] },
        live: { queueLength: 0, isOpen: true, isConnected: true },
        session: { selectedServiceId: null }
      }
    },
    {
      id: 'employee',
      label: 'Authenticated employee',
      context: {
        identity: { isAuthenticated: true, isEmployee: true, groups: [] },
        live: { queueLength: 2, isOpen: true, isConnected: true },
        session: { selectedServiceId: null }
      }
    },
    {
      id: 'employee-group',
      label: 'Employee in selected group',
      context: {
        identity: {
          isAuthenticated: true,
          isEmployee: true,
          groups: ['employees']
        },
        live: { queueLength: 2, isOpen: true, isConnected: true },
        session: { selectedServiceId: null }
      }
    },
    {
      id: 'queue-empty',
      label: 'Queue empty',
      context: {
        identity: { isAuthenticated: false, isEmployee: false, groups: [] },
        live: { queueLength: 0, isOpen: true, isConnected: true },
        session: { selectedServiceId: null }
      }
    },
    {
      id: 'queue-active',
      label: 'Queue active',
      context: {
        identity: { isAuthenticated: false, isEmployee: false, groups: [] },
        live: { queueLength: 8, isOpen: true, isConnected: true },
        session: { selectedServiceId: null }
      }
    },
    {
      id: 'offline',
      label: 'Offline',
      context: {
        identity: { isAuthenticated: false, isEmployee: false, groups: [] },
        live: { queueLength: 0, isOpen: true, isConnected: false },
        session: { selectedServiceId: null }
      }
    }
  ];

const safeRootKeys = new Set(['identity', 'live', 'session']);
const safeIdentityKeys = new Set(['isAuthenticated', 'isEmployee', 'groups']);
const safeLiveKeys = new Set(['queueLength', 'isOpen', 'isConnected']);
const safeSessionKeys = new Set(['selectedServiceId']);

function hasOnlyKeys(
  value: unknown,
  keys: Set<string>
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null) &&
    Object.keys(value).every((key) => keys.has(key))
  );
}

export function isSafePreviewContext(
  value: unknown
): value is ConditionContext {
  if (!hasOnlyKeys(value, safeRootKeys)) return false;
  const context = value as Record<string, unknown>;
  if (context.identity !== undefined) {
    if (!hasOnlyKeys(context.identity, safeIdentityKeys)) return false;
    const identity = context.identity;
    if (
      (identity.isAuthenticated !== undefined &&
        typeof identity.isAuthenticated !== 'boolean') ||
      (identity.isEmployee !== undefined &&
        typeof identity.isEmployee !== 'boolean') ||
      (identity.groups !== undefined &&
        (!Array.isArray(identity.groups) ||
          identity.groups.some((group) => group !== 'employees')))
    ) {
      return false;
    }
  }
  if (context.live !== undefined) {
    if (!hasOnlyKeys(context.live, safeLiveKeys)) return false;
    const live = context.live;
    if (
      (live.queueLength !== undefined &&
        (typeof live.queueLength !== 'number' ||
          !Number.isInteger(live.queueLength) ||
          live.queueLength < 0 ||
          live.queueLength > 100000)) ||
      (live.isOpen !== undefined && typeof live.isOpen !== 'boolean') ||
      (live.isConnected !== undefined && typeof live.isConnected !== 'boolean')
    ) {
      return false;
    }
  }
  if (context.session !== undefined) {
    if (!hasOnlyKeys(context.session, safeSessionKeys)) return false;
    if (
      context.session.selectedServiceId !== undefined &&
      context.session.selectedServiceId !== null
    ) {
      return false;
    }
  }
  return true;
}

export type ConditionPreviewScenariosProps = {
  policy: AccessPolicy | undefined;
  onContextChange?: (context: ConditionContext) => void;
};

export function ConditionPreviewScenarios({
  policy,
  onContextChange
}: ConditionPreviewScenariosProps) {
  const t = useTranslations('experience.builder.task11');
  const [scenarioId, setScenarioId] =
    useState<ConditionPreviewScenario['id']>('anonymous');
  const [customQueueLength, setCustomQueueLength] = useState(0);
  const [customEmployee, setCustomEmployee] = useState(false);
  const [customOnline, setCustomOnline] = useState(true);
  const [isCustom, setIsCustom] = useState(false);
  const scenario =
    CONDITION_PREVIEW_SCENARIOS.find((item) => item.id === scenarioId) ??
    CONDITION_PREVIEW_SCENARIOS[0]!;
  const customContext: ConditionContext = {
    identity: {
      isAuthenticated: customEmployee,
      isEmployee: customEmployee,
      groups: customEmployee ? ['employees'] : []
    },
    live: {
      queueLength: customQueueLength,
      isOpen: true,
      isConnected: customOnline
    },
    session: { selectedServiceId: null }
  };
  const context = isCustom ? customContext : scenario.context;
  const result = useMemo(
    () =>
      policy
        ? evaluateConditionResult(policy.when, context)
        : { matches: true, diagnostics: [] },
    [policy, context]
  );
  const outcome = !result.matches
    ? policy?.whenFalse === 'lock'
      ? t('scenario.locked', { default: 'Shown locked' })
      : t('scenario.hidden', { default: 'Hidden' })
    : t('scenario.shown', { default: 'Shown' });

  return (
    <section
      className='space-y-3'
      aria-label={t('scenario.label', { default: 'Safe preview scenarios' })}
    >
      <div className='flex items-center gap-2'>
        <ShieldCheck className='size-4 text-emerald-700' aria-hidden />
        <h3 className='text-sm font-medium'>
          {t('scenario.title', { default: 'Safe preview scenarios' })}
        </h3>
      </div>
      <p className='text-muted-foreground text-xs'>
        {t('scenario.safeNotice', {
          default:
            'Uses synthetic role and queue values only. No badge, visitor, token, phone, passport, or other personal data is requested or stored.'
        })}
      </p>
      <fieldset className='grid grid-cols-2 gap-2'>
        <legend className='sr-only'>
          {t('scenario.choose', { default: 'Choose a scenario' })}
        </legend>
        {CONDITION_PREVIEW_SCENARIOS.map((item) => (
          <button
            key={item.id}
            type='button'
            className='focus-visible:ring-ring min-h-11 rounded-md border px-3 text-left text-xs font-medium focus-visible:ring-2'
            aria-pressed={!isCustom && scenarioId === item.id}
            onClick={() => {
              setIsCustom(false);
              setScenarioId(item.id);
              onContextChange?.(item.context);
            }}
          >
            {item.id === 'offline' ? (
              <WifiOff className='mr-1 inline size-3.5' aria-hidden />
            ) : null}
            {t(`scenario.${item.id}`, { default: item.label })}
          </button>
        ))}
      </fieldset>
      <fieldset className='space-y-2 rounded-md border p-3'>
        <legend className='px-1 text-xs font-medium'>
          {t('scenario.custom', { default: 'Custom safe values' })}
        </legend>
        <div className='grid grid-cols-2 gap-2'>
          <Label className='text-xs'>
            {t('scenario.queueLength', { default: 'Queue length' })}
            <Input
              className='mt-1 min-h-11'
              type='number'
              min='0'
              max='100000'
              value={customQueueLength}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isInteger(next) && next >= 0 && next <= 100000) {
                  const nextContext = {
                    ...customContext,
                    live: { ...customContext.live, queueLength: next }
                  };
                  setIsCustom(true);
                  setCustomQueueLength(next);
                  onContextChange?.(nextContext);
                }
              }}
            />
          </Label>
          <Label className='flex min-h-11 items-center gap-2 text-xs'>
            <input
              type='checkbox'
              className='size-4'
              checked={customEmployee}
              onChange={(event) => {
                const employee = event.target.checked;
                const nextContext = {
                  ...customContext,
                  identity: {
                    isAuthenticated: employee,
                    isEmployee: employee,
                    groups: employee ? ['employees'] : []
                  }
                };
                setIsCustom(true);
                setCustomEmployee(employee);
                onContextChange?.(nextContext);
              }}
            />
            {t('scenario.employee', { default: 'Authenticated employee' })}
          </Label>
          <Label className='flex min-h-11 items-center gap-2 text-xs'>
            <input
              type='checkbox'
              className='size-4'
              checked={customOnline}
              onChange={(event) => {
                const online = event.target.checked;
                const nextContext = {
                  ...customContext,
                  live: { ...customContext.live, isConnected: online }
                };
                setIsCustom(true);
                setCustomOnline(online);
                onContextChange?.(nextContext);
              }}
            />
            {t('scenario.online', { default: 'Online' })}
          </Label>
        </div>
      </fieldset>
      <output
        role='status'
        aria-live='polite'
        className='bg-muted block rounded-md px-3 py-2 text-sm'
      >
        {outcome}
        {result.diagnostics.length > 0
          ? ` · ${t('scenario.diagnostic', { default: 'Incomplete scenario value' })}`
          : ''}
      </output>
    </section>
  );
}
