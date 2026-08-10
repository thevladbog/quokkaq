'use client';

import {
  AccessPolicySchema,
  MAX_ACCESS_POLICY_CONDITION_NODES,
  type AccessPolicy,
  type ConditionField,
  type ConditionNode,
  type ConditionRule
} from '@quokkaq/shared-types';
import { Minus, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type ConditionPath = readonly number[];

export type ConditionSemanticBounds = {
  maxDepth: number;
  maxGroupChildren: number;
};

/** Mirrors the additional resource bounds enforced by ServiceBehaviorSchema. */
export const SERVICE_BEHAVIOR_CONDITION_BOUNDS: ConditionSemanticBounds = {
  maxDepth: 8,
  maxGroupChildren: 20
};

type FieldDefinition = {
  label: string;
  labelKey: string;
  operators: readonly ConditionRule['operator'][];
  value: 'none' | 'text' | 'number';
};

export const CONDITION_FIELD_DEFINITIONS: Record<
  ConditionField,
  FieldDefinition
> = {
  'identity.isAuthenticated': {
    label: 'Authenticated',
    labelKey: 'condition.fields.authenticated',
    operators: ['is-true', 'is-false'],
    value: 'none'
  },
  'identity.isEmployee': {
    label: 'Employee',
    labelKey: 'condition.fields.employee',
    operators: ['is-true', 'is-false'],
    value: 'none'
  },
  'identity.groups': {
    label: 'Employee group',
    labelKey: 'condition.fields.employeeGroup',
    operators: ['contains', 'not-contains'],
    value: 'text'
  },
  'live.queueLength': {
    label: 'Queue length',
    labelKey: 'condition.fields.queueLength',
    operators: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte'],
    value: 'number'
  },
  'live.isOpen': {
    label: 'Unit open',
    labelKey: 'condition.fields.unitOpen',
    operators: ['is-true', 'is-false'],
    value: 'none'
  },
  'live.isConnected': {
    label: 'Online',
    labelKey: 'condition.fields.online',
    operators: ['is-true', 'is-false'],
    value: 'none'
  },
  'session.selectedServiceId': {
    label: 'Selected service ID',
    labelKey: 'condition.fields.selectedService',
    operators: ['eq', 'ne'],
    value: 'text'
  }
};

const FIELDS = Object.keys(CONDITION_FIELD_DEFINITIONS) as ConditionField[];

const OPERATOR_LABELS: Record<ConditionRule['operator'], string> = {
  'is-true': 'is true',
  'is-false': 'is false',
  eq: 'equals',
  ne: 'does not equal',
  gt: 'is greater than',
  gte: 'is at least',
  lt: 'is less than',
  lte: 'is at most',
  contains: 'contains',
  'not-contains': 'does not contain'
};

const OPERATOR_KEYS: Record<ConditionRule['operator'], string> = {
  'is-true': 'condition.operators.isTrue',
  'is-false': 'condition.operators.isFalse',
  eq: 'condition.operators.eq',
  ne: 'condition.operators.ne',
  gt: 'condition.operators.gt',
  gte: 'condition.operators.gte',
  lt: 'condition.operators.lt',
  lte: 'condition.operators.lte',
  contains: 'condition.operators.contains',
  'not-contains': 'condition.operators.notContains'
};

export function ruleForConditionField(field: ConditionField): ConditionRule {
  const definition = CONDITION_FIELD_DEFINITIONS[field];
  const operator = definition.operators.includes('is-true')
    ? 'is-true'
    : definition.operators.includes('contains')
      ? 'contains'
      : definition.operators.includes('gte')
        ? 'gte'
        : 'eq';

  if (definition.value === 'none') {
    return { kind: 'rule', field, operator } as ConditionRule;
  }
  return {
    kind: 'rule',
    field,
    operator,
    value:
      definition.value === 'number'
        ? 1
        : field === 'identity.groups'
          ? 'employees'
          : 'service-id'
  } as ConditionRule;
}

function cloneNode<T extends ConditionNode>(node: T): T {
  return JSON.parse(JSON.stringify(node)) as T;
}

function nodeAtPath(
  node: ConditionNode,
  path: ConditionPath
): ConditionNode | null {
  let current: ConditionNode = node;
  for (const index of path) {
    if (
      current.kind !== 'group' ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= current.children.length
    ) {
      return null;
    }
    current = current.children[index]!;
  }
  return current;
}

export function replaceConditionAtPath(
  node: ConditionNode,
  path: ConditionPath,
  replacement: ConditionNode
): ConditionNode {
  if (path.length === 0) return cloneNode(replacement);
  const next = cloneNode(node);
  const parent = nodeAtPath(next, path.slice(0, -1));
  const childIndex = path[path.length - 1];
  if (
    parent?.kind !== 'group' ||
    childIndex === undefined ||
    !parent.children[childIndex]
  ) {
    return node;
  }
  parent.children[childIndex] = cloneNode(replacement);
  return next;
}

export function appendConditionChild(
  node: ConditionNode,
  groupPath: ConditionPath,
  kind: 'rule' | 'group',
  semanticBounds?: ConditionSemanticBounds
): ConditionNode {
  const next = cloneNode(node);
  const group = nodeAtPath(next, groupPath);
  const addedNodeCount = kind === 'group' ? 2 : 1;
  if (
    group?.kind !== 'group' ||
    countConditionNodes(next) + addedNodeCount >
      MAX_ACCESS_POLICY_CONDITION_NODES ||
    (semanticBounds !== undefined &&
      (group.children.length >= semanticBounds.maxGroupChildren ||
        groupPath.length + 1 + addedNodeCount > semanticBounds.maxDepth))
  ) {
    return node;
  }
  group.children.push(
    kind === 'group'
      ? {
          kind: 'group',
          combinator: 'and',
          children: [ruleForConditionField('identity.isAuthenticated')]
        }
      : ruleForConditionField('identity.isAuthenticated')
  );
  return next;
}

function removeConditionAtPath(
  node: ConditionNode,
  path: ConditionPath
): ConditionNode | null {
  if (path.length === 0) return null;
  const next = cloneNode(node);
  const parent = nodeAtPath(next, path.slice(0, -1));
  const childIndex = path[path.length - 1];
  if (
    parent?.kind !== 'group' ||
    childIndex === undefined ||
    parent.children.length <= 1
  ) {
    return node;
  }
  parent.children.splice(childIndex, 1);
  return next;
}

function countConditionNodes(node: ConditionNode): number {
  let count = 0;
  const pending: ConditionNode[] = [node];
  while (pending.length > 0) {
    const current = pending.pop()!;
    count += 1;
    if (current.kind === 'group') pending.push(...current.children);
  }
  return count;
}

export function isConditionWithinSemanticBounds(
  node: ConditionNode,
  bounds: ConditionSemanticBounds
): boolean {
  return firstSemanticBoundsViolation(node, bounds) === null;
}

type InvalidSavedPolicyReason =
  | { kind: 'unsupported-field'; field: string }
  | { kind: 'max-depth'; limit: number }
  | { kind: 'max-group-children'; limit: number }
  | { kind: 'max-nodes'; limit: number }
  | { kind: 'invalid-schema' };

function firstSemanticBoundsViolation(
  node: ConditionNode,
  bounds: ConditionSemanticBounds
): Extract<
  InvalidSavedPolicyReason,
  { kind: 'max-depth' | 'max-group-children' }
> | null {
  const pending: Array<{ node: ConditionNode; depth: number }> = [
    { node, depth: 1 }
  ];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current.depth > bounds.maxDepth) {
      return { kind: 'max-depth', limit: bounds.maxDepth };
    }
    if (current.node.kind === 'group') {
      if (current.node.children.length > bounds.maxGroupChildren) {
        return {
          kind: 'max-group-children',
          limit: bounds.maxGroupChildren
        };
      }
      for (const child of current.node.children) {
        pending.push({ node: child, depth: current.depth + 1 });
      }
    }
  }
  return null;
}

