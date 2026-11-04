import type { Client, ClinicState, Id, LocalDate, LocalDateTime, Therapist } from '../../domain/types';
import { MONTH_GENITIVE, NBSP, countLabel, formatDateLong, plural, prepZ } from '../../engine/format';
import { groupSessionsOverview, type GroupSessionOverview } from '../../engine/groups';
import { getTherapist } from '../../engine/selectors';
import { addDays, dateOf, daysBetween, startOfWeek } from '../../engine/time';

/** Čisté pomocné funkce obrazovky „Skupinové lekce“ a karty na přehledu (bez Reactu). */

/* ------------------------------------------------------------------ */
/* Období a filtry                                                     */
/* ------------------------------------------------------------------ */

export type RangeMode = 'week' | 'next14' | 'custom';

export interface GroupsPrefs {
  mode: RangeMode;
  /** Posun o celé období (týden / 14 dní) od aktuálního; 0 = tento týden / od dneška. */
  offset: number;
  customFrom: LocalDate;
  /** Poslední den vlastního období (včetně). */
  customTo: LocalDate;
  /** '' = všechny lekce */
  serviceId: Id;
  /** '' = všichni trenéři */
  therapistId: Id;
  onlyFree: boolean;
  showPast: boolean;
}

/** Nejdelší vlastní období (dny). */
export const MAX_CUSTOM_DAYS = 92;

export function defaultPrefs(today: LocalDate): GroupsPrefs {
  return {
    mode: 'week',
    offset: 0,
    customFrom: today,
    customTo: addDays(today, 13),
    serviceId: '',
    therapistId: '',
    onlyFree: false,
    showPast: false,
  };
}

/*
 * Volby si obrazovka pamatuje jen v rámci otevřené aplikace (návrat z detailu klienta
 * ukáže stejný týden a filtry); po obnovení stránky začíná zase tento týden.
 */
let remembered: GroupsPrefs | null = null;
let pendingFocus: Id | null = null;

export function rememberedPrefs(today: LocalDate): GroupsPrefs {
  return remembered ?? defaultPrefs(today);
}

export function rememberPrefs(p: GroupsPrefs): void {
  remembered = p;
}

/** Termín, na který má obrazovka po otevření posunout pohled (jednorázově). */
export function takePendingFocus(): Id | null {
  const id = pendingFocus;
  pendingFocus = null;
  return id;
}

/**
 * Připraví obrazovku na týden s daným termínem a zvýrazní ho (karta na přehledu).
 * Filtry se vynulují, aby termín nebyl skrytý.
 */
export function prepareFocus(sessionId: Id, sessionStart: LocalDateTime, today: LocalDate): void {
  const weeks = Math.round(daysBetween(startOfWeek(today), startOfWeek(dateOf(sessionStart))) / 7);
  const base = remembered ?? defaultPrefs(today);
  remembered = { ...defaultPrefs(today), customFrom: base.customFrom, customTo: base.customTo, offset: weeks };
  pendingFocus = sessionId;
}

export interface ResolvedRange {
  from: LocalDate;
  /** Exkluzivně. */
  to: LocalDate;
  /** Popisek ve stepperu („2.–8. listopadu“). */
  navLabel: string;
  /** Celé období i s rokem („2.–8. listopadu 2026“). */
  text: string;
  /** Předvolba, která odpovídá období ('' = posunuté období). */
  preset: RangeMode | '';
  prevLabel: string;
  nextLabel: string;
}

export function clampCustom(from: LocalDate, to: LocalDate): { from: LocalDate; to: LocalDate } {
  let end = to < from ? from : to;
  if (daysBetween(from, end) > MAX_CUSTOM_DAYS - 1) end = addDays(from, MAX_CUSTOM_DAYS - 1);
  return { from, to: end };
}

