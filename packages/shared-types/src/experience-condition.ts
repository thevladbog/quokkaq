import { z } from 'zod';

export const ConditionFieldSchema = z.enum([
  'identity.isAuthenticated',
  'identity.isEmployee',
  'identity.groups',
  'live.queueLength',
  'live.isOpen',
  'live.isConnected',
  'session.selectedServiceId'
]);

export const ConditionOperatorSchema = z.enum([
  'eq',
  'ne',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'not-contains',
  'is-true',
  'is-false'
]);

export type ConditionField = z.infer<typeof ConditionFieldSchema>;
export type ConditionOperator = z.infer<typeof ConditionOperatorSchema>;

type BooleanConditionRule = {
  kind: 'rule';
  field:
    | 'identity.isAuthenticated'
    | 'identity.isEmployee'
    | 'live.isOpen'
    | 'live.isConnected';
  operator: 'is-true' | 'is-false';
};

type GroupsConditionRule = {
  kind: 'rule';
  field: 'identity.groups';
  operator: 'contains' | 'not-contains';
  value: string;
};

type QueueLengthConditionRule = {
  kind: 'rule';
  field: 'live.queueLength';
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte';
  value: number;
};

type SelectedServiceConditionRule = {
  kind: 'rule';
  field: 'session.selectedServiceId';
  operator: 'eq' | 'ne';
  value: string;
};

export type ConditionRule =
  | BooleanConditionRule
  | GroupsConditionRule
  | QueueLengthConditionRule
  | SelectedServiceConditionRule;

export type ConditionGroup = {
  kind: 'group';
  combinator: 'and' | 'or';
  children: ConditionNode[];
};

export type ConditionNode = ConditionRule | ConditionGroup;

/** Maximum condition AST nodes accepted in one page or widget access policy. */
export const MAX_ACCESS_POLICY_CONDITION_NODES = 100;

/**
 * Iterative traversal keeps resource checks bounded even when a policy comes
 * from an untrusted editor payload. Call this only after the node schema has
 * parsed the AST shape.
 */
export function exceedsConditionNodeLimit(
  node: ConditionNode,
  limit = MAX_ACCESS_POLICY_CONDITION_NODES
): boolean {
  let nodes = 0;
  let current: ConditionNode | undefined = node;
  const parents: Array<{ children: ConditionNode[]; nextIndex: number }> = [];

  while (current !== undefined) {
    nodes += 1;
    if (nodes > limit) return true;
    if (current.kind === 'group') {
      parents.push({ children: current.children, nextIndex: 0 });
    }

    current = undefined;
    while (parents.length > 0 && current === undefined) {
      const parent = parents[parents.length - 1]!;
      if (parent.nextIndex < parent.children.length) {
        current = parent.children[parent.nextIndex++]!;
      } else {
        parents.pop();
      }
    }
  }

  return false;
}

function isPlainOwnRecord(
  value: unknown,
  requiredKeys: readonly string[]
): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return false;
  }

  return requiredKeys.every((key) =>
    Object.prototype.hasOwnProperty.call(value, key)
  );
}

function plainOwnRecord<T extends z.ZodType>(
  schema: T,
  requiredKeys: readonly string[]
) {
  return z.preprocess(
    (value) => (isPlainOwnRecord(value, requiredKeys) ? value : undefined),
    schema
  );
}

const BooleanConditionRuleSchema = plainOwnRecord(
  z
    .object({
      kind: z.literal('rule'),
      field: z.enum([
        'identity.isAuthenticated',
        'identity.isEmployee',
        'live.isOpen',
        'live.isConnected'
      ]),
      operator: z.enum(['is-true', 'is-false'])
    })
    .strict(),
  ['kind', 'field', 'operator']
);

const GroupsConditionRuleSchema = plainOwnRecord(
  z
    .object({
      kind: z.literal('rule'),
      field: z.literal('identity.groups'),
      operator: z.enum(['contains', 'not-contains']),
      value: z.string().min(1)
    })
    .strict(),
  ['kind', 'field', 'operator', 'value']
);

const QueueLengthConditionRuleSchema = plainOwnRecord(
  z
    .object({
      kind: z.literal('rule'),
      field: z.literal('live.queueLength'),
      operator: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte']),
      value: z.number()
    })
    .strict(),
  ['kind', 'field', 'operator', 'value']
);

const SelectedServiceConditionRuleSchema = plainOwnRecord(
  z
    .object({
      kind: z.literal('rule'),
      field: z.literal('session.selectedServiceId'),
      operator: z.enum(['eq', 'ne']),
      value: z.string().min(1)
    })
    .strict(),
  ['kind', 'field', 'operator', 'value']
);

export const ConditionRuleSchema: z.ZodType<ConditionRule> = z.union([
  BooleanConditionRuleSchema,
  GroupsConditionRuleSchema,
  QueueLengthConditionRuleSchema,
  SelectedServiceConditionRuleSchema
]);

export const ConditionGroupSchema: z.ZodType<ConditionGroup> = plainOwnRecord(
  z
    .object({
      kind: z.literal('group'),
      combinator: z.enum(['and', 'or']),
      children: z.array(z.lazy(() => ConditionNodeSchema)).min(1)
    })
    .strict(),
  ['kind', 'combinator', 'children']
);

export const ConditionNodeSchema: z.ZodType<ConditionNode> = z.lazy(() =>
  z.union([ConditionRuleSchema, ConditionGroupSchema])
);

function accessPolicyWithConditionLimit<T extends z.ZodType>(schema: T): T {
  return schema.superRefine((policy, ctx) => {
    const value = policy as { when: ConditionNode };
    if (exceedsConditionNodeLimit(value.when)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['when'],
        message: 'access condition exceeds resource bounds'
      });
    }
  }) as T;
}

export const AccessPolicySchema = plainOwnRecord(
  accessPolicyWithConditionLimit(
    z
      .object({
        when: ConditionNodeSchema,
        whenFalse: z.enum(['hide', 'lock'])
      })
      .strict()
  ),
  ['when', 'whenFalse']
);

export const PageAccessPolicySchema = plainOwnRecord(
  accessPolicyWithConditionLimit(
    z
      .object({
        when: ConditionNodeSchema,
        whenFalse: z.literal('hide')
      })
      .strict()
  ),
  ['when', 'whenFalse']
);

export const ConditionContextSchema = z.object({
  identity: z
    .object({
      isAuthenticated: z.boolean().optional(),
      isEmployee: z.boolean().optional(),
      groups: z.array(z.string()).optional()
    })
    .optional(),
  live: z
    .object({
      queueLength: z.number().optional(),
      isOpen: z.boolean().optional(),
      isConnected: z.boolean().optional()
    })
    .optional(),
  session: z
    .object({
      selectedServiceId: z.string().nullable().optional()
    })
    .optional()
});

export type AccessPolicy = z.infer<typeof AccessPolicySchema>;
export type PageAccessPolicy = z.infer<typeof PageAccessPolicySchema>;
export type ConditionContext = z.infer<typeof ConditionContextSchema>;
