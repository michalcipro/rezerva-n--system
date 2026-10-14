import type { Booking, ClinicState, Id, LocalDate, LocalDateTime, PaymentPurpose, Tone } from '../domain/types';
import { bookedMinutes, workingIntervals, workingMinutes } from './availability';
import {
  bookingsOfClient,
  getCategory,
  getPackage,
  getService,
  isOccupying,
  packageUsage,
} from './selectors';
import {
  addDays,
  addMonths,
  combine,
  dateOf,
  daysBetween,
  diffMinutes,
  eachDay,
  maxStr,
  minStr,
  monthKey,
  startOfMonth,
  weekdayOf,
} from './time';

export interface StatsQuery {
  from: LocalDate;
  /** Exkluzivní konec období. */
  to: LocalDate;
  therapistId?: Id | null;
  categoryId?: Id | null;
}

export interface StatsCore {
  bookings: number;
  completed: number;
  upcoming: number;
  noShow: number;
  cancelled: number;
  lateCancelled: number;
  excused: number;
  clinicCancelled: number;
  cancellationRate: number;
  lateRate: number;
  noShowRate: number;
  utilization: number;
  bookedMinutes: number;
  availableMinutes: number;
  revenue: number;
  deliveredValue: number;
  revenuePerHour: number;
  newClients: number;
  activeClients: number;
  returningClients: number;
  rebookingRate: number;
}

export interface StatsResult extends StatsCore {
  query: StatsQuery;
  days: number;
  previous: StatsCore;
  revenueByPurpose: Record<PaymentPurpose, number>;
  byCategory: { categoryId: Id; name: string; tone: Tone; count: number; value: number }[];
  byTherapist: { therapistId: Id; booked: number; available: number; pct: number; completed: number; value: number }[];
  byChannel: { online: number; recepce: number; telefon: number };
  daily: { date: LocalDate; count: number; completed: number; cancelled: number }[];
  heatmap: { weekday: number; hour: number; pct: number; booked: number; available: number }[];
  packages: {
    sold: { templateId: Id; name: string; count: number; revenue: number }[];
    soldTotal: number;
    expiringSoon: number;
    expiringEntries: number;
    liabilityEntries: number;
    liabilityValue: number;
    creditLiability: number;
  };
  excuses: { used: number; makeupsOpen: number; makeupsUsed: number; makeupsExpired: number };
  trend: { month: string; bookings: number; cancellationRate: number; noShowRate: number; revenue: number }[];
}

const CANCEL_STATUSES = new Set(['cancelled', 'late_cancelled', 'excused']);

function matches(s: ClinicState, b: Booking, q: StatsQuery): boolean {
  if (q.therapistId && b.therapistId !== q.therapistId) return false;
  if (q.categoryId && getService(s, b.serviceId)?.categoryId !== q.categoryId) return false;
  return true;
}

function bookingValue(s: ClinicState, b: Booking, today: LocalDate): number {
  if (b.payment.packageId) {
    const p = getPackage(s, b.payment.packageId);
    if (p) return packageUsage(s, p, today).unitValue;
  }
  return b.price;
}

function inPeriod(dt: LocalDateTime, q: StatsQuery): boolean {
  return dt >= q.from && dateOf(dt) < q.to;
}