function firstUnsupportedSavedField(value: unknown): string | null {
  try {
    if (value === null || typeof value !== 'object') return null;
    const when = (value as { when?: unknown }).when;
    const pending: unknown[] = [when];
    const visited = new Set<object>();

    while (
      pending.length > 0 &&
      visited.size <= MAX_ACCESS_POLICY_CONDITION_NODES
    ) {
      const current = pending.pop();
      if (
        current === null ||
        typeof current !== 'object' ||
        Array.isArray(current)
      ) {
        continue;
      }
      if (visited.has(current)) continue;
      visited.add(current);

      const node = current as {
        kind?: unknown;
        field?: unknown;
        children?: unknown;
      };
      if (
        node.kind === 'rule' &&
        typeof node.field === 'string' &&
        !Object.prototype.hasOwnProperty.call(
          CONDITION_FIELD_DEFINITIONS,
          node.field
        )
      ) {
        return node.field;
      }
      if (node.kind === 'group' && Array.isArray(node.children)) {
        pending.push(...node.children);
      }
    }
  } catch {
    return null;
  }
  return null;
}

function savedConditionExceedsNodeLimit(value: unknown): boolean {
  try {
    if (value === null || typeof value !== 'object') return false;
    const pending: unknown[] = [(value as { when?: unknown }).when];
    const visited = new Set<object>();

    while (pending.length > 0) {
      const current = pending.pop();
      if (
        current === null ||
        typeof current !== 'object' ||
        Array.isArray(current) ||
        visited.has(current)
      ) {
        return false;
      }
      visited.add(current);
      if (visited.size > MAX_ACCESS_POLICY_CONDITION_NODES) return true;

      const node = current as { kind?: unknown; children?: unknown };
      if (node.kind === 'group') {
        if (!Array.isArray(node.children)) return false;
        pending.push(...node.children);
      } else if (node.kind !== 'rule') {
        return false;
      }
    }
  } catch {
    return false;
  }
  return false;
}

