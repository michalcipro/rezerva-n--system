/**
 * Data pro Přehled (domovská obrazovka recepce): kdo je tu teď, kdo přijde,
 * co je potřeba vyřídit. Čisté funkce nad ClinicState.
 */
import type {
  Booking,
  Client,
  ClientPackage,
  ClinicState,
  GroupSession,
  Id,
  LocalDate,
  LocalDateTime,
  MakeupRight,
} from '../../domain/types';
import { formatMoney, formatPercent } from '../../engine/format';
import {
  bookingsOfClient,
  bookingsOnDate,
  clientCredit,
  getClient,
  getPackage,
  packageUsage,
  sessionParticipants,
  sessionsOnDate,
  type PackageUsage,
} from '../../engine/selectors';
import { addDays, addMinutes, dateOf, daysBetween } from '../../engine/time';

export interface SessionNow {
  session: GroupSession;
  participants: number;
}

export interface DayLists {
  /** Potvrzené individuální termíny, které právě běží. */
  inProgress: Booking[];
  /** Skončily, ale docházka není zapsaná (při vypnuté automatické docházce). */
  unmarked: Booking[];
  sessionsNow: SessionNow[];
  /** Příchody v nejbližších `windowMin` minutách. */
  next: Booking[];
  sessionsNext: SessionNow[];
  /** První termín po tomto okně (dnes). */
  later: Booking | null;
  /** Kolik termínů dnes ještě zbývá (po teď). */
  remaining: number;
}

export function dayLists(s: ClinicState, date: LocalDate, now: LocalDateTime, therapistId: Id | null, windowMin = 120): DayLists {
  const until = addMinutes(now, windowMin);
  const list = bookingsOnDate(s, date).filter(
    (b) => !b.sessionId && b.status === 'confirmed' && (!therapistId || b.therapistId === therapistId),
  );
  const sessions = sessionsOnDate(s, date)
    .filter((ses) => !ses.cancelled && (!therapistId || ses.therapistId === therapistId))
    .map((session) => ({ session, participants: sessionParticipants(s, session.id).length }))
    .filter((x) => x.participants > 0);
  return {
    inProgress: list.filter((b) => b.start <= now && b.end > now),
    unmarked: list.filter((b) => b.end <= now),
    sessionsNow: sessions.filter((x) => x.session.start <= now && x.session.end > now),
    next: list.filter((b) => b.start > now && b.start <= until),
    sessionsNext: sessions.filter((x) => x.session.start > now && x.session.start <= until),
    later: list.find((b) => b.start > until) ?? null,
    remaining: list.filter((b) => b.start > now).length,
  };
}

/** První potvrzený individuální termín zítra (pro prázdný stav). */
export function firstOnDate(s: ClinicState, date: LocalDate, therapistId: Id | null): Booking | null {
  return (
    bookingsOnDate(s, date).find((b) => !b.sessionId && b.status === 'confirmed' && (!therapistId || b.therapistId === therapistId)) ?? null
  );
}

/* ------------------------------------------------------------------ */
/* Upozornění                                                          */
/* ------------------------------------------------------------------ */

export interface FeeItem {
  booking: Booking;
  client: Client | undefined;
  amount: number;
}

/** Neuhrazené storno poplatky a poplatky za nedostavení (nejnovější nahoře). */
export function dueFees(s: ClinicState): { items: FeeItem[]; total: number; clients: number } {
  const items: FeeItem[] = [];
  for (const b of s.bookings) {
    if (b.fee?.status !== 'due' || b.fee.amount <= 0) continue;
    items.push({ booking: b, client: getClient(s, b.clientId), amount: b.fee.amount });
  }
  items.sort((a, b) => (a.booking.start < b.booking.start ? 1 : -1));
  return {
    items,
    total: items.reduce((sum, i) => sum + i.amount, 0),
    clients: new Set(items.map((i) => i.booking.clientId)).size,
  };
}

export interface OfferGroup {
  key: string;
  start: LocalDateTime;
  therapistId: Id;
  serviceId: Id;
  sessionId?: Id;
  expiresAt: LocalDateTime;
  clientIds: Id[];
}

