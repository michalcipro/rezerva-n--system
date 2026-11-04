/**
 * Pomocné výpočty obrazovky Vstupy a platby (čisté funkce, bez Reactu).
 *
 * - období: tento / minulý / příští týden, měsíc, vlastní rozsah (`to` vždy exkluzivně);
 *   na rozdíl od statistik bere celé období včetně budoucích dní, protože přehled ukazuje
 *   i plánované vstupy („zda to bude z permanentky“)
 * - souhrny řádků pro KPI dlaždice (stavy, čekající QR, částka k úhradě)
 */
import type { LocalDate } from '../../domain/types';
import { MONTH_GENITIVE, NBSP, formatMonthYear } from '../../engine/format';
import type { VisitKind, VisitRow, VisitStatus, VisitSummary } from '../../engine/visits';
import { addDays, addMonths, daysBetween, isValidLocalDate, startOfMonth, startOfWeek } from '../../engine/time';

/* ------------------------------------------------------------------ */
/* Období                                                              */
/* ------------------------------------------------------------------ */

export type PeriodUnit = 'week' | 'month' | 'custom';
export type PresetId = 'week' | 'month' | 'lastMonth' | 'custom';

export interface PeriodState {
  unit: PeriodUnit;
  /** 0 = tento týden / měsíc, −1 = předchozí, +1 = následující … */
  offset: number;
  customFrom: LocalDate;
  /** Poslední den vlastního období (včetně). */
  customTo: LocalDate;
}

export interface ResolvedPeriod {
  from: LocalDate;
  /** Exkluzivně (den po posledním dni období). */
  to: LocalDate;
  /**
   * Popisek mezi šipkami: týden přesným datem („2.–8. listopadu 2026“ – název předvolby je už
   * v přepínači), měsíc názvem („Listopad 2026“), vlastní období krátce („1. 9. – 30. 11.“).
   */
  navLabel: string;
  /** Přesné datum („2.–8. listopadu 2026“). */
  rangeText: string;
}

export const PERIOD_PRESETS: { value: PresetId; label: string }[] = [
  { value: 'week', label: 'Tento týden' },
  { value: 'month', label: 'Tento měsíc' },
  { value: 'lastMonth', label: 'Minulý měsíc' },
  { value: 'custom', label: 'Vlastní' },
];

/** Nejdelší vlastní období (dny). */
export const MAX_CUSTOM_DAYS = 366;

const ymd = (date: LocalDate): [number, number, number] => [Number(date.slice(0, 4)), Number(date.slice(5, 7)), Number(date.slice(8, 10))];

/** „2.–8. listopadu 2026“, „26. 10. – 1. 11. 2026“, „4. listopadu 2026“. */
export function formatRange(from: LocalDate, toExclusive: LocalDate): string {
  const last = addDays(toExclusive, -1);
  const [y1, m1, d1] = ymd(from);
  const [y2, m2, d2] = ymd(last);
  if (from >= last) return `${d1}.${NBSP}${MONTH_GENITIVE[m1 - 1]} ${y1}`;
  if (y1 === y2 && m1 === m2) return `${d1}.–${d2}.${NBSP}${MONTH_GENITIVE[m1 - 1]} ${y1}`;
  if (y1 === y2) return `${d1}.${NBSP}${m1}.${NBSP}– ${d2}.${NBSP}${m2}.${NBSP}${y1}`;
  return `${d1}.${NBSP}${m1}.${NBSP}${y1} – ${d2}.${NBSP}${m2}.${NBSP}${y2}`;
}

/** Bez roku: „9.–15. 11.“, „26. 10. – 1. 11.“. */
export function formatRangeShort(from: LocalDate, toExclusive: LocalDate): string {
  const last = addDays(toExclusive, -1);
  const [, m1, d1] = ymd(from);
  const [, m2, d2] = ymd(last);
  if (from >= last) return `${d1}.${NBSP}${m1}.`;
  if (m1 === m2) return `${d1}.–${d2}.${NBSP}${m1}.`;
  return `${d1}.${NBSP}${m1}.${NBSP}– ${d2}.${NBSP}${m2}.`;
}

export function defaultPeriod(today: LocalDate): PeriodState {
  const monday = startOfWeek(today);
  return { unit: 'week', offset: 0, customFrom: monday, customTo: addDays(monday, 6) };
}

export function presetOf(p: PeriodState): PresetId | '' {
  if (p.unit === 'custom') return 'custom';
  if (p.unit === 'week' && p.offset === 0) return 'week';
  if (p.unit === 'month' && p.offset === 0) return 'month';
  if (p.unit === 'month' && p.offset === -1) return 'lastMonth';
  return '';
}