function classifyInvalidSavedPolicy(
  value: unknown,
  semanticBounds?: ConditionSemanticBounds
): InvalidSavedPolicyReason | null {
  const unsupportedField = firstUnsupportedSavedField(value);
  if (unsupportedField) {
    return { kind: 'unsupported-field', field: unsupportedField };
  }

  let parsed: ReturnType<typeof AccessPolicySchema.safeParse>;
  try {
    parsed = AccessPolicySchema.safeParse(value);
  } catch {
    return { kind: 'invalid-schema' };
  }
  if (!parsed.success) {
    return savedConditionExceedsNodeLimit(value)
      ? { kind: 'max-nodes', limit: MAX_ACCESS_POLICY_CONDITION_NODES }
      : { kind: 'invalid-schema' };
  }
  if (semanticBounds) {
    return firstSemanticBoundsViolation(parsed.data.when, semanticBounds);
  }
  return null;
}

function operatorForField(
  field: ConditionField,
  operator: string
): ConditionRule['operator'] {
  const allowed = CONDITION_FIELD_DEFINITIONS[field].operators;
  return allowed.includes(operator as ConditionRule['operator'])
    ? (operator as ConditionRule['operator'])
    : ruleForConditionField(field).operator;
}

type ConditionTreeProps = {
  node: ConditionNode;
  path: ConditionPath;
  disabled: boolean;
  rootNodeCount: number;
  semanticBounds?: ConditionSemanticBounds;
  onReplace: (path: ConditionPath, node: ConditionNode) => void;
  onRemove: (path: ConditionPath) => void;
  onAdd: (path: ConditionPath, kind: 'rule' | 'group') => void;
};

