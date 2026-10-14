/**
 * Čisté pomocné funkce oblasti „Nastavení a katalog" (bez Reactu).
 * Pracují nad `ClinicState` jen pro čtení – změny jdou vždy přes příkazy enginu.
 */
import type {
  Booking,
  CancellationPolicy,
  Client,
  ClientPackage,
  ClinicState,
  CreditBonusRule,
  GroupSession,
  GroupTemplate,
  Id,
  LateTier,
  LocalDate,
  LocalDateTime,
  PackageTemplate,
  Service,
  Settings,
  Therapist,
  TimeRange,
  Tone,
  Weekday,
  WeekSchedule,
} from '../../domain/types';
import { bookedMinutes, workingMinutes } from '../../engine/availability';
import {
  NBSP,
  WEEKDAY_LONG,
  countLabel,
  formatDayShort,
  formatDuration,
  formatNumber,
  formatPercent,
  formatTime,
  plural,
} from '../../engine/format';
import type { CancellationEvaluation } from '../../engine/policy';
import {
  getService,
  indexById,
  packageUsage,
  sessionParticipants,
  sessionsOnDate,
  type PackageUsage,
} from '../../engine/selectors';
import { addDays, addMinutes, combine, dateOf, daysBetween, diffMinutes, minutesOfDay, timeFromMinutes, timeOf } from '../../engine/time';

/* ------------------------------------------------------------------ */
/* Obecné                                                              */
/* ------------------------------------------------------------------ */

export interface Option {
  value: string;
  label: string;
}

export const WEEKDAYS: readonly Weekday[] = [0, 1, 2, 3, 4, 5, 6];

export const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export const weekdayName = (wd: Weekday): string => capitalize(WEEKDAY_LONG[wd]);

export function byOrder<T extends { order: number }>(a: T, b: T): number {
  return a.order - b.order;
}

/** Hluboká kopie čistých dat (bez funkcí a cyklů). */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Strukturální porovnání čistých dat (nezávislé na pořadí klíčů). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao).filter((k) => ao[k] !== undefined);
  const bk = Object.keys(bo).filter((k) => bo[k] !== undefined);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => deepEqual(ao[k], bo[k]));
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (v: string): boolean => EMAIL_RE.test(v.trim());

/** Hodiny z minut pro tabulky: 480 → „8 h", 510 → „8,5 h", 495 → „8,25 h". */
export function hoursLabel(minutes: number): string {
  const h = Math.max(0, minutes) / 60;
  const dec = Number.isInteger(h) ? 0 : Number.isInteger(h * 2) ? 1 : 2;
  return formatNumber(h, dec) + NBSP + 'h';
}

/** „24 hodin", „1 hodinu", „2 hodiny" (4. pád – „nejpozději …", „méně než …"). */
export function hoursText(h: number): string {
  return formatNumber(h) + NBSP + plural(h, ['hodinu', 'hodiny', 'hodin']);
}

/** „do 1 dne", „do 14 dní" (2. pád). */
export function daysGenitive(n: number): string {
  return formatNumber(n) + NBSP + (n === 1 ? 'dne' : 'dní');
}

/** Platnost permanentky: „183 dní · cca 6 měsíců". */
export function validityLabel(days: number): string {
  const base = countLabel(days, ['den', 'dny', 'dní']);
  if (days === 365 || days === 366) return base + ' · 1 rok';
  if (days < 28) return base;
  const months = Math.round(days / 30.44);
  return base + ' · cca ' + countLabel(months, ['měsíc', 'měsíce', 'měsíců']);
}

/* ------------------------------------------------------------------ */
/* Barvy                                                               */
/* ------------------------------------------------------------------ */

export const TONE_OPTIONS: readonly { value: Tone; label: string }[] = [
  { value: 'teal', label: 'Tyrkysová' },
  { value: 'sand', label: 'Písková' },
  { value: 'blue', label: 'Modrá' },
  { value: 'violet', label: 'Fialová' },
  { value: 'slate', label: 'Šedá' },
  { value: 'rose', label: 'Růžová' },
  { value: 'olive', label: 'Olivová' },
];

export const toneLabel = (t: Tone): string => TONE_OPTIONS.find((o) => o.value === t)?.label ?? t;

/* ------------------------------------------------------------------ */
/* Výběry času a délky                                                 */
/* ------------------------------------------------------------------ */

/** Délky služby 15–240 min po 15 min (+ případná stávající hodnota mimo rozsah). */
export function durationOptions(current?: number): Option[] {
  const values = Array.from({ length: 16 }, (_, i) => (i + 1) * 15);
  if (current && !values.includes(current)) values.push(current);
  return values
    .sort((a, b) => a - b)
    .map((v) => ({ value: String(v), label: formatDuration(v) + (v % 15 ? ' – neplatná délka' : '') }));
}

/** Časy po `step` minutách mezi `from` a `to` (minuty od půlnoci), navíc zadané hodnoty. */
export function timeOptions(from: number, to: number, step = 15, extra: readonly string[] = []): Option[] {
  const set = new Set<string>();
  for (let m = from; m <= to; m += step) set.add(timeFromMinutes(m));
  for (const e of extra) if (/^\d{2}:\d{2}$/.test(e)) set.add(e);
  return [...set].sort().map((v) => ({ value: v, label: formatTime(v) }));
}

