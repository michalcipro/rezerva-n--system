import { isDraft } from 'immer';
import type {
  Booking,
  BookingStatus,
  Category,
  Client,
  ClientPackage,
  ClinicState,
  GroupSession,
  Id,
  LocalDate,
  LocalDateTime,
  MakeupRight,
  PackageTemplate,
  Room,
  Service,
  Therapist,
} from '../domain/types';
import { addDays, addMinutes, combine, dateOf, diffMinutes, weekdayOf } from './time';

/* ------------------------------------------------------------------ */
/* Indexy (cache podle identity pole; drafty Immeru se necachují)      */
/* ------------------------------------------------------------------ */

/*
 * Cache je navázaná na identitu pole a jeho délku. V aplikaci vzniká při každé
 * změně nové pole (Immer); generátor ukázkových dat mění pole přímo, proto se
 * kontroluje i délka a lze zavolat clearSelectorCaches().
 */
let idIndexCache = new WeakMap<object, { len: number; map: Map<string, unknown> }>();

export function indexById<T extends { id: string }>(arr: readonly T[]): Map<string, T> {
  if (isDraft(arr)) return new Map(arr.map((x) => [x.id, x]));
  const hit = idIndexCache.get(arr);
  if (hit && hit.len === arr.length) return hit.map as Map<string, T>;
  const map = new Map(arr.map((x) => [x.id, x]));
  idIndexCache.set(arr, { len: arr.length, map });
  return map;
}

let groupCache = new WeakMap<object, { len: number; byKind: Map<string, Map<string, Booking[]>> }>();

export function clearSelectorCaches(): void {
  idIndexCache = new WeakMap();
  groupCache = new WeakMap();
}

function groupBookings(bookings: readonly Booking[], kind: 'client' | 'therapistDate' | 'date' | 'session'): Map<string, Booking[]> {
  const build = (): Map<string, Booking[]> => {
    const m = new Map<string, Booking[]>();
    for (const b of bookings) {
      let key: string | undefined;
      if (kind === 'client') key = b.clientId;
      else if (kind === 'therapistDate') key = b.therapistId + '|' + dateOf(b.start);
      else if (kind === 'date') key = dateOf(b.start);
      else key = b.sessionId;
      if (!key) continue;
      const list = m.get(key);
      if (list) list.push(b);
      else m.set(key, [b]);
    }
    for (const list of m.values()) list.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
    return m;
  };
  if (isDraft(bookings)) return build();
  let entry = groupCache.get(bookings);
  if (!entry || entry.len !== bookings.length) {
    entry = { len: bookings.length, byKind: new Map() };
    groupCache.set(bookings, entry);
  }
  const byKind = entry.byKind;
  let m = byKind.get(kind);
  if (!m) {
    m = build();
    byKind.set(kind, m);
  }
  return m;
}

/* ------------------------------------------------------------------ */
/* Základní dotazy                                                     */
/* ------------------------------------------------------------------ */

export const getClient = (s: ClinicState, id: Id): Client | undefined => indexById(s.clients).get(id);
export const getService = (s: ClinicState, id: Id): Service | undefined => indexById(s.services).get(id);
export const getTherapist = (s: ClinicState, id: Id): Therapist | undefined => indexById(s.therapists).get(id);
export const getCategory = (s: ClinicState, id: Id): Category | undefined => indexById(s.categories).get(id);
export const getRoom = (s: ClinicState, id: Id): Room | undefined => indexById(s.rooms).get(id);
export const getPackageTemplate = (s: ClinicState, id: Id): PackageTemplate | undefined =>
  indexById(s.packageTemplates).get(id);
export const getPackage = (s: ClinicState, id: Id): ClientPackage | undefined => indexById(s.packages).get(id);
export const getBooking = (s: ClinicState, id: Id): Booking | undefined => indexById(s.bookings).get(id);
export const getMakeup = (s: ClinicState, id: Id): MakeupRight | undefined => indexById(s.makeups).get(id);

export function therapistName(t: Pick<Therapist, 'title' | 'firstName' | 'lastName'> | undefined): string {
  if (!t) return 'Neznámý terapeut';
  return [t.title, t.firstName, t.lastName].filter(Boolean).join(' ');
}

