/**
 * Výpočty pro Statistiky a Přehled, které engine nenabízí (čisté funkce nad ClinicState).
 *
 * - resolvePeriod: období (tento týden / měsíc do dneška, minulý měsíc, 90 dní, vlastní)
 *   a srovnatelné předchozí období stejné délky (1.–14. října ↔ 1.–14. září).
 * - capacityModel: obsazenost terapeutů a heatmapa. Skupinová lekce se počítá jednou
 *   (ne za každého účastníka) a filtr kategorie platí i pro heatmapu.
 * - dailySeries / bucketize: rezervace po dnech podle výsledku.
 * - trendSeries: storna a nedostavení za 6 měsíců jen z termínů, které už začaly.
 * - hourlyOccupancy: obsazenost jednoho dne po hodinách.
 * - daysText: průměrný počet dní česky (doba ve fázi spolupráce).
 */
import type { Booking, ClinicState, Id, LocalDate, LocalDateTime } from '../../domain/types';
import { workingIntervals } from '../../engine/availability';
import { MONTH_GENITIVE, MONTH_NOMINATIVE, NBSP, countLabel, formatMoney, formatMonthYear, formatNumber } from '../../engine/format';
import {
  bookingsOfTherapistOnDate,
  bookingsOnDate,
  getService,
  isOccupying,
  sessionParticipants,
  sessionsOnDate,
} from '../../engine/selectors';
import {
  addDays,
  addMonths,
  dateOf,
  daysBetween,
  eachDay,
  minutesOf,
  monthKey,
  startOfMonth,
  startOfWeek,
  weekdayOf,
} from '../../engine/time';
import type { KpiDelta } from '../../ui';

/* ------------------------------------------------------------------ */
/* Období                                                              */
/* ------------------------------------------------------------------ */

export interface StatsFilters {
  therapistId: Id | null;
  categoryId: Id | null;
}

/** Rozsah dní, `to` je exkluzivní. */
export interface DateRange {
  from: LocalDate;
  to: LocalDate;
}

export type PeriodUnit = 'week' | 'month' | 'd90' | 'custom';
export type PresetId = 'week' | 'month' | 'lastMonth' | 'd90' | 'custom';

export interface PeriodState {
  unit: PeriodUnit;
  /** 0 = aktuální období (do dneška), −1 = předchozí celé období … */
  offset: number;
  customFrom: LocalDate;
  /** Včetně. */
  customTo: LocalDate;
}

export interface ResolvedPeriod {
  range: DateRange;
  compare: DateRange;
  /** Popisek v přepínači období („Září 2026“, „Tento týden“). */
  navLabel: string;
  /** Přesné datum období („1.–14. října 2026“). */
  rangeText: string;
  /** Srovnávací období celým textem („srpen 2026“, „1.–14. září 2026“). */
  compareText: string;
  /** Krátký dovětek do dlaždic („vs. srpen“). */
  compareShort: string;
  /** Období ještě běží (končí dneškem). */
  toDate: boolean;
  canNext: boolean;
}

export const MAX_CUSTOM_DAYS = 366;

const ymd = (date: LocalDate): [number, number, number] => [Number(date.slice(0, 4)), Number(date.slice(5, 7)), Number(date.slice(8, 10))];

/** „1.–14. října 2026“, „28. 9. – 4. 10. 2026“, „14. října 2026“. */
export function formatRange(from: LocalDate, toExclusive: LocalDate): string {
  const last = addDays(toExclusive, -1);
  const [y1, m1, d1] = ymd(from);
  const [y2, m2, d2] = ymd(last);
  if (from >= last) return `${d1}.${NBSP}${MONTH_GENITIVE[m1 - 1]} ${y1}`;
  if (y1 === y2 && m1 === m2) return `${d1}.–${d2}.${NBSP}${MONTH_GENITIVE[m1 - 1]} ${y1}`;
  if (y1 === y2) return `${d1}.${NBSP}${m1}.${NBSP}– ${d2}.${NBSP}${m2}.${NBSP}${y1}`;
  return `${d1}.${NBSP}${m1}.${NBSP}${y1} – ${d2}.${NBSP}${m2}.${NBSP}${y2}`;
}