function ConditionTree({
  node,
  path,
  disabled,
  rootNodeCount,
  semanticBounds,
  onReplace,
  onRemove,
  onAdd
}: ConditionTreeProps) {
  const t = useTranslations('experience.builder.task11');
  if (node.kind === 'group') {
    const depth = path.length + 1;
    const canAddRule =
      rootNodeCount < MAX_ACCESS_POLICY_CONDITION_NODES &&
      (semanticBounds === undefined ||
        (node.children.length < semanticBounds.maxGroupChildren &&
          depth + 1 <= semanticBounds.maxDepth));
    const canAddGroup =
      rootNodeCount + 1 < MAX_ACCESS_POLICY_CONDITION_NODES &&
      (semanticBounds === undefined ||
        (node.children.length < semanticBounds.maxGroupChildren &&
          depth + 2 <= semanticBounds.maxDepth));
    return (
      <fieldset className='bg-muted/20 space-y-3 rounded-md border p-3'>
        <legend className='sr-only'>
          {t('condition.group', { default: 'Condition group' })}
        </legend>
        <div className='flex flex-wrap items-center gap-2'>
          <Label
            className='text-xs'
            htmlFor={`condition-combinator-${path.join('-') || 'root'}`}
          >
            {t('condition.match', { default: 'Match' })}
          </Label>
          <select
            id={`condition-combinator-${path.join('-') || 'root'}`}
            aria-label={t('condition.combinator', {
              default: 'Condition combinator'
            })}
            className='border-input bg-background focus-visible:ring-ring h-11 rounded-md border px-2 text-sm focus-visible:ring-2'
            value={node.combinator}
            disabled={disabled}
            onChange={(event) =>
              onReplace(path, {
                ...node,
                combinator: event.target.value as 'and' | 'or'
              })
            }
          >
            <option value='and'>
              {t('condition.and', { default: 'All conditions (AND)' })}
            </option>
            <option value='or'>
              {t('condition.or', { default: 'Any condition (OR)' })}
            </option>
          </select>
          {path.length > 0 ? (
            <Button
              type='button'
              variant='ghost'
              size='sm'
              className='min-h-11'
              disabled={disabled}
              onClick={() => onRemove(path)}
            >
              <Minus aria-hidden />
              {t('condition.removeGroup', { default: 'Remove group' })}
            </Button>
          ) : null}
        </div>
        <div className='space-y-2 border-l pl-3'>
          {node.children.map((child, index) => (
            <ConditionTree
              key={index}
              node={child}
              path={[...path, index]}
              disabled={disabled}
              rootNodeCount={rootNodeCount}
              semanticBounds={semanticBounds}
              onReplace={onReplace}
              onRemove={onRemove}
              onAdd={onAdd}
            />
          ))}
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button
            type='button'
            variant='outline'
            size='sm'
            className='min-h-11'
            disabled={disabled || !canAddRule}
            onClick={() => onAdd(path, 'rule')}
          >
            <Plus aria-hidden />
            {t('condition.addRule', { default: 'Add rule' })}
          </Button>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            className='min-h-11'
            disabled={disabled || !canAddGroup}
            onClick={() => onAdd(path, 'group')}
          >
            <Plus aria-hidden />
            {t('condition.addGroup', { default: 'Add group' })}
          </Button>
        </div>
      </fieldset>
    );
  }

  const definition = CONDITION_FIELD_DEFINITIONS[node.field];
  return (
    <fieldset className='bg-background rounded-md border p-3'>
      <legend className='sr-only'>
        {t('condition.rule', { default: 'Condition rule' })}
      </legend>
      <div className='grid gap-2'>
        <Label
          className='sr-only'
          htmlFor={`condition-field-${path.join('-') || 'root'}`}
        >
          {t('condition.field', { default: 'Field' })}
        </Label>
        <select
          id={`condition-field-${path.join('-') || 'root'}`}
          aria-label={t('condition.field', { default: 'Field' })}
          className='border-input bg-background focus-visible:ring-ring h-11 rounded-md border px-2 text-sm focus-visible:ring-2'
          value={node.field}
          disabled={disabled}
          onChange={(event) =>
            onReplace(
              path,
              ruleForConditionField(event.target.value as ConditionField)
            )
          }
        >
          {FIELDS.map((field) => {
            const fieldDefinition = CONDITION_FIELD_DEFINITIONS[field];
            return (
              <option key={field} value={field}>
                {t(fieldDefinition.labelKey, {
                  default: fieldDefinition.label
                })}
              </option>
            );
          })}
        </select>
        <Label
          className='sr-only'
          htmlFor={`condition-operator-${path.join('-') || 'root'}`}
        >
          {t('condition.operator', { default: 'Operator' })}
        </Label>
        <select
          id={`condition-operator-${path.join('-') || 'root'}`}
          aria-label={t('condition.operator', { default: 'Operator' })}
          className='border-input bg-background focus-visible:ring-ring h-11 rounded-md border px-2 text-sm focus-visible:ring-2'
          value={node.operator}
          disabled={disabled}
          onChange={(event) =>
            onReplace(path, {
              ...node,
              operator: operatorForField(node.field, event.target.value)
            } as ConditionRule)
          }
        >
          {definition.operators.map((operator) => (
            <option key={operator} value={operator}>
              {t(OPERATOR_KEYS[operator], {
                default: OPERATOR_LABELS[operator]
              })}
            </option>
          ))}
        </select>
        {definition.value !== 'none' ? (
          <>
            <Label
              className='sr-only'
              htmlFor={`condition-value-${path.join('-') || 'root'}`}
            >
              {t('condition.value', { default: 'Value' })}
            </Label>
            <Input
              id={`condition-value-${path.join('-') || 'root'}`}
              aria-label={t('condition.value', { default: 'Value' })}
              className='min-h-11'
              type={definition.value === 'number' ? 'number' : 'text'}
              inputMode={definition.value === 'number' ? 'numeric' : 'text'}
              value={String('value' in node ? node.value : '')}
              disabled={disabled}
              onChange={(event) => {
                const value =
                  definition.value === 'number'
                    ? Number(event.target.value)
                    : event.target.value;
                if (definition.value === 'number' && !Number.isFinite(value))
                  return;
                onReplace(path, { ...node, value } as ConditionRule);
              }}
            />
          </>
        ) : null}
        {path.length > 0 ? (
          <Button
            type='button'
            variant='ghost'
            size='sm'
            className='text-muted-foreground min-h-11 justify-start'
            disabled={disabled}
            onClick={() => onRemove(path)}
          >
            <Minus aria-hidden />
            {t('condition.removeRule', { default: 'Remove rule' })}
          </Button>
        ) : null}
      </div>
    </fieldset>
  );
}

