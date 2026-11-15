import { describe, expect, it } from 'vitest';
import { computeInvoice, documentNumber, dueDate, round2, vsFromNumber, type InvoiceLine } from '../src/billing/invoice';

const line = (unitPrice: number, vatRate: InvoiceLine['vatRate'] = 21, quantity = 1): InvoiceLine => ({ text: 'Položka', quantity, unit: 'ks', unitPrice, vatRate });

describe('faktury: výpočet částek a DPH', () => {
  it('plátce, ceny bez DPH: rekapitulace podle sazby (návrh dokladu DP-2026-000045)', () => {
    const t = computeInvoice({ vatPayer: true, pricesIncludeVat: false, lines: [line(13900), line(9900)] });
    expect(t.recap).toEqual([{ rate: 21, base: 23800, vat: 4998, total: 28798 }]);
    expect(t.lines).toEqual([
      { base: 13900, vat: 2919, total: 16819 },
      { base: 9900, vat: 2079, total: 11979 },
    ]);
    expect([t.base, t.vat, t.total]).toEqual([23800, 4998, 28798]);
  });

  it('plátce, ceny s DPH: daň shora (§ 37 odst. 2)', () => {
    const t = computeInvoice({ vatPayer: true, pricesIncludeVat: true, lines: [line(1210), line(112, 12)] });
    expect(t.recap).toEqual([
      { rate: 21, base: 1000, vat: 210, total: 1210 },
      { rate: 12, base: 100, vat: 12, total: 112 },
    ]);
    expect(t.total).toBe(1322);
  });

  it('daň se počítá z úhrnu základu za sazbu, ne sčítáním zaokrouhlených položek', () => {
    // 3 × 0,10 Kč: daň položek 0,02 + 0,02 + 0,02, z úhrnu 0,30 Kč jen 0,06
    const t = computeInvoice({ vatPayer: true, pricesIncludeVat: false, lines: [line(0.1), line(0.1), line(0.1)] });
    expect(t.recap[0]).toEqual({ rate: 21, base: 0.3, vat: 0.06, total: 0.36 });
  });

  it('opravný doklad: záporné částky se zaokrouhlují symetricky', () => {
    const t = computeInvoice({ vatPayer: true, pricesIncludeVat: false, lines: [line(-6416.67)] });
    expect(t.recap).toEqual([{ rate: 21, base: -6416.67, vat: -1347.5, total: -7764.17 }]);
    expect(round2(-2.345)).toBe(-2.35);
    expect(round2(1.005)).toBe(1.01);
    expect(round2(-0.004)).toBe(0);
  });

  it('neplátce: bez DPH a bez rekapitulace', () => {
    const t = computeInvoice({ vatPayer: false, pricesIncludeVat: false, lines: [line(3950, null), line(645, null, 2)] });
    expect(t.recap).toEqual([]);
    expect([t.base, t.vat, t.total]).toEqual([5240, 0, 5240]);
  });

  it('číslo dokladu, variabilní symbol a splatnost', () => {
    expect(documentNumber('payment_request', 2026, 123)).toBe('VP-2026-000123');
    expect(documentNumber('payment_receipt', 2026, 45)).toBe('DP-2026-000045');
    expect(documentNumber('correction', 2027, 1)).toBe('OD-2027-000001');
    // výzva i navazující doklad k platbě mají týž variabilní symbol (z čísla výzvy)
    expect(vsFromNumber('VP-2026-000123')).toBe('2026000123');
    expect(dueDate('2026-12-01')).toBe('2026-12-15');
    expect(dueDate('2026-12-25', 14)).toBe('2027-01-08');
  });
});
