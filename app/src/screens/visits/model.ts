import type { ClinicState, Id, LocalDate } from '../../domain/types';
import { formatMonthYear, MONTH_GENITIVE, NBSP } from '../../engine/format';
import { clientName, getClient, getService, getSession, getTherapist, STATUS_LABEL, therapistName } from '../../engine/selectors';
import { addDays, addMonths, daysBetween, isValidLocalDate, startOfMonth, startOfWeek, timeOf } from '../../engine/time';
import { VISIT_SOURCES, type EmployeeVisitSummary, type VisitFilters, type VisitRow, type VisitSource } from '../../engine/visits';

/**
 * Obrazovka „Vstupy“ – čisté pomocné funkce (období, uložené volby, export CSV).
 * Data počítá engine/visits.ts (visitsOverview); tady je jen to, co potřebuje obrazovka.
 */

/* ------------------------------------------------------------------ */
/* Období                                                              */
/* ------------------------------------------------------------------ */

export type PeriodPreset = 'week' | 'month' | 'lastMonth' | 'custom';

export interface PeriodState {
  unit: 'week' | 'month' | 'custom';
  /** 0 = aktuální týden/měsíc, −1 = předchozí, +1 = příští… */
  offset: number;
  customFrom: LocalDate;
  /** Včetně. */
  customTo: LocalDate;
}

export interface ResolvedPeriod {
  from: LocalDate;
  /** Exkluzivně (jako visitsOverview). */
  to: LocalDate;
  /** Popisek v přepínači období („Tento týden“, „Listopad 2026“). */
  navLabel: string;
  /** Přesné datum období („1.–30. listopadu 2026“). */
  rangeText: string;
}

export const MAX_CUSTOM_DAYS = 366;

const ymd = (date: LocalDate): [number, number, number] => [Number(date.slice(0, 4)), Number(date.slice(5, 7)), Number(date.slice(8, 10))];

/** „1.–30. listopadu 2026“, „26. 10. – 1. 11. 2026“, „4. listopadu 2026“, „28. 12. 2026 – 3. 1. 2027“. */
export function formatRangeText(from: LocalDate, toExclusive: LocalDate): string {
  const last = addDays(toExclusive, -1);
  const [y1, m1, d1] = ymd(from);
  const [y2, m2, d2] = ymd(last);
  if (from >= last) return `${d1}.${NBSP}${MONTH_GENITIVE[m1 - 1]} ${y1}`;
  if (y1 === y2 && m1 === m2) return `${d1}.–${d2}.${NBSP}${MONTH_GENITIVE[m1 - 1]} ${y1}`;
  if (y1 === y2) return `${d1}.${NBSP}${m1}.${NBSP}– ${d2}.${NBSP}${m2}.${NBSP}${y1}`;
  return `${d1}.${NBSP}${m1}.${NBSP}${y1} – ${d2}.${NBSP}${m2}.${NBSP}${y2}`;
}

export function defaultPeriod(today: LocalDate): PeriodState {
  return { unit: 'month', offset: 0, customFrom: startOfMonth(today), customTo: today };
}

export function presetOf(p: PeriodState): PeriodPreset | '' {
  if (p.unit === 'custom') return 'custom';
  if (p.unit === 'week' && p.offset === 0) return 'week';
  if (p.unit === 'month' && p.offset === 0) return 'month';
  if (p.unit === 'month' && p.offset === -1) return 'lastMonth';
  return '';
}

export function resolvePeriod(p: PeriodState, today: LocalDate): ResolvedPeriod {
  switch (p.unit) {
    case 'week': {
      const from = addDays(startOfWeek(today), 7 * p.offset);
      const to = addDays(from, 7);
      const navLabel =
        p.offset === 0 ? 'Tento týden' : p.offset === -1 ? 'Minulý týden' : p.offset === 1 ? 'Příští týden' : formatRangeText(from, to);
      return { from, to, navLabel, rangeText: formatRangeText(from, to) };
    }
    case 'month': {
      const from = addMonths(startOfMonth(today), p.offset);
      const to = addMonths(from, 1);
      return { from, to, navLabel: formatMonthYear(from), rangeText: formatRangeText(from, to) };
    }
    case 'custom':
    default: {
      const c = clampCustom(p.customFrom, p.customTo);
      const to = addDays(c.to, 1);
      return { from: c.from, to, navLabel: 'Vlastní období', rangeText: formatRangeText(c.from, to) };
    }
  }
}