export function therapistShort(t: Pick<Therapist, 'firstName' | 'lastName'> | undefined): string {
  if (!t) return '—';
  return t.firstName.charAt(0) + '. ' + t.lastName;
}

export function therapistInitials(t: Pick<Therapist, 'firstName' | 'lastName'> | undefined): string {
  if (!t) return '?';
  return (t.firstName.charAt(0) + t.lastName.charAt(0)).toUpperCase();
}

export function clientName(c: Pick<Client, 'firstName' | 'lastName'> | undefined): string {
  return c ? c.firstName + ' ' + c.lastName : 'Neznámý klient';
}

/** Stavy, ve kterých rezervace blokuje čas terapeuta. */
export const OCCUPYING: readonly BookingStatus[] = ['confirmed', 'completed', 'no_show'];
export const isOccupying = (status: BookingStatus): boolean => OCCUPYING.includes(status);

export const STATUS_LABEL: Record<BookingStatus, string> = {
  confirmed: 'Potvrzeno',
  completed: 'Proběhlo',
  no_show: 'Nedostavil/a se',
  cancelled: 'Zrušeno',
  late_cancelled: 'Pozdní storno',
  excused: 'Omluveno',
  clinic_cancelled: 'Zrušeno klinikou',
};

export function bookingsOfClient(s: ClinicState, clientId: Id): Booking[] {
  return groupBookings(s.bookings, 'client').get(clientId) ?? [];
}

export function bookingsOnDate(s: ClinicState, date: LocalDate): Booking[] {
  return groupBookings(s.bookings, 'date').get(date) ?? [];
}

export function bookingsOfTherapistOnDate(s: ClinicState, therapistId: Id, date: LocalDate): Booking[] {
  return groupBookings(s.bookings, 'therapistDate').get(therapistId + '|' + date) ?? [];
}

export function bookingsOfSession(s: ClinicState, sessionId: Id): Booking[] {
  return groupBookings(s.bookings, 'session').get(sessionId) ?? [];
}

export function upcomingBookingsOfClient(s: ClinicState, clientId: Id, now: LocalDateTime): Booking[] {
  return bookingsOfClient(s, clientId).filter((b) => b.status === 'confirmed' && b.end > now);
}

export function pastBookingsOfClient(s: ClinicState, clientId: Id, now: LocalDateTime): Booking[] {
  return bookingsOfClient(s, clientId)
    .filter((b) => !(b.status === 'confirmed' && b.end > now))
    .slice()
    .reverse();
}

/* ------------------------------------------------------------------ */
/* Skupinové lekce                                                     */
/* ------------------------------------------------------------------ */

export function sessionId(templateId: Id, date: LocalDate): Id {
  return templateId + '@' + date;
}

export function sessionsOnDate(s: ClinicState, date: LocalDate): GroupSession[] {
  const wd = weekdayOf(date);
  const out: GroupSession[] = [];
  for (const t of s.groupTemplates) {
    if (!t.active || t.weekday !== wd) continue;
    if (date < t.validFrom || (t.validTo && date > t.validTo)) continue;
    const service = getService(s, t.serviceId);
    if (!service) continue;
    const start = combine(date, t.start);
    const id = sessionId(t.id, date);
    out.push({
      id,
      templateId: t.id,
      serviceId: t.serviceId,
      therapistId: t.therapistId,
      roomId: t.roomId,
      title: t.title,
      start,
      end: addMinutes(start, service.durationMin),
      capacity: t.capacity,
      cancelled: s.cancelledSessions.includes(id),
    });
  }
  return out.sort((a, b) => (a.start < b.start ? -1 : 1));
}

export function getSession(s: ClinicState, id: Id): GroupSession | undefined {
  const at = id.lastIndexOf('@');
  if (at < 0) return undefined;
  const date = id.slice(at + 1);
  return sessionsOnDate(s, date).find((x) => x.id === id);
}

export function sessionParticipants(s: ClinicState, id: Id): Booking[] {
  return bookingsOfSession(s, id).filter((b) => isOccupying(b.status));
}

export function sessionFreeSpots(s: ClinicState, session: GroupSession): number {
  return Math.max(0, session.capacity - sessionParticipants(s, session.id).length);
}

