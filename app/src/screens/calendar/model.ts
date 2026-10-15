/**
 * Čisté pomocné funkce kalendáře (bez Reactu): rozvržení mřížky, pruhy překrývajících
 * se bloků, štítky, čekací listina, souhrny. Všechno počítá nad `ClinicState`.
 */
import type {
  Booking,
  BookingStatus,
  Client,
  ClinicState,
  GroupSession,
  Id,
  LocalDate,
  LocalDateTime,
  Service,
  Therapist,
  WaitlistEntry,
} from '../../domain/types';
import { bookedMinutes, freeWindows, workingMinutes, type Interval, type TherapistDay } from '../../engine/availability';
import { countLabel, formatDayMonth, formatDuration, plural } from '../../engine/format';
import {
  bookingsOfClient,
  bookingsOnDate,
  getCategory,
  getPackage,
  getService,
  getSession,
  isOccupying,
  packageUsage,
  packageValidUntil,
  sessionParticipants,
  sessionsOnDate,
} from '../../engine/selectors';
import { addDays, addMinutes, dateOf, daysBetween, minutesOf, minutesOfDay, startOfWeek, weekdayOf } from '../../engine/time';

/* ------------------------------------------------------------------ */
/* Mřížka                                                              */
/* ------------------------------------------------------------------ */

/** Výchozí rozsah dne 7:00–20:00 (rozšíří se, když směna nebo termín leží mimo). */
export const DAY_START_MIN = 7 * 60;
export const DAY_END_MIN = 20 * 60;
/** Krok mřížky a přichycení při přetahování. */
export const STEP_MIN = 15;
/** Šířka sloupce s časy. */
export const GUTTER_PX = 52;

export interface GridRange {
  startMin: number;
  endMin: number;
}

/** Minuty od půlnoci data `date` (konec v další den = 1440 +). */
export function minuteIn(dt: LocalDateTime, date: LocalDate): number {
  return daysBetween(date, dateOf(dt)) * 1440 + minutesOf(dt);
}

export interface ColumnModel {
  key: string;
  date: LocalDate;
  therapist: Therapist;
  day: TherapistDay;
}

