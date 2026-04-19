'use client';

import { useEffect, useState } from 'react';

import {
  postPublicLeadRequest,
  type HandlersPublicLeadRequestBody
} from '@/lib/api/generated/leads';
import type { AppLocale, HomeMessages } from '@/src/messages';

export type LeadRequestModalProps = {
  open: boolean;
  onClose: () => void;
  locale: AppLocale;
  source: string;
  planCode?: string;
  lead: HomeMessages['leadForm'];
};

export function LeadRequestModal({
  open,
  onClose,
  locale,
  source,
  planCode,
  lead
}: LeadRequestModalProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setSuccess(false);
      setError(false);
      setSubmitting(false);
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(false);
    const n = name.trim();
    const em = email.trim();
    if (!n || !em) {
      setError(true);
      return;
    }
    setSubmitting(true);
    try {
      const body: HandlersPublicLeadRequestBody = {
        name: n,
        email: em,
        company: company.trim(),
        message: message.trim(),
        source,
        locale,
        referrer:
          typeof window !== 'undefined'
            ? `${window.location.pathname}${window.location.search}`
            : '',
        planCode: planCode?.trim() ?? ''
      };
      const res = await postPublicLeadRequest(body);
      if (res.status === 201) {
        setSuccess(true);
        setName('');
        setEmail('');
        setCompany('');
        setMessage('');
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className='fixed inset-0 z-[100] flex items-center justify-center p-4'
      role='dialog'
      aria-modal='true'
      aria-labelledby='lead-modal-title'
    >
      <button
        type='button'
        className='absolute inset-0 bg-black/50 backdrop-blur-[2px]'
        aria-label='Close'
        onClick={onClose}
      />
      <div className='relative z-[101] w-full max-w-lg rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-elevated)] p-6 shadow-xl'>
        <h2
          id='lead-modal-title'
          className='font-display mb-2 text-xl font-semibold text-[color:var(--color-text)]'
        >
          {lead.title}
        </h2>
        <p className='mb-4 text-sm text-[color:var(--color-text-muted)]'>
          {lead.description}
        </p>
        {success ? (
          <div className='space-y-4'>
            <p className='text-sm text-[color:var(--color-text)]'>{lead.success}</p>
            <button
              type='button'
              className='focus-ring rounded-xl bg-[color:var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white'
              onClick={onClose}
            >
              {lead.close}
            </button>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className='space-y-4'>
            <div className='grid gap-2'>
              <label htmlFor='lead-name' className='text-sm font-medium text-[color:var(--color-text)]'>
                {lead.name}
              </label>
              <input
                id='lead-name'
                className='focus-ring w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm text-[color:var(--color-text)]'
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete='name'
                required
              />
            </div>
            <div className='grid gap-2'>
              <label htmlFor='lead-email' className='text-sm font-medium text-[color:var(--color-text)]'>
                {lead.email}
              </label>
              <input
                id='lead-email'
                type='email'
                className='focus-ring w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm text-[color:var(--color-text)]'
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete='email'
                required
              />
            </div>
            <div className='grid gap-2'>
              <label htmlFor='lead-company' className='text-sm font-medium text-[color:var(--color-text)]'>
                {lead.company}
              </label>
              <input
                id='lead-company'
                className='focus-ring w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm text-[color:var(--color-text)]'
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                autoComplete='organization'
              />
            </div>
            <div className='grid gap-2'>
              <label htmlFor='lead-message' className='text-sm font-medium text-[color:var(--color-text)]'>
                {lead.message}
              </label>
              <textarea
                id='lead-message'
                rows={4}
                className='focus-ring w-full resize-y rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm text-[color:var(--color-text)]'
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
            {error ? (
              <p className='text-sm text-red-600 dark:text-red-400' role='alert'>
                {lead.error}
              </p>
            ) : null}
            <div className='flex flex-wrap gap-3 pt-2'>
              <button
                type='submit'
                disabled={submitting}
                className='focus-ring min-h-11 rounded-xl bg-[color:var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60'
              >
                {submitting ? lead.submitting : lead.submit}
              </button>
              <button
                type='button'
                className='focus-ring text-sm font-medium text-[color:var(--color-text-muted)] underline-offset-4 hover:underline'
                onClick={onClose}
              >
                {lead.close}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
