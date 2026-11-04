import type { ClinicState, Id, LocalDate, Service, Therapist, WaitlistEntry } from '../../domain/types';
import { countLabel, formatDayShort, formatNumber, plural, prepZ } from '../../engine/format';
import { groupOverviewSummary, type GroupSessionOverview } from '../../engine/groups';
import { addDays, daysBetween, isValidLocalDate, startOfWeek } from '../../engine/time';

/**
 * Skupinové lekce (docs/VSTUPY-SKUPINY-QR.md, část 2) – pomocné čisté funkce obrazovky a widgetu na Přehledu.
 * Výpočet obsazenosti je v engine/groups.ts, tady jen rozsah, seskupení a texty.
 */

/* ------------------------------------------------------------------ */
/* Rozsah                                                              */
/* ------------------------------------------------------------------ */

export type RangePreset = 'week' | 'next14' | 'custom';

export interface RangeState {
  preset: RangePreset;
  /** Posun o celé období (týden / 14 dní) od aktuálního. */
  offset: number;
  /** Vlastní rozsah – oba dny včetně. */
  customFrom: LocalDate;
  customTo: LocalDate;
}

export interface ResolvedRange {
  from: LocalDate;
  /** Exkluzivně (jako groupSessionsOverview). */
  to: LocalDate;
  /** Poslední den včetně. */
  last: LocalDate;
  /** „Tento týden“, „Příštích 14 dní“ nebo „Po 2. 11. – Ne 8. 11.“ */
  label: string;
  /** „Po 2. 11. – Ne 8. 11.“ */
  text: string;
}

export const RANGE_OPTIONS: { value: RangePreset; label: string }[] = [
  { value: 'week', label: 'Tento týden' },
  { value: 'next14', label: 'Příštích 14 dní' },
  { value: 'custom', label: 'Vlastní' },
];

/** Nejdelší vlastní rozsah (dny). */
export const MAX_CUSTOM_DAYS = 92;

export function defaultRange(today: LocalDate): RangeState {
  return { preset: 'week', offset: 0, customFrom: today, customTo: addDays(today, 13) };
}

/** „Po 2. 11. – Ne 8. 11.“ (jeden den: „St 4. 11.“). */
export function rangeText(from: LocalDate, last: LocalDate): string {
  return from === last ? formatDayShort(from) : `${formatDayShort(from)} – ${formatDayShort(last)}`;
}

/** Vlastní rozsah: platná data, začátek ≤ konec, nejvýš MAX_CUSTOM_DAYS dní. */
export function clampCustom(from: string, to: string, today: LocalDate): { from: LocalDate; to: LocalDate } {
  const f = isValidLocalDate(from) ? from : today;
  let t = isValidLocalDate(to) ? to : f;
  if (t < f) t = f;
  if (daysBetween(f, t) >= MAX_CUSTOM_DAYS) t = addDays(f, MAX_CUSTOM_DAYS - 1);
  return { from: f, to: t };
}

export function resolveRange(r: RangeState, today: LocalDate): ResolvedRange {
  if (r.preset === 'custom') {
    const c = clampCustom(r.customFrom, r.customTo, today);
    const text = rangeText(c.from, c.to);
    return { from: c.from, to: addDays(c.to, 1), last: c.to, label: text, text };
  }
  const len = r.preset === 'week' ? 7 : 14;
  const base = r.preset === 'week' ? startOfWeek(today) : today;
  const from = addDays(base, r.offset * len);
  const last = addDays(from, len - 1);
  const text = rangeText(from, last);
  let label = text;
  if (r.preset === 'week') {
    if (r.offset === 0) label = 'Tento týden';
    else if (r.offset === 1) label = 'Příští týden';
    else if (r.offset === -1) label = 'Minulý týden';
  } else if (r.offset === 0) label = 'Příštích 14 dní';
  return { from, to: addDays(from, len), last, label, text };
}

/* ------------------------------------------------------------------ */
/* Seskupení a souhrn                                                  */
/* ------------------------------------------------------------------ */

export interface DayGroup {
  date: LocalDate;
  items: GroupSessionOverview[];
  /** Volná místa v nezrušených termínech dne. */
  free: number;
  /** Nezrušené termíny dne. */
  sessions: number;
}

/** Termíny po dnech (vstup je seřazený podle začátku). */
export function groupByDay(list: readonly GroupSessionOverview[]): DayGroup[] {
  const out: DayGroup[] = [];
  for (const g of list) {
    const date = g.session.start.slice(0, 10);
    let day = out[out.length - 1];
    if (!day || day.date !== date) {
      day = { date, items: [], free: 0, sessions: 0 };
      out.push(day);
    }
    day.items.push(g);
    if (!g.cancelled) {
      day.sessions++;
      day.free += g.free;
    }
  }
  return out;
}

export interface GroupsSummary {
  sessions: number;
  freeSpots: number;
  fullSessions: number;
  waiting: number;
  /** Termíny s volnými místy ≤ 2 nebo obsazeností ≥ 80 %. */
  almostSessions: number;
  capacity: number;
  booked: number;
  cancelled: number;
}

