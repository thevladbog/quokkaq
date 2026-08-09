import { z } from 'zod';
import { AccessPolicySchema, type AccessPolicy } from './experience-condition';

const LocalizedTextSchema = z
  .record(z.string().min(1), z.string().min(1))
  .refine((value) => Object.keys(value).length > 0);

const ServiceBehaviorFieldKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,63}$/);

const ServiceBehaviorFieldBaseSchema = z.object({
  key: ServiceBehaviorFieldKeySchema,
  label: LocalizedTextSchema,
  required: z.boolean()
});

const ServiceBehaviorSelectFieldSchema = ServiceBehaviorFieldBaseSchema.extend({
  type: z.literal('select'),
  options: z.array(LocalizedTextSchema).min(1).max(50)
}).strict();

const ServiceBehaviorSimpleFieldSchema = ServiceBehaviorFieldBaseSchema.extend({
  type: z.enum(['text', 'number', 'phone', 'checkbox'])
}).strict();

export const ServiceBehaviorFieldSchema = z.discriminatedUnion('type', [
  ServiceBehaviorSelectFieldSchema,
  ServiceBehaviorSimpleFieldSchema
]);

export const ServiceBehaviorInformationSchema = z
  .object({
    body: LocalizedTextSchema,
    requireAcknowledgement: z.boolean().optional()
  })
  .strict();

export const ServiceBehaviorRouteSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('auto') }).strict(),
  z
    .object({
      mode: z.literal('page-slot'),
      slot: z.enum(['service-info', 'service-form', 'identity', 'confirmation'])
    })
    .strict()
]);

export type ServiceBehavior = {
  version: 1;
  information?: z.infer<typeof ServiceBehaviorInformationSchema>;
  fields: z.infer<typeof ServiceBehaviorFieldSchema>[];
  dataRetentionDays?: number;
  route?: z.infer<typeof ServiceBehaviorRouteSchema>;
  access?: AccessPolicy;
};

export const ServiceBehaviorSchema: z.ZodType<ServiceBehavior> = z
  .object({
    version: z.literal(1),
    information: ServiceBehaviorInformationSchema.optional(),
    fields: z.array(ServiceBehaviorFieldSchema).default([]),
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
  });
