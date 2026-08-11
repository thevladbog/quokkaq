import {
  ExperienceTemplateSchema,
  ServiceBehaviorSchema,
  type ExperienceTemplate,
  type ServiceBehavior
} from '@quokkaq/shared-types';
import { z } from 'zod';

import {
  listScreenLayoutTemplateVersions,
  publishScreenLayoutTemplate,
  restoreScreenLayoutTemplateVersion,
  updateScreenLayoutTemplate
} from '@/lib/api/generated/auth';
import { updateDesktopTerminal } from '@/lib/api/generated/desktop-terminal';
import { putServicesId } from '@/lib/api/generated/services';
import {
  acknowledgeTerminalExperienceManifest,
  getTerminalExperienceManifest
} from '@/lib/api/generated/terminal-experience';

export type ExperienceDefinitionIssue = {
  code: string;
  path: Array<string | number>;
  message: string;
};

export type ExperienceDefinitionParseResult =
  | { kind: 'valid'; template: ExperienceTemplate }
  | InvalidExperienceDefinitionResult;

type InvalidExperienceDefinitionResult = {
  kind: 'invalid-definition';
  issues: ExperienceDefinitionIssue[];
};

const TemplateResponseSchema = z
  .object({
    id: z.string().min(1),
    definition: z.unknown()
  })
  .passthrough();

const PublishedVersionResponseSchema = z
  .object({
    id: z.string().min(1),
    templateId: z.string().min(1),
    version: z.number().int().positive(),
    publishedAt: z.string().min(1),
    definition: z.unknown()
  })
  .passthrough();

const VersionHistoryResponseSchema = z
  .object({
    items: z.array(
      z
        .object({
          id: z.string().min(1),
          templateId: z.string().min(1),
          version: z.number().int().positive(),
          publishedAt: z.string().min(1)
        })
        .passthrough()
    ),
    nextBeforeVersion: z.number().int().positive().nullable(),
    hasMore: z.boolean()
  })
  .passthrough();

export const TerminalExperienceAcknowledgementSchema = z.discriminatedUnion(
  'status',
  [
    z
      .object({
        status: z.literal('applied'),
        versionId: z.string().trim().min(1)
      })
      .strict(),
    z
      .object({
        status: z.literal('rejected'),
        versionId: z.string().trim().min(1),
        reasonCode: z
          .string()
          .trim()
          .min(1)
          .max(64)
          .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/)
      })
      .strict()
  ]
);

export type TerminalExperienceAcknowledgement = z.infer<
  typeof TerminalExperienceAcknowledgementSchema
>;

export type ParsedExperienceTemplateVersion =
  | {
      kind: 'valid';
      template: ExperienceTemplate;
      version: {
        id: string;
        templateId: string;
        version: number;
        publishedAt: string;
      };
    }
  | { kind: 'invalid-definition'; issues: ExperienceDefinitionIssue[] };

function redactIssues(error: z.ZodError): ExperienceDefinitionIssue[] {
  return error.issues.map((issue) => ({
    code: issue.code,
    path: issue.path.filter(
      (part): part is string | number =>
        typeof part === 'string' || typeof part === 'number'
    ),
    message: issue.message
  }));
}

function invalidDefinition(
  issues: ExperienceDefinitionIssue[]
): InvalidExperienceDefinitionResult {
  return { kind: 'invalid-definition', issues };
}

function responseIssue(
  path: Array<string | number>,
  message: string
): InvalidExperienceDefinitionResult {
  return invalidDefinition([{ code: 'response.invalid', path, message }]);
}

function expectedStatus(
  status: number,
  expected: number,
  operation: string
): void {
  if (status !== expected) {
    throw new Error(`${operation} returned unexpected status ${status}`);
  }
}

function terminalRequestOptions(terminalToken: string): RequestInit {
  const token = terminalToken.trim();
  if (token === '') {
    throw new Error('terminal token is required');
  }
  return { headers: { Authorization: `Bearer ${token}` } };
}

function parseVersionPayload(
  payload: unknown,
  expectedTemplateID?: string
): ParsedExperienceTemplateVersion {
  const envelope = PublishedVersionResponseSchema.safeParse(payload);
  if (!envelope.success) {
    return invalidDefinition(redactIssues(envelope.error));
  }
  if (
    expectedTemplateID !== undefined &&
    envelope.data.templateId !== expectedTemplateID
  ) {
    return responseIssue(['templateId'], 'response template id does not match');
  }
  const parsed = parseExperienceDefinition(envelope.data.definition);
  if (parsed.kind === 'invalid-definition') {
    return parsed;
  }
  if (parsed.template.id !== envelope.data.templateId) {
    return responseIssue(['definition', 'id'], 'definition id does not match');
  }
  return {
    kind: 'valid',
    template: parsed.template,
    version: {
      id: envelope.data.id,
      templateId: envelope.data.templateId,
      version: envelope.data.version,
      publishedAt: envelope.data.publishedAt
    }
  };
}