/** Bez roku: „1.–14. 9.“, „28. 9. – 4. 10.“. */
export function formatRangeShort(from: LocalDate, toExclusive: LocalDate): string {
  const last = addDays(toExclusive, -1);
  const [, m1, d1] = ymd(from);
  const [, m2, d2] = ymd(last);
  if (from >= last) return `${d1}.${NBSP}${m1}.`;
  if (m1 === m2) return `${d1}.–${d2}.${NBSP}${m1}.`;
  return `${d1}.${NBSP}${m1}.${NBSP}– ${d2}.${NBSP}${m2}.`;
}

export function presetOf(p: PeriodState): PresetId | '' {
  if (p.unit === 'custom') return 'custom';
  if (p.unit === 'week' && p.offset === 0) return 'week';
  if (p.unit === 'month' && p.offset === 0) return 'month';
  if (p.unit === 'month' && p.offset === -1) return 'lastMonth';
  if (p.unit === 'd90' && p.offset === 0) return 'd90';
  return '';
}

export function applyPreset(p: PeriodState, id: PresetId, today: LocalDate): PeriodState {
  switch (id) {
    case 'week':
      return { ...p, unit: 'week', offset: 0 };
    case 'month':
      return { ...p, unit: 'month', offset: 0 };
    case 'lastMonth':
      return { ...p, unit: 'month', offset: -1 };
    case 'd90':
      return { ...p, unit: 'd90', offset: 0 };
    case 'custom': {
      // vlastní rozsah začíná tím, co je právě vybrané
      const r = resolvePeriod(p, today).range;
      return { ...p, unit: 'custom', offset: 0, customFrom: r.from, customTo: addDays(r.to, -1) };
    }
  }
}

export function clampCustom(from: LocalDate, to: LocalDate): { from: LocalDate; to: LocalDate } {
  let a = from;
  let b = to;
  if (b < a) [a, b] = [b, a];
  if (daysBetween(a, b) + 1 > MAX_CUSTOM_DAYS) a = addDays(b, -(MAX_CUSTOM_DAYS - 1));
  return { from: a, to: b };
}

export function shiftPeriod(p: PeriodState, dir: -1 | 1): PeriodState {
  if (p.unit !== 'custom') return { ...p, offset: Math.min(0, p.offset + dir) };
  const len = daysBetween(p.customFrom, p.customTo) + 1;
  return { ...p, customFrom: addDays(p.customFrom, dir * len), customTo: addDays(p.customTo, dir * len) };
}