function core(s: ClinicState, q: StatsQuery, now: LocalDateTime): StatsCore {
  const today = dateOf(now);
  const list = s.bookings.filter((b) => inPeriod(b.start, q) && matches(s, b, q));
  let completed = 0;
  let upcoming = 0;
  let noShow = 0;
  let cancelled = 0;
  let lateCancelled = 0;
  let excused = 0;
  let clinicCancelled = 0;
  let deliveredValue = 0;
  const activeClients = new Set<Id>();
  for (const b of list) {
    switch (b.status) {
      case 'completed':
        completed++;
        deliveredValue += bookingValue(s, b, today);
        activeClients.add(b.clientId);
        break;
      case 'confirmed':
        upcoming++;
        break;
      case 'no_show':
        noShow++;
        break;
      case 'cancelled':
        cancelled++;
        break;
      case 'late_cancelled':
        lateCancelled++;
        break;
      case 'excused':
        excused++;
        break;
      case 'clinic_cancelled':
        clinicCancelled++;
        break;
    }
  }
  const total = list.length - clinicCancelled;

  // vytíženost
  const therapists = s.therapists.filter((t) => t.active && (!q.therapistId || t.id === q.therapistId));
  let booked = 0;
  let available = 0;
  const days = eachDay(q.from, q.to);
  if (!q.categoryId) {
    for (const t of therapists) {
      for (const day of days) {
        available += workingMinutes(s, t.id, day);
        booked += bookedMinutes(s, t.id, day);
      }
    }
  } else {
    for (const b of list) if (isOccupying(b.status)) booked += diffMinutes(b.end, b.start);
    for (const t of therapists) for (const day of days) available += workingMinutes(s, t.id, day);
  }

  // tržby = přijaté peníze v období
  let revenue = 0;
  if (!q.therapistId && !q.categoryId) {
    for (const p of s.payments) if (inPeriod(p.at, q)) revenue += p.amount;
  } else {
    revenue = deliveredValue;
  }

  // noví klienti = registrovaní v období, kteří u nás v období byli; ostatní aktivní = vracející se
  let newClients = 0;
  let returning = 0;
  const createdIn = new Set(s.clients.filter((c) => inPeriod(c.createdAt, q)).map((c) => c.id));
  for (const clientId of activeClients) {
    if (createdIn.has(clientId)) newClients++;
    else returning++;
  }

  // rebooking: po návštěvě má klient další termín do 30 dní
  let rebooked = 0;
  let completedForRebook = 0;
  for (const b of list) {
    if (b.status !== 'completed' || b.sessionId) continue;
    completedForRebook++;
    const limit = addDays(b.start, 30);
    if (bookingsOfClient(s, b.clientId).some((x) => x.start > b.start && x.start <= limit && (isOccupying(x.status) || x.status === 'excused'))) rebooked++;
  }

  const attended = completed + noShow;
  return {
    bookings: total,
    completed,
    upcoming,
    noShow,
    cancelled,
    lateCancelled,
    excused,
    clinicCancelled,
    cancellationRate: total ? (cancelled + lateCancelled + excused) / total : 0,
    lateRate: total ? lateCancelled / total : 0,
    noShowRate: attended ? noShow / attended : 0,
    utilization: available ? booked / available : 0,
    bookedMinutes: booked,
    availableMinutes: available,
    revenue: Math.round(revenue),
    deliveredValue: Math.round(deliveredValue),
    revenuePerHour: booked ? Math.round(deliveredValue / (booked / 60)) : 0,
    newClients,
    activeClients: activeClients.size,
    returningClients: returning,
    rebookingRate: completedForRebook ? rebooked / completedForRebook : 0,
  };
}