/** Rozsah zobrazených hodin: 7–20 h, rozšířený o směny a termíny mimo tento rozsah. */
export function gridRange(columns: ColumnModel[]): GridRange {
  let start = DAY_START_MIN;
  let end = DAY_END_MIN;
  const take = (a: number, b: number): void => {
    start = Math.min(start, a);
    end = Math.max(end, b);
  };
  for (const col of columns) {
    const wd = weekdayOf(col.date);
    for (const r of col.therapist.workingHours[wd] ?? []) take(minutesOfDay(r.start), minutesOfDay(r.end));
    for (const b of col.day.bookings) take(minuteIn(b.start, col.date), minuteIn(b.end, col.date));
    for (const s of col.day.sessions) take(minuteIn(s.start, col.date), minuteIn(s.end, col.date));
  }
  start = Math.max(0, Math.floor(start / 60) * 60);
  end = Math.min(24 * 60, Math.ceil(end / 60) * 60);
  return { startMin: start, endMin: Math.max(end, start + 60) };
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function snap(min: number, step = STEP_MIN): number {
  return Math.round(min / step) * step;
}

export function floorStep(min: number, step = STEP_MIN): number {
  return Math.floor(min / step) * step;
}

/** Hustota obsahu bloku podle výšky v px. */
export function densityFor(minutes: number, ppm: number): 'xs' | 'sm' | 'md' | 'lg' {
  const px = minutes * ppm;
  if (px < 22) return 'xs';
  if (px < 36) return 'sm';
  if (px < 52) return 'md';
  return 'lg';
}

/* ------------------------------------------------------------------ */
/* Pruhy překrývajících se bloků                                       */
/* ------------------------------------------------------------------ */

export interface Placed<T> {
  item: T;
  startMin: number;
  endMin: number;
  lane: number;
  lanes: number;
}

/** Klasické rozdělení překrývajících se bloků do pruhů (jako Google Kalendář). */
export function layoutLanes<T>(items: T[], range: (item: T) => [number, number]): Placed<T>[] {
  const sorted: Placed<T>[] = items
    .map((item) => {
      const [s, e] = range(item);
      return { item, startMin: s, endMin: Math.max(e, s + 1), lane: 0, lanes: 1 };
    })
    .sort((a, b) => a.startMin - b.startMin || b.endMin - b.startMin - (a.endMin - a.startMin));
  const out: Placed<T>[] = [];
  let cluster: Placed<T>[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;
  const flush = (): void => {
    for (const p of cluster) p.lanes = laneEnds.length;
    out.push(...cluster);
    cluster = [];
    laneEnds = [];
    clusterEnd = -Infinity;
  };
  for (const p of sorted) {
    if (cluster.length && p.startMin >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= p.startMin);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(p.endMin);
    } else {
      laneEnds[lane] = p.endMin;
    }
    p.lane = lane;
    cluster.push(p);
    clusterEnd = Math.max(clusterEnd, p.endMin);
  }
  if (cluster.length) flush();
  return out;
}

/* ------------------------------------------------------------------ */
/* Rozvržení jednoho sloupce                                           */
/* ------------------------------------------------------------------ */

export interface Span {
  startMin: number;
  endMin: number;
}

export type ColumnItem = { kind: 'booking'; booking: Booking } | { kind: 'session'; session: GroupSession };

export interface GhostItem extends Span {
  booking: Booking;
  offer: OfferGroup | null;
}

export interface FreeItem extends Span {
  start: LocalDateTime;
  end: LocalDateTime;
  /** Okno se překrývá se zrušeným termínem – kreslí se jen levá část sloupce. */
  narrow: boolean;
}

export interface LabeledSpan extends Span {
  label: string;
}

export interface SessionGhost extends Span {
  session: GroupSession;
}

export interface ColumnLayout {
  offhours: Span[];
  breaks: LabeledSpan[];
  timeOff: LabeledSpan[];
  items: Placed<ColumnItem>[];
  ghosts: GhostItem[];
  /** Zrušené skupinové lekce (nezabírají místo). */
  cancelledSessions: SessionGhost[];
  frees: FreeItem[];
  /** Terapeut ten den nepracuje (nebo má celý den volno). */
  closedLabel: string | null;
}

const overlapsSpan = (a: Span, b: Span): boolean => a.startMin < b.endMin && b.startMin < a.endMin;

/** Datum + minuty od půlnoci → LocalDateTime (1440 = půlnoc dalšího dne). */
export function combineMin(date: LocalDate, minutes: number): LocalDateTime {
  return addMinutes(date + 'T00:00', minutes);
}

function complement(range: GridRange, spans: Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => a.startMin - b.startMin);
  const out: Span[] = [];
  let cursor = range.startMin;
  for (const s of sorted) {
    if (s.startMin > cursor) out.push({ startMin: cursor, endMin: Math.min(s.startMin, range.endMin) });
    cursor = Math.max(cursor, s.endMin);
  }
  if (cursor < range.endMin) out.push({ startMin: cursor, endMin: range.endMin });
  return out.filter((s) => s.endMin > s.startMin);
}

