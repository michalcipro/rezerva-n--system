import type { LocalDate, LocalDateTime, TimeOfDay, Weekday } from '../domain/types';

/**
 * Práce s lokálním časem kliniky. Hodnoty jsou řetězce 'YYYY-MM-DDTHH:mm'
 * a 'YYYY-MM-DD'; lexikografické porovnání odpovídá časovému pořadí.
 */

export const pad2 = (n: number): string => (n < 10 ? '0' + n : String(n));

export function toDate(value: LocalDateTime | LocalDate): Date {
  const y = Number(value.slice(0, 4));
  const m = Number(value.slice(5, 7));
  const d = Number(value.slice(8, 10));
  const h = value.length > 10 ? Number(value.slice(11, 13)) : 0;
  const mi = value.length > 10 ? Number(value.slice(14, 16)) : 0;
  return new Date(y, m - 1, d, h, mi, 0, 0);
}

export function fromDate(d: Date): LocalDateTime {
  return (
    d.getFullYear() +
    '-' +
    pad2(d.getMonth() + 1) +
    '-' +
    pad2(d.getDate()) +
    'T' +
    pad2(d.getHours()) +
    ':' +
    pad2(d.getMinutes())
  );
}

export function dateFromDate(d: Date): LocalDate {
  return fromDate(d).slice(0, 10);
}

export function nowLocal(): LocalDateTime {
  return fromDate(new Date());
}

export const dateOf = (dt: LocalDateTime): LocalDate => dt.slice(0, 10);
export const timeOf = (dt: LocalDateTime): TimeOfDay => dt.slice(11, 16);
export const combine = (date: LocalDate, time: TimeOfDay): LocalDateTime => date + 'T' + time;

export function minutesOfDay(time: TimeOfDay): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

export function timeFromMinutes(min: number): TimeOfDay {
  const m = ((min % 1440) + 1440) % 1440;
  return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60);
}

/** Minuty od půlnoci daného data (pro pozicování v kalendáři). */
export function minutesOf(dt: LocalDateTime): number {
  return minutesOfDay(timeOf(dt));
}

export function addMinutes(dt: LocalDateTime, minutes: number): LocalDateTime {
  const d = toDate(dt);
  d.setMinutes(d.getMinutes() + minutes);
  return fromDate(d);
}

export function addHours(dt: LocalDateTime, hours: number): LocalDateTime {
  return addMinutes(dt, Math.round(hours * 60));
}

export function addDays(value: LocalDate, days: number): LocalDate;
export function addDays(value: LocalDateTime, days: number): LocalDateTime;
export function addDays(value: string, days: number): string {
  const d = toDate(value);
  d.setDate(d.getDate() + days);
  const out = fromDate(d);
  return value.length > 10 ? out : out.slice(0, 10);
}

export function addMonths(date: LocalDate, months: number): LocalDate {
  const d = toDate(date);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return dateFromDate(d);
}

/** Rozdíl a − b v minutách (skutečný čas, včetně přechodu na letní čas). */
export function diffMinutes(a: LocalDateTime, b: LocalDateTime): number {
  return Math.round((toDate(a).getTime() - toDate(b).getTime()) / 60000);
}

export function diffHours(a: LocalDateTime, b: LocalDateTime): number {
  return diffMinutes(a, b) / 60;
}

/** Počet kalendářních dní mezi daty (b − a). */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  const da = toDate(a);
  const db = toDate(b);
  const ua = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate());
  const ub = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate());
  return Math.round((ub - ua) / 86400000);
}

/** Den v týdnu, 0 = pondělí … 6 = neděle. */
export function weekdayOf(date: LocalDate | LocalDateTime): Weekday {
  const js = toDate(date.slice(0, 10)).getDay();
  return ((js + 6) % 7) as Weekday;
}

export function startOfWeek(date: LocalDate): LocalDate {
  return addDays(date.slice(0, 10), -weekdayOf(date));
}

export function startOfMonth(date: LocalDate): LocalDate {
  return date.slice(0, 7) + '-01';
}

export function endOfMonthExclusive(date: LocalDate): LocalDate {
  return addMonths(startOfMonth(date), 1);
}

export function eachDay(from: LocalDate, toExclusive: LocalDate): LocalDate[] {
  const out: LocalDate[] = [];
  let d = from;
  let guard = 0;
  while (d < toExclusive && guard < 4000) {
    out.push(d);
    d = addDays(d, 1);
    guard++;
  }
  return out;
}

/** ISO týden 'YYYY-Www' (pro dělení dat do bloků). */
export function isoWeekKey(date: LocalDate | LocalDateTime): string {
  const d = toDate(date.slice(0, 10));
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((target.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7,
    );
  return target.getUTCFullYear() + '-W' + pad2(week);
}

export const monthKey = (value: LocalDate | LocalDateTime): string => value.slice(0, 7);

/** Zaokrouhlí čas nahoru na krok (v minutách od půlnoci). */
export function ceilToStep(min: number, step: number): number {
  return Math.ceil(min / step) * step;
}

export function floorToStep(min: number, step: number): number {
  return Math.floor(min / step) * step;
}

/** Překrývají se intervaly [aStart, aEnd) a [bStart, bEnd)? */
export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export const maxStr = (a: string, b: string): string => (a > b ? a : b);
export const minStr = (a: string, b: string): string => (a < b ? a : b);

export function isValidLocalDateTime(value: unknown): value is LocalDateTime {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value);
}

export function isValidLocalDate(value: unknown): value is LocalDate {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