/* ------------------------------------------------------------------ */
/* Permanentky, kredit, náhrady, omluvenky                            */
/* ------------------------------------------------------------------ */

export function packageValidUntil(p: ClientPackage): LocalDate {
  return p.extendedDays ? addDays(p.validUntil, p.extendedDays) : p.validUntil;
}

export interface PackageUsage {
  total: number;
  /** Absolvované vstupy. */
  used: number;
  /** Propadlé vstupy (nedostavení, pozdní storno, nevyčerpaná náhrada). */
  forfeited: number;
  /** Vstupy rezervované na budoucí termíny. */
  reserved: number;
  /** Volné vstupy k rezervaci. */
  free: number;
  excusesUsed: number;
  excusesLeft: number;
  validUntil: LocalDate;
  expired: boolean;
  /** Hodnota jednoho vstupu (cena / počet). */
  unitValue: number;
}

export function packageUsage(s: ClinicState, p: ClientPackage, today: LocalDate): PackageUsage {
  let used = 0;
  let forfeited = 0;
  let reserved = 0;
  let excusesUsed = 0;
  for (const b of bookingsOfClient(s, p.clientId)) {
    if (b.payment.packageId !== p.id) continue;
    switch (b.status) {
      case 'completed':
        used++;
        break;
      case 'no_show':
        forfeited++;
        break;
      case 'late_cancelled':
        if (b.fee?.settledBy === 'package_entry') forfeited++;
        break;
      case 'confirmed':
        reserved++;
        break;
      case 'excused':
        excusesUsed++;
        break;
      default:
        break;
    }
  }
  for (const m of s.makeups) {
    if (m.packageId === p.id && m.status === 'expired') forfeited++;
  }
  const validUntil = packageValidUntil(p);
  const free = Math.max(0, p.entriesTotal - used - forfeited - reserved);
  return {
    total: p.entriesTotal,
    used,
    forfeited,
    reserved,
    free,
    excusesUsed,
    excusesLeft: Math.max(0, p.excusesAllowed - excusesUsed),
    validUntil,
    expired: validUntil < today || p.cancelled,
    unitValue: p.entriesTotal > 0 ? Math.round(p.priceCzk / p.entriesTotal) : 0,
  };
}

export function packagesOfClient(s: ClinicState, clientId: Id): ClientPackage[] {
  return s.packages
    .filter((p) => p.clientId === clientId)
    .sort((a, b) => (a.purchasedAt < b.purchasedAt ? 1 : -1));
}

/** Aktivní permanentky (platné a s volnými nebo rezervovanými vstupy). */
export function activePackages(s: ClinicState, clientId: Id, today: LocalDate): ClientPackage[] {
  return packagesOfClient(s, clientId).filter((p) => {
    const u = packageUsage(s, p, today);
    return !u.expired && u.free + u.reserved > 0;
  });
}

/** Permanentky, kterými lze zaplatit danou službu v daný den. */
export function eligiblePackages(
  s: ClinicState,
  clientId: Id,
  serviceId: Id,
  bookingDate: LocalDate,
  today: LocalDate,
): ClientPackage[] {
  return packagesOfClient(s, clientId)
    .filter((p) => {
      if (p.cancelled || !p.serviceIds.includes(serviceId)) return false;
      const u = packageUsage(s, p, today);
      return !u.expired && u.free > 0 && u.validUntil >= bookingDate;
    })
    .sort((a, b) => (packageValidUntil(a) < packageValidUntil(b) ? -1 : 1));
}

export function clientCredit(s: ClinicState, clientId: Id): number {
  let sum = 0;
  for (const e of s.ledger) if (e.clientId === clientId) sum += e.amount;
  return Math.round(sum);
}

export function openMakeups(s: ClinicState, clientId: Id, now: LocalDateTime): MakeupRight[] {
  return s.makeups
    .filter((m) => m.clientId === clientId && m.status === 'open' && m.validUntil > now)
    .sort((a, b) => (a.validUntil < b.validUntil ? -1 : 1));
}