export function resolvePeriod(p: PeriodState, today: LocalDate): ResolvedPeriod {
  const tomorrow = addDays(today, 1);
  switch (p.unit) {
    case 'week': {
      const start = addDays(startOfWeek(today), 7 * p.offset);
      const prevStart = addDays(start, -7);
      if (p.offset >= 0) {
        const elapsed = daysBetween(start, tomorrow);
        const prevTo = addDays(prevStart, elapsed);
        return {
          range: { from: start, to: tomorrow },
          compare: { from: prevStart, to: prevTo },
          navLabel: 'Tento týden',
          rangeText: formatRange(start, tomorrow),
          compareText: formatRange(prevStart, prevTo),
          compareShort: 'vs. minulý týden',
          toDate: true,
          canNext: false,
        };
      }
      const end = addDays(start, 7);
      return {
        range: { from: start, to: end },
        compare: { from: prevStart, to: start },
        navLabel: p.offset === -1 ? 'Minulý týden' : formatRangeShort(start, end),
        rangeText: formatRange(start, end),
        compareText: formatRange(prevStart, start),
        compareShort: 'vs. předchozí týden',
        toDate: false,
        canNext: true,
      };
    }
    case 'month': {
      const start = addMonths(startOfMonth(today), p.offset);
      const prevStart = addMonths(start, -1);
      if (p.offset >= 0) {
        const day = ymd(today)[2];
        const prevLen = daysBetween(prevStart, start);
        const prevTo = addDays(prevStart, Math.min(day, prevLen));
        return {
          range: { from: start, to: tomorrow },
          compare: { from: prevStart, to: prevTo },
          navLabel: formatMonthYear(start),
          rangeText: formatRange(start, tomorrow),
          compareText: formatRange(prevStart, prevTo),
          compareShort: 'vs. ' + formatRangeShort(prevStart, prevTo),
          toDate: true,
          canNext: false,
        };
      }
      const end = addMonths(start, 1);
      return {
        range: { from: start, to: end },
        compare: { from: prevStart, to: start },
        navLabel: formatMonthYear(start),
        rangeText: formatRange(start, end),
        compareText: MONTH_NOMINATIVE[ymd(prevStart)[1] - 1] + ' ' + ymd(prevStart)[0],
        compareShort: 'vs. ' + MONTH_NOMINATIVE[ymd(prevStart)[1] - 1],
        toDate: false,
        canNext: true,
      };
    }
    case 'd90': {
      const end = addDays(tomorrow, 90 * Math.min(0, p.offset));
      const start = addDays(end, -90);
      const prevStart = addDays(start, -90);
      return {
        range: { from: start, to: end },
        compare: { from: prevStart, to: start },
        navLabel: p.offset >= 0 ? 'Posledních 90 dní' : formatRangeShort(start, end),
        rangeText: formatRange(start, end),
        compareText: formatRange(prevStart, start),
        compareShort: 'vs. předchozích 90 dní',
        toDate: p.offset >= 0,
        canNext: p.offset < 0,
      };
    }
    case 'custom': {
      const c = clampCustom(p.customFrom, p.customTo);
      const to = addDays(c.to, 1);
      const len = daysBetween(c.from, to);
      const prevStart = addDays(c.from, -len);
      return {
        range: { from: c.from, to },
        compare: { from: prevStart, to: c.from },
        navLabel: formatRangeShort(c.from, to),
        rangeText: formatRange(c.from, to),
        compareText: formatRange(prevStart, c.from),
        compareShort: 'vs. předchozí období',
        toDate: to > today,
        canNext: to <= today,
      };
    }
  }
}

/** Datum prvního termínu v systému (od kdy existují data). */
export function firstBookingDate(bookings: readonly Booking[]): LocalDate | null {
  let min: LocalDateTime | null = null;
  for (const b of bookings) if (min === null || b.start < min) min = b.start;
  return min ? dateOf(min) : null;
}

/* ------------------------------------------------------------------ */
/* Kapacita: obsazenost terapeutů a heatmapa                           */
/* ------------------------------------------------------------------ */

export const HEAT_FIRST_HOUR = 7;
export const HEAT_LAST_HOUR = 19;
export const HEAT_HOURS: number[] = Array.from({ length: HEAT_LAST_HOUR - HEAT_FIRST_HOUR + 1 }, (_, i) => HEAT_FIRST_HOUR + i);
/** Po–So. */
export const HEAT_DAYS = 6;

export interface HeatCell {
  weekday: number;
  hour: number;
  booked: number;
  available: number;
  pct: number;
}

export interface CapacityModel {
  booked: number;
  available: number;
  utilization: number;
  byTherapist: Record<Id, { booked: number; available: number }>;
  /** Pracovní minuty týmu (ve filtru) po dnech. */
  availableByDay: Record<LocalDate, number>;
  /** Po–So × 7–19 h, řádek po řádku. */
  heat: HeatCell[];
}

interface Span {
  start: number;
  end: number;
}