export function columnLayout(
  s: ClinicState,
  col: ColumnModel,
  range: GridRange,
  now: LocalDateTime,
  opts: { showCancelled: boolean; offers: Map<string, OfferGroup> },
): ColumnLayout {
  const { day, date, therapist } = col;
  const toSpan = (iv: Interval): Span => ({ startMin: minuteIn(iv.start, date), endMin: minuteIn(iv.end, date) });
  const wd = weekdayOf(date);
  const hours = (therapist.workingHours[wd] ?? []).map((r) => ({ startMin: minutesOfDay(r.start), endMin: minutesOfDay(r.end) }));
  const offhours = complement(range, hours);

  const dayStart = date + 'T00:00';
  const dayEnd = addDays(date, 1) + 'T00:00';
  const timeOff: LabeledSpan[] = s.timeOff
    .filter((t) => (t.therapistId === null || t.therapistId === therapist.id) && t.start < dayEnd && t.end > dayStart)
    .map((t) => ({
      startMin: t.start <= dayStart ? 0 : minuteIn(t.start, date),
      endMin: t.end >= dayEnd ? 1440 : minuteIn(t.end, date),
      label: t.reason.trim() || (t.therapistId === null ? 'Klinika zavřená' : 'Nepřítomnost'),
    }))
    .map((t) => ({ ...t, startMin: Math.max(t.startMin, range.startMin), endMin: Math.min(t.endMin, range.endMin) }))
    .filter((t) => t.endMin > t.startMin);
  // pauzy, které nespadají do nepřítomnosti
  const breaks: LabeledSpan[] = day.breaks
    .map((iv) => ({ ...toSpan(iv), label: 'Pauza' }))
    .filter((b) => !timeOff.some((t) => t.startMin <= b.startMin && t.endMin >= b.endMin));

  // Popisek jen pro den bez směny; celodenní nepřítomnost má vlastní šrafovaný blok.
  const closedLabel: string | null = hours.length ? null : 'Nepracuje';

  const occupying: ColumnItem[] = [];
  const ghosts: GhostItem[] = [];
  for (const b of day.bookings) {
    if (isOccupying(b.status)) occupying.push({ kind: 'booking', booking: b });
    else if (opts.showCancelled || opts.offers.has(offerKey(b.therapistId, b.start))) {
      ghosts.push({ booking: b, startMin: minuteIn(b.start, date), endMin: minuteIn(b.end, date), offer: opts.offers.get(offerKey(b.therapistId, b.start)) ?? null });
    }
  }
  const cancelledSessions: SessionGhost[] = [];
  for (const ses of day.sessions) {
    if (ses.cancelled) {
      if (opts.showCancelled) cancelledSessions.push({ session: ses, startMin: minuteIn(ses.start, date), endMin: minuteIn(ses.end, date) });
      continue;
    }
    occupying.push({ kind: 'session', session: ses });
  }
  const items = layoutLanes(occupying, (it) => {
    const iv = it.kind === 'booking' ? it.booking : it.session;
    return [minuteIn(iv.start, date), minuteIn(iv.end, date)];
  });
  // Zrušené termíny, které leží pod obsazeným blokem, se nekreslí (nezabírají místo).
  const visibleGhosts = ghosts.filter((g) => !items.some((p) => p.startMin <= g.startMin && p.endMin >= g.endMin));
  // Jeden zrušený termín na stejný čas stačí (jinak by se kreslily přes sebe).
  const dedup: GhostItem[] = [];
  const cancelledAt = (g: GhostItem): string => g.booking.cancel?.at ?? g.booking.start;
  visibleGhosts.sort((a, b) => (b.offer ? 1 : 0) - (a.offer ? 1 : 0) || (cancelledAt(a) < cancelledAt(b) ? 1 : -1));
  for (const g of visibleGhosts) {
    if (!dedup.some((d) => overlapsSpan(d, g))) dedup.push(g);
  }

  // Volná okna bez uvolněných termínů nabídnutých čekající listině (ty mají vlastní blok přes celou šířku).
  const released = dedup.filter((g) => g.offer);
  const frees: FreeItem[] = [];
  if (dateOf(now) <= date) {
    for (const iv of day.freeWindows) {
      let pieces: Span[] = [toSpan(iv)];
      for (const r of released) {
        pieces = pieces.flatMap((p) =>
          overlapsSpan(p, r)
            ? [
                { startMin: p.startMin, endMin: r.startMin },
                { startMin: r.endMin, endMin: p.endMin },
              ].filter((x) => x.endMin - x.startMin >= 30)
            : [p],
        );
      }
      for (const p of pieces) {
        frees.push({
          ...p,
          start: combineMin(date, p.startMin),
          end: combineMin(date, p.endMin),
          narrow: dedup.some((g) => !g.offer && overlapsSpan(g, p)),
        });
      }
    }
  }

  return { offhours, breaks, timeOff, items, ghosts: dedup, cancelledSessions, frees, closedLabel };
}

/* ------------------------------------------------------------------ */
/* Rezervace – štítky a odvozené údaje                                 */
/* ------------------------------------------------------------------ */

/** První návštěva klienta (žádná dřívější proběhlá návštěva). */
export function isFirstVisit(s: ClinicState, b: Booking): boolean {
  return !bookingsOfClient(s, b.clientId).some((x) => x.id !== b.id && x.status === 'completed' && x.start < b.start);
}

export interface PackageEntryInfo {
  index: number;
  total: number;
  name: string;
  validUntil: LocalDate;
  used: number;
  forfeited: number;
  reserved: number;
  free: number;
}