/** Vlastní rozsah: prohodí obrácené meze a zkrátí příliš dlouhé období (od konce). */
export function clampCustom(from: LocalDate, to: LocalDate): { from: LocalDate; to: LocalDate } {
  let a = from;
  let b = to;
  if (b < a) [a, b] = [b, a];
  if (daysBetween(a, b) + 1 > MAX_CUSTOM_DAYS) a = addDays(b, -(MAX_CUSTOM_DAYS - 1));
  return { from: a, to: b };
}

export function applyPreset(p: PeriodState, id: PresetId, today: LocalDate): PeriodState {
  switch (id) {
    case 'week':
      return { ...p, unit: 'week', offset: 0 };
    case 'month':
      return { ...p, unit: 'month', offset: 0 };
    case 'lastMonth':
      return { ...p, unit: 'month', offset: -1 };
    case 'custom': {
      // vlastní rozsah začíná tím, co je právě vybrané
      if (p.unit === 'custom') return p;
      const r = resolvePeriod(p, today);
      return { ...p, unit: 'custom', offset: 0, customFrom: r.from, customTo: addDays(r.to, -1) };
    }
  }
}

/** Šipky v přepínači: o týden / měsíc, vlastní období o svou délku. Dopředu i dozadu (plánované vstupy). */
export function shiftPeriod(p: PeriodState, dir: -1 | 1): PeriodState {
  if (p.unit !== 'custom') return { ...p, offset: p.offset + dir };
  const c = clampCustom(p.customFrom, p.customTo);
  const len = daysBetween(c.from, c.to) + 1;
  return { ...p, customFrom: addDays(c.from, dir * len), customTo: addDays(c.to, dir * len) };
}

/** Nastaví vlastní rozsah z políček od–do (neplatné datum ignoruje). */
export function setCustomRange(p: PeriodState, from: string, to: string): PeriodState {
  if (!isValidLocalDate(from) || !isValidLocalDate(to)) return p;
  const c = clampCustom(from, to);
  return { ...p, unit: 'custom', offset: 0, customFrom: c.from, customTo: c.to };
}

export function resolvePeriod(p: PeriodState, today: LocalDate): ResolvedPeriod {
  switch (p.unit) {
    case 'week': {
      const from = addDays(startOfWeek(today), 7 * p.offset);
      const to = addDays(from, 7);
      const rangeText = formatRange(from, to);
      return { from, to, navLabel: rangeText, rangeText };
    }
    case 'month': {
      const from = addMonths(startOfMonth(today), p.offset);
      const to = addMonths(from, 1);
      return { from, to, navLabel: formatMonthYear(from), rangeText: formatRange(from, to) };
    }
    case 'custom': {
      const c = clampCustom(p.customFrom, p.customTo);
      const to = addDays(c.to, 1);
      return { from: c.from, to, navLabel: formatRangeShort(c.from, to), rangeText: formatRange(c.from, to) };
    }
  }
}

/** „vstupy-2026-11-02–2026-11-08.csv“ */
export function csvFileName(from: LocalDate, toExclusive: LocalDate): string {
  return `vstupy-${from}–${addDays(toExclusive, -1)}.csv`;
}

/* ------------------------------------------------------------------ */
/* Filtry                                                              */
/* ------------------------------------------------------------------ */

export type KindFilter = VisitKind | 'all';
export type StatusFilter = VisitStatus | 'all';

export const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Vše' },
  { value: 'planned', label: 'Plánované' },
  { value: 'done', label: 'Proběhlé' },
  { value: 'missed', label: 'Nedostavení a storna' },
];

/* ------------------------------------------------------------------ */
/* Souhrny pro dlaždice                                                */
/* ------------------------------------------------------------------ */

export interface RowStats {
  done: number;
  planned: number;
  missed: number;
  /** Vstupy čekající na připsání QR platby. */
  qrPending: number;
  /** Kč, které ještě nejsou zaplacené (nezaplaceno + čekající QR). */
  unpaidAmount: number;
}

export function rowStats(rows: readonly VisitRow[]): RowStats {
  const r: RowStats = { done: 0, planned: 0, missed: 0, qrPending: 0, unpaidAmount: 0 };
  for (const row of rows) {
    r[row.status]++;
    const st = row.info.payState;
    if (st === 'qr_pending') r.qrPending++;
    if (st === 'unpaid' || st === 'qr_pending') r.unpaidAmount += row.info.amount;
  }
  return r;
}

/** Předplacené náhrady (náhrada za termín z permanentky nebo zaplacený předem). */
export const prepaidMakeups = (s: VisitSummary): number => Math.max(0, s.prepaid - s.byKind.package - s.byKind.credit);

/** Podíl 0–1, nebo null, když není z čeho počítat. */
export const shareOf = (part: number, total: number): number | null => (total > 0 ? part / total : null);