/** Minuty od půlnoci, konec po půlnoci se ořízne na 24:00. */
function spanOf(start: LocalDateTime, end: LocalDateTime, day: LocalDate): Span {
  const s = dateOf(start) < day ? 0 : minutesOf(start);
  const e = dateOf(end) > day ? 24 * 60 : minutesOf(end);
  return { start: s, end: Math.max(s, e) };
}

/** Rozdělí interval do hodinových přihrádek. */
function spreadHours(span: Span, add: (hour: number, minutes: number) => void): void {
  for (let h = Math.floor(span.start / 60); h * 60 < span.end && h < 24; h++) {
    const a = Math.max(span.start, h * 60);
    const z = Math.min(span.end, (h + 1) * 60);
    if (z > a) add(h, z - a);
  }
}

interface DayVisitor {
  available: (therapistId: Id, span: Span) => void;
  booked: (therapistId: Id, span: Span) => void;
}

/**
 * Projde jeden den: pracovní intervaly terapeutů, individuální termíny, které blokují čas,
 * a skupinové lekce s alespoň jedním účastníkem (lekce = jeden blok, ne počet účastníků).
 */
function visitDay(s: ClinicState, day: LocalDate, therapistIds: Id[], categoryId: Id | null, v: DayVisitor): void {
  const catOk = (serviceId: Id): boolean => !categoryId || getService(s, serviceId)?.categoryId === categoryId;
  const sessions = sessionsOnDate(s, day);
  for (const tid of therapistIds) {
    for (const iv of workingIntervals(s, tid, day)) v.available(tid, spanOf(iv.start, iv.end, day));
    for (const b of bookingsOfTherapistOnDate(s, tid, day)) {
      if (b.sessionId || !isOccupying(b.status) || !catOk(b.serviceId)) continue;
      v.booked(tid, spanOf(b.start, b.end, day));
    }
    for (const ses of sessions) {
      if (ses.therapistId !== tid || ses.cancelled || !catOk(ses.serviceId)) continue;
      if (sessionParticipants(s, ses.id).length === 0) continue;
      v.booked(tid, spanOf(ses.start, ses.end, day));
    }
  }
}

function scopeTherapists(s: ClinicState, therapistId: Id | null): Id[] {
  return s.therapists
    .filter((t) => t.active && (!therapistId || t.id === therapistId))
    .sort((a, b) => a.order - b.order)
    .map((t) => t.id);
}

export function capacityModel(s: ClinicState, range: DateRange, f: StatsFilters): CapacityModel {
  const ids = scopeTherapists(s, f.therapistId);
  const byTherapist: CapacityModel['byTherapist'] = {};
  for (const id of ids) byTherapist[id] = { booked: 0, available: 0 };
  const availableByDay: Record<LocalDate, number> = {};
  const heatBooked = new Array<number>(7 * 24).fill(0);
  const heatAvail = new Array<number>(7 * 24).fill(0);
  let booked = 0;
  let available = 0;
  for (const day of eachDay(range.from, range.to)) {
    const wd = weekdayOf(day);
    let dayAvail = 0;
    visitDay(s, day, ids, f.categoryId, {
      available: (tid, span) => {
        const m = span.end - span.start;
        byTherapist[tid].available += m;
        available += m;
        dayAvail += m;
        spreadHours(span, (h, mins) => {
          heatAvail[wd * 24 + h] += mins;
        });
      },
      booked: (tid, span) => {
        const m = span.end - span.start;
        byTherapist[tid].booked += m;
        booked += m;
        spreadHours(span, (h, mins) => {
          heatBooked[wd * 24 + h] += mins;
        });
      },
    });
    availableByDay[day] = dayAvail;
  }
  const heat: HeatCell[] = [];
  for (let wd = 0; wd < HEAT_DAYS; wd++) {
    for (const hour of HEAT_HOURS) {
      const b = heatBooked[wd * 24 + hour];
      const a = heatAvail[wd * 24 + hour];
      heat.push({ weekday: wd, hour, booked: b, available: a, pct: a ? Math.min(1, b / a) : 0 });
    }
  }
  return { booked, available, utilization: available ? booked / available : 0, byTherapist, availableByDay, heat };
}