const countsAsEntry = (b: Booking): boolean =>
  b.status === 'completed' ||
  b.status === 'confirmed' ||
  b.status === 'no_show' ||
  (b.status === 'late_cancelled' && b.fee?.settledBy === 'package_entry');

/** Kolikátý vstup permanentky termín je („vstup 7/10“). */
export function packageEntry(s: ClinicState, b: Booking, today: LocalDate): PackageEntryInfo | null {
  if (!b.payment.packageId) return null;
  const p = getPackage(s, b.payment.packageId);
  if (!p) return null;
  // Pořadí vstupu: dřívější čerpání (termíny i propadlé náhrady z této permanentky) + 1.
  const counted = countsAsEntry(b);
  const before =
    bookingsOfClient(s, b.clientId).filter((x) => x.id !== b.id && x.payment.packageId === p.id && countsAsEntry(x) && x.start < b.start).length +
    s.makeups.filter((m) => m.packageId === p.id && m.status === 'expired' && m.validUntil < b.start).length;
  const u = packageUsage(s, p, today);
  return {
    index: counted ? before + 1 : 0,
    total: p.entriesTotal,
    name: p.name,
    validUntil: packageValidUntil(p),
    used: u.used,
    forfeited: u.forfeited,
    reserved: u.reserved,
    free: u.free,
  };
}

/** Krátký popis platby do bloku v kalendáři. */
export function paymentHint(s: ClinicState, b: Booking, today: LocalDate): string {
  switch (b.payment.method) {
    case 'package': {
      const e = packageEntry(s, b, today);
      return e && e.index ? `permanentka ${e.index}/${e.total}` : 'permanentka';
    }
    case 'credit':
      return 'z kreditu';
    case 'online':
      return 'zaplaceno online';
    case 'makeup':
      return 'náhrada za omluvenku';
    case 'free':
      return 'zdarma';
    default:
      return b.payment.paid ? 'zaplaceno' : 'na místě';
  }
}

/** Ženská příjmení končí na -á → „Nedostavila se“. */
export function noShowLabel(client: Pick<Client, 'lastName'> | undefined): string {
  const last = client?.lastName.trim().toLowerCase() ?? '';
  if (last.endsWith('á')) return 'Nedostavila se';
  if (!last || last.endsWith('í')) return 'Nedostavil/a se';
  return 'Nedostavil se';
}

export function statusLabel(status: BookingStatus, client: Pick<Client, 'lastName'> | undefined): string | undefined {
  return status === 'no_show' ? noShowLabel(client) : undefined;
}

export const GHOST_LABEL: Partial<Record<BookingStatus, string>> = {
  cancelled: 'Zrušeno',
  late_cancelled: 'Pozdní storno',
  excused: 'Omluveno',
  clinic_cancelled: 'Zrušeno klinikou',
};

/* ------------------------------------------------------------------ */
/* Čekací listina                                                      */
/* ------------------------------------------------------------------ */

export interface OfferGroup {
  key: string;
  start: LocalDateTime;
  end: LocalDateTime;
  therapistId: Id;
  serviceId: Id;
  sessionId?: Id;
  entries: WaitlistEntry[];
  expiresAt: LocalDateTime;
}

export const offerKey = (therapistId: Id, start: LocalDateTime): string => therapistId + '|' + start;

/** Aktivní nabídky uvolněných termínů (seskupené podle termínu). */
export function activeOfferGroups(s: ClinicState, now: LocalDateTime): OfferGroup[] {
  const map = new Map<string, OfferGroup>();
  for (const w of s.waitlist) {
    if (w.status !== 'offered' || !w.offer || w.offer.expiresAt <= now) continue;
    const key = offerKey(w.offer.therapistId, w.offer.start);
    let g = map.get(key);
    if (!g) {
      const svc = getService(s, w.serviceId);
      const ses = w.offer.sessionId ? getSession(s, w.offer.sessionId) : undefined;
      g = {
        key,
        start: w.offer.start,
        end: ses?.end ?? addMinutes(w.offer.start, svc?.durationMin ?? 60),
        therapistId: w.offer.therapistId,
        serviceId: w.serviceId,
        sessionId: w.offer.sessionId,
        entries: [],
        expiresAt: w.offer.expiresAt,
      };
      map.set(key, g);
    }
    g.entries.push(w);
    if (w.offer.expiresAt < g.expiresAt) g.expiresAt = w.offer.expiresAt;
  }
  return [...map.values()].sort((a, b) => (a.expiresAt < b.expiresAt ? -1 : 1));
}