/** Platné nabídky z čekací listiny, seskupené podle uvolněného termínu. */
export function activeOffers(s: ClinicState, now: LocalDateTime): OfferGroup[] {
  const map = new Map<string, OfferGroup>();
  for (const w of s.waitlist) {
    if (w.status !== 'offered' || !w.offer || w.offer.expiresAt <= now) continue;
    const key = [w.offer.start, w.offer.therapistId, w.offer.sessionId ?? '', w.serviceId].join('|');
    const g = map.get(key);
    if (g) {
      g.clientIds.push(w.clientId);
      if (w.offer.expiresAt < g.expiresAt) g.expiresAt = w.offer.expiresAt;
    } else {
      map.set(key, {
        key,
        start: w.offer.start,
        therapistId: w.offer.therapistId,
        serviceId: w.serviceId,
        sessionId: w.offer.sessionId,
        expiresAt: w.offer.expiresAt,
        clientIds: [w.clientId],
      });
    }
  }
  return [...map.values()].sort((a, b) => (a.expiresAt < b.expiresAt ? -1 : 1));
}

/** Otevřené náhrady, kterým do `days` dní vyprší lhůta. */
export function makeupsDue(s: ClinicState, now: LocalDateTime, days: number): MakeupRight[] {
  const limit = addDays(now, days);
  return s.makeups
    .filter((m) => m.status === 'open' && m.validUntil > now && m.validUntil <= limit)
    .sort((a, b) => (a.validUntil < b.validUntil ? -1 : 1));
}

export interface ExpiringPackage {
  pkg: ClientPackage;
  usage: PackageUsage;
  daysLeft: number;
}

/** Platné permanentky s volnými vstupy, které skončí do `days` dní. */
export function packagesExpiring(s: ClinicState, today: LocalDate, days: number): ExpiringPackage[] {
  const out: ExpiringPackage[] = [];
  for (const pkg of s.packages) {
    if (pkg.cancelled) continue;
    const usage = packageUsage(s, pkg, today);
    if (usage.expired || usage.free <= 0) continue;
    const daysLeft = daysBetween(today, usage.validUntil);
    if (daysLeft <= days) out.push({ pkg, usage, daysLeft });
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft || b.usage.free - a.usage.free);
}

export function blockedClients(s: ClinicState): Client[] {
  return s.clients.filter((c) => c.blocked).sort((a, b) => a.lastName.localeCompare(b.lastName, 'cs'));
}

export function noShowsLast90(s: ClinicState, clientId: Id, now: LocalDateTime): number {
  const since = addDays(now, -90);
  return bookingsOfClient(s, clientId).filter((b) => b.status === 'no_show' && b.start >= since).length;
}

/** Co zápis nedostavení způsobí (stejná pravidla jako příkaz markNoShow). */
export function noShowConsequence(s: ClinicState, b: Booking, now: LocalDateTime): string {
  const pctFee = s.settings.policy.noShowFeePct;
  const parts: string[] = [];
  if (b.payment.method === 'package') {
    const p = b.payment.packageId ? getPackage(s, b.payment.packageId) : undefined;
    parts.push(`Vstup z permanentky${p ? ' ' + p.name : ''} propadne.`);
  } else if (b.payment.method === 'makeup') {
    parts.push('Náhradní termín propadne.');
  } else if (b.payment.paid && b.payment.paidAmount > 0) {
    const fee = Math.round((b.payment.paidAmount * pctFee) / 100);
    const back = b.payment.paidAmount - fee;
    parts.push(
      `Z uhrazené částky propadne ${formatMoney(fee)} (${formatPercent(pctFee)})` +
        (back > 0 ? `, ${formatMoney(back)} se vrátí na kredit.` : '.'),
    );
  } else {
    const fee = Math.round((b.price * pctFee) / 100);
    if (fee <= 0) parts.push('Bez poplatku.');
    else if (clientCredit(s, b.clientId) >= fee)
      parts.push(`Poplatek ${formatMoney(fee)} (${formatPercent(pctFee)}) se strhne z kreditu klienta.`);
    else parts.push(`Vznikne poplatek ${formatMoney(fee)} (${formatPercent(pctFee)}) k úhradě.`);
  }
  const limit = s.settings.policy.blockAfterNoShows;
  const client = getClient(s, b.clientId);
  if (limit > 0 && client && !client.blocked) {
    const count = noShowsLast90(s, b.clientId, now) + 1;
    if (count >= limit) parts.push(`Bude to ${count}. nedostavení za 90 dní, online rezervace klienta se zablokují.`);
  }
  return parts.join(' ');
}

/** Platby přijaté v daný den (Kč). */
export function paymentsOn(s: ClinicState, date: LocalDate): number {
  let sum = 0;
  for (const p of s.payments) if (dateOf(p.at) === date) sum += p.amount;
  return Math.round(sum);
}