/** Parses every opaque API definition through the canonical shared schema. */
export function parseExperienceDefinition(
  definition: unknown
): ExperienceDefinitionParseResult {
  const parsed = ExperienceTemplateSchema.safeParse(definition);
  if (!parsed.success) {
    return invalidDefinition(redactIssues(parsed.error));
  }
  return { kind: 'valid', template: parsed.data };
}

/** Saves a mutable draft and returns a validated definition result. */
export async function updateExperienceDraft(
  templateId: string,
  input: { name?: string; definition: unknown }
): Promise<ExperienceDefinitionParseResult> {
  const definition = parseExperienceDefinition(input.definition);
  if (definition.kind === 'invalid-definition') {
    return definition;
  }
  const response = await updateScreenLayoutTemplate(templateId, {
    ...(input.name === undefined ? {} : { name: input.name }),
    definition: definition.template
  });
  expectedStatus(response.status, 200, 'update experience draft');
  const envelope = TemplateResponseSchema.safeParse(response.data);
  if (!envelope.success) {
    return invalidDefinition(redactIssues(envelope.error));
  }
  if (envelope.data.id !== templateId) {
    return responseIssue(['id'], 'response template id does not match');
  }
  const parsedDefinition = parseExperienceDefinition(envelope.data.definition);
  if (parsedDefinition.kind === 'invalid-definition') {
    return parsedDefinition;
  }
  if (parsedDefinition.template.id !== templateId) {
    return responseIssue(['definition', 'id'], 'definition id does not match');
  }
  return parsedDefinition;
}

/** Publishes the draft into an immutable version and validates its definition. */
export async function publishExperienceTemplate(
  templateId: string
): Promise<ParsedExperienceTemplateVersion> {
  const response = await publishScreenLayoutTemplate(templateId);
  expectedStatus(response.status, 201, 'publish experience template');
  return parseVersionPayload(response.data, templateId);
}

/** Lists definition-free immutable version metadata. */
export async function listExperienceTemplateVersions(
  templateId: string
): Promise<{
  items: Array<{
    id: string;
    templateId: string;
    version: number;
    publishedAt: string;
  }>;
  nextBeforeVersion: number | null;
  hasMore: boolean;
}> {
  const response = await listScreenLayoutTemplateVersions(templateId);
  expectedStatus(response.status, 200, 'list experience template versions');
  return VersionHistoryResponseSchema.parse(response.data);
}

/** Restores a historical definition by asking the API to publish a new immutable version. */
export async function restoreExperienceTemplateVersion(
  templateId: string,
  versionId: string
): Promise<ParsedExperienceTemplateVersion> {
  const response = await restoreScreenLayoutTemplateVersion(
    templateId,
    versionId
  );
  expectedStatus(response.status, 201, 'restore experience template version');
  return parseVersionPayload(response.data, templateId);
}

/** Assigns a published template variant to a device, or clears both fields. */
export async function assignExperienceToTerminal(
  terminalId: string,
  assignment:
    | { templateId: string; variantId: string }
    | { templateId: null; variantId: null }
): Promise<void> {
  const response = await updateDesktopTerminal(terminalId, {
    experienceTemplateId: assignment.templateId,
    experienceVariantId: assignment.variantId
  });
  expectedStatus(response.status, 204, 'assign experience terminal');
}

/** Updates only the portable behavior owned by a service. */
export async function updateServiceBehavior(
  serviceId: string,
  behavior: ServiceBehavior | null
): Promise<void> {
  const parsedBehavior =
    behavior === null ? null : ServiceBehaviorSchema.parse(behavior);
  const response = await putServicesId(serviceId, { behavior: parsedBehavior });
  expectedStatus(response.status, 200, 'update service behavior');
}

/** Uses the terminal-JWT generated client; callers receive the untouched wire payload. */
export async function fetchTerminalExperienceManifest(
  terminalToken: string
): Promise<unknown> {
  const response = await getTerminalExperienceManifest(
    terminalRequestOptions(terminalToken)
  );
  expectedStatus(response.status, 200, 'get terminal experience manifest');
  return response.data;
}

/** Acknowledges exactly one strict deployment outcome with the terminal-JWT client. */
export async function acknowledgeTerminalExperience(
  terminalToken: string,
  acknowledgement: TerminalExperienceAcknowledgement
): Promise<void> {
  const parsed = TerminalExperienceAcknowledgementSchema.parse(acknowledgement);
  const response = await acknowledgeTerminalExperienceManifest(
    parsed,
    terminalRequestOptions(terminalToken)
  );
  expectedStatus(response.status, 204, 'acknowledge terminal experience');
}