/** Čekající (bez nabídky) na dny v rozsahu [from, to]. */
export function waitingEntries(s: ClinicState, from: LocalDate, to: LocalDate): WaitlistEntry[] {
  return s.waitlist
    .filter((w) => w.status === 'waiting' && w.dateFrom <= to && w.dateTo >= from)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

export function waitingForSession(s: ClinicState, sessionId: Id): WaitlistEntry[] {
  return s.waitlist
    .filter((w) => w.sessionId === sessionId && (w.status === 'waiting' || w.status === 'offered'))
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

/* ------------------------------------------------------------------ */
/* Souhrny                                                             */
/* ------------------------------------------------------------------ */

export interface ScheduleSummary {
  bookings: number;
  groupSessions: number;
  groupParticipants: number;
  inProgress: number;
  excused: number;
  noShows: number;
  occupancy: number;
  freeWindows: number;
}

/** Souhrn pro vybrané terapeuty a dny (pro filtr terapeuta a týdenní pohled). */
export function scheduleSummary(s: ClinicState, therapistIds: Id[], dates: LocalDate[], now: LocalDateTime): ScheduleSummary {
  const ids = new Set(therapistIds);
  let bookings = 0;
  let inProgress = 0;
  let excused = 0;
  let noShows = 0;
  let booked = 0;
  let available = 0;
  let groupSessions = 0;
  let groupParticipants = 0;
  let windows = 0;
  for (const date of dates) {
    for (const b of bookingsOnDate(s, date)) {
      if (!ids.has(b.therapistId) || b.sessionId) continue;
      if (isOccupying(b.status)) bookings++;
      if (b.status === 'confirmed' && b.start <= now && b.end > now) inProgress++;
      if (b.status === 'excused') excused++;
      if (b.status === 'no_show') noShows++;
    }
    for (const ses of sessionsOnDate(s, date)) {
      if (!ids.has(ses.therapistId) || ses.cancelled) continue;
      const n = sessionParticipants(s, ses.id).length;
      if (n > 0) {
        groupSessions++;
        groupParticipants += n;
      }
    }
    for (const id of ids) {
      booked += bookedMinutes(s, id, date);
      available += workingMinutes(s, id, date);
      if (date >= dateOf(now)) windows += freeWindows(s, id, date, now, 45).length;
    }
  }
  return {
    bookings,
    groupSessions,
    groupParticipants,
    inProgress,
    excused,
    noShows,
    occupancy: available ? Math.round((booked / available) * 100) : 0,
    freeWindows: windows,
  };
}

/* ------------------------------------------------------------------ */
/* Data a popisky                                                      */
/* ------------------------------------------------------------------ */

/** Dny týdenního pohledu: Po–So, neděle jen když terapeut v neděli pracuje nebo má termíny. */
export function weekDates(s: ClinicState, date: LocalDate, therapist: Therapist | undefined): LocalDate[] {
  const monday = startOfWeek(date);
  const sunday = addDays(monday, 6);
  const sundayUsed =
    !!therapist &&
    ((therapist.workingHours[6] ?? []).length > 0 ||
      bookingsOnDate(s, sunday).some((b) => b.therapistId === therapist.id && isOccupying(b.status)) ||
      sessionsOnDate(s, sunday).some((x) => x.therapistId === therapist.id));
  return Array.from({ length: sundayUsed ? 7 : 6 }, (_, i) => addDays(monday, i));
}

/** „12.–17. října 2026“, „28. září – 3. října 2026“. */
export function weekRangeLabel(from: LocalDate, to: LocalDate): string {
  const y1 = from.slice(0, 4);
  const y2 = to.slice(0, 4);
  if (y1 !== y2) return `${formatDayMonth(from)} ${y1} – ${formatDayMonth(to)} ${y2}`;
  if (from.slice(5, 7) === to.slice(5, 7)) return `${Number(from.slice(8, 10))}.–${formatDayMonth(to)} ${y2}`;
  return `${formatDayMonth(from)} – ${formatDayMonth(to)} ${y2}`;
}

/** „Dnes“, „Zítra“, „Za 3 dny“, „Před 2 dny“. */
export function relativeDayLabel(date: LocalDate, today: LocalDate): string {
  const d = daysBetween(today, date);
  if (d === 0) return 'Dnes';
  if (d === 1) return 'Zítra';
  if (d === -1) return 'Včera';
  if (d > 0) return 'Za ' + countLabel(d, ['den', 'dny', 'dní']);
  const a = Math.abs(d);
  return 'Před ' + a + ' ' + (a === 1 ? 'dnem' : 'dny');
}

/** Popis služby do výběru: „Mentální koučink · 60 min · 1 900 Kč“ (délku nepřidá, když už je v názvu). */
export function serviceOptionLabel(svc: Service, price: string): string {
  const dur = formatDuration(svc.durationMin);
  const name = svc.name.includes(String(svc.durationMin) + ' min') ? svc.name : `${svc.name} · ${dur}`;
  return `${name} · ${price}` + (svc.kind === 'group' ? ' · skupinová' : '');
}

export interface ServiceGroup {
  id: Id;
  name: string;
  services: Service[];
}

/** Aktivní služby seskupené podle kategorií (pro výběr). */
export function servicesByCategory(s: ClinicState, filter?: (svc: Service) => boolean): ServiceGroup[] {
  const groups = new Map<Id, ServiceGroup>();
  const list = s.services
    .filter((x) => x.active && (!filter || filter(x)))
    .sort((a, b) => {
      const ca = getCategory(s, a.categoryId)?.order ?? 99;
      const cb = getCategory(s, b.categoryId)?.order ?? 99;
      return ca - cb || a.order - b.order;
    });
  for (const svc of list) {
    const cat = getCategory(s, svc.categoryId);
    const id = cat?.id ?? 'other';
    let g = groups.get(id);
    if (!g) {
      g = { id, name: cat?.name ?? 'Ostatní', services: [] };
      groups.set(id, g);
    }
    g.services.push(svc);
  }
  return [...groups.values()];
}

/** Výchozí služba terapeuta: první individuální služba, ne „jen pro nové klienty“. */
export function defaultServiceFor(s: ClinicState, therapistId: Id | undefined, maxMinutes?: number): Service | undefined {
  const groups = servicesByCategory(s, (x) => x.kind === 'individual' && (!therapistId || x.therapistIds.includes(therapistId)));
  const all = groups.flatMap((g) => g.services);
  const fit = (x: Service): boolean => !maxMinutes || x.durationMin <= maxMinutes;
  return all.find((x) => !x.newClientsOnly && fit(x)) ?? all.find((x) => !x.newClientsOnly) ?? all[0];
}

/* ------------------------------------------------------------------ */
/* Hledání klientů                                                     */
/* ------------------------------------------------------------------ */

export const normalize = (v: string): string =>
  v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** Vyhledání podle jména, e-mailu nebo telefonu (bez diakritiky). */
export function searchClients(s: ClinicState, query: string, limit = 8): Client[] {
  const q = normalize(query);
  if (q.length < 2) return [];
  const digits = q.replace(/[^\d]/g, '');
  const scored: { c: Client; score: number }[] = [];
  for (const c of s.clients) {
    const first = normalize(c.firstName);
    const last = normalize(c.lastName);
    const full = first + ' ' + last;
    const rev = last + ' ' + first;
    let score = -1;
    if (full.startsWith(q) || rev.startsWith(q)) score = 3;
    else if (first.startsWith(q) || last.startsWith(q)) score = 2;
    else if (full.includes(q) || rev.includes(q)) score = 1;
    else if (c.email.toLowerCase().includes(q)) score = 1;
    else if (digits.length >= 3 && c.phone.replace(/[^\d]/g, '').includes(digits)) score = 1;
    if (score >= 0) scored.push({ c, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || (a.c.lastName + a.c.firstName).localeCompare(b.c.lastName + b.c.firstName, 'cs'))
    .slice(0, limit)
    .map((x) => x.c);
}

/** „3 volná místa“, „1 volné místo“. */
export function freeSpotsLabel(n: number): string {
  if (n <= 0) return 'plno';
  return `${n} ${plural(n, ['volné místo', 'volná místa', 'volných míst'])}`;
}
