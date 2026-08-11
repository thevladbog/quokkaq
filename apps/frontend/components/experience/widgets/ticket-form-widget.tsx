'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { ServiceBehavior } from '@quokkaq/shared-types';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

type FormValues = Record<string, unknown>;
type Field = ServiceBehavior['fields'][number];

function schemaFor(fields: readonly Field[]) {
  const shape: Record<string, z.ZodType> = {};
  for (const field of fields) {
    let validator: z.ZodType =
      field.type === 'checkbox' ? z.boolean() : z.string();
    if (field.type === 'phone')
      validator = z.string().regex(/^\+?[1-9]\d{6,14}$/, 'Phone is invalid');
    if (field.type === 'number')
      validator = z.string().regex(/^-?\d+(\.\d+)?$/, 'Number is invalid');
    if (field.type === 'select')
      validator = z.enum(
        field.options.map((option) => option.key) as [string, ...string[]]
      );
    if (field.required)
      validator =
        field.type === 'checkbox'
          ? z.literal(true, { error: 'Required' })
          : (validator as z.ZodString).min(1, 'Required');
    shape[field.key] = validator;
  }
  return z.object(shape);
}

function labelFor(field: Field, locale: string) {
  return (
    field.label[locale] ??
    field.label.en ??
    Object.values(field.label)[0] ??
    field.key
  );
}

export function TicketFormWidget({
  fields,
  locale,
  onSubmit
}: {
  fields: readonly Field[];
  locale: string;
  onSubmit: (value: { documentsData: { form: FormValues } }) => void;
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schemaFor(fields)),
    defaultValues: Object.fromEntries(
      fields.map((field) => [field.key, field.type === 'checkbox' ? false : ''])
    )
  });
  return (
    <form
      className='flex h-full min-h-0 flex-col gap-4 overflow-auto'
      onSubmit={form.handleSubmit((values) =>
        onSubmit({ documentsData: { form: values } })
      )}
    >
      {fields.map((field) => (
        <label key={field.key} className='grid gap-1 text-lg font-medium'>
          {labelFor(field, locale)}
          {field.type === 'select' ? (
            <select
              aria-label={labelFor(field, locale)}
              className='min-h-14 rounded-lg border px-3'
              {...form.register(field.key)}
            >
              <option value=''>Select</option>
              {field.options.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label[locale] ?? option.label.en ?? option.key}
                </option>
              ))}
            </select>
          ) : field.type === 'checkbox' ? (
            <input
              aria-label={labelFor(field, locale)}
              type='checkbox'
              className='size-7'
              {...form.register(field.key)}
            />
          ) : (
            <input
              aria-label={labelFor(field, locale)}
              type={field.type === 'number' ? 'text' : 'text'}
              className='min-h-14 rounded-lg border px-3'
              {...form.register(field.key)}
            />
          )}
          {form.formState.errors[field.key]?.message ? (
            <span className='text-destructive text-sm'>
              {String(form.formState.errors[field.key]?.message)}
            </span>
          ) : null}
        </label>
      ))}
      <button
        type='submit'
        className='bg-primary text-primary-foreground min-h-14 rounded-lg px-5 font-semibold'
      >
        Continue
      </button>
    </form>
  );
}
