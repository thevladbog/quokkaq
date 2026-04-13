import { describe, expect, it } from 'vitest';
import { buildEscPosReceipt, ticketReceiptLines } from './kiosk-print';
import type { Ticket } from '@quokkaq/shared-types';

describe('buildEscPosReceipt', () => {
  it('initializes printer and ends with partial cut', () => {
    const bytes = buildEscPosReceipt(['Hi']);
    expect(bytes[0]).toBe(0x1b);
    expect(bytes[1]).toBe(0x40);
    expect(bytes[bytes.length - 3]).toBe(0x1d);
    expect(bytes[bytes.length - 2]).toBe(0x56);
    expect(bytes[bytes.length - 1]).toBe(0x00);
  });

  it('writes UTF-8 lines with LF', () => {
    const bytes = buildEscPosReceipt(['a']);
    const text = new TextDecoder('utf-8').decode(bytes.subarray(2));
    expect(text.startsWith('a\n')).toBe(true);
  });
});

describe('ticketReceiptLines', () => {
  const ticket = {
    id: 'tid-1',
    queueNumber: '7',
    unitId: 'u',
    serviceId: 's',
    status: 'waiting'
  } satisfies Ticket;

  it('includes service, queue number and id', () => {
    const lines = ticketReceiptLines(ticket, 'Counter', undefined);
    expect(lines).toContain('Counter');
    expect(lines).toContain('#7');
    expect(lines).toContain('tid-1');
  });

  it('prepends unit name when provided', () => {
    const lines = ticketReceiptLines(ticket, 'S', 'Branch');
    expect(lines[0]).toBe('Branch');
  });
});
