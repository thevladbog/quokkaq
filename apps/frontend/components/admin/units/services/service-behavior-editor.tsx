'use client';

import {
  ServiceBehaviorSchema,
  type ServiceBehavior
} from '@quokkaq/shared-types';
import { Plus, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import {
  ConditionBuilder,
  SERVICE_BEHAVIOR_CONDITION_BOUNDS
} from '@/components/admin/experience-builder/condition-builder';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { isApiHttpError } from '@/lib/api-errors';
import { updateServiceBehavior } from '@/lib/experience/experience-api';

type FieldErrors = Record<string, string>;
type BehaviorField = ServiceBehavior['fields'][number];
type BehaviorFieldType = BehaviorField['type'];
type ValidationIssue = {
  code: string;
  path: PropertyKey[];
  errors?: ValidationIssue[][];
};

const MAX_FIELDS = 50;
const MAX_OPTIONS = 50;

function nextStableKey(
  prefix: string,
  values: readonly { key: string }[]
): string {
  const existing = new Set(values.map((value) => value.key));
  let suffix = 1;
  while (existing.has(`${prefix}_${suffix}`)) {
    suffix += 1;
  }
  return `${prefix}_${suffix}`;
}

function defaultBehavior(): ServiceBehavior {
  return { version: 1, fields: [], route: { mode: 'auto' } };
}

function cloneBehavior(value: ServiceBehavior | null): ServiceBehavior {
  return value === null
    ? defaultBehavior()
    : (JSON.parse(JSON.stringify(value)) as ServiceBehavior);
}

function setLocalizedValue(
  values: Record<string, string>,
  locale: string,
  value: string
): Record<string, string> {
  const next = { ...values };
  if (value.trim() === '') delete next[locale];
  else next[locale] = value;
  return next;
}

function errorMessages(error: unknown, fallback: string): FieldErrors {
  // The current service update endpoint exposes a plain-string error envelope.
  // Field-level errors below therefore come from the local canonical schema;
  // API failures remain form-level until the backend contract is expanded.
  return {
    form:
      isApiHttpError(error) && error.code
        ? `${fallback} (${error.code})`
        : fallback
  };
}

function actionableIssues(issue: ValidationIssue): ValidationIssue[] {
  if (issue.code !== 'invalid_union' || !Array.isArray(issue.errors)) {
    return [issue];
  }
  const branches = issue.errors.map((branch) =>
    branch.flatMap(actionableIssues)
  );
  return branches.reduce<ValidationIssue[]>(
    (best, branch) =>
      best.length === 0 || branch.length < best.length ? branch : best,
    []
  );
}

function localValidationErrors(
  issues: readonly ValidationIssue[],
  message: string
): FieldErrors {
  const entries = issues.flatMap(actionableIssues).map((issue) => {
    const path = issue.path.filter(
      (part): part is string | number =>
        typeof part === 'string' || typeof part === 'number'
    );
    return [path.length > 0 ? path.join('.') : 'form', message] as const;
  });
  return Object.fromEntries(entries);
}

function fieldError(
  errors: FieldErrors,
  ...paths: string[]
): string | undefined {
  return paths.map((path) => errors[path]).find(Boolean);
}

function nextFieldForType(
  field: BehaviorField,
  type: BehaviorFieldType,
  locale: string,
  optionLabel: string
): BehaviorField {
  const common = {
    key: field.key,
    label: field.label,
    required: field.required
  };
  if (type === 'select') {
    return {
      ...common,
      type,
      options:
        field.type === 'select' && field.options.length > 0
          ? field.options
          : [{ key: 'option_1', label: { [locale]: optionLabel } }]
    };
  }
  return { ...common, type };
}

export type ServiceBehaviorEditorProps = {
  serviceId: string;
  value: ServiceBehavior | null | undefined;
  onSave?: (serviceId: string, behavior: ServiceBehavior) => Promise<void>;
  onSaved?: (behavior: ServiceBehavior) => void;
  disabled?: boolean;
};

export function ServiceBehaviorEditor({
  serviceId,
  value,
  onSave = updateServiceBehavior,
  onSaved,
  disabled = false
}: ServiceBehaviorEditorProps) {
  const t = useTranslations('experience.builder.task11');
  const locale = useLocale();
  const [behavior, setBehavior] = useState<ServiceBehavior>(() =>
    cloneBehavior(value ?? null)
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setBehavior(cloneBehavior(value ?? null));
    setErrors({});
    setSaving(false);
  }, [serviceId, value]);

  const activeInformation = behavior.information?.body[locale] ?? '';
  const canEdit = !disabled && !saving;
  const fieldLimitReached = behavior.fields.length >= MAX_FIELDS;

  const setInformation = (text: string) => {
    setBehavior((current) => {
      const body = setLocalizedValue(
        current.information?.body ?? {},
        locale,
        text
      );
      if (Object.keys(body).length === 0) {
        const next = { ...current };
        delete next.information;
        return next;
      }
      return {
        ...current,
        information: { ...current.information, body }
      };
    });
  };

  const updateField = (
    index: number,
    update: (field: BehaviorField) => BehaviorField
  ) => {
    setBehavior((current) => ({
      ...current,
      fields: current.fields.map((field, fieldIndex) =>
        fieldIndex === index ? update(field) : field
      )
    }));
  };

  const addField = () => {
    if (fieldLimitReached) return;
    setBehavior((current) => {
      if (current.fields.length >= MAX_FIELDS) return current;
      return {
        ...current,
        fields: [
          ...current.fields,
          {
            key: nextStableKey('field', current.fields),
            label: {
              [locale]: t('service.fieldDefault', { default: 'Field' })
            },
            type: 'text',
            required: false
          }
        ]
      };
    });
  };

  const save = async () => {
    const parsed = ServiceBehaviorSchema.safeParse(behavior);
    if (!parsed.success) {
      const invalidValue = t('service.invalidValue', {
        default: 'Check this value.'
      });
      setErrors(
        localValidationErrors(
          parsed.error.issues as ValidationIssue[],
          invalidValue
        )
      );
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await onSave(serviceId, parsed.data);
      setBehavior(parsed.data);
      onSaved?.(parsed.data);
    } catch (error) {
      setErrors(
        errorMessages(
          error,
          t('service.saveFailed', {
            default: 'Could not save service behavior. Try again.'
          })
        )
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      className='mt-4 space-y-4 border-t pt-4'
      aria-label={t('service.title', { default: 'Service behavior' })}
    >
      <div>
        <h3 className='text-sm font-semibold'>
          {t('service.title', { default: 'Service behavior' })}
        </h3>
        <p className='text-muted-foreground mt-1 text-xs'>
          {t('service.description', {
            default:
              'Configure service information, requested fields, access policy and route separately from visitor identification.'
          })}
        </p>
      </div>

      <div className='bg-muted text-muted-foreground rounded-md p-3 text-xs'>
        {t('service.identificationReadOnly', {
          default:
            'Badge, employee login, phone, document and other identification settings stay in the existing service identification controls.'
        })}
      </div>

      <div className='space-y-2'>
        <Label htmlFor={`service-information-${serviceId}`}>
          {t('service.information', { default: 'Information' })}
        </Label>
        <Textarea
          id={`service-information-${serviceId}`}
          aria-label={t('service.information', { default: 'Information' })}
          aria-invalid={Boolean(errors.information)}
          value={activeInformation}
          disabled={!canEdit}
          maxLength={4000}
          onChange={(event) => setInformation(event.target.value)}
        />
        {errors.information ? (
          <p className='text-destructive text-xs'>{errors.information}</p>
        ) : null}
        {behavior.information ? (
          <Label className='min-h-11 rounded-md border px-3 text-xs'>
            <input
              type='checkbox'
              className='size-4'
              checked={behavior.information.requireAcknowledgement ?? false}
              disabled={!canEdit}
              onChange={(event) =>
                setBehavior((current) =>
                  current.information
                    ? {
                        ...current,
                        information: {
                          ...current.information,
                          requireAcknowledgement: event.target.checked
                        }
                      }
                    : current
                )
              }
            />
            {t('service.requireAcknowledgement', {
              default: 'Require acknowledgement before continuing'
            })}
          </Label>
        ) : null}
      </div>

      <fieldset className='space-y-3'>
        <legend className='text-sm font-medium'>
          {t('service.fields', { default: 'Requested fields' })}
        </legend>
        {behavior.fields.map((field, index) => {
          const keyError = fieldError(
            errors,
            `fields.${index}.key`,
            'fields.key'
          );
          const labelError = fieldError(
            errors,
            `fields.${index}.label`,
            'fields.label'
          );
          const fieldErrorMessage = fieldError(errors, `fields.${index}`);
          const keyId = `service-field-${serviceId}-${index}-key`;
          const labelId = `service-field-${serviceId}-${index}-label`;
          const typeId = `service-field-${serviceId}-${index}-type`;

          return (
            <div
              key={`${field.key}-${index}`}
              className='space-y-3 rounded-md border p-3'
            >
              <div className='grid gap-3 sm:grid-cols-2'>
                <div className='space-y-1'>
                  <Label className='text-xs' htmlFor={keyId}>
                    {t('service.fieldKey', { default: 'Key' })}
                  </Label>
                  <Input
                    id={keyId}
                    aria-label={t('service.fieldKey', { default: 'Key' })}
                    aria-invalid={Boolean(keyError)}
                    className='min-h-11'
                    value={field.key}
                    disabled={!canEdit}
                    onChange={(event) =>
                      updateField(index, (candidate) => ({
                        ...candidate,
                        key: event.target.value
                      }))
                    }
                  />
                  {keyError ? (
                    <p className='text-destructive text-xs'>{keyError}</p>
                  ) : null}
                </div>
                <div className='space-y-1'>
                  <Label className='text-xs' htmlFor={labelId}>
                    {t('service.fieldLabel', { default: 'Label' })}
                  </Label>
                  <Input
                    id={labelId}
                    aria-label={t('service.fieldLabel', { default: 'Label' })}
                    aria-invalid={Boolean(labelError)}
                    className='min-h-11'
                    value={field.label[locale] ?? ''}
                    disabled={!canEdit}
                    onChange={(event) =>
                      updateField(index, (candidate) => ({
                        ...candidate,
                        label: setLocalizedValue(
                          candidate.label,
                          locale,
                          event.target.value
                        )
                      }))
                    }
                  />
                  {labelError ? (
                    <p className='text-destructive text-xs'>{labelError}</p>
                  ) : null}
                </div>
                <div className='space-y-1'>
                  <Label className='text-xs' htmlFor={typeId}>
                    {t('service.fieldType', { default: 'Field type' })}
                  </Label>
                  <select
                    id={typeId}
                    aria-label={t('service.fieldType', {
                      default: 'Field type'
                    })}
                    className='border-input bg-background focus-visible:ring-ring h-11 w-full rounded-md border px-3 text-sm focus-visible:ring-2'
                    value={field.type}
                    disabled={!canEdit}
                    onChange={(event) =>
                      updateField(index, (candidate) =>
                        nextFieldForType(
                          candidate,
                          event.target.value as BehaviorFieldType,
                          locale,
                          t('service.optionDefault', { default: 'Option' })
                        )
                      )
                    }
                  >
                    <option value='text'>
                      {t('service.types.text', { default: 'Text' })}
                    </option>
                    <option value='number'>
                      {t('service.types.number', { default: 'Number' })}
                    </option>
                    <option value='phone'>
                      {t('service.types.phone', { default: 'Phone' })}
                    </option>
                    <option value='checkbox'>
                      {t('service.types.checkbox', { default: 'Checkbox' })}
                    </option>
                    <option value='select'>
                      {t('service.types.select', { default: 'Select' })}
                    </option>
                  </select>
                </div>
                <Label className='min-h-11 self-end rounded-md border px-3 text-xs'>
                  <input
                    type='checkbox'
                    className='size-4'
                    aria-label={t('service.required', { default: 'Required' })}
                    checked={field.required}
                    disabled={!canEdit}
                    onChange={(event) =>
                      updateField(index, (candidate) => ({
                        ...candidate,
                        required: event.target.checked
                      }))
                    }
                  />
                  {t('service.required', { default: 'Required' })}
                </Label>
              </div>

              {field.type === 'select' ? (
                <fieldset className='space-y-2 border-l pl-3'>
                  <legend className='text-xs font-medium'>
                    {t('service.options', { default: 'Options' })}
                  </legend>
                  {field.options.map((option, optionIndex) => {
                    const optionKeyId = `${keyId}-option-${optionIndex}-key`;
                    const optionLabelId = `${keyId}-option-${optionIndex}-label`;
                    const optionKeyError = fieldError(
                      errors,
                      `fields.${index}.options.${optionIndex}.key`
                    );
                    const optionLabelError = fieldError(
                      errors,
                      `fields.${index}.options.${optionIndex}.label`
                    );
                    return (
                      <div
                        key={`${option.key}-${optionIndex}`}
                        className='grid gap-2 sm:grid-cols-[1fr_1fr_auto]'
                      >
                        <div className='space-y-1'>
                          <Label className='text-xs' htmlFor={optionKeyId}>
                            {t('service.optionKey', { default: 'Option key' })}
                          </Label>
                          <Input
                            id={optionKeyId}
                            aria-label={t('service.optionKey', {
                              default: 'Option key'
                            })}
                            aria-invalid={Boolean(optionKeyError)}
                            className='min-h-11'
                            value={option.key}
                            disabled={!canEdit}
                            onChange={(event) =>
                              updateField(index, (candidate) =>
                                candidate.type === 'select'
                                  ? {
                                      ...candidate,
                                      options: candidate.options.map(
                                        (item, itemIndex) =>
                                          itemIndex === optionIndex
                                            ? {
                                                ...item,
                                                key: event.target.value
                                              }
                                            : item
                                      )
                                    }
                                  : candidate
                              )
                            }
                          />
                          {optionKeyError ? (
                            <p className='text-destructive text-xs'>
                              {optionKeyError}
                            </p>
                          ) : null}
                        </div>
                        <div className='space-y-1'>
                          <Label className='text-xs' htmlFor={optionLabelId}>
                            {t('service.optionLabel', {
                              default: 'Option label'
                            })}
                          </Label>
                          <Input
                            id={optionLabelId}
                            aria-label={t('service.optionLabel', {
                              default: 'Option label'
                            })}
                            aria-invalid={Boolean(optionLabelError)}
                            className='min-h-11'
                            value={option.label[locale] ?? ''}
                            disabled={!canEdit}
                            onChange={(event) =>
                              updateField(index, (candidate) =>
                                candidate.type === 'select'
                                  ? {
                                      ...candidate,
                                      options: candidate.options.map(
                                        (item, itemIndex) =>
                                          itemIndex === optionIndex
                                            ? {
                                                ...item,
                                                label: setLocalizedValue(
                                                  item.label,
                                                  locale,
                                                  event.target.value
                                                )
                                              }
                                            : item
                                      )
                                    }
                                  : candidate
                              )
                            }
                          />
                          {optionLabelError ? (
                            <p className='text-destructive text-xs'>
                              {optionLabelError}
                            </p>
                          ) : null}
                        </div>
                        <Button
                          type='button'
                          variant='ghost'
                          className='text-destructive min-h-11 self-end'
                          disabled={!canEdit || field.options.length <= 1}
                          aria-label={t('service.removeOption', {
                            default: 'Remove option'
                          })}
                          onClick={() =>
                            updateField(index, (candidate) =>
                              candidate.type === 'select'
                                ? {
                                    ...candidate,
                                    options: candidate.options.filter(
                                      (_, itemIndex) =>
                                        itemIndex !== optionIndex
                                    )
                                  }
                                : candidate
                            )
                          }
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      </div>
                    );
                  })}
                  <Button
                    type='button'
                    variant='outline'
                    className='min-h-11'
                    disabled={!canEdit || field.options.length >= MAX_OPTIONS}
                    onClick={() =>
                      updateField(index, (candidate) => {
                        if (
                          candidate.type !== 'select' ||
                          candidate.options.length >= MAX_OPTIONS
                        ) {
                          return candidate;
                        }
                        return {
                          ...candidate,
                          options: [
                            ...candidate.options,
                            {
                              key: nextStableKey('option', candidate.options),
                              label: {
                                [locale]: t('service.optionDefault', {
                                  default: 'Option'
                                })
                              }
                            }
                          ]
                        };
                      })
                    }
                  >
                    <Plus aria-hidden />
                    {t('service.addOption', { default: 'Add option' })}
                  </Button>
                </fieldset>
              ) : null}

              {fieldErrorMessage ? (
                <p className='text-destructive text-xs'>{fieldErrorMessage}</p>
              ) : null}
              <Button
                type='button'
                variant='ghost'
                className='text-destructive min-h-11'
                disabled={!canEdit}
                aria-label={t('service.removeField', {
                  default: 'Remove field'
                })}
                onClick={() =>
                  setBehavior((current) => ({
                    ...current,
                    fields: current.fields.filter(
                      (_, fieldIndex) => fieldIndex !== index
                    )
                  }))
                }
              >
                <Trash2 aria-hidden />
                {t('service.removeField', { default: 'Remove field' })}
              </Button>
            </div>
          );
        })}
        <Button
          type='button'
          variant='outline'
          className='min-h-11'
          disabled={!canEdit || fieldLimitReached}
          onClick={addField}
        >
          <Plus aria-hidden />
          {t('service.addField', { default: 'Add field' })}
        </Button>
      </fieldset>

      {behavior.fields.length > 0 ? (
        <div className='space-y-2'>
          <Label htmlFor={`service-retention-${serviceId}`}>
            {t('service.retention', { default: 'Retention days' })}
          </Label>
          <Input
            id={`service-retention-${serviceId}`}
            aria-label={t('service.retention', { default: 'Retention days' })}
            aria-invalid={Boolean(errors.dataRetentionDays)}
            className='min-h-11'
            type='number'
            min='1'
            max='30'
            value={behavior.dataRetentionDays ?? ''}
            disabled={!canEdit}
            onChange={(event) => {
              const next = Number(event.target.value);
              setBehavior((current) => ({
                ...current,
                dataRetentionDays:
                  Number.isInteger(next) && next >= 1 && next <= 30
                    ? next
                    : undefined
              }));
            }}
          />
          {errors.dataRetentionDays ? (
            <p className='text-destructive text-xs'>
              {errors.dataRetentionDays}
            </p>
          ) : (
            <p className='text-muted-foreground text-xs'>
              {t('service.retentionHint', {
                default:
                  'Fields are retained under the configured service data policy.'
              })}
            </p>
          )}
        </div>
      ) : null}

      <fieldset className='space-y-2'>
        <legend className='text-sm font-medium'>
          {t('service.route', { default: 'Route mode' })}
        </legend>
        <select
          aria-label={t('service.route', { default: 'Route mode' })}
          className='border-input bg-background focus-visible:ring-ring h-11 w-full rounded-md border px-2 text-sm focus-visible:ring-2'
          disabled={!canEdit}
          value={
            behavior.route?.mode === 'page-slot' ? behavior.route.slot : 'auto'
          }
          onChange={(event) =>
            setBehavior((current) => ({
              ...current,
              route:
                event.target.value === 'auto'
                  ? { mode: 'auto' }
                  : {
                      mode: 'page-slot',
                      slot: event.target.value as
                        | 'service-info'
                        | 'service-form'
                        | 'identity'
                        | 'confirmation'
                    }
            }))
          }
        >
          <option value='auto'>
            {t('service.autoRoute', { default: 'Automatic route' })}
          </option>
          <option value='service-info'>
            {t('service.infoRoute', { default: 'Information page' })}
          </option>
          <option value='service-form'>
            {t('service.formRoute', { default: 'Form page' })}
          </option>
          <option value='identity'>
            {t('service.identityRoute', { default: 'Identity page' })}
          </option>
          <option value='confirmation'>
            {t('service.confirmationRoute', { default: 'Confirmation page' })}
          </option>
        </select>
      </fieldset>

      <div className='space-y-2'>
        <h4 className='text-sm font-medium'>
          {t('service.access', { default: 'Access policy' })}
        </h4>
        <ConditionBuilder
          value={behavior.access}
          disabled={!canEdit}
          semanticBounds={SERVICE_BEHAVIOR_CONDITION_BOUNDS}
          onChange={(access) =>
            setBehavior((current) => {
              const next = { ...current };
              if (access === undefined) delete next.access;
              else next.access = access;
              return next;
            })
          }
        />
        {fieldError(errors, 'access.when', 'access') ? (
          <p className='text-destructive text-xs'>
            {fieldError(errors, 'access.when', 'access')}
          </p>
        ) : null}
      </div>

      {errors.form ? (
        <p role='alert' className='text-destructive text-sm'>
          {errors.form}
        </p>
      ) : null}
      <div className='flex justify-end'>
        <Button
          type='button'
          className='min-h-11'
          disabled={!canEdit}
          onClick={() => void save()}
        >
          {saving
            ? t('service.saving', { default: 'Saving…' })
            : t('service.save', { default: 'Save behavior' })}
        </Button>
      </div>
    </section>
  );
}
