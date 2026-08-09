import { z } from 'zod';
import {
  AccessPolicySchema,
  type AccessPolicy,
  type ConditionNode
} from './experience-condition';

const maxServiceBehaviorJSONBytes = 64 * 1024;
const maxLocalizedEntries = 8;
const maxFields = 50;
const maxSelectOptions = 50;
const maxConditionDepth = 8;
const maxConditionNodes = 100;
const maxConditionGroupChildren = 20;

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

function localizedTextSchema(maxValueLength: number) {
  return plainOwnRecord(
    z
      .record(z.string().min(1).max(16), z.string().min(1).max(maxValueLength))
      .superRefine((value, ctx) => {
        if (Object.keys(value).length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'localized text must contain at least one locale'
          });
        }
        if (Object.keys(value).length > maxLocalizedEntries) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `localized text must contain at most ${maxLocalizedEntries} locales`
          });
        }
      }),
    []
  );
}

const ServiceBehaviorLabelSchema = localizedTextSchema(160);
const ServiceBehaviorInformationBodySchema = localizedTextSchema(4000);

export const ServiceBehaviorFieldKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,63}$/);

const ServiceBehaviorSelectOptionSchema = plainOwnRecord(
  z
    .object({
      key: ServiceBehaviorFieldKeySchema,
      label: ServiceBehaviorLabelSchema
    })
    .strict(),
  ['key', 'label']
);

const ServiceBehaviorSelectFieldSchema = plainOwnRecord(
  z
    .object({
      key: ServiceBehaviorFieldKeySchema,
      label: ServiceBehaviorLabelSchema,
      type: z.literal('select'),
      required: z.boolean(),
      options: z
        .array(ServiceBehaviorSelectOptionSchema)
        .min(1)
        .max(maxSelectOptions)
    })
    .strict()
    .superRefine((field, ctx) => {
      const seen = new Set<string>();
      for (const [index, option] of field.options.entries()) {
        if (seen.has(option.key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['options', index, 'key'],
            message: 'select option keys must be unique'
          });
        }
        seen.add(option.key);
      }
    }),
  ['key', 'label', 'type', 'required', 'options']
);

const ServiceBehaviorSimpleFieldSchema = plainOwnRecord(
  z
    .object({
      key: ServiceBehaviorFieldKeySchema,
      label: ServiceBehaviorLabelSchema,
      type: z.enum(['text', 'number', 'phone', 'checkbox']),
      required: z.boolean()
    })
    .strict(),
  ['key', 'label', 'type', 'required']
);

export const ServiceBehaviorFieldSchema = z.union([
  ServiceBehaviorSelectFieldSchema,
  ServiceBehaviorSimpleFieldSchema
]);

export const ServiceBehaviorInformationSchema = plainOwnRecord(
  z
    .object({
      body: ServiceBehaviorInformationBodySchema,
      requireAcknowledgement: z.boolean().optional()
    })
    .strict(),
  ['body']
);

export const ServiceBehaviorRouteSchema = z.union([
  plainOwnRecord(z.object({ mode: z.literal('auto') }).strict(), ['mode']),
  plainOwnRecord(
    z
      .object({
        mode: z.literal('page-slot'),
        slot: z.enum([
          'service-info',
          'service-form',
          'identity',
          'confirmation'
        ])
      })
      .strict(),
    ['mode', 'slot']
  )
]);

function validateServiceBehaviorAccessBounds(
  access: AccessPolicy,
  ctx: z.RefinementCtx
) {
  let nodes = 0;
  let invalid = false;

  function visit(node: ConditionNode, depth: number) {
    nodes += 1;
    if (depth > maxConditionDepth || nodes > maxConditionNodes) {
      invalid = true;
      return;
    }
    if (node.kind === 'group') {
      if (node.children.length > maxConditionGroupChildren) {
        invalid = true;
        return;
      }
      for (const child of node.children) {
        visit(child, depth + 1);
        if (invalid) {
          return;
        }
      }
    }
  }

  visit(access.when, 1);
  if (invalid) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['access', 'when'],
      message: 'access condition exceeds Service behavior resource bounds'
    });
  }
}

export type ServiceBehavior = {
  version: 1;
  information?: z.infer<typeof ServiceBehaviorInformationSchema>;
  fields: z.infer<typeof ServiceBehaviorFieldSchema>[];
  dataRetentionDays?: number;
  route?: z.infer<typeof ServiceBehaviorRouteSchema>;
  access?: AccessPolicy;
};

export const ServiceBehaviorSchema: z.ZodType<ServiceBehavior> = plainOwnRecord(
  z
    .object({
      version: z.literal(1),
      information: ServiceBehaviorInformationSchema.optional(),
      fields: z.array(ServiceBehaviorFieldSchema).max(maxFields).default([]),
      dataRetentionDays: z.number().int().min(1).max(30).optional(),
      route: ServiceBehaviorRouteSchema.optional(),
      access: AccessPolicySchema.optional()
    })
    .strict()
    .superRefine((behavior, ctx) => {
      if (
        behavior.fields.length > 0 &&
        behavior.dataRetentionDays === undefined
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['dataRetentionDays'],
          message: 'dataRetentionDays is required when fields are configured'
        });
      }

      const seen = new Set<string>();
      for (const [index, field] of behavior.fields.entries()) {
        if (seen.has(field.key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['fields', index, 'key'],
            message: 'field keys must be unique'
          });
        }
        seen.add(field.key);
      }

      if (behavior.access !== undefined) {
        validateServiceBehaviorAccessBounds(behavior.access, ctx);
      }

      try {
        const serialized = JSON.stringify(behavior);
        if (
          new TextEncoder().encode(serialized).length >
          maxServiceBehaviorJSONBytes
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `service behavior must be at most ${maxServiceBehaviorJSONBytes} bytes`
          });
        }
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'service behavior must be JSON serializable'
        });
      }
    }),
  ['version']
) as z.ZodType<ServiceBehavior>;
