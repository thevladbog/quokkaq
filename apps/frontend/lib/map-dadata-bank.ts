import type { PaymentAccount } from '@quokkaq/shared-types';

type BankData = {
  bic?: string;
  correspondent_account?: string;
  swift?: string;
  name?: {
    payment?: string;
    full?: string | null;
    short?: string | null;
  };
};

type BankSuggestion = {
  value?: string;
  unrestricted_value?: string;
  data?: BankData;
};

function bankDataName(data: BankData | undefined): string {
  const n = data?.name;
  const payment = typeof n?.payment === 'string' ? n.payment.trim() : '';
  if (payment) return payment;
  const short = typeof n?.short === 'string' ? n.short.trim() : '';
  if (short) return short;
  const full = typeof n?.full === 'string' ? n.full.trim() : '';
  return full;
}

/** Human-readable line for a bank suggestion row. */
export function formatBankSuggestionLabel(suggestion: unknown): string {
  if (!suggestion || typeof suggestion !== 'object') return '';
  const s = suggestion as BankSuggestion;
  if (typeof s.value === 'string' && s.value.trim()) return s.value.trim();
  const d = s.data;
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
  const s = suggestion as BankSuggestion;
  const d = s.data;
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