export function resolveRange(p: GroupsPrefs, today: LocalDate): ResolvedRange {
  if (p.mode === 'custom') {
    const c = clampCustom(p.customFrom, p.customTo);
    const to = addDays(c.to, 1);
    return { from: c.from, to, navLabel: formatRangeShort(c.from, to), text: formatRange(c.from, to), preset: 'custom', prevLabel: '', nextLabel: '' };
  }
  if (p.mode === 'next14') {
    const from = addDays(today, p.offset * 14);
    const to = addDays(from, 14);
    return {
      from,
      to,
      navLabel: formatRangeShort(from, to),
      text: formatRange(from, to),
      preset: p.offset === 0 ? 'next14' : '',
      prevLabel: 'Předchozích 14 dní',
      nextLabel: 'Dalších 14 dní',
    };
  }
  const from = addDays(startOfWeek(today), p.offset * 7);
  const to = addDays(from, 7);
  return {
    from,
    to,
    navLabel: formatRangeShort(from, to),
    text: formatRange(from, to),
    preset: p.offset === 0 ? 'week' : '',
    prevLabel: 'Předchozí týden',
    nextLabel: 'Další týden',
  };
}

const ymd = (d: LocalDate): [number, number, number] => [Number(d.slice(0, 4)), Number(d.slice(5, 7)), Number(d.slice(8, 10))];

/** „2.–8. listopadu 2026“, „28. 10. – 3. 11. 2026“. */
export function formatRange(from: LocalDate, toExclusive: LocalDate): string {
  const last = addDays(toExclusive, -1);
  const [y1, m1, d1] = ymd(from);
  const [y2, m2, d2] = ymd(last);
  if (from >= last) return `${d1}.${NBSP}${MONTH_GENITIVE[m1 - 1]} ${y1}`;
  if (y1 === y2 && m1 === m2) return `${d1}.–${d2}.${NBSP}${MONTH_GENITIVE[m1 - 1]} ${y1}`;
  if (y1 === y2) return `${d1}.${NBSP}${m1}.${NBSP}– ${d2}.${NBSP}${m2}.${NBSP}${y1}`;
  return `${d1}.${NBSP}${m1}.${NBSP}${y1} – ${d2}.${NBSP}${m2}.${NBSP}${y2}`;
}

/** Bez roku: „2.–8. listopadu“, „28. 10. – 3. 11.“. */
export function formatRangeShort(from: LocalDate, toExclusive: LocalDate): string {
  const last = addDays(toExclusive, -1);
  const [, m1, d1] = ymd(from);
  const [, m2, d2] = ymd(last);
  if (from >= last) return `${d1}.${NBSP}${MONTH_GENITIVE[m1 - 1]}`;
  if (m1 === m2) return `${d1}.–${d2}.${NBSP}${MONTH_GENITIVE[m1 - 1]}`;
  return `${d1}.${NBSP}${m1}.${NBSP}– ${d2}.${NBSP}${m2}.`;
}

/* ------------------------------------------------------------------ */
/* Obsazenost                                                          */
/* ------------------------------------------------------------------ */

export type SpotsTone = 'free' | 'almost' | 'full' | 'past' | 'cancelled';

export interface SpotsStatus {
  tone: SpotsTone;
  /** „7 ze 12“ – obsazená místa z kapacity (u zrušené lekce prázdné). */
  count: string;
  /** „5 volných“, „Poslední 2 místa“, „Plno“, „proběhlo“, „Zrušeno“. */
  status: string;
  /** Celá věta pro čtečku obrazovky. */
  spoken: string;
}

/** „Poslední místo“, „Poslední 2 místa“, „Posledních 5 míst“. */
export function lastSpotsLabel(free: number): string {
  if (free <= 1) return 'Poslední místo';
  return `${plural(free, ['Poslední', 'Poslední', 'Posledních'])} ${countLabel(free, ['místo', 'místa', 'míst'])}`;
}

/** Předložka „z“ / „ze“ – navíc „ze 100–199“ (ze sta…), které obecné `prepZ` nezná. */
export function zPrep(n: number): 'z' | 'ze' {
  const a = Math.abs(Math.round(n));
  return a >= 100 && a < 200 ? 'ze' : prepZ(a);
}

/** „7 ze 12“, „5 z 8“, „92 ze 168“ */
export function occupancyLabel(booked: number, capacity: number): string {
  return `${booked} ${zPrep(capacity)} ${capacity}`;
}