export type ConditionBuilderProps = {
  value: AccessPolicy | undefined;
  onChange: (value: AccessPolicy | undefined) => void;
  disabled?: boolean;
  allowLock?: boolean;
  semanticBounds?: ConditionSemanticBounds;
};

export function ConditionBuilder({
  value,
  onChange,
  disabled = false,
  allowLock = true,
  semanticBounds
}: ConditionBuilderProps) {
  const t = useTranslations('experience.builder.task11');
  const invalidReason =
    value === undefined
      ? null
      : classifyInvalidSavedPolicy(value, semanticBounds);
  if (invalidReason) {
    const whenFalse =
      value !== null && typeof value === 'object'
        ? (value as { whenFalse?: unknown }).whenFalse
        : undefined;
    let issueTitle: string;
    let issueHint: string;
    switch (invalidReason.kind) {
      case 'unsupported-field':
        issueTitle = t('condition.invalidField', {
          default: 'Unsupported saved field'
        });
        issueHint = t('condition.invalidHint', {
          default:
            'This saved condition is from a newer or incompatible version. It is retained unchanged until repaired.'
        });
        break;
      case 'max-depth':
        issueTitle = t('condition.invalidMaxDepth', {
          default: `Saved condition exceeds the maximum depth of ${invalidReason.limit}.`,
          limit: invalidReason.limit
        });
        issueHint = t('condition.invalidMaxDepthHint', {
          default: `Service behavior conditions support at most ${invalidReason.limit} levels. The saved policy is retained unchanged until repaired.`,
          limit: invalidReason.limit
        });
        break;
      case 'max-group-children':
        issueTitle = t('condition.invalidMaxGroupChildren', {
          default: `Saved condition exceeds the maximum group size of ${invalidReason.limit}.`,
          limit: invalidReason.limit
        });
        issueHint = t('condition.invalidMaxGroupChildrenHint', {
          default: `Each Service behavior condition group supports at most ${invalidReason.limit} direct children. The saved policy is retained unchanged until repaired.`,
          limit: invalidReason.limit
        });
        break;
      case 'max-nodes':
        issueTitle = t('condition.invalidMaxNodes', {
          default: `Saved condition exceeds the maximum of ${invalidReason.limit} nodes.`,
          limit: invalidReason.limit
        });
        issueHint = t('condition.invalidMaxNodesHint', {
          default: `Access conditions support at most ${invalidReason.limit} nodes. The saved policy is retained unchanged until repaired.`,
          limit: invalidReason.limit
        });
        break;
      case 'invalid-schema':
        issueTitle = t('condition.invalidSchema', {
          default: 'Saved condition is invalid.'
        });
        issueHint = t('condition.invalidSchemaHint', {
          default:
            'The saved policy does not match the supported condition format. It is retained unchanged until repaired.'
        });
        break;
    }
    return (
      <div
        role='alert'
        className='rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100'
      >
        <p className='font-medium'>{issueTitle}</p>
        <p className='mt-1 text-xs'>{issueHint}</p>
        {invalidReason.kind === 'unsupported-field' ? (
          <code className='bg-background mt-2 inline-flex rounded px-2 py-1 text-xs'>
            {invalidReason.field}
          </code>
        ) : null}
        <span className='bg-background mt-2 inline-flex rounded px-2 py-1 text-xs'>
          {whenFalse === 'lock'
            ? t('condition.locked', { default: 'Show locked' })
            : t('condition.hidden', { default: 'Hide' })}
        </span>
      </div>
    );
  }

  const policy = value ?? {
    when: ruleForConditionField('identity.isAuthenticated'),
    whenFalse: 'hide' as const
  };
  const commit = (when: ConditionNode) => onChange({ ...policy, when });
  const rootNodeCount = countConditionNodes(policy.when);
  const canWrapTopLevelRule =
    policy.when.kind === 'rule' &&
    rootNodeCount + 1 <= MAX_ACCESS_POLICY_CONDITION_NODES &&
    (semanticBounds === undefined ||
      (semanticBounds.maxGroupChildren >= 2 && semanticBounds.maxDepth >= 2));
  const canWrapTopLevelRuleInGroup =
    policy.when.kind === 'rule' &&
    rootNodeCount + 2 <= MAX_ACCESS_POLICY_CONDITION_NODES &&
    (semanticBounds === undefined ||
      (semanticBounds.maxGroupChildren >= 2 && semanticBounds.maxDepth >= 3));

  const wrapTopLevelRule = (kind: 'rule' | 'group') => {
    if (policy.when.kind !== 'rule') return;
    const child =
      kind === 'group'
        ? {
            kind: 'group' as const,
            combinator: 'and' as const,
            children: [ruleForConditionField('identity.isAuthenticated')]
          }
        : ruleForConditionField('identity.isAuthenticated');
    commit({
      kind: 'group',
      combinator: 'and',
      children: [cloneNode(policy.when), child]
    });
  };
  return (
    <section
      className='space-y-3'
      aria-label={t('condition.label', {
        default: 'Structured visibility condition'
      })}
    >
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <p className='text-muted-foreground text-xs'>
          {t('condition.structuredOnly', { default: 'Structured rules only' })}
        </p>
        {value !== undefined ? (
          <Button
            type='button'
            variant='ghost'
            size='sm'
            className='min-h-11'
            disabled={disabled}
            onClick={() => onChange(undefined)}
          >
            {t('condition.clear', { default: 'Clear access rule' })}
          </Button>
        ) : null}
      </div>
      <ConditionTree
        node={policy.when}
        path={[]}
        disabled={disabled}
        rootNodeCount={rootNodeCount}
        semanticBounds={semanticBounds}
        onReplace={(path, node) =>
          commit(replaceConditionAtPath(policy.when, path, node))
        }
        onRemove={(path) => {
          const next = removeConditionAtPath(policy.when, path);
          if (next) commit(next);
        }}
        onAdd={(path, kind) =>
          commit(appendConditionChild(policy.when, path, kind, semanticBounds))
        }
      />
      {policy.when.kind === 'rule' ? (
        <fieldset
          className='flex flex-wrap gap-2'
          aria-label={t('condition.extend', { default: 'Extend condition' })}
        >
          <legend className='text-xs font-medium'>
            {t('condition.extend', { default: 'Extend condition' })}
          </legend>
          <Button
            type='button'
            variant='outline'
            className='min-h-11'
            disabled={disabled || !canWrapTopLevelRule}
            onClick={() => wrapTopLevelRule('rule')}
          >
            <Plus aria-hidden />
            {t('condition.addRule', { default: 'Add rule' })}
          </Button>
          <Button
            type='button'
            variant='outline'
            className='min-h-11'
            disabled={disabled || !canWrapTopLevelRuleInGroup}
            onClick={() => wrapTopLevelRule('group')}
          >
            <Plus aria-hidden />
            {t('condition.addGroup', { default: 'Add group' })}
          </Button>
        </fieldset>
      ) : null}
      <fieldset
        className='flex flex-wrap gap-2'
        aria-label={t('condition.whenFalse', {
          default: 'When the condition does not match'
        })}
      >
        <legend className='text-xs font-medium'>
          {t('condition.whenFalse', {
            default: 'When the condition does not match'
          })}
        </legend>
        <Button
          type='button'
          variant={policy.whenFalse === 'hide' ? 'secondary' : 'outline'}
          className='min-h-11'
          disabled={disabled}
          onClick={() => onChange({ ...policy, whenFalse: 'hide' })}
        >
          {t('condition.hidden', { default: 'Hide' })}
        </Button>
        {allowLock ? (
          <Button
            type='button'
            variant={policy.whenFalse === 'lock' ? 'secondary' : 'outline'}
            className='min-h-11'
            disabled={disabled}
            onClick={() => onChange({ ...policy, whenFalse: 'lock' })}
          >
            {t('condition.locked', { default: 'Show locked' })}
          </Button>
        ) : null}
      </fieldset>
    </section>
  );
}