export function applyPreset(p: PeriodState, id: PeriodPreset, today: LocalDate): PeriodState {
  switch (id) {
    case 'week':
      return { ...p, unit: 'week', offset: 0 };
    case 'month':
      return { ...p, unit: 'month', offset: 0 };
    case 'lastMonth':
      return { ...p, unit: 'month', offset: -1 };
    case 'custom': {
      // vlastní rozsah začíná tím, co je právě vybrané
      const r = resolvePeriod(p, today);
      return { ...p, unit: 'custom', offset: 0, customFrom: r.from, customTo: addDays(r.to, -1) };
    }
  }
}

/** Posun o jedno období (týden, měsíc, u vlastního o jeho délku). Vstupy jsou i v budoucnu (plánované). */
export function shiftPeriod(p: PeriodState, dir: -1 | 1): PeriodState {
  if (p.unit !== 'custom') return { ...p, offset: p.offset + dir };
  const c = clampCustom(p.customFrom, p.customTo);
  const len = daysBetween(c.from, c.to) + 1;
  return { ...p, customFrom: addDays(c.from, dir * len), customTo: addDays(c.to, dir * len) };
}

/** Prohodí obrácený rozsah a omezí délku na MAX_CUSTOM_DAYS (od konce). */
export function clampCustom(from: LocalDate, to: LocalDate): { from: LocalDate; to: LocalDate } {
  let a = from;
  let b = to;
  if (b < a) [a, b] = [b, a];
  if (daysBetween(a, b) + 1 > MAX_CUSTOM_DAYS) a = addDays(b, -(MAX_CUSTOM_DAYS - 1));
  return { from: a, to: b };
}

/* ------------------------------------------------------------------ */
/* Filtry a uložené volby (jen pohodlí v tomto prohlížeči)              */
/* ------------------------------------------------------------------ */

export type VisitStatusFilter = VisitFilters['status'];

export const STATUS_FILTER_OPTIONS: { value: VisitStatusFilter; label: string }[] = [
  { value: 'all', label: 'Všechny' },
  { value: 'done', label: 'Proběhlé a účtované' },
  { value: 'planned', label: 'Plánované' },
];

export interface VisitPrefs {
  period: PeriodState;
  /** '' = všichni zaměstnanci (filtruje seznam, souhrn ukazuje všechny). */
  therapistId: Id | '';
  serviceId: Id | '';
  /** Prázdné pole = všechny zdroje. */
  sources: VisitSource[];
  status: VisitStatusFilter;
}

export const PREFS_KEY = 'winningminds.visits.v1';

export function defaultPrefs(today: LocalDate): VisitPrefs {
  return { period: defaultPeriod(today), therapistId: '', serviceId: '', sources: [], status: 'all' };
}

/** Načte uložené volby; cokoli neplatného nahradí výchozí hodnotou. */
export function parsePrefs(raw: string | null, today: LocalDate): VisitPrefs {
  const base = defaultPrefs(today);
  if (!raw) return base;
  try {
    const v = JSON.parse(raw) as Partial<VisitPrefs> | null;
    if (!v || typeof v !== 'object') return base;
    const p = v.period;
    const period: PeriodState =
      p &&
      (p.unit === 'week' || p.unit === 'month' || p.unit === 'custom') &&
      typeof p.offset === 'number' &&
      Number.isFinite(p.offset) &&
      isValidLocalDate(p.customFrom) &&
      isValidLocalDate(p.customTo)
        ? { unit: p.unit, offset: Math.max(-120, Math.min(120, Math.round(p.offset))), customFrom: p.customFrom, customTo: p.customTo }
        : base.period;
    const sources = Array.isArray(v.sources) ? VISIT_SOURCES.filter((s) => (v.sources as unknown[]).includes(s)) : [];
    const status = STATUS_FILTER_OPTIONS.some((o) => o.value === v.status) ? (v.status as VisitStatusFilter) : 'all';
    return {
      period,
      therapistId: typeof v.therapistId === 'string' ? v.therapistId : '',
      serviceId: typeof v.serviceId === 'string' ? v.serviceId : '',
      sources,
      status,
    };
  } catch {
    return base;
  }
}

export function loadPrefs(today: LocalDate): VisitPrefs {
  try {
    return parsePrefs(localStorage.getItem(PREFS_KEY), today);
  } catch {
    return defaultPrefs(today);
  }
}

export function savePrefs(p: VisitPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* prohlížeč bez úložiště */
  }
}

/* ------------------------------------------------------------------ */
/* Popisky                                                             */
/* ------------------------------------------------------------------ */

/** Sloupce souhrnu po zaměstnancích (počty vstupů podle zdroje platby). */
export const SUMMARY_SOURCE_COLUMNS: { source: VisitSource; label: string }[] = [
  { source: 'package', label: 'Z permanentky' },
  { source: 'credit', label: 'Z kreditu' },
  { source: 'single', label: 'Jednorázově' },
  { source: 'qr_pending', label: 'Čeká na QR' },
  { source: 'unpaid', label: 'Nezaplaceno' },
  { source: 'makeup', label: 'Náhrady' },
  { source: 'free', label: 'Zdarma' },
];