export function spotsStatus(r: GroupSessionOverview, now: LocalDateTime): SpotsStatus {
  const count = occupancyLabel(r.booked, r.capacity);
  const taken = `obsazeno ${count} ${plural(r.capacity, ['místa', 'míst', 'míst'])}`;
  if (r.cancelled) return { tone: 'cancelled', count: '', status: 'Zrušeno', spoken: 'Lekce je zrušená' };
  if (r.past) {
    const status = r.session.end > now ? 'probíhá' : 'proběhlo';
    return { tone: 'past', count, status, spoken: `${status === 'probíhá' ? 'Probíhá' : 'Proběhlo'}, ${taken}` };
  }
  if (r.fill === 'full') return { tone: 'full', count, status: 'Plno', spoken: `Plno, ${taken}` };
  if (r.fill === 'almost') {
    const status = lastSpotsLabel(r.free);
    return { tone: 'almost', count, status, spoken: `${status}, ${taken}` };
  }
  const status = countLabel(r.free, ['volné', 'volná', 'volných']);
  return { tone: 'free', count, status, spoken: `${countLabel(r.free, ['volné místo', 'volná místa', 'volných míst'])}, ${taken}` };
}

/** „Čeká 1“, „Čekají 3“, „Čeká 5“ (štítek čekací listiny). */
export function waitingLabel(n: number): string {
  return `${plural(n, ['Čeká', 'Čekají', 'Čeká'])} ${n}`;
}

/** Zbytek věty pro čtečku za štítkem („… na uvolněné místo“). */
export function waitingSpoken(n: number): string {
  return ` ${plural(n, ['klient', 'klienti', 'klientů'])} na uvolněné místo`;
}

/* ------------------------------------------------------------------ */
/* Seskupení a dotazy                                                  */
/* ------------------------------------------------------------------ */

export interface DayGroup {
  date: LocalDate;
  rows: GroupSessionOverview[];
}

export function groupByDay(rows: readonly GroupSessionOverview[]): DayGroup[] {
  const out: DayGroup[] = [];
  for (const r of rows) {
    const date = dateOf(r.session.start);
    const last = out[out.length - 1];
    if (last && last.date === date) last.rows.push(r);
    else out.push({ date, rows: [r] });
  }
  return out;
}

/** „Úterý 10. listopadu“ */
export function dayHeading(date: LocalDate): string {
  return formatDateLong(date, { capital: true, year: false });
}

/** „dnes“, „zítra“, „včera“ nebo ''. */
export function relativeDayLabel(date: LocalDate, today: LocalDate): string {
  const d = daysBetween(today, date);
  if (d === 0) return 'dnes';
  if (d === 1) return 'zítra';
  if (d === -1) return 'včera';
  return '';
}

/** Trenéři, kteří vedou aspoň jednu pravidelnou lekci (pro filtr). */
export function groupTrainers(s: ClinicState): Therapist[] {
  const ids = new Set(s.groupTemplates.filter((t) => t.active).map((t) => t.therapistId));
  return [...ids]
    .map((id) => getTherapist(s, id))
    .filter((t): t is Therapist => !!t)
    .sort((a, b) => a.order - b.order);
}

/** Jeden termín i s obsazeností (pro detail účastníků – vždy čerstvá data). */
export function sessionOverview(s: ClinicState, sessionId: Id, now: LocalDateTime): GroupSessionOverview | undefined {
  const at = sessionId.lastIndexOf('@');
  if (at < 0) return undefined;
  const date = sessionId.slice(at + 1);
  return groupSessionsOverview(s, date, addDays(date, 1), { includePast: true, includeCancelled: true }, now).find(
    (r) => r.session.id === sessionId,
  );
}

/** „Nedostavila se“ podle příjmení (-á), jinak neutrálně. */
export function noShowText(client: Pick<Client, 'lastName'> | undefined): string {
  const last = client?.lastName.trim().toLowerCase() ?? '';
  if (last.endsWith('á')) return 'Nedostavila se';
  if (!last || last.endsWith('í')) return 'Nedostavil/a se';
  return 'Nedostavil se';
}

/** Id řádku termínu v DOM (pro posun a zvýraznění). */
export const rowDomId = (sessionId: Id): string => `grp-row-${sessionId}`;