/** 0 = nic, 1–5 = (0–20 %] … (80–100 %]. */
export function heatLevel(pct: number): number {
  if (pct <= 0) return 0;
  return Math.min(5, Math.max(1, Math.ceil(pct * 5 - 1e-9)));
}

/* ------------------------------------------------------------------ */
/* Rezervace po dnech                                                  */
/* ------------------------------------------------------------------ */

export interface DayRow {
  date: LocalDate;
  completed: number;
  noShow: number;
  upcoming: number;
  /** Zrušené celkem (zrušeno + pozdní storno + omluveno). */
  cancelled: number;
  late: number;
  excused: number;
  /** Nikdo z týmu nepracuje a nic není rezervováno. */
  closed: boolean;
}

export function dailySeries(s: ClinicState, range: DateRange, f: StatsFilters, availableByDay: Record<LocalDate, number>): DayRow[] {
  return eachDay(range.from, range.to).map((date) => {
    const row: DayRow = { date, completed: 0, noShow: 0, upcoming: 0, cancelled: 0, late: 0, excused: 0, closed: false };
    for (const b of bookingsOnDate(s, date)) {
      if (f.therapistId && b.therapistId !== f.therapistId) continue;
      if (f.categoryId && getService(s, b.serviceId)?.categoryId !== f.categoryId) continue;
      switch (b.status) {
        case 'completed':
          row.completed++;
          break;
        case 'no_show':
          row.noShow++;
          break;
        case 'confirmed':
          row.upcoming++;
          break;
        case 'cancelled':
          row.cancelled++;
          break;
        case 'late_cancelled':
          row.cancelled++;
          row.late++;
          break;
        case 'excused':
          row.cancelled++;
          row.excused++;
          break;
        default:
          break;
      }
    }
    row.closed = rowTotal(row) === 0 && !(availableByDay[date] > 0);
    return row;
  });
}

/** Proběhlé individuální návštěvy (základ míry rebookingu – skupinové lekce se nepočítají). */
export function countSoloCompleted(s: ClinicState, range: DateRange, f: StatsFilters): number {
  let n = 0;
  for (const date of eachDay(range.from, range.to)) {
    for (const b of bookingsOnDate(s, date)) {
      if (b.status !== 'completed' || b.sessionId) continue;
      if (f.therapistId && b.therapistId !== f.therapistId) continue;
      if (f.categoryId && getService(s, b.serviceId)?.categoryId !== f.categoryId) continue;
      n++;
    }
  }
  return n;
}

export const rowTotal = (r: Pick<DayRow, 'completed' | 'noShow' | 'upcoming' | 'cancelled'>): number =>
  r.completed + r.noShow + r.upcoming + r.cancelled;

export type Granularity = 'day' | 'week' | 'month';

export function granularityFor(days: number): Granularity {
  if (days <= 45) return 'day';
  if (days <= 210) return 'week';
  return 'month';
}

export interface Bucket extends Omit<DayRow, 'date'> {
  key: string;
  from: LocalDate;
  /** Exkluzivní. */
  to: LocalDate;
}

