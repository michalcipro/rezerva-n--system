import type { LocalDate, LocalDateTime } from '../domain/types';
import { dateOf, daysBetween, diffMinutes, timeOf, toDate, weekdayOf } from './time';

/** České formátování dat, časů a částek. */

export const NBSP = ' ';

export const WEEKDAY_SHORT = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'] as const;
export const WEEKDAY_LONG = ['pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota', 'neděle'] as const;
export const MONTH_GENITIVE = [
  'ledna', 'února', 'března', 'dubna', 'května', 'června',
  'července', 'srpna', 'září', 'října', 'listopadu', 'prosince',
] as const;
export const MONTH_NOMINATIVE = [
  'leden', 'únor', 'březen', 'duben', 'květen', 'červen',
  'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec',
] as const;

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** 1 190 → '1 190' (nezlomitelná mezera jako oddělovač tisíců). */
export function formatNumber(n: number, decimals = 0): string {
  const fixed = Math.abs(n).toFixed(decimals);
  const [int, dec] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return (n < 0 ? '−' : '') + grouped + (dec ? ',' + dec : '');
}

export function formatMoney(n: number): string {
  return formatNumber(Math.round(n)) + NBSP + 'Kč';
}

export function formatSignedMoney(n: number): string {
  const r = Math.round(n);
  return (r > 0 ? '+' : r < 0 ? '−' : '') + formatNumber(Math.abs(r)) + NBSP + 'Kč';
}

export function formatPercent(value: number, decimals = 0): string {
  return formatNumber(value, decimals) + NBSP + '%';
}

/** '9:00' – hodiny bez úvodní nuly. */
export function formatTime(dt: LocalDateTime | string): string {
  const t = dt.length > 5 ? timeOf(dt) : dt;
  return String(Number(t.slice(0, 2))) + ':' + t.slice(3, 5);
}

export function formatTimeRange(start: LocalDateTime, end: LocalDateTime): string {
  return formatTime(start) + '–' + formatTime(end);
}

/** 'St 14. 10.' */
export function formatDayShort(date: LocalDate | LocalDateTime): string {
  const d = toDate(dateOf(date.length > 10 ? date : date + 'T00:00'));
  return WEEKDAY_SHORT[weekdayOf(date)] + ' ' + d.getDate() + '.' + NBSP + (d.getMonth() + 1) + '.';
}

/** '14. 10. 2026' */
export function formatDate(date: LocalDate | LocalDateTime): string {
  const d = toDate(date.slice(0, 10));
  return d.getDate() + '.' + NBSP + (d.getMonth() + 1) + '.' + NBSP + d.getFullYear();
}

/** 'středa 14. října 2026' (nebo s velkým písmenem). */
export function formatDateLong(date: LocalDate | LocalDateTime, opts: { capital?: boolean; year?: boolean } = {}): string {
  const d = toDate(date.slice(0, 10));
  const s =
    WEEKDAY_LONG[weekdayOf(date)] +
    ' ' +
    d.getDate() +
    '.' +
    NBSP +
    MONTH_GENITIVE[d.getMonth()] +
    (opts.year === false ? '' : ' ' + d.getFullYear());
  return opts.capital ? capitalize(s) : s;
}

/** '14. října' */
export function formatDayMonth(date: LocalDate | LocalDateTime): string {
  const d = toDate(date.slice(0, 10));
  return d.getDate() + '.' + NBSP + MONTH_GENITIVE[d.getMonth()];
}

export function formatMonthYear(date: LocalDate): string {
  const d = toDate(date.slice(0, 10));
  return capitalize(MONTH_NOMINATIVE[d.getMonth()]) + ' ' + d.getFullYear();
}

/** 'St 14. 10. · 9:00–9:45' */
export function formatSlot(start: LocalDateTime, end?: LocalDateTime): string {
  return formatDayShort(start) + ' · ' + (end ? formatTimeRange(start, end) : formatTime(start));
}

/** 'St 14. 10. 9:00' */
export function formatDateTimeShort(dt: LocalDateTime): string {
  return formatDayShort(dt) + ' ' + formatTime(dt);
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return minutes + NBSP + 'min';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h + NBSP + 'h' + (m ? ' ' + m + NBSP + 'min' : '');
}

/** Volba tvaru podle čísla: plural(3, ['vstup', 'vstupy', 'vstupů']) → 'vstupy'. */
export function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n);
  if (a === 1) return forms[0];
  if (a >= 2 && a <= 4 && Number.isInteger(a)) return forms[1];
  return forms[2];
}

export function countLabel(n: number, forms: [string, string, string]): string {
  return formatNumber(n) + NBSP + plural(n, forms);
}

/** Relativní popis času vůči `now`: 'za 2 h 20 min', 'před 3 dny', 'zítra 9:00'. */
export function formatRelative(target: LocalDateTime, now: LocalDateTime): string {
  const mins = diffMinutes(target, now);
  const abs = Math.abs(mins);
  const future = mins >= 0;
  if (abs < 1) return 'právě teď';
  if (abs < 60) return (future ? 'za ' : 'před ') + abs + NBSP + 'min';
  if (abs < 24 * 60) {
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    const body = h + NBSP + 'h' + (m ? ' ' + m + NBSP + 'min' : '');
    return (future ? 'za ' : 'před ') + body;
  }
  const days = daysBetween(dateOf(now), dateOf(target));
  if (days === 1) return 'zítra ' + formatTime(target);
  if (days === -1) return 'včera ' + formatTime(target);
  const ad = Math.abs(days);
  if (future) return 'za ' + ad + NBSP + plural(ad, ['den', 'dny', 'dní']);
  return 'před ' + ad + NBSP + (ad === 1 ? 'dnem' : 'dny');
}

/** Délka v hodinách a minutách z minut, např. pro „zbývá 22 h 20 min". */
export function formatSpan(minutes: number): string {
  const abs = Math.max(0, Math.round(minutes));
  const d = Math.floor(abs / 1440);
  const h = Math.floor((abs % 1440) / 60);
  const m = abs % 60;
  const parts: string[] = [];
  if (d) parts.push(d + NBSP + plural(d, ['den', 'dny', 'dní']));
  if (h) parts.push(h + NBSP + 'h');
  if (m && !d) parts.push(m + NBSP + 'min');
  return parts.length ? parts.join(' ') : '0' + NBSP + 'min';
}

export function personName(p: { firstName: string; lastName: string }): string {
  return p.firstName + ' ' + p.lastName;
}

export function initials(p: { firstName: string; lastName: string }): string {
  return (p.firstName.charAt(0) + p.lastName.charAt(0)).toUpperCase();
}

/** 'T. Malá' */
export function shortName(p: { firstName: string; lastName: string }): string {
  return p.firstName.charAt(0) + '.' + NBSP + p.lastName;
}
