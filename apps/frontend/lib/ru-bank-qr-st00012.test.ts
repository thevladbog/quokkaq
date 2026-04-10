import { describe, expect, it } from 'vitest';
import { buildRuBankQrSt00012Payload } from './ru-bank-qr-st00012';

function decodeQrUtf8Binary(s: string): string {
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    bytes[i] = s.charCodeAt(i) & 0xff;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

describe('buildRuBankQrSt00012Payload', () => {
  it('returns null when sumKopecks is not a positive safe integer', () => {
    const base = {
      name: 'ООО Тест',
      personalAcc: '40702810100000000001',
      bankName: 'Тестбанк',
      bic: '044525225',
      correspondentAccount: '30101810100000000593',
      purpose: 'Оплата',
      payeeInn: '7707083893',
      kpp: '770701001'
    };
    expect(
      buildRuBankQrSt00012Payload({ ...base, sumKopecks: 100.5 })
    ).toBeNull();
    expect(
      buildRuBankQrSt00012Payload({ ...base, sumKopecks: NaN })
    ).toBeNull();
    expect(buildRuBankQrSt00012Payload({ ...base, sumKopecks: 0 })).toBeNull();
    expect(
      buildRuBankQrSt00012Payload({ ...base, sumKopecks: -100 })
    ).toBeNull();
    expect(
      buildRuBankQrSt00012Payload({
        ...base,
        sumKopecks: Number.MAX_SAFE_INTEGER + 1
      })
    ).toBeNull();
    expect(
      buildRuBankQrSt00012Payload({ ...base, sumKopecks: Infinity })
    ).toBeNull();
  });

  it('returns null for invalid account', () => {
    expect(
      buildRuBankQrSt00012Payload({
        name: 'ООО Тест',
        personalAcc: '123',
        bankName: 'Банк',
        bic: '044525225',
        correspondentAccount: '30101810100000000593',
        sumKopecks: 100,
        purpose: 'Оплата',
        payeeInn: '7707083893',
        kpp: '770701001'
      })
    ).toBeNull();
  });

  it('builds UTF-8 binary payload with readable Name and Purpose after decode', () => {
    const s = buildRuBankQrSt00012Payload({
      name: 'ООО Тест',
      personalAcc: '40702810100000000001',
      bankName: 'Тестбанк',
      bic: '044525225',
      correspondentAccount: '30101810100000000593',
      sumKopecks: 940500,
      purpose: 'Оплата по счёту 1',
      payeeInn: '7707083893',
      kpp: '770701001'
    });
    expect(s).toBeTruthy();
    const decoded = decodeQrUtf8Binary(s!);
    expect(decoded).toMatch(/^ST00012\|/);
    expect(decoded).toMatch(/\|CRC=[0-9A-F]{4}$/);
    expect(decoded).toContain('Sum=940500');
    expect(decoded).toContain('PayeeINN=7707083893');
    expect(decoded).toContain('KPP=770701001');
    expect(decoded).toContain('Name=ООО Тест');
    expect(decoded).toContain('Purpose=Оплата по счёту 1');
  });
});