export function bucketize(rows: DayRow[], g: Granularity, range: DateRange): Bucket[] {
  const out: Bucket[] = [];
  const map = new Map<string, Bucket>();
  for (const r of rows) {
    const start = g === 'day' ? r.date : g === 'week' ? startOfWeek(r.date) : startOfMonth(r.date);
    let b = map.get(start);
    if (!b) {
      const naturalEnd = g === 'day' ? addDays(start, 1) : g === 'week' ? addDays(start, 7) : addMonths(start, 1);
      b = {
        key: start,
        from: start < range.from ? range.from : start,
        to: naturalEnd > range.to ? range.to : naturalEnd,
        completed: 0,
        noShow: 0,
        upcoming: 0,
        cancelled: 0,
        late: 0,
        excused: 0,
        closed: true,
      };
      map.set(start, b);
      out.push(b);
    }
    b.completed += r.completed;
    b.noShow += r.noShow;
    b.upcoming += r.upcoming;
    b.cancelled += r.cancelled;
    b.late += r.late;
    b.excused += r.excused;
    b.closed = b.closed && r.closed;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Trend storen a nedostavení                                          */
/* ------------------------------------------------------------------ */

export interface TrendPoint {
  month: LocalDate;
  total: number;
  cancels: number;
  late: number;
  noShows: number;
  completed: number;
  cancelRate: number | null;
  noShowRate: number | null;
  /** Rozpracovaný (aktuální) měsíc. */
  partial: boolean;
}

/**
 * Posledních 6 měsíců. Započítávají se jen termíny, které už začaly – budoucí rezervace
 * aktuálního měsíce ještě nemohly být zrušeny, a míru storna by uměle snižovaly.
 */
export function trendSeries(s: ClinicState, f: StatsFilters, now: LocalDateTime): TrendPoint[] {
  const today = dateOf(now);
  const thisMonth = startOfMonth(today);
  const first = addMonths(thisMonth, -5);
  const points: TrendPoint[] = Array.from({ length: 6 }, (_, i) => ({
    month: addMonths(first, i),
    total: 0,
    cancels: 0,
    late: 0,
    noShows: 0,
    completed: 0,
    cancelRate: null,
    noShowRate: null,
    partial: false,
  }));
  const index = new Map(points.map((p, i) => [monthKey(p.month), i]));
  for (const b of s.bookings) {
    if (b.start < first || b.start > now || b.status === 'clinic_cancelled') continue;
    if (f.therapistId && b.therapistId !== f.therapistId) continue;
    if (f.categoryId && getService(s, b.serviceId)?.categoryId !== f.categoryId) continue;
    const i = index.get(monthKey(b.start));
    if (i === undefined) continue;
    const p = points[i];
    p.total++;
    if (b.status === 'completed') p.completed++;
    else if (b.status === 'no_show') p.noShows++;
    else if (b.status === 'cancelled' || b.status === 'excused') p.cancels++;
    else if (b.status === 'late_cancelled') {
      p.cancels++;
      p.late++;
    }
  }
  for (const p of points) {
    p.cancelRate = p.total ? p.cancels / p.total : null;
    p.noShowRate = p.completed + p.noShows ? p.noShows / (p.completed + p.noShows) : null;
    p.partial = p.month === thisMonth;
  }
  return points;
}

export const MONTH_SHORT = ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro'] as const;

export function monthName(date: LocalDate): string {
  return MONTH_NOMINATIVE[ymd(date)[1] - 1];
}

export function monthShort(date: LocalDate): string {
  return MONTH_SHORT[ymd(date)[1] - 1];
}

/* ------------------------------------------------------------------ */
/* Obsazenost dne po hodinách (Přehled)                                */
/* ------------------------------------------------------------------ */

export interface HourSlot {
  hour: number;
  booked: number;
  available: number;
  /** Kolik terapeutů v této hodině pracuje. */
  staff: number;
}

export function hourlyOccupancy(s: ClinicState, date: LocalDate, therapistId: Id | null): HourSlot[] {
  const ids = scopeTherapists(s, therapistId);
  const booked = new Array<number>(24).fill(0);
  const avail = new Array<number>(24).fill(0);
  const staff: Array<Set<Id>> = Array.from({ length: 24 }, () => new Set<Id>());
  visitDay(s, date, ids, null, {
    available: (tid, span) =>
      spreadHours(span, (h, m) => {
        avail[h] += m;
        staff[h].add(tid);
      }),
    booked: (_tid, span) =>
      spreadHours(span, (h, m) => {
        booked[h] += m;
      }),
  });
  return HEAT_HOURS.map((hour) => ({ hour, booked: booked[hour], available: avail[hour], staff: staff[hour].size }));
}

/* ------------------------------------------------------------------ */
/* Rozdíly proti srovnávacímu období                                   */
/* ------------------------------------------------------------------ */

const sign = (n: number): string => (n > 0 ? '+' : n < 0 ? '−' : '');

/**
 * Procentní změna (počty, částky). Když srovnávací hodnota je 0, ukáže absolutní rozdíl.
 * Vrací null, když se nic nezměnilo.
 */
export function changeDelta(
  cur: number,
  prev: number,
  higherIsBetter: boolean,
  absFormat: (n: number) => string = formatNumber,
): KpiDelta | null {
  if (cur === prev) return null;
  const direction: KpiDelta['direction'] = cur > prev ? 'up' : 'down';
  const good = (direction === 'up') === higherIsBetter;
  if (prev === 0) return { value: sign(cur - prev) + absFormat(Math.abs(cur - prev)), direction, good };
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  if (Math.abs(pct) < 0.05) return null;
  const abs = Math.abs(pct);
  return { value: sign(pct) + formatNumber(abs, abs >= 100 ? 0 : 1) + NBSP + '%', direction, good };
}

/** Změna podílu v procentních bodech. */
export function pointsDelta(cur: number, prev: number, higherIsBetter: boolean): KpiDelta | null {
  const pp = (cur - prev) * 100;
  if (Math.abs(pp) < 0.05) return null;
  const direction: KpiDelta['direction'] = pp > 0 ? 'up' : 'down';
  return {
    value: sign(pp) + formatNumber(Math.abs(pp), 1) + NBSP + 'p.' + NBSP + 'b.',
    direction,
    good: (direction === 'up') === higherIsBetter,
  };
}

/* ------------------------------------------------------------------ */
/* Formátování a škály                                                 */
/* ------------------------------------------------------------------ */

/** Podíl 0–1 jako „63,4 %“. */
export function pct(value: number, decimals = 0): string {
  return formatNumber(value * 100, decimals) + NBSP + '%';
}

/** Kompaktní částka pro úzké dlaždice: „1,44 mil. Kč“, „846 tis. Kč“. */
export function moneyCompact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return formatNumber(n / 1_000_000, 2) + NBSP + 'mil.' + NBSP + 'Kč';
  if (a >= 100_000) return formatNumber(Math.round(n / 1000)) + NBSP + 'tis.' + NBSP + 'Kč';
  return formatMoney(n);
}

export function hoursText(minutes: number): string {
  const h = minutes / 60;
  return formatNumber(h, h >= 100 || Number.isInteger(h) ? 0 : 1) + NBSP + 'h';
}

/**
 * Průměrný počet dní: „1 den“, „3 dny“, „12 dní“, „4,5 dne“ (desetinné číslo má 2. pád jednotného čísla).
 * Od 10 dní celá čísla, pod 10 na jedno desetinné místo.
 */
export function daysText(days: number): string {
  const v = days >= 10 ? Math.round(days) : Math.round(days * 10) / 10;
  if (Number.isInteger(v)) return countLabel(v, ['den', 'dny', 'dní']);
  return formatNumber(v, 1) + NBSP + 'dne';
}

export interface NiceScale {
  max: number;
  step: number;
  ticks: number[];
}

/** Zaokrouhlená osa (kroky 1–2–5). */
export function niceScale(maxValue: number, target = 4, integer = false): NiceScale {
  const value = Math.max(0, maxValue);
  if (value === 0) {
    const step = integer ? 1 : 0.25;
    return { max: step * target, step, ticks: Array.from({ length: target + 1 }, (_, i) => i * step) };
  }
  const raw = value / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  let step = nice * mag;
  if (integer) step = Math.max(1, Math.round(step));
  const max = Math.ceil(value / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { max, step, ticks };
}