export const SHIFT_FROM = 5 * 60;
export const SHIFT_TO = 23 * 60;

/* ------------------------------------------------------------------ */
/* Pracovní doba                                                       */
/* ------------------------------------------------------------------ */

type Span = [number, number];

function mergeSpans(spans: Span[]): Span[] {
  const sorted = spans.filter(([a, b]) => a < b).sort((x, y) => x[0] - y[0]);
  const out: Span[] = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

function subtractSpans(base: Span[], cut: Span[]): Span[] {
  let out = base;
  for (const [c0, c1] of cut) {
    const next: Span[] = [];
    for (const [a, b] of out) {
      if (c1 <= a || c0 >= b) {
        next.push([a, b]);
        continue;
      }
      if (c0 > a) next.push([a, c0]);
      if (c1 < b) next.push([c1, b]);
    }
    out = next;
  }
  return out;
}

export const rangeSpan = (r: TimeRange): Span => [minutesOfDay(r.start), minutesOfDay(r.end)];

/** Odpracované minuty dne: pracovní intervaly bez pauz. */
export function dayMinutes(work: readonly TimeRange[], breaks: readonly TimeRange[]): number {
  const spans = subtractSpans(mergeSpans(work.map(rangeSpan)), mergeSpans(breaks.map(rangeSpan)));
  return spans.reduce((sum, [a, b]) => sum + (b - a), 0);
}

export function weekMinutes(t: Pick<Therapist, 'workingHours' | 'breaks'>): number {
  return WEEKDAYS.reduce<number>((sum, wd) => sum + dayMinutes(t.workingHours[wd] ?? [], t.breaks[wd] ?? []), 0);
}

/** Pracovní úseky dne po odečtení pauz (pro mini náhled směny). */
export function daySegments(work: readonly TimeRange[], breaks: readonly TimeRange[]): { work: Span[]; breaks: Span[] } {
  const w = mergeSpans(work.map(rangeSpan));
  const br = mergeSpans(breaks.map(rangeSpan));
  return { work: subtractSpans(w, br), breaks: br };
}

export function rangesLabel(ranges: readonly TimeRange[]): string {
  return [...ranges]
    .sort((a, b) => (a.start < b.start ? -1 : 1))
    .map((r) => formatTime(r.start) + '–' + formatTime(r.end))
    .join(', ');
}

export interface DayValidation {
  work: (string | null)[];
  breaks: (string | null)[];
  hasError: boolean;
}

const onGrid = (t: string): boolean => /^\d{2}:\d{2}$/.test(t) && minutesOfDay(t) % 15 === 0;

/** Kontrola jednoho dne pracovní doby: pořadí časů, překryvy, pauzy uvnitř směny. */
export function validateDay(work: readonly TimeRange[], breaks: readonly TimeRange[]): DayValidation {
  const merged = mergeSpans(work.filter((r) => r.start < r.end).map(rangeSpan));
  const w = work.map((r, i) => {
    if (!onGrid(r.start) || !onGrid(r.end)) return 'Časy musí odpovídat 15minutové mřížce.';
    if (!(r.start < r.end)) return 'Konec musí být později než začátek.';
    if (work.some((o, j) => j !== i && o.start < o.end && r.start < o.end && o.start < r.end)) return 'Interval se překrývá s jiným intervalem.';
    return null;
  });
  const b = breaks.map((r, i) => {
    if (!onGrid(r.start) || !onGrid(r.end)) return 'Časy musí odpovídat 15minutové mřížce.';
    if (!(r.start < r.end)) return 'Konec pauzy musí být později než začátek.';
    const [s0, s1] = rangeSpan(r);
    if (!merged.some(([a, z]) => a <= s0 && s1 <= z)) return 'Pauza musí ležet uvnitř pracovní doby.';
    if (breaks.some((o, j) => j !== i && r.start < o.end && o.start < r.end)) return 'Pauza se překrývá s jinou pauzou.';
    return null;
  });
  return { work: w, breaks: b, hasError: [...w, ...b].some(Boolean) };
}

export function validateWeek(t: Pick<Therapist, 'workingHours' | 'breaks'>): Record<Weekday, DayValidation> {
  const out = {} as Record<Weekday, DayValidation>;
  for (const wd of WEEKDAYS) out[wd] = validateDay(t.workingHours[wd] ?? [], t.breaks[wd] ?? []);
  return out;
}

export function emptyWeek(): WeekSchedule {
  return { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
}

/* ------------------------------------------------------------------ */
/* Týdenní kapacita                                                    */
/* ------------------------------------------------------------------ */

export interface CapacityDay {
  date: LocalDate;
  /** Skutečná pracovní doba (bez pauz a nepřítomností). */
  minutes: number;
  /** Plánovaná pracovní doba podle rozvrhu. */
  nominal: number;
  booked: number;
  /** Terapeut má v tento den nepřítomnost. */
  off: boolean;
  /** Klinika je v tento den (zčásti) zavřená. */
  closed: boolean;
}

export interface CapacityRow {
  therapist: Therapist;
  days: CapacityDay[];
  total: number;
  nominal: number;
  booked: number;
}

export function weekCapacity(s: ClinicState, weekStart: LocalDate): CapacityRow[] {
  const dates = WEEKDAYS.map((i) => addDays(weekStart, i));
  return s.therapists
    .filter((t) => t.active)
    .sort(byOrder)
    .map((t) => {
      const days = dates.map((date, i): CapacityDay => {
        const wd = i as Weekday;
        const dayStart = combine(date, '00:00');
        const dayEnd = combine(addDays(date, 1), '00:00');
        const offs = s.timeOff.filter(
          (o) => (o.therapistId === null || o.therapistId === t.id) && o.start < dayEnd && dayStart < o.end,
        );
        return {
          date,
          minutes: workingMinutes(s, t.id, date),
          nominal: dayMinutes(t.workingHours[wd] ?? [], t.breaks[wd] ?? []),
          booked: bookedMinutes(s, t.id, date),
          off: offs.some((o) => o.therapistId !== null),
          closed: offs.some((o) => o.therapistId === null),
        };
      });
      return {
        therapist: t,
        days,
        total: days.reduce((a, d) => a + d.minutes, 0),
        nominal: days.reduce((a, d) => a + d.nominal, 0),
        booked: days.reduce((a, d) => a + d.booked, 0),
      };
    });
}

/* ------------------------------------------------------------------ */
/* Nepřítomnosti                                                       */
/* ------------------------------------------------------------------ */

export interface SessionImpact {
  session: GroupSession;
  participants: number;
}

export interface TimeOffImpact {
  bookings: Booking[];
  sessions: SessionImpact[];
}

/** Potvrzené rezervace a skupinové lekce, které nepřítomnost zasáhne (jen budoucí). */
export function timeOffImpact(
  s: ClinicState,
  therapistId: Id | null,
  start: LocalDateTime,
  end: LocalDateTime,
  now: LocalDateTime,
): TimeOffImpact {
  if (!(start < end)) return { bookings: [], sessions: [] };
  const bookings = s.bookings
    .filter(
      (b) =>
        b.status === 'confirmed' &&
        !b.sessionId &&
        b.end > now &&
        (therapistId === null || b.therapistId === therapistId) &&
        b.start < end &&
        start < b.end,
    )
    .sort((a, b) => (a.start < b.start ? -1 : 1));
  const sessions: SessionImpact[] = [];
  const last = dateOf(end);
  let date = dateOf(start);
  for (let guard = 0; date <= last && guard < 400; guard++, date = addDays(date, 1)) {
    for (const ses of sessionsOnDate(s, date)) {
      if (ses.cancelled || ses.end <= now) continue;
      if (therapistId !== null && ses.therapistId !== therapistId) continue;
      if (!(ses.start < end && start < ses.end)) continue;
      sessions.push({ session: ses, participants: sessionParticipants(s, ses.id).length });
    }
  }
  return { bookings, sessions };
}

export const isWholeDays = (start: LocalDateTime, end: LocalDateTime): boolean =>
  timeOf(start) === '00:00' && timeOf(end) === '00:00';

/** „Po 20. 10. – Pá 24. 10. · 5 dní", „St 15. 10. · 13:00–17:00". */
export function describeRange(start: LocalDateTime, end: LocalDateTime): string {
  if (isWholeDays(start, end)) {
    const from = dateOf(start);
    const lastDay = addDays(dateOf(end), -1);
    const n = daysBetween(from, dateOf(end));
    if (n <= 1) return formatDayShort(from) + ' · celý den';
    return formatDayShort(from) + ' – ' + formatDayShort(lastDay) + ' · ' + countLabel(n, ['den', 'dny', 'dní']);
  }
  if (dateOf(start) === dateOf(end)) return formatDayShort(start) + ' · ' + formatTime(start) + '–' + formatTime(end);
  return formatDayShort(start) + ' ' + formatTime(start) + ' – ' + formatDayShort(end) + ' ' + formatTime(end);
}

export const TIME_OFF_REASONS = ['Dovolená', 'Nemoc', 'Školení', 'Státní svátek', 'Lékař'] as const;

/* ------------------------------------------------------------------ */
/* Skupinové lekce                                                     */
/* ------------------------------------------------------------------ */

/** Budoucí potvrzené rezervace na termíny dané pravidelné lekce. */
export function templateBookings(s: ClinicState, templateId: Id, now: LocalDateTime): Booking[] {
  const prefix = templateId + '@';
  return s.bookings
    .filter((b) => b.status === 'confirmed' && b.end > now && !!b.sessionId && b.sessionId.startsWith(prefix))
    .sort((a, b) => (a.start < b.start ? -1 : 1));
}

/** Nejbližší termín každé lekce (do `days` dní) s počtem přihlášených. */
export function nextSessions(s: ClinicState, now: LocalDateTime, days = 21): Map<Id, SessionImpact> {
  const out = new Map<Id, SessionImpact>();
  const today = dateOf(now);
  for (let i = 0; i < days; i++) {
    for (const ses of sessionsOnDate(s, addDays(today, i))) {
      if (out.has(ses.templateId) || ses.cancelled || ses.end <= now) continue;
      out.set(ses.templateId, { session: ses, participants: sessionParticipants(s, ses.id).length });
    }
  }
  return out;
}

/** Obsazenost skupinových lekcí v následujících 7 dnech. */
export function groupOccupancy(s: ClinicState, now: LocalDateTime): { sessions: number; seats: number; taken: number } {
  const today = dateOf(now);
  let sessions = 0;
  let seats = 0;
  let taken = 0;
  for (let i = 0; i < 7; i++) {
    for (const ses of sessionsOnDate(s, addDays(today, i))) {
      if (ses.cancelled || ses.end <= now) continue;
      sessions++;
      seats += ses.capacity;
      taken += Math.min(ses.capacity, sessionParticipants(s, ses.id).length);
    }
  }
  return { sessions, seats, taken };
}

export function templateEnd(s: ClinicState, t: Pick<GroupTemplate, 'serviceId' | 'start'>): string {
  const svc = getService(s, t.serviceId);
  return timeFromMinutes(minutesOfDay(t.start) + (svc?.durationMin ?? 60));
}

/* ------------------------------------------------------------------ */
/* Permanentky a kredit                                                */
/* ------------------------------------------------------------------ */

export interface PackagePricing {
  perEntry: number;
  singleMin: number | null;
  singleMax: number | null;
  /** Sleva v % oproti jednotlivé ceně (nejlevnější / nejdražší služba). */
  discountMin: number | null;
  discountMax: number | null;
  savingsMin: number | null;
  savingsMax: number | null;
}

export function packagePricing(s: ClinicState, tpl: Pick<PackageTemplate, 'priceCzk' | 'entries' | 'serviceIds'>): PackagePricing {
  const perEntry = tpl.entries > 0 ? Math.round(tpl.priceCzk / tpl.entries) : 0;
  const prices = tpl.serviceIds
    .map((id) => getService(s, id)?.priceCzk)
    .filter((p): p is number => typeof p === 'number' && p > 0);
  if (!prices.length || tpl.entries <= 0 || tpl.priceCzk <= 0) {
    return { perEntry, singleMin: null, singleMax: null, discountMin: null, discountMax: null, savingsMin: null, savingsMax: null };
  }
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const disc = (single: number): number => Math.round((1 - tpl.priceCzk / (single * tpl.entries)) * 100);
  return {
    perEntry,
    singleMin: min,
    singleMax: max,
    discountMin: disc(min),
    discountMax: disc(max),
    savingsMin: min * tpl.entries - tpl.priceCzk,
    savingsMax: max * tpl.entries - tpl.priceCzk,
  };
}

/** „Sleva 8 %", „Sleva 5–24 %", „Bez slevy", „Dražší o 4 %". */
export function discountLabel(p: PackagePricing): { text: string; tone: 'success' | 'neutral' | 'warning' } | null {
  if (p.discountMin === null || p.discountMax === null) return null;
  const lo = Math.min(p.discountMin, p.discountMax);
  const hi = Math.max(p.discountMin, p.discountMax);
  if (hi < 0) return { text: 'Dražší o ' + (lo === hi ? formatPercent(-hi) : formatNumber(-hi) + '–' + formatPercent(-lo)), tone: 'warning' };
  if (hi === 0 && lo === 0) return { text: 'Bez slevy', tone: 'neutral' };
  if (lo === hi) return { text: 'Sleva ' + formatPercent(hi), tone: 'success' };
  return { text: 'Sleva ' + formatNumber(Math.max(0, lo)) + '–' + formatPercent(hi), tone: lo < 0 ? 'warning' : 'success' };
}

export type SoldStatus = 'active' | 'expiring' | 'usedUp' | 'expired' | 'cancelled';

export const SOLD_STATUS_LABEL: Record<SoldStatus, string> = {
  active: 'Aktivní',
  expiring: 'Končí',
  usedUp: 'Vyčerpaná',
  expired: 'Prošlá',
  cancelled: 'Zrušená',
};

export interface SoldRow {
  pkg: ClientPackage;
  client: Client | undefined;
  usage: PackageUsage;
  status: SoldStatus;
  daysLeft: number;
  /** Nevyčerpané vstupy (volné + rezervované) u platných permanentek. */
  openEntries: number;
  openValue: number;
}

export function soldPackageRows(s: ClinicState, today: LocalDate): SoldRow[] {
  const clients = indexById(s.clients);
  return s.packages.map((pkg) => {
    const usage = packageUsage(s, pkg, today);
    const daysLeft = daysBetween(today, usage.validUntil);
    let status: SoldStatus;
    if (pkg.cancelled) status = 'cancelled';
    else if (usage.validUntil < today) status = 'expired';
    else if (usage.free + usage.reserved <= 0) status = 'usedUp';
    else if (daysLeft <= 30 && usage.free > 0) status = 'expiring';
    else status = 'active';
    const open = status === 'active' || status === 'expiring' ? usage.free + usage.reserved : 0;
    return { pkg, client: clients.get(pkg.clientId), usage, status, daysLeft, openEntries: open, openValue: open * usage.unitValue };
  });
}

/** Zůstatky kreditu všech klientů najednou (jeden průchod účtem). */
export function creditBalances(s: ClinicState): Map<Id, number> {
  const m = new Map<Id, number>();
  for (const e of s.ledger) m.set(e.clientId, (m.get(e.clientId) ?? 0) + e.amount);
  for (const [k, v] of m) m.set(k, Math.round(v));
  return m;
}

/** Bonus za dobití – stejné pravidlo jako engine (platí nejvyšší dosažené procento). */
export function bonusFor(rules: readonly CreditBonusRule[], amount: number): { pct: number; bonus: number } {
  let pct = 0;
  for (const r of rules) if (amount >= r.minTopup && r.pct > pct) pct = r.pct;
  return { pct, bonus: Math.round((amount * pct) / 100) };
}

export interface BonusRowIssue {
  error: string | null;
  warning: string | null;
}

export function validateBonusRules(rules: readonly CreditBonusRule[]): BonusRowIssue[] {
  return rules.map((r, i) => {
    let error: string | null = null;
    if (!Number.isFinite(r.minTopup) || r.minTopup < 100) error = 'Částka dobití musí být alespoň 100 Kč.';
    else if (r.minTopup > 100000) error = 'Nejvyšší jednorázové dobití je 100 000 Kč.';
    else if (!Number.isFinite(r.pct) || r.pct < 1 || r.pct > 50) error = 'Bonus musí být 1–50 %.';
    else if (rules.some((o, j) => j !== i && o.minTopup === r.minTopup)) error = 'Pro tuto částku už bonus existuje.';
    let warning: string | null = null;
    if (!error && rules.some((o, j) => j !== i && o.minTopup < r.minTopup && o.pct >= r.pct)) {
      warning = 'Nikdy se neuplatní – nižší dobití už má stejný nebo vyšší bonus.';
    }
    return { error, warning };
  });
}

/* ------------------------------------------------------------------ */
/* Nastavení – koncept, změny, kontrola                                */
/* ------------------------------------------------------------------ */

export type SettingsDraft = Pick<
  Settings,
  'clinicName' | 'clinicTagline' | 'senderName' | 'senderEmail' | 'bookingRules' | 'policy' | 'waitlist' | 'reminders'
>;

export function settingsDraftOf(s: Settings): SettingsDraft {
  return clone({
    clinicName: s.clinicName,
    clinicTagline: s.clinicTagline,
    senderName: s.senderName,
    senderEmail: s.senderEmail,
    bookingRules: s.bookingRules,
    policy: s.policy,
    waitlist: s.waitlist,
    reminders: s.reminders,
  });
}

export type SectionId = 'booking' | 'policy' | 'excuses' | 'waitlist' | 'reminders' | 'clinic';

export function dirtySections(draft: SettingsDraft, base: SettingsDraft): SectionId[] {
  const out: SectionId[] = [];
  if (!deepEqual(draft.bookingRules, base.bookingRules)) out.push('booking');
  const { excuses: dEx, ...dPol } = draft.policy;
  const { excuses: bEx, ...bPol } = base.policy;
  if (!deepEqual(dPol, bPol)) out.push('policy');
  if (!deepEqual(dEx, bEx)) out.push('excuses');
  if (!deepEqual(draft.waitlist, base.waitlist)) out.push('waitlist');
  if (!deepEqual(draft.reminders, base.reminders)) out.push('reminders');
  if (
    draft.clinicName !== base.clinicName ||
    draft.clinicTagline !== base.clinicTagline ||
    draft.senderName !== base.senderName ||
    draft.senderEmail !== base.senderEmail
  )
    out.push('clinic');
  return out;
}

/** Sjednocení před uložením: stupně sestupně, ořezané texty. */
export function normalizeDraft(d: SettingsDraft): SettingsDraft {
  const n = clone(d);
  const free = n.policy.freeCancelHours;
  // bez bezplatné lhůty nemají stupně smysl (engine by je navíc odmítl)
  const tiers = free > 0 ? n.policy.lateTiers : n.policy.lateTiers.filter((t) => t.hoursBefore <= 0);
  n.policy.lateTiers = [...tiers].sort((a, b) => b.hoursBefore - a.hoursBefore);
  n.clinicName = n.clinicName.trim();
  n.clinicTagline = n.clinicTagline.trim();
  n.senderName = n.senderName.trim();
  n.senderEmail = n.senderEmail.trim();
  return n;
}

/**
 * Index stupně, který začíná hned po bezplatné lhůtě (hranice = `freeCancelHours`), nebo −1.
 * Když chybí, engine použije poplatek nejvyššího stupně (případně 100 %).
 */
export function lockedTierIndex(p: Pick<CancellationPolicy, 'freeCancelHours' | 'lateTiers'>): number {
  return p.lateTiers.findIndex((t) => t.hoursBefore === p.freeCancelHours);
}

/** Poplatek, který platí hned po skončení bezplatné lhůty (stejně jako v enginu). */
export function firstStageFee(p: Pick<CancellationPolicy, 'freeCancelHours' | 'lateTiers'>): number {
  const i = lockedTierIndex(p);
  if (i >= 0) return p.lateTiers[i].feePct;
  const inside = p.lateTiers.filter((t) => t.hoursBefore <= p.freeCancelHours).sort((a, b) => b.hoursBefore - a.hoursBefore);
  return inside[0]?.feePct ?? 100;
}

export type SettingsErrors = Partial<Record<string, string>>;

export function validateSettings(d: SettingsDraft): SettingsErrors {
  const e: SettingsErrors = {};
  const p = d.policy;
  if (!(p.freeCancelHours >= 0 && p.freeCancelHours <= 168)) e['policy.freeCancelHours'] = 'Zadejte 0–168 hodin.';
  if (p.freeCancelHours > 0) {
    // první stupeň (hranice = bezplatná lhůta) je pevný, ostatní musí ležet uvnitř lhůty
    const locked = lockedTierIndex(p);
    p.lateTiers.forEach((t, i) => {
      if (i !== locked) {
        if (!(t.hoursBefore >= 1)) e[`tier.${i}.hours`] = 'Zadejte alespoň 1 hodinu.';
        else if (t.hoursBefore >= p.freeCancelHours)
          e[`tier.${i}.hours`] = `Hranice musí být kratší než bezplatná lhůta (${formatNumber(p.freeCancelHours)} h).`;
        else if (p.lateTiers.some((o, j) => j !== locked && j < i && o.hoursBefore === t.hoursBefore))
          e[`tier.${i}.hours`] = 'Stupeň se stejnou hranicí už existuje.';
      }
      if (!(t.feePct >= 0 && t.feePct <= 100)) e[`tier.${i}.pct`] = 'Poplatek musí být 0–100 %.';
    });
  }
  if (!(p.noShowFeePct >= 0 && p.noShowFeePct <= 100)) e['policy.noShowFeePct'] = 'Poplatek musí být 0–100 %.';
  if (!(p.groupCancelHours >= 0 && p.groupCancelHours <= 168)) e['policy.groupCancelHours'] = 'Zadejte 0–168 hodin.';
  if (!(p.blockAfterNoShows >= 0 && p.blockAfterNoShows <= 20)) e['policy.blockAfterNoShows'] = 'Zadejte 1–20.';
  const x = p.excuses;
  if (!(x.makeupDays >= 1 && x.makeupDays <= 180)) e['excuses.makeupDays'] = 'Lhůta pro náhradu musí být 1–180 dní.';
  if (!(x.perClientMonths >= 1 && x.perClientMonths <= 24)) e['excuses.perClientMonths'] = 'Zadejte 1–24 měsíců.';
  if (!(x.deadlineHoursBefore >= 0 && x.deadlineHoursBefore <= 168)) e['excuses.deadlineHoursBefore'] = 'Zadejte 0–168 hodin.';
  const r = d.bookingRules;
  if (!(r.horizonDays >= 1 && r.horizonDays <= 365)) e['booking.horizonDays'] = 'Horizont rezervací musí být 1–365 dní.';
  if (!(r.maxUpcomingPerClient >= 1)) e['booking.maxUpcomingPerClient'] = 'Zadejte alespoň 1.';
  if (!d.clinicName.trim()) e['clinic.clinicName'] = 'Zadejte název kliniky.';
  if (!d.senderName.trim()) e['clinic.senderName'] = 'Zadejte jméno odesílatele.';
  if (!isEmail(d.senderEmail)) e['clinic.senderEmail'] = 'Zadejte platný e-mail, např. rezervace@klinika.cz.';
  return e;
}

/** Upozornění (neblokující) k pořadí stupňů. */
export function tierWarning(tiers: readonly LateTier[]): string | null {
  const sorted = [...tiers].sort((a, b) => b.hoursBefore - a.hoursBefore);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].feePct < sorted[i - 1].feePct)
      return 'Blíž k začátku termínu je poplatek nižší než dřív – zkontrolujte, jestli je to záměr.';
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Náhled storno podmínek                                              */
/* ------------------------------------------------------------------ */

export const PREVIEW_CLIENT_ID = '__preview_client';
export const PREVIEW_PACKAGE_ID = '__preview_package';

/** Kopie stavu s rozpracovanými podmínkami (a případně fiktivní permanentkou) – jen pro čtení. */
export function previewClinic(s: ClinicState, policy: CancellationPolicy, pkg?: ClientPackage): ClinicState {
  return {
    ...s,
    settings: { ...s.settings, policy },
    packages: pkg ? [...s.packages, pkg] : s.packages,
  };
}

export function previewPackage(s: ClinicState, service: Service, policy: CancellationPolicy, now: LocalDateTime): ClientPackage {
  const tpl = [...s.packageTemplates].sort(byOrder).find((t) => t.active && t.serviceIds.includes(service.id));
  const entries = tpl?.entries ?? 10;
  return {
    id: PREVIEW_PACKAGE_ID,
    clientId: PREVIEW_CLIENT_ID,
    templateId: tpl?.id ?? '',
    name: tpl?.name ?? 'Permanentka',
    serviceIds: [service.id],
    entriesTotal: entries,
    priceCzk: tpl?.priceCzk ?? service.priceCzk * entries,
    excusesAllowed: tpl?.excusesAllowed ?? policy.excuses.perPackage,
    purchasedAt: now,
    validUntil: addDays(dateOf(now), 120),
    paidBy: 'card',
    cancelled: false,
    extendedDays: 0,
  };
}

export function previewBooking(args: {
  service: Service;
  start: LocalDateTime;
  createdAt: LocalDateTime;
  payment: 'onsite' | 'package';
}): Booking {
  const { service, start } = args;
  const isGroup = service.kind === 'group';
  return {
    id: '__preview_booking',
    clientId: PREVIEW_CLIENT_ID,
    serviceId: service.id,
    therapistId: service.therapistIds[0] ?? '',
    roomId: '',
    start,
    end: addMinutes(start, service.durationMin),
    sessionId: isGroup ? '__preview@' + dateOf(start) : undefined,
    status: 'confirmed',
    createdAt: args.createdAt,
    createdBy: 'client',
    channel: 'online',
    price: service.priceCzk,
    payment:
      args.payment === 'package'
        ? { method: 'package', packageId: PREVIEW_PACKAGE_ID, paid: true, paidAmount: 0 }
        : { method: 'onsite', paid: false, paidAmount: 0 },
    note: '',
  };
}

/** Pomocná služba pro náhled, když katalog žádnou vhodnou nemá. */
export function fallbackService(kind: 'individual' | 'group'): Service {
  return {
    id: '__preview_service_' + kind,
    name: kind === 'group' ? 'Skupinová lekce' : 'Individuální termín',
    categoryId: '',
    durationMin: 60,
    priceCzk: kind === 'group' ? 300 : 1000,
    bufferMin: 0,
    kind,
    capacity: kind === 'group' ? 8 : 1,
    therapistIds: [],
    onlineBookable: true,
    newClientsOnly: false,
    remote: false,
    description: '',
    active: true,
    order: 0,
  };
}

export interface PolicyTier {
  hoursBefore: number;
  feePct: number;
}

/**
 * Skutečně platné stupně poplatků podle vyhodnocení enginu (bez úvodní bezplatné fáze).
 * Sousední stupně se stejným poplatkem se slučují, aby text pro klienta nebyl zdvojený.
 */
export function tiersFromEvaluation(ev: CancellationEvaluation, start: LocalDateTime): PolicyTier[] {
  const out: PolicyTier[] = [];
  for (const seg of ev.segments) {
    if (seg.from === null) continue;
    const tier = { hoursBefore: Math.round((diffMinutes(start, seg.from) / 60) * 100) / 100, feePct: seg.feePct };
    const prev = out[out.length - 1];
    if (prev && prev.feePct === tier.feePct) continue;
    out.push(tier);
  }
  return out;
}

export interface PolicyRow {
  label: string;
  value: string;
  tone: 'free' | 'partial' | 'full' | 'info';
}

export interface PolicyClause {
  id: string;
  title: string;
  text: string;
}

export interface PolicyTextInput {
  policy: CancellationPolicy;
  /** Stupně pozdního storna individuálních termínů (z vyhodnocení enginu). */
  tiers: PolicyTier[];
  /** Počty omluvenek aktivních šablon permanentek. */
  packageExcuses: number[];
}

const hShort = (h: number): string => formatNumber(h) + NBSP + 'h';

/** Stručný přehled jako v kartě klienta: „Zdarma · do 24 h před začátkem" … */
export function policyRows({ policy, tiers }: PolicyTextInput): PolicyRow[] {
  const rows: PolicyRow[] = [];
  rows.push({
    label: 'Zdarma',
    value: policy.freeCancelHours > 0 ? `do ${hShort(policy.freeCancelHours)} před začátkem` : 'kdykoli před začátkem',
    tone: 'free',
  });
  tiers.forEach((t, i) => {
    const next = tiers[i + 1];
    rows.push({
      label: t.feePct > 0 ? formatPercent(t.feePct) : 'Bez poplatku',
      value: next
        ? `${formatNumber(t.hoursBefore)}–${hShort(next.hoursBefore)} před začátkem`
        : `méně než ${hShort(t.hoursBefore)} před začátkem`,
      tone: t.feePct <= 0 ? 'free' : t.feePct < 100 ? 'partial' : 'full',
    });
  });
  rows.push({
    label: policy.noShowFeePct > 0 ? formatPercent(policy.noShowFeePct) : 'Bez poplatku',
    value: 'nedostavení bez zrušení',
    tone: policy.noShowFeePct <= 0 ? 'free' : policy.noShowFeePct < 100 ? 'partial' : 'full',
  });
  rows.push({
    label: 'Skupinové lekce',
    value:
      policy.groupCancelHours > 0
        ? `zdarma do ${hShort(policy.groupCancelHours)} předem, potom vstup propadá`
        : 'zdarma kdykoli před začátkem',
    tone: 'info',
  });
  if (policy.excuses.enabled) {
    rows.push({
      label: 'Omluvenka',
      value: `ruší poplatek · náhradní termín do ${daysGenitive(policy.excuses.makeupDays)}`,
      tone: 'info',
    });
  }
  return rows;
}

/** Podmínky celými větami – přesně tak, jak je čte klient. */
export function policyClauses({ policy, tiers, packageExcuses }: PolicyTextInput): PolicyClause[] {
  const out: PolicyClause[] = [];
  const free = policy.freeCancelHours;
  out.push({
    id: 'free',
    title: 'Zrušení zdarma',
    text:
      free > 0
        ? `Termín můžete zrušit nebo přesunout zdarma nejpozději ${hoursText(free)} před jeho začátkem.`
        : 'Termín můžete zrušit nebo přesunout zdarma kdykoli před jeho začátkem.',
  });
  if (tiers.length) {
    const parts = tiers.map((t) =>
      t.feePct > 0
        ? `méně než ${hoursText(t.hoursBefore)} předem ${formatPercent(t.feePct)} ceny`
        : `méně než ${hoursText(t.hoursBefore)} předem bez poplatku`,
    );
    out.push({ id: 'late', title: 'Pozdní zrušení', text: `Při pozdějším zrušení účtujeme storno poplatek: ${parts.join(', ')}.` });
    out.push({
      id: 'package',
      title: 'Permanentky',
      text:
        policy.packageLateHandling === 'forfeit_entry'
          ? 'Pokud pozdě zrušíte termín placený permanentkou, vstup se odečte, jako by termín proběhl.'
          : 'Pokud pozdě zrušíte termín placený permanentkou, vstup se vám vrátí a zaplatíte storno poplatek podle pravidel výše.',
    });
  }
  out.push({
    id: 'noshow',
    title: 'Nedostavení',
    text:
      policy.noShowFeePct > 0
        ? `Pokud na termín nepřijdete a předem ho nezrušíte, účtujeme ${formatPercent(policy.noShowFeePct)} ceny. U permanentky vstup propadá.`
        : 'Nedostavení bez zrušení nezpoplatňujeme, u permanentky však vstup propadá.',
  });
  out.push({
    id: 'group',
    title: 'Skupinové lekce',
    text:
      policy.groupCancelHours > 0
        ? `Ze skupinové lekce se můžete zdarma odhlásit nejpozději ${hoursText(policy.groupCancelHours)} před začátkem. Při pozdějším odhlášení místo propadá – účtujeme celou cenu lekce, u permanentky se odečte vstup.`
        : 'Ze skupinové lekce se můžete zdarma odhlásit kdykoli před jejím začátkem.',
  });
  if (policy.graceFirstLateCancel && tiers.length) {
    out.push({ id: 'grace', title: 'Jednou bez poplatku', text: 'První pozdní zrušení za posledních 12 měsíců je bez poplatku.' });
  }
  const x = policy.excuses;
  if (x.enabled) {
    const counts = [...new Set(packageExcuses)].sort((a, b) => a - b);
    let pkgPart = '';
    if (counts.length === 1) pkgPart = `Ke každé permanentce máte ${countLabel(counts[0], ['omluvenku', 'omluvenky', 'omluvenek'])}`;
    else if (counts.length > 1)
      pkgPart = `K permanentce máte ${formatNumber(counts[0])}–${formatNumber(counts[counts.length - 1])} ${plural(counts[counts.length - 1], ['omluvenku', 'omluvenky', 'omluvenek'])} podle jejího typu`;
    const clientPart =
      x.perClientCount > 0
        ? `${countLabel(x.perClientCount, ['omluvenku', 'omluvenky', 'omluvenek'])} za ${countLabel(x.perClientMonths, ['měsíc', 'měsíce', 'měsíců'])}`
        : '';
    let counting = '';
    if (pkgPart && clientPart) counting = `${pkgPart}, bez permanentky ${clientPart}.`;
    else if (pkgPart) counting = `${pkgPart}.`;
    else if (clientPart) counting = `Máte k dispozici ${clientPart}.`;
    const deadline =
      x.deadlineHoursBefore > 0
        ? `Omluvit termín lze nejpozději ${hoursText(x.deadlineHoursBefore)} před začátkem.`
        : 'Omluvit termín lze až do jeho začátku.';
    out.push({
      id: 'excuse',
      title: 'Omluvenky',
      text: [
        'Když vám do termínu vstoupí něco nečekaného, můžete ho po uplynutí bezplatné lhůty omluvit omluvenkou – bez poplatku.',
        counting,
        deadline,
        `Za omluvený předplacený termín si vyberete náhradní, který musí proběhnout do ${daysGenitive(x.makeupDays)}.`,
      ]
        .filter(Boolean)
        .join(' '),
    });
  }
  if (policy.blockAfterNoShows > 0) {
    out.push({
      id: 'block',
      title: 'Opakované nedostavení',
      text: `Po ${formatNumber(policy.blockAfterNoShows)} ${plural(policy.blockAfterNoShows, ['nedostavení', 'nedostaveních', 'nedostaveních'])} během 90 dní pozastavíme online rezervace – další termín si pak domluvíte s recepcí.`,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Služby                                                              */
/* ------------------------------------------------------------------ */

export function newServiceDraft(categoryId: Id, kind: 'individual' | 'group' = 'individual'): Service {
  return {
    id: '',
    name: '',
    categoryId,
    durationMin: kind === 'group' ? 60 : 45,
    priceCzk: 0,
    bufferMin: 0,
    kind,
    capacity: kind === 'group' ? 8 : 1,
    therapistIds: [],
    onlineBookable: true,
    newClientsOnly: false,
    remote: false,
    description: '',
    active: true,
    order: 0,
  };
}

export interface ServiceErrors {
  name?: string;
  categoryId?: string;
  durationMin?: string;
  priceCzk?: string;
  capacity?: string;
  bufferMin?: string;
}

export function validateService(svc: Service, categoryIds: readonly Id[]): ServiceErrors {
  const e: ServiceErrors = {};
  if (!svc.name.trim()) e.name = 'Zadejte název služby.';
  if (!categoryIds.includes(svc.categoryId)) e.categoryId = 'Vyberte kategorii.';
  if (!(svc.durationMin > 0) || svc.durationMin % 15 !== 0) e.durationMin = 'Délka musí být násobkem 15 minut (např. 30, 45 nebo 60 min).';
  else if (svc.durationMin > 480) e.durationMin = 'Služba může trvat nejvýše 8 hodin.';
  if (!(svc.priceCzk >= 0)) e.priceCzk = 'Cena nesmí být záporná.';
  if (!(svc.bufferMin >= 0 && svc.bufferMin <= 60)) e.bufferMin = 'Rezerva musí být 0–60 minut.';
  if (svc.kind === 'group' && !(svc.capacity >= 2)) e.capacity = 'Skupinová lekce musí mít kapacitu alespoň 2 místa.';
  return e;
}

/** Spojení tříd (bez závislosti na interních utilitách designového systému). */
export function cx(...parts: Array<string | false | null | undefined | 0>): string {
  return parts.filter(Boolean).join(' ');
}