export function computeStats(s: ClinicState, q: StatsQuery, now: LocalDateTime): StatsResult {
  const today = dateOf(now);
  const base = core(s, q, now);
  const days = Math.max(1, daysBetween(q.from, q.to));
  const prevQuery: StatsQuery = { ...q, from: addDays(q.from, -days), to: q.from };
  const previous = core(s, prevQuery, now);
  const list = s.bookings.filter((b) => inPeriod(b.start, q) && matches(s, b, q));

  const revenueByPurpose: Record<PaymentPurpose, number> = { booking: 0, package: 0, credit_topup: 0, storno_fee: 0 };
  for (const p of s.payments) if (inPeriod(p.at, q)) revenueByPurpose[p.purpose] += p.amount;

  // kategorie
  const catMap = new Map<Id, { count: number; value: number }>();
  for (const b of list) {
    if (b.status === 'clinic_cancelled') continue;
    const catId = getService(s, b.serviceId)?.categoryId ?? '';
    const e = catMap.get(catId) ?? { count: 0, value: 0 };
    e.count++;
    if (b.status === 'completed') e.value += bookingValue(s, b, today);
    catMap.set(catId, e);
  }
  const byCategory = [...catMap.entries()]
    .map(([categoryId, e]) => {
      const cat = getCategory(s, categoryId);
      return { categoryId, name: cat?.name ?? 'Ostatní', tone: (cat?.tone ?? 'slate') as Tone, count: e.count, value: Math.round(e.value) };
    })
    .sort((a, b) => b.count - a.count);

  // terapeuti
  const dayList = eachDay(q.from, q.to);
  const byTherapist = s.therapists
    .filter((t) => t.active && (!q.therapistId || t.id === q.therapistId))
    .sort((a, b) => a.order - b.order)
    .map((t) => {
      let booked = 0;
      let available = 0;
      for (const day of dayList) {
        booked += bookedMinutes(s, t.id, day);
        available += workingMinutes(s, t.id, day);
      }
      let completed = 0;
      let value = 0;
      for (const b of list) {
        if (b.therapistId !== t.id || b.status !== 'completed') continue;
        completed++;
        value += bookingValue(s, b, today);
      }
      return { therapistId: t.id, booked, available, pct: available ? booked / available : 0, completed, value: Math.round(value) };
    });

  const byChannel = { online: 0, recepce: 0, telefon: 0 };
  for (const b of list) if (b.status !== 'clinic_cancelled') byChannel[b.channel]++;

  const daily = dayList.map((date) => {
    let count = 0;
    let completedCount = 0;
    let cancelledCount = 0;
    for (const b of list) {
      if (dateOf(b.start) !== date || b.status === 'clinic_cancelled') continue;
      count++;
      if (b.status === 'completed') completedCount++;
      if (CANCEL_STATUSES.has(b.status)) cancelledCount++;
    }
    return { date, count, completed: completedCount, cancelled: cancelledCount };
  });

  // heatmapa obsazenosti (Po–So × 7–19 h)
  const cells = new Map<string, { booked: number; available: number }>();
  const add = (wd: number, hour: number, key: 'booked' | 'available', minutes: number): void => {
    const k = wd + '|' + hour;
    const e = cells.get(k) ?? { booked: 0, available: 0 };
    e[key] += minutes;
    cells.set(k, e);
  };
  const spread = (start: LocalDateTime, end: LocalDateTime, wd: number, key: 'booked' | 'available'): void => {
    const date = dateOf(start);
    for (let h = 6; h <= 21; h++) {
      const hs = combine(date, String(h).padStart(2, '0') + ':00');
      const he = combine(date, String(h + 1).padStart(2, '0') + ':00');
      const a = maxStr(start, hs);
      const z = minStr(end, he);
      if (a < z) add(wd, h, key, diffMinutes(z, a));
    }
  };
  for (const t of s.therapists.filter((x) => x.active && (!q.therapistId || x.id === q.therapistId))) {
    for (const day of dayList) {
      const wd = weekdayOf(day);
      for (const iv of workingIntervals(s, t.id, day)) spread(iv.start, iv.end, wd, 'available');
    }
  }
  for (const b of list) if (isOccupying(b.status) && !b.sessionId) spread(b.start, b.end, weekdayOf(b.start), 'booked');
  const heatmap: StatsResult['heatmap'] = [];
  for (let wd = 0; wd < 6; wd++) {
    for (let hour = 7; hour <= 19; hour++) {
      const e = cells.get(wd + '|' + hour) ?? { booked: 0, available: 0 };
      heatmap.push({ weekday: wd, hour, booked: e.booked, available: e.available, pct: e.available ? Math.min(1, e.booked / e.available) : 0 });
    }
  }

  // permanentky a závazky
  const soldMap = new Map<Id, { name: string; count: number; revenue: number }>();
  let soldTotal = 0;
  for (const p of s.packages) {
    if (!inPeriod(p.purchasedAt, q)) continue;
    const e = soldMap.get(p.templateId) ?? { name: p.name, count: 0, revenue: 0 };
    e.count++;
    e.revenue += p.priceCzk;
    soldMap.set(p.templateId, e);
    soldTotal++;
  }
  let expiringSoon = 0;
  let expiringEntries = 0;
  let liabilityEntries = 0;
  let liabilityValue = 0;
  for (const p of s.packages) {
    if (p.cancelled) continue;
    const u = packageUsage(s, p, today);
    if (u.expired) continue;
    const open = u.free + u.reserved;
    liabilityEntries += open;
    liabilityValue += open * u.unitValue;
    if (u.free > 0 && daysBetween(today, u.validUntil) <= 30) {
      expiringSoon++;
      expiringEntries += u.free;
    }
  }
  let creditLiability = 0;
  const balances = new Map<Id, number>();
  for (const e of s.ledger) balances.set(e.clientId, (balances.get(e.clientId) ?? 0) + e.amount);
  for (const v of balances.values()) if (v > 0) creditLiability += v;

  // omluvenky a náhrady
  const excuses = { used: base.excused, makeupsOpen: 0, makeupsUsed: 0, makeupsExpired: 0 };
  for (const m of s.makeups) {
    if (!inPeriod(m.createdAt, q)) continue;
    if (m.status === 'open') excuses.makeupsOpen++;
    else if (m.status === 'used') excuses.makeupsUsed++;
    else if (m.status === 'expired') excuses.makeupsExpired++;
  }

  // trend posledních 6 měsíců
  const trend: StatsResult['trend'] = [];
  const thisMonth = startOfMonth(today);
  for (let i = 5; i >= 0; i--) {
    const from = addMonths(thisMonth, -i);
    const to = addMonths(from, 1);
    const tq: StatsQuery = { ...q, from, to };
    const mList = s.bookings.filter((b) => inPeriod(b.start, tq) && matches(s, b, tq) && b.status !== 'clinic_cancelled');
    const cancels = mList.filter((b) => CANCEL_STATUSES.has(b.status)).length;
    const ns = mList.filter((b) => b.status === 'no_show').length;
    const comp = mList.filter((b) => b.status === 'completed').length;
    let rev = 0;
    for (const p of s.payments) if (inPeriod(p.at, tq)) rev += p.amount;
    trend.push({
      month: monthKey(from),
      bookings: mList.length,
      cancellationRate: mList.length ? cancels / mList.length : 0,
      noShowRate: comp + ns ? ns / (comp + ns) : 0,
      revenue: Math.round(rev),
    });
  }

  return {
    ...base,
    query: q,
    days,
    previous,
    revenueByPurpose,
    byCategory,
    byTherapist,
    byChannel,
    daily,
    heatmap,
    packages: {
      sold: [...soldMap.entries()].map(([templateId, e]) => ({ templateId, ...e })).sort((a, b) => b.count - a.count),
      soldTotal,
      expiringSoon,
      expiringEntries,
      liabilityEntries,
      liabilityValue: Math.round(liabilityValue),
      creditLiability: Math.round(creditLiability),
    },
    excuses,
    trend,
  };
}

