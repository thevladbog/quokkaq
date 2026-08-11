'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { ServiceBehavior } from '@quokkaq/shared-types';
import { useForm } from 'react-hook-form';
import { useState } from 'react';
import { z } from 'zod';

type FormValues = Record<string, unknown>;
type Field = ServiceBehavior['fields'][number];

function normalizePhone(value: unknown) {
  if (typeof value !== 'string') return value;
  const compact = value.replace(/[\s().-]/g, '');
  if (compact.startsWith('8') && compact.length === 11)
    return `+7${compact.slice(1)}`;
  if (compact.startsWith('7') && compact.length === 11) return `+${compact}`;
  return compact;
}

function schemaFor(fields: readonly Field[]) {
  const shape: Record<string, z.ZodType> = {};
  for (const field of fields) {
    let validator: z.ZodType =
      field.type === 'checkbox' ? z.boolean() : z.string();
    if (field.type === 'phone')
      validator = z.preprocess(
        normalizePhone,
        z.string().regex(/^\+?[1-9]\d{6,14}$/, 'Phone is invalid')
      );
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
          : field.type === 'phone'
            ? z.preprocess(
                normalizePhone,
                z
                  .string()
                  .regex(/^\+?[1-9]\d{6,14}$/, 'Phone is invalid')
                  .min(1, 'Required')
              )
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
  const [page, setPage] = useState(0);
  const pageSize = 5;
  const pageCount = Math.max(1, Math.ceil(fields.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const pageFields = fields.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize
  );
  const form = useForm<FormValues>({
    resolver: zodResolver(schemaFor(fields)),
    defaultValues: Object.fromEntries(
      fields.map((field) => [field.key, field.type === 'checkbox' ? false : ''])
    )
  });
  return (
    <form
      className='flex h-full min-h-0 flex-col gap-4 overflow-hidden'
      onSubmit={form.handleSubmit((values) =>
        onSubmit({ documentsData: { form: values } })
      )}
    >
      <div className='min-h-0 flex-1 space-y-4 overflow-hidden'>
        {pageFields.map((field) => (
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
      </div>
      {pageCount > 1 ? (
        <nav
          className='flex shrink-0 items-center justify-between gap-3'
          aria-label='Form pages'
        >
          <button
            type='button'
            className='min-h-14 rounded-lg border px-5 font-semibold disabled:opacity-50'
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            Previous
          </button>
          <span aria-live='polite'>
            {currentPage + 1} / {pageCount}
          </span>
          {currentPage + 1 < pageCount ? (
            <button
              type='button'
              className='min-h-14 rounded-lg border px-5 font-semibold'
              onClick={() => setPage(currentPage + 1)}
            >
              Next
            </button>
          ) : (
            <span className='min-w-24' />
          )}
        </nav>
      ) : null}
      <button
        type='submit'
        disabled={currentPage + 1 < pageCount}
        className='bg-primary text-primary-foreground min-h-14 rounded-lg px-5 font-semibold'
      >
        Continue
      </button>
    </form>
  );
}