/** Název lekce u skupinového termínu, jinak název služby. */
export function visitServiceTitle(s: ClinicState, row: VisitRow): { title: string; service: string; group: boolean } {
  const b = row.booking;
  const service = getService(s, b.serviceId)?.name ?? 'Služba';
  if (!b.sessionId) return { title: service, service, group: false };
  const session = getSession(s, b.sessionId);
  return { title: session?.title || service, service, group: true };
}

export function employeeName(s: ClinicState, therapistId: Id): string {
  const t = getTherapist(s, therapistId);
  return t ? therapistName(t) : 'Neznámý zaměstnanec';
}

/* ------------------------------------------------------------------ */
/* Export CSV                                                          */
/* ------------------------------------------------------------------ */

/** Hodnota buňky: středník, uvozovky a zalomení v uvozovkách; text začínající = + − @ dostane apostrof (ochrana tabulkového procesoru). */
export function csvCell(value: string | number): string {
  if (typeof value === 'number') return String(Math.round(value));
  let v = value.replace(/ /g, ' ').replace(/\r\n?/g, '\n');
  if (/^[=+\-@\t]/.test(v)) v = "'" + v;
  return /[;"\n]/.test(v) || v !== v.trim() ? '"' + v.replace(/"/g, '""') + '"' : v;
}

/** CSV se středníkem jako oddělovačem, řádky CRLF, na začátku BOM (Excel pak pozná UTF-8). */
export function toCsv(rows: (string | number)[][]): string {
  return '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
}

export const VISITS_CSV_HEADER = [
  'Datum',
  'Začátek',
  'Konec',
  'Klient',
  'E-mail klienta',
  'Služba',
  'Skupinová lekce',
  'Zaměstnanec',
  'Stav',
  'Zdroj platby',
  'Detail platby',
  'Předplaceno',
  'Částka (Kč)',
];

/** Seznam vstupů pro export (datum ve tvaru RRRR-MM-DD, aby ho tabulka poznala jako datum). */
export function visitsCsv(s: ClinicState, rows: readonly VisitRow[]): string {
  const out: (string | number)[][] = [VISITS_CSV_HEADER];
  for (const r of rows) {
    const b = r.booking;
    const c = getClient(s, b.clientId);
    const svc = visitServiceTitle(s, r);
    out.push([
      b.start.slice(0, 10),
      timeOf(b.start),
      timeOf(b.end),
      c ? clientName(c) : 'Neznámý klient',
      c?.email ?? '',
      svc.service,
      svc.group ? svc.title : '',
      employeeName(s, b.therapistId),
      STATUS_LABEL[b.status],
      r.info.label,
      r.info.detail,
      r.info.prepaid ? 'ano' : 'ne',
      r.info.amount,
    ]);
  }
  return toCsv(out);
}

export const SUMMARY_CSV_HEADER = [
  'Zaměstnanec',
  'Vstupy celkem',
  ...SUMMARY_SOURCE_COLUMNS.map((c) => c.label),
  'Předplacené vstupy',
  'Jednorázové vstupy',
  'Tržba jednorázově (Kč)',
  'Hodnota předplacených (Kč)',
];

/** Souhrn po zaměstnancích a řádek Celkem. */
export function summaryCsv(s: ClinicState, byEmployee: readonly EmployeeVisitSummary[], totals: EmployeeVisitSummary): string {
  const line = (name: string, x: EmployeeVisitSummary): (string | number)[] => [
    name,
    x.total,
    ...SUMMARY_SOURCE_COLUMNS.map((c) => x.bySource[c.source]),
    x.prepaidCount,
    x.singleCount,
    x.singleRevenue,
    x.prepaidValue,
  ];
  const out: (string | number)[][] = [SUMMARY_CSV_HEADER, ...byEmployee.map((x) => line(employeeName(s, x.therapistId), x))];
  if (byEmployee.length !== 1) out.push(line('Celkem', totals));
  return toCsv(out);
}

/** Jméno souboru bez diakritiky: „vstupy-2026-11-01-2026-11-30.csv“, se jménem zaměstnance „vstupy-mala-…“. */
export function csvFileName(kind: 'vstupy' | 'vstupy-souhrn', from: LocalDate, toExclusive: LocalDate, who?: string): string {
  const slug = (who ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return [kind, slug, from, addDays(toExclusive, -1)].filter(Boolean).join('-') + '.csv';
}