export function eligibleMakeups(s: ClinicState, clientId: Id, serviceId: Id, start: LocalDateTime, now: LocalDateTime): MakeupRight[] {
  return openMakeups(s, clientId, now).filter((m) => m.serviceIds.includes(serviceId) && start <= m.validUntil);
}

export interface ExcuseStatus {
  scope: 'package' | 'client';
  total: number;
  used: number;
  remaining: number;
  packageName?: string;
}

/** Kolik omluvenek má klient k dispozici pro daný termín. */
export function excuseStatusFor(s: ClinicState, booking: Booking, now: LocalDateTime): ExcuseStatus {
  const policy = s.settings.policy;
  if (booking.payment.packageId) {
    const p = getPackage(s, booking.payment.packageId);
    if (p) {
      const u = packageUsage(s, p, dateOf(now));
      return { scope: 'package', total: p.excusesAllowed, used: u.excusesUsed, remaining: u.excusesLeft, packageName: p.name };
    }
  }
  const since = addDays(now, -Math.round(policy.excuses.perClientMonths * 30.4));
  const used = bookingsOfClient(s, booking.clientId).filter(
    (b) => b.status === 'excused' && b.cancel?.excuse && !b.payment.packageId && b.cancel.at >= since,
  ).length;
  return {
    scope: 'client',
    total: policy.excuses.perClientCount,
    used,
    remaining: Math.max(0, policy.excuses.perClientCount - used),
  };
}

export interface ClientSummary {
  visits: number;
  firstVisit: LocalDateTime | null;
  lastVisit: LocalDateTime | null;
  nextBooking: Booking | null;
  upcoming: number;
  noShows90: number;
  lateCancels12m: number;
  excuses12m: number;
  spent: number;
  credit: number;
  debt: number;
}

export function clientSummary(s: ClinicState, clientId: Id, now: LocalDateTime): ClientSummary {
  const list = bookingsOfClient(s, clientId);
  const d90 = addDays(now, -90);
  const d365 = addDays(now, -365);
  let visits = 0;
  let firstVisit: LocalDateTime | null = null;
  let lastVisit: LocalDateTime | null = null;
  let nextBooking: Booking | null = null;
  let upcoming = 0;
  let noShows90 = 0;
  let lateCancels12m = 0;
  let excuses12m = 0;
  let debt = 0;
  for (const b of list) {
    if (b.status === 'completed') {
      visits++;
      if (!firstVisit || b.start < firstVisit) firstVisit = b.start;
      if (!lastVisit || b.start > lastVisit) lastVisit = b.start;
      if (!b.payment.paid && b.payment.method === 'onsite') debt += b.price - b.payment.paidAmount;
    }
    if (b.status === 'confirmed' && b.end > now) {
      upcoming++;
      if (!nextBooking || b.start < nextBooking.start) nextBooking = b;
    }
    if (b.status === 'no_show' && b.start >= d90) noShows90++;
    if (b.status === 'late_cancelled' && (b.cancel?.at ?? b.start) >= d365) lateCancels12m++;
    if (b.status === 'excused' && (b.cancel?.at ?? b.start) >= d365) excuses12m++;
    if (b.fee && b.fee.status === 'due') debt += b.fee.amount;
  }
  let spent = 0;
  for (const p of s.payments) if (p.clientId === clientId) spent += p.amount;
  return {
    visits,
    firstVisit,
    lastVisit,
    nextBooking,
    upcoming,
    noShows90,
    lateCancels12m,
    excuses12m,
    spent: Math.round(spent),
    credit: clientCredit(s, clientId),
    debt: Math.round(debt),
  };
}

/** Má klient už absolvovanou (nebo potvrzenou) návštěvu? */
export function isNewClient(s: ClinicState, clientId: Id): boolean {
  return !bookingsOfClient(s, clientId).some((b) => b.status === 'completed' || b.status === 'confirmed');
}

export function serviceCategoryTone(s: ClinicState, serviceId: Id): Category['tone'] {
  const svc = getService(s, serviceId);
  const cat = svc ? getCategory(s, svc.categoryId) : undefined;
  return cat?.tone ?? 'slate';
}

export function minutesUntil(target: LocalDateTime, now: LocalDateTime): number {
  return diffMinutes(target, now);
}
