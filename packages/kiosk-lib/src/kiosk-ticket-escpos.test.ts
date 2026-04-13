import { describe, expect, it } from 'vitest';
import { buildKioskTicketEscPos } from './kiosk-ticket-escpos';
import type { Ticket } from '@quokkaq/shared-types';

function findSubarray(haystack: Uint8Array, needle: number[]): number {
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        continue outer;
      }
    }
    return i;
  }
  return -1;
}

const sampleTicket = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  queueNumber: '42',
  unitId: 'unit-1',
  serviceId: 'svc-1',
  status: 'waiting'
} satisfies Ticket;

describe('buildKioskTicketEscPos', () => {
  it('starts with ESC @, ESC t 46 (WPC1251), then centered blank line (ESC a 1, LF)', async () => {
    const bytes = await buildKioskTicketEscPos({
      kiosk: {},
      ticket: sampleTicket,
      serviceLabel: 'Service',
      ticketPageUrl:
        'https://app.example/en/ticket/550e8400-e29b-41d4-a716-446655440000',
      unitDisplayTitle: ''
    });
    expect(bytes[0]).toBe(0x1b);
    expect(bytes[1]).toBe(0x40);
    expect(bytes[2]).toBe(0x1b);
    expect(bytes[3]).toBe(0x74);
    expect(bytes[4]).toBe(0x2e);
    expect(bytes[5]).toBe(0x1b);
    expect(bytes[6]).toBe(0x61);
    expect(bytes[7]).toBe(0x01);
    expect(bytes[8]).toBe(0x0a);
  });

  it('ends with partial cut GS V NUL', async () => {
    const bytes = await buildKioskTicketEscPos({
      kiosk: {},
      ticket: sampleTicket,
      serviceLabel: 'S',
      ticketPageUrl: 'https://x/y',
      unitDisplayTitle: ''
    });
    expect(bytes[bytes.length - 3]).toBe(0x1d);
    expect(bytes[bytes.length - 2]).toBe(0x56);
    expect(bytes[bytes.length - 1]).toBe(0x00);
  });

  it('embeds Epson-style QR Model 2 preamble (GS ( k)', async () => {
    const url = 'https://ex.com/t/1';
    const bytes = await buildKioskTicketEscPos({
      kiosk: {},
      ticket: sampleTicket,
      serviceLabel: 'Lab',
      ticketPageUrl: url,
      unitDisplayTitle: ''
    });
    const model2 = [0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00];
    expect(findSubarray(bytes, model2)).toBeGreaterThanOrEqual(0);
  });

  it('embeds ticket page URL inside QR store-data (not as plain printed lines)', async () => {
    const url = 'https://app.example/ru/ticket/abc';
    const bytes = await buildKioskTicketEscPos({
      kiosk: {},
      ticket: sampleTicket,
      serviceLabel: 'S',
      ticketPageUrl: url,
      unitDisplayTitle: ''
    });
    const urlBytes = new TextEncoder().encode(url);
    const storePrefix = [
      0x1d,
      0x28,
      0x6b,
      (urlBytes.length + 3) & 0xff,
      ((urlBytes.length + 3) >> 8) & 0xff,
      0x31,
      0x50,
      0x30
    ];
    const at = findSubarray(bytes, storePrefix);
    expect(at).toBeGreaterThanOrEqual(0);
    for (let j = 0; j < urlBytes.length; j++) {
      expect(bytes[at + storePrefix.length + j]).toBe(urlBytes[j]);
    }
    const asLatin = new TextDecoder('latin1').decode(bytes);
    expect(asLatin).not.toContain('Link / URL');
    expect(asLatin).not.toContain(`ID: ${sampleTicket.id}`);
  });

  it('substitutes {{ticketId}} in feedbackUrl', async () => {
    const bytes = await buildKioskTicketEscPos({
      kiosk: { feedbackUrl: 'https://poll.example/r/{{ticketId}}/done' },
      ticket: sampleTicket,
      serviceLabel: 'S',
      ticketPageUrl: 'https://x',
      unitDisplayTitle: ''
    });
    const asLatin = new TextDecoder('latin1').decode(bytes);
    expect(asLatin).toContain('poll.example/r/');
    expect(asLatin).toContain('550e8400-e29b-41d4-');
    expect(asLatin).toContain('a716-446655440000/done');
    expect(asLatin).not.toContain('{{ticketId}}');
  });

  it('omits header text when showHeader is false', async () => {
    const secret = 'SECRET_HEADER_XYZ';
    const bytes = await buildKioskTicketEscPos({
      kiosk: { showHeader: false, headerText: secret },
      ticket: sampleTicket,
      serviceLabel: 'S',
      ticketPageUrl: 'https://x',
      unitDisplayTitle: ''
    });
    const asLatin = new TextDecoder('latin1').decode(bytes);
    expect(asLatin).not.toContain(secret);
  });

  it('includes header when showHeader is true', async () => {
    const hdr = 'Welcome';
    const bytes = await buildKioskTicketEscPos({
      kiosk: { showHeader: true, headerText: hdr },
      ticket: sampleTicket,
      serviceLabel: 'S',
      ticketPageUrl: 'https://x',
      unitDisplayTitle: ''
    });
    const asLatin = new TextDecoder('latin1').decode(bytes);
    expect(asLatin).toContain(hdr);
  });
});
