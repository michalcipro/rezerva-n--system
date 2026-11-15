import type { LocalDate } from '../domain/types';

/**
 * Faktury – společné jádro pro faktury platformy (licence) i doklady provozoven klientům:
 * položky, výpočet DPH (zákon č. 235/2004 Sb., § 37), rekapitulace podle sazeb, číslování.
 * Čisté funkce bez závislostí na prohlížeči i serveru.
 */

/** Sazby DPH platné v roce 2026 (základní a snížená); 0 = osvobozené plnění. */
export type VatRate = 21 | 12 | 0;
export const VAT_RATES: readonly VatRate[] = [21, 12, 0];

export interface InvoiceParty {
  /** Obchodní firma, nebo jméno a příjmení. */
  name: string;
  street: string;
  city: string;
  zip: string;
  ico: string;
  dic: string;
  /** Údaj o zápisu v obchodním nebo jiném veřejném rejstříku (§ 435 občanského zákoníku). */
  registryNote: string;
}

export interface InvoiceLine {
  text: string;
  /** Doplňující řádek (období předplatného, platnost permanentky…). */
  note?: string;
  quantity: number;
  /** Měrná jednotka (ks, rok, měsíc…). */
  unit: string;
  /**
   * Cena za jednotku. Plátce DPH: bez daně (výpočet zdola), nebo s daní, když `pricesIncludeVat`
   * (výpočet shora). Neplátce: konečná cena. Oprava snižující cenu má zápornou cenu.
   */
  unitPrice: number;
  /** Sazba DPH v procentech; u neplátce DPH null. */
  vatRate: VatRate | null;
}

export interface InvoiceAmounts {
  /** Dodavatel je plátce DPH – doklad je daňový doklad s rekapitulací DPH. */
  vatPayer: boolean;
  /** Ceny položek jsou včetně DPH (daň se počítá shora, § 37 odst. 2). */
  pricesIncludeVat: boolean;
  lines: InvoiceLine[];
}

export interface LineAmounts {
  base: number;
  vat: number;
  total: number;
}

export interface VatRecapRow {
  rate: VatRate;
  base: number;
  vat: number;
  total: number;
}

export interface InvoiceTotals {
  lines: LineAmounts[];
  /** Rekapitulace DPH podle sazeb (u neplátce prázdná). */
  recap: VatRecapRow[];
  base: number;
  vat: number;
  total: number;
}

/** Zaokrouhlení na haléře, symetricky (polovina od nuly) – i pro záporné částky opravných dokladů. */
export function round2(n: number): number {
  const abs = Math.abs(n);
  if (abs < 1e-9) return 0;
  const r = Number(Math.round(Number(`${abs}e2`)) + 'e-2');
  if (r === 0) return 0;
  return n < 0 ? -r : r;
}

/** Daň z částky bez daně (zdola) nebo z částky s daní (shora). */
function vatOf(amount: number, rate: VatRate, fromGross: boolean): number {
  if (rate === 0) return 0;
  return round2(fromGross ? (amount * rate) / (100 + rate) : (amount * rate) / 100);
}

/**
 * Částky dokladu. Daň se počítá z úhrnu základů za každou sazbu (rekapitulace); u položek je
 * orientační, proto se součet daní položek může od rekapitulace lišit o haléře.
 */
export function computeInvoice(doc: InvoiceAmounts): InvoiceTotals {
  const amounts = doc.lines.map((l) => round2(l.quantity * l.unitPrice));
  if (!doc.vatPayer) {
    const lines = amounts.map((a) => ({ base: a, vat: 0, total: a }));
    const total = round2(amounts.reduce((s, a) => s + a, 0));
    return { lines, recap: [], base: total, vat: 0, total };
  }
  const fromGross = doc.pricesIncludeVat;
  const lines = doc.lines.map((l, i) => {
    const rate = l.vatRate ?? 0;
    const vat = vatOf(amounts[i], rate, fromGross);
    return fromGross ? { base: round2(amounts[i] - vat), vat, total: amounts[i] } : { base: amounts[i], vat, total: round2(amounts[i] + vat) };
  });
  const byRate = new Map<VatRate, number>();
  doc.lines.forEach((l, i) => {
    const rate = l.vatRate ?? 0;
    byRate.set(rate, round2((byRate.get(rate) ?? 0) + amounts[i]));
  });
  const recap = VAT_RATES.filter((r) => byRate.has(r)).map((rate) => {
    const sum = byRate.get(rate) ?? 0;
    const vat = vatOf(sum, rate, fromGross);
    return fromGross ? { rate, base: round2(sum - vat), vat, total: sum } : { rate, base: sum, vat, total: round2(sum + vat) };
  });
  const base = round2(recap.reduce((s, r) => s + r.base, 0));
  const vat = round2(recap.reduce((s, r) => s + r.vat, 0));
  return { lines, recap, base, vat, total: round2(base + vat) };
}

/** Číslo dokladu v roční řadě: 2026-0042. */
export function invoiceNumber(year: number, seq: number): string {
  return `${year}-${String(seq).padStart(4, '0')}`;
}

/** Variabilní symbol z čísla dokladu (jen číslice, nejvýš 10): 2026-0042 → 20260042. */
export function vsFromNumber(number: string): string {
  return number.replace(/\D/g, '').slice(-10);
}

/** Datum splatnosti: den vystavení + počet dní (výchozí 14). */
export function dueDate(issuedOn: LocalDate, days = 14): LocalDate {
  const [y, m, d] = issuedOn.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}
