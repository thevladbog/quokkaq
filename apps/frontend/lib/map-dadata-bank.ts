import type { PaymentAccount } from '@quokkaq/shared-types';
import { z } from 'zod';

/** Nested `data.name` from DaData `suggest/bank` (fields used by {@link bankDataName}). */
const dadataBankNameSchema = z
  .object({
    payment: z.string().optional(),
    full: z.string().nullable().optional(),
    short: z.string().nullable().optional()
  })
  .passthrough()
  .optional();

/** `data` object from DaData `suggest/bank` (BIC, k/c, SWIFT, bank name parts). */
const dadataBankDataSchema = z
  .object({
    bic: z.string().optional(),
    correspondent_account: z.string().optional(),
    swift: z.string().optional(),
    name: dadataBankNameSchema
  })
  .passthrough();

/** Top-level suggestion item from DaData `suggest/bank`. */
const dadataBankSuggestionSchema = z
  .object({
    value: z.string().optional(),
    unrestricted_value: z.string().optional(),
    data: z.union([dadataBankDataSchema, z.null()]).optional()
  })
  .passthrough();

export type DadataBankSuggestion = z.infer<typeof dadataBankSuggestionSchema>;

function bankDataName(
  data: z.infer<typeof dadataBankDataSchema> | undefined
): string {
  if (!data) return '';
  const n = data.name;
  const payment = typeof n?.payment === 'string' ? n.payment.trim() : '';
  if (payment) return payment;
  const short = typeof n?.short === 'string' ? n.short.trim() : '';
  if (short) return short;
  const full = typeof n?.full === 'string' ? n.full.trim() : '';
  return full;
}

function parseBankSuggestion(suggestion: unknown) {
  return dadataBankSuggestionSchema.safeParse(suggestion);
}

/** Human-readable line for a bank suggestion row. */
export function formatBankSuggestionLabel(suggestion: unknown): string {
  if (!suggestion || typeof suggestion !== 'object') return '';
  const parsed = parseBankSuggestion(suggestion);
  if (!parsed.success) return '';
  const s = parsed.data;
  if (typeof s.value === 'string' && s.value.trim()) return s.value.trim();
  const d = s.data === null ? undefined : s.data;
  const name = bankDataName(d);
  const bic = typeof d?.bic === 'string' ? d.bic.trim() : '';
  if (name && bic) return `${name} — ${bic}`;
  if (bic) return bic;
  if (typeof s.unrestricted_value === 'string' && s.unrestricted_value.trim()) {
    return s.unrestricted_value.trim();
  }
  return name || '';
}

/** Map a DaData `suggest/bank` suggestion into editable account fields. */
export function draftPaymentAccountFromBankSuggestion(
  suggestion: unknown
): Partial<PaymentAccount> {
  if (!suggestion || typeof suggestion !== 'object') return {};
  const parsed = parseBankSuggestion(suggestion);
  if (!parsed.success) return {};
  const s = parsed.data;
  const d = s.data === null ? undefined : s.data;
  const bankName = bankDataName(d);
  const bic = typeof d?.bic === 'string' ? d.bic.trim() : '';
  const correspondentAccount =
    typeof d?.correspondent_account === 'string'
      ? d.correspondent_account.trim()
      : '';
  const swift = typeof d?.swift === 'string' ? d.swift.trim() : '';
  return {
    ...(bankName ? { bankName } : {}),
    ...(bic ? { bic } : {}),
    ...(correspondentAccount ? { correspondentAccount } : {}),
    ...(swift ? { swift } : {})
  };
}