/** Souhrn nad přehledem (zrušené termíny se do čísel nepočítají, jen do `cancelled`). */
export function summarize(list: readonly GroupSessionOverview[]): GroupsSummary {
  const base = groupOverviewSummary(list);
  let almostSessions = 0;
  let capacity = 0;
  let booked = 0;
  let cancelled = 0;
  for (const g of list) {
    if (g.cancelled) {
      cancelled++;
      continue;
    }
    if (g.fill === 'almost') almostSessions++;
    capacity += g.capacity;
    booked += Math.min(g.booked, g.capacity);
  }
  return { ...base, almostSessions, capacity, booked, cancelled };
}

/** Termín je možné doplnit (nezrušený, ještě neskončil). */
export const isBookable = (g: GroupSessionOverview): boolean => !g.cancelled && !g.past;

/* ------------------------------------------------------------------ */
/* Texty                                                               */
/* ------------------------------------------------------------------ */

/** „5 volných“ / „1 volné“ / „2 volná“ / „plno“. */
export function freeShort(n: number): string {
  if (n <= 0) return 'plno';
  return `${formatNumber(n)} ${plural(n, ['volné', 'volná', 'volných'])}`;
}

/** „5 volných míst“ / „1 volné místo“ / „plno“. */
export function freeSpotsText(n: number): string {
  if (n <= 0) return 'plno';
  return countLabel(n, ['volné místo', 'volná místa', 'volných míst']);
}

/** „7 ze 12“ */
export function takenText(booked: number, capacity: number): string {
  return `${formatNumber(booked)} ${prepZ(capacity)} ${formatNumber(capacity)}`;
}

/** Text ukazatele obsazenosti: „7 ze 12 · 5 volných“; plný termín jen „12 ze 12“ (vedle je štítek Plno). */
export function occupancyText(booked: number, capacity: number): string {
  const free = Math.max(0, capacity - booked);
  return free > 0 ? `${takenText(booked, capacity)} · ${freeShort(free)}` : takenText(booked, capacity);
}

/** Přístupný popis obsazenosti: „Obsazeno 7 míst ze 12, 5 volných míst“. */
export function occupancyAria(booked: number, capacity: number, cancelled = false): string {
  if (cancelled) return 'Termín je zrušený';
  const free = Math.max(0, capacity - booked);
  const taken = `Obsazeno ${countLabel(booked, ['místo', 'místa', 'míst'])} ${prepZ(capacity)} ${formatNumber(capacity)}`;
  return free > 0 ? `${taken}, ${freeSpotsText(free)}` : `${taken}, plně obsazeno`;
}

/** „3 termíny · 7 volných míst“ */
export function dayMeta(day: DayGroup): string {
  if (day.sessions === 0) return 'jen zrušené termíny';
  return `${countLabel(day.sessions, ['termín', 'termíny', 'termínů'])} · ${day.free > 0 ? freeSpotsText(day.free) : 'vše obsazeno'}`;
}

/* ------------------------------------------------------------------ */
/* Data pro filtry a panel účastníků                                   */
/* ------------------------------------------------------------------ */

/** Skupinové služby (aktivní a ty, které mají šablonu termínů), v pořadí z nastavení. */
export function groupServices(s: ClinicState): Service[] {
  const withTemplates = new Set(s.groupTemplates.map((t) => t.serviceId));
  return s.services.filter((x) => x.kind === 'group' && (x.active || withTemplates.has(x.id))).sort((a, b) => a.order - b.order);
}

/** Trenéři skupinových lekcí (vedou šablonu nebo jsou u skupinové služby), v pořadí z nastavení. */
export function groupTrainers(s: ClinicState): Therapist[] {
  const ids = new Set<Id>();
  for (const t of s.groupTemplates) if (t.active) ids.add(t.therapistId);
  for (const svc of s.services) if (svc.kind === 'group' && svc.active) svc.therapistIds.forEach((id) => ids.add(id));
  return s.therapists.filter((t) => ids.has(t.id) && (t.active || s.groupTemplates.some((g) => g.active && g.therapistId === t.id))).sort((a, b) => a.order - b.order);
}

/** Vede terapeut nějakou aktivní pravidelnou skupinovou lekci? */
export function leadsGroups(s: ClinicState, therapistId: Id | null | undefined): boolean {
  if (!therapistId) return false;
  return s.groupTemplates.some((t) => t.active && t.therapistId === therapistId);
}

/** Čekající na konkrétní termín (čeká / nabídnuto), nejdříve přihlášení první. */
export function waitingForSession(s: ClinicState, sessionId: Id): WaitlistEntry[] {
  return s.waitlist
    .filter((w) => w.sessionId === sessionId && (w.status === 'waiting' || w.status === 'offered'))
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
}

/** „3 na čekací listině“ */
export const waitlistText = (n: number): string => `${formatNumber(n)} na čekací listině`;
