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

const BooleanConditionRuleSchema = z
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
  .strict();

const GroupsConditionRuleSchema = z
  .object({
    kind: z.literal('rule'),
    field: z.literal('identity.groups'),
    operator: z.enum(['contains', 'not-contains']),
    value: z.string().min(1)
  })
  .strict();

const QueueLengthConditionRuleSchema = z
  .object({
    kind: z.literal('rule'),
    field: z.literal('live.queueLength'),
    operator: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte']),
    value: z.number()
  })
  .strict();

const SelectedServiceConditionRuleSchema = z
  .object({
    kind: z.literal('rule'),
    field: z.literal('session.selectedServiceId'),
    operator: z.enum(['eq', 'ne']),
    value: z.string().min(1)
  })
  .strict();

export const ConditionRuleSchema: z.ZodType<ConditionRule> =
  z.discriminatedUnion('field', [
    BooleanConditionRuleSchema,
    GroupsConditionRuleSchema,
    QueueLengthConditionRuleSchema,
    SelectedServiceConditionRuleSchema
  ]);

export const ConditionGroupSchema: z.ZodType<ConditionGroup> = z
  .object({
    kind: z.literal('group'),
    combinator: z.enum(['and', 'or']),
    children: z.array(z.lazy(() => ConditionNodeSchema)).min(1)
  })
  .strict();

export const ConditionNodeSchema: z.ZodType<ConditionNode> = z.lazy(() =>
  z.union([ConditionRuleSchema, ConditionGroupSchema])
);

export const AccessPolicySchema = z
  .object({
    when: ConditionNodeSchema,
    whenFalse: z.enum(['hide', 'lock'])
  })
  .strict();

export const PageAccessPolicySchema = z
  .object({
    when: ConditionNodeSchema,
    whenFalse: z.literal('hide')
  })
  .strict();

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