/** Rychlé souhrnné číslo pro „dnešek" na kalendáři. */
export function daySummary(s: ClinicState, date: LocalDate, now: LocalDateTime): {
  bookings: number;
  groupSessions: number;
  groupParticipants: number;
  inProgress: number;
  excused: number;
  noShows: number;
  occupancy: number;
} {
  const list = s.bookings.filter((b) => dateOf(b.start) === date);
  const individual = list.filter((b) => !b.sessionId);
  const groupBookings = list.filter((b) => b.sessionId && isOccupying(b.status));
  const sessions = new Set(groupBookings.map((b) => b.sessionId));
  let booked = 0;
  let available = 0;
  for (const t of s.therapists.filter((x) => x.active)) {
    booked += bookedMinutes(s, t.id, date);
    available += workingMinutes(s, t.id, date);
  }
  return {
    bookings: individual.filter((b) => isOccupying(b.status)).length,
    groupSessions: sessions.size,
    groupParticipants: groupBookings.length,
    inProgress: individual.filter((b) => b.status === 'confirmed' && b.start <= now && b.end > now).length,
    excused: list.filter((b) => b.status === 'excused').length,
    noShows: list.filter((b) => b.status === 'no_show').length,
    occupancy: available ? Math.round((booked / available) * 100) : 0,
  };
}
