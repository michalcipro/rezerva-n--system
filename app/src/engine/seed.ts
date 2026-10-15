import type {
  Actor,
  Booking,
  Campaign,
  ClinicState,
  Ctx,
  Id,
  LocalDate,
  LocalDateTime,
  MoneyMethod,
  Service,
} from '../domain/types';
import {
  cancelBooking,
  createBooking,
  createClient,
  deliverCampaign,
  joinWaitlist,
  markCompleted,
  markNoShow,
  payFee,
  saveCampaign,
  sellPackage,
  topUpCredit,
  waiveFee,
} from './commands';
import { createBaseState } from './defaults';
import { evaluateCancellation } from './policy';
import { runProcesses } from './processes';
import {
  bookingsOfClient,
  clearSelectorCaches,
  clientCredit,
  eligiblePackages,
  getService,
  isNewClient,
  sessionsOnDate,
} from './selectors';
import { workingIntervals } from './availability';
import {
  addDays,
  addHours,
  addMinutes,
  combine,
  dateOf,
  daysBetween,
  minutesOf,
  startOfWeek,
  timeFromMinutes,
  weekdayOf,
} from './time';

/**
 * Generátor ukázkových dat. Data vznikají simulací skutečného provozu přes
 * stejné příkazy, které používá aplikace – permanentky, kredit, omluvenky,
 * náhrady a poplatky jsou proto vzájemně konzistentní.
 */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FEMALE = [
  'Jana', 'Eva', 'Hana', 'Lenka', 'Kateřina', 'Petra', 'Martina', 'Veronika', 'Markéta', 'Barbora', 'Zuzana', 'Alena',
  'Simona', 'Kristýna', 'Ivana', 'Andrea', 'Michaela', 'Monika', 'Adéla', 'Nikola', 'Pavla', 'Iveta', 'Zdeňka', 'Jitka',
  'Dana', 'Renata', 'Gabriela', 'Šárka', 'Radka', 'Denisa',
];
const MALE = [
  'Martin', 'Petr', 'Tomáš', 'Jan', 'Michal', 'David', 'Lukáš', 'Ondřej', 'Jiří', 'Pavel', 'Filip', 'Roman', 'Karel',
  'Daniel', 'Matěj', 'Radek', 'Vojtěch', 'Josef', 'Richard', 'Adam', 'Václav', 'Zdeněk', 'Milan', 'Aleš', 'Libor', 'Vít',
  'Štěpán', 'Patrik',
];
const SURNAMES: [string, string][] = [
  ['Novák', 'Nováková'], ['Svoboda', 'Svobodová'], ['Novotný', 'Novotná'], ['Černý', 'Černá'], ['Procházka', 'Procházková'],
  ['Kučera', 'Kučerová'], ['Veselý', 'Veselá'], ['Horák', 'Horáková'], ['Němec', 'Němcová'], ['Pokorný', 'Pokorná'],
  ['Marek', 'Marková'], ['Pospíšil', 'Pospíšilová'], ['Hájek', 'Hájková'], ['Jelínek', 'Jelínková'], ['Král', 'Králová'],
  ['Růžička', 'Růžičková'], ['Fiala', 'Fialová'], ['Sedláček', 'Sedláčková'], ['Doležal', 'Doležalová'], ['Zeman', 'Zemanová'],
  ['Kolář', 'Kolářová'], ['Navrátil', 'Navrátilová'], ['Čermák', 'Čermáková'], ['Urban', 'Urbanová'], ['Vaněk', 'Vaňková'],
  ['Blažek', 'Blažková'], ['Kříž', 'Křížová'], ['Kovář', 'Kovářová'], ['Bartoš', 'Bartošová'], ['Vlček', 'Vlčková'],
  ['Polák', 'Poláková'], ['Musil', 'Musilová'], ['Šimek', 'Šimková'], ['Holub', 'Holubová'], ['Kopecký', 'Kopecká'],
  ['Šťastný', 'Šťastná'], ['Mach', 'Machová'], ['Hrubý', 'Hrubá'], ['Krejčí', 'Krejčí'], ['Bureš', 'Burešová'],
  ['Dušek', 'Dušková'], ['Kadlec', 'Kadlecová'], ['Vávra', 'Vávrová'], ['Matoušek', 'Matoušková'], ['Ševčík', 'Ševčíková'],
];
const TAGS = ['Bederní páteř', 'Krční páteř', 'Koleno', 'Rameno', 'Kotník', 'Běžec', 'Cyklista', 'Po operaci', 'Sedavé zaměstnání', 'Preferuje ráno', 'Preferuje odpoledne', 'Těhotenství'];

type Interest = 'fyzio' | 'masaze' | 'trenink' | 'skupiny';

interface SimClient {
  id: Id;
  interests: Interest[];
  regular: boolean;
  gapDays: number;
  createdDate: LocalDate;
  online: boolean;
  /** Zbývající návštěvy v aktuální sérii terapie. */
  episodeLeft: number;
  /** Do kdy klient nepřijde (pauza mezi sériemi). */
  pauseUntil: LocalDate | null;
}

const ascii = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function shiftToWorkday(date: LocalDate): LocalDate {
  const wd = weekdayOf(date);
  if (wd === 5) return addDays(date, 2);
  if (wd === 6) return addDays(date, 1);
  return date;
}

export interface DemoOptions {
  weeksBack?: number;
  daysAhead?: number;
  clients?: number;
  seed?: number;
}

export function generateDemoState(now: LocalDateTime, opts: DemoOptions = {}): ClinicState {
  clearSelectorCaches();
  const rand = mulberry32(opts.seed ?? 20261014);
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
  const chance = (p: number): boolean => rand() < p;
  const between = (a: number, b: number): number => a + Math.floor(rand() * (b - a + 1));

  const today = dateOf(now);
  const simStart = addDays(startOfWeek(today), -7 * (opts.weeksBack ?? 8));
  const simEnd = addDays(today, opts.daysAhead ?? 21);
  const d: ClinicState = createBaseState(simStart);
  const staff: Actor = { role: 'reception', name: 'Recepce' };
  const owner: Actor = { role: 'owner', name: 'Tereza Malá', therapistId: 't_mala' };
  const at = (time: LocalDateTime, actor: Actor = staff): Ctx => ({ now: time, actor });
  const clientActor = (id: Id): Actor => ({ role: 'client', name: 'Klient', clientId: id });
  const svc = (id: Id): Service => getService(d, id) as Service;

  /* ---------------- klienti ---------------- */
  const sim: SimClient[] = [];
  const usedNames = new Set<string>();
  const makeClient = (first: string, last: string, createdAt: LocalDateTime, extra: Partial<SimClient> = {}): Id | null => {
    const key = first + ' ' + last;
    if (usedNames.has(key)) return null;
    usedNames.add(key);
    const res = createClient(
      d,
      {
        firstName: first,
        lastName: last,
        email: `${ascii(first)}.${ascii(last)}@example.com`,
        phone: `+420 ${between(601, 799)} ${String(between(0, 999)).padStart(3, '0')} ${String(between(0, 999)).padStart(3, '0')}`,
        tags: chance(0.75) ? [pick(TAGS), ...(chance(0.35) ? [pick(TAGS)] : [])].filter((t, i, a) => a.indexOf(t) === i) : [],
        source: pick(['online', 'online', 'recepce', 'telefon', 'doporučení'] as const),
        consents: { gdpr: true, health: chance(0.92), marketingEmail: chance(0.72), sms: chance(0.86) },
        demo: true,
      },
      at(createdAt),
    );
    if (!res.ok) return null;
    const interestsRoll = rand();
    const interests: Interest[] =
      interestsRoll < 0.55 ? ['fyzio'] : interestsRoll < 0.68 ? ['masaze'] : interestsRoll < 0.78 ? ['trenink'] : interestsRoll < 0.9 ? ['skupiny'] : ['fyzio', 'masaze'];
    if (chance(0.15) && !interests.includes('skupiny')) interests.push('skupiny');
    const regular = chance(0.5);
    sim.push({
      id: res.value,
      interests,
      regular,
      gapDays: regular ? between(3, 7) : between(7, 18),
      createdDate: dateOf(createdAt),
      online: chance(0.65),
      episodeLeft: between(4, 12),
      pauseUntil: chance(0.35) ? addDays(dateOf(createdAt), between(0, 90)) : null,
      ...extra,
    });
    return res.value;
  };

  // Scénář: Martin Dvořák (permanentka, omluvenka, náhrada, pozdní storno)
  const martinCreated = combine(addDays(today, -31), '18:20');
  const martin = makeClient('Martin', 'Dvořák', martinCreated, { interests: ['fyzio'], regular: true, gapDays: 999 }) as Id;
  const mc = d.clients.find((c) => c.id === martin);
  if (mc) mc.tags = ['Bederní páteř', 'Běžec', 'Preferuje ráno'];

  const total = opts.clients ?? 600;
  let guard = 0;
  while (sim.length < total && guard < total * 5) {
    guard++;
    const female = chance(0.56);
    const [m, f] = pick(SURNAMES);
    const first = female ? pick(FEMALE) : pick(MALE);
    const created = combine(addDays(today, -between(20, 420)), timeFromMinutes(between(8 * 60, 21 * 60)));
    // část klientů přichází až během simulace
    const createdAt = chance(0.2) ? combine(addDays(simStart, between(0, Math.max(1, daysBetween(simStart, today) - 3))), '09:00') : created;
    makeClient(first, female ? f : m, createdAt);
  }

  /* ---------------- Martinův příběh ---------------- */
  const story = (offset: number, time: string): LocalDateTime => combine(shiftToWorkday(addDays(today, offset)), time);
  {
    const ctxM = at(addDays(martinCreated, 0));
    topUpCredit(d, { clientId: martin, amount: 2000, method: 'card' }, at(combine(dateOf(story(-30, '09:00')), '08:40')));
    const first = createBooking(d, { clientId: martin, serviceId: 's_vstupni', therapistId: 't_mala', start: story(-30, '09:00'), payment: { method: 'onsite' }, override: true }, ctxM);
    if (first.ok) markCompleted(d, { bookingId: first.value, settleWith: 'card' }, at(story(-30, '10:00')));
    const buyAt = combine(addDays(dateOf(story(-23, '09:00')), -1), '18:00');
    const pkg = sellPackage(d, { clientId: martin, templateId: 'pt_fyzio10', paidBy: 'card' }, at(buyAt));
    const plan: [number, 'done' | 'excuse' | 'future'][] = [
      [-23, 'done'],
      [-16, 'done'],
      [-9, 'excuse'],
      [-2, 'done'],
      [1, 'future'],
      [5, 'future'],
    ];
    for (const [off, kind] of plan) {
      const start = story(off, '09:00');
      const created = kind === 'future' ? addHours(now, -between(30, 120)) : addHours(start, -96);
      const createdAt = created < buyAt ? addMinutes(buyAt, 5) : created;
      const r = createBooking(d, { clientId: martin, serviceId: 's_fyzio45', therapistId: 't_mala', start, payment: { method: 'package', packageId: pkg.ok ? pkg.value : undefined }, override: true }, at(createdAt, clientActor(martin)));
      if (!r.ok) continue;
      if (kind === 'done') markCompleted(d, { bookingId: r.value }, at(addMinutes(start, 45)));
      if (kind === 'excuse') {
        const exAt = combine(addDays(dateOf(start), -1), '18:00');
        const c = cancelBooking(d, { bookingId: r.value, option: 'excuse', reason: 'Nemoc' }, at(exAt, clientActor(martin)));
        if (c.ok) {
          const right = d.makeups.find((x) => x.sourceBookingId === r.value);
          const mStart = story(-6, '09:00');
          const mk = createBooking(d, { clientId: martin, serviceId: 's_fyzio45', therapistId: 't_mala', start: mStart, payment: { method: 'makeup', makeupId: right?.id }, override: true }, at(addMinutes(exAt, 20), clientActor(martin)));
          if (mk.ok) markCompleted(d, { bookingId: mk.value }, at(addMinutes(mStart, 45)));
        }
      }
    }
    // masáž zrušená po lhůtě (50 % z kreditu)
    const massageStart = story(-19, '16:00');
    const ms = createBooking(d, { clientId: martin, serviceId: 's_sport60', therapistId: 't_vavrova', start: massageStart, payment: { method: 'onsite' }, override: true }, at(addDays(massageStart, -4), clientActor(martin)));
    if (ms.ok) cancelBooking(d, { bookingId: ms.value, option: 'fee', reason: 'Pracovní cesta' }, at(addHours(massageStart, -20), clientActor(martin)));
    createBooking(d, { clientId: martin, serviceId: 's_sport60', therapistId: 't_vavrova', start: story(6, '16:00'), payment: { method: 'onsite' }, override: true }, at(addHours(now, -50), clientActor(martin)));
  }

  /* ---------------- běžný provoz ---------------- */
  const lastBooked = new Map<Id, LocalDate>();
  const poolFor = (interest: Interest, date: LocalDate): SimClient[] =>
    sim.filter((c) => c.id !== martin && c.interests.includes(interest) && c.createdDate <= date && (!c.pauseUntil || c.pauseUntil <= date));

  const SERVICES_BY_THERAPIST: Record<Id, [Id, number][]> = {
    t_mala: [['s_fyzio45', 6], ['s_fyzio30', 2], ['s_taping', 1], ['s_razova', 1], ['s_online', 0.5]],
    t_riha: [['s_fyzio45', 6], ['s_fyzio30', 2], ['s_razova', 2], ['s_taping', 1]],
    t_benesova: [['s_fyzio45', 5], ['s_panevni', 3], ['s_fyzio30', 1], ['s_online', 0.6]],
    t_vavrova: [['s_sport60', 5], ['s_sport90', 1.5], ['s_rekond30', 2.5]],
    t_kos: [['s_trening', 1]],
  };
  const weighted = (items: [Id, number][]): Id => {
    const sum = items.reduce((s, [, w]) => s + w, 0);
    let x = rand() * sum;
    for (const [id, w] of items) {
      x -= w;
      if (x <= 0) return id;
    }
    return items[0][0];
  };
  const interestOf = (serviceId: Id): Interest => {
    const cat = svc(serviceId).categoryId;
    if (cat === 'cat_masaze') return 'masaze';
    if (cat === 'cat_trenink') return 'trenink';
    if (cat === 'cat_skupiny') return 'skupiny';
    return 'fyzio';
  };

  const choosePayment = (clientId: Id, serviceId: Id, start: LocalDateTime, created: LocalDateTime): { method: 'package' | 'credit' | 'online' | 'onsite'; packageId?: Id } => {
    const pk = eligiblePackages(d, clientId, serviceId, dateOf(start), dateOf(created));
    if (pk.length && chance(0.93)) return { method: 'package', packageId: pk[0].id };
    const price = svc(serviceId).priceCzk;
    if (clientCredit(d, clientId) >= price && chance(0.6)) return { method: 'credit' };
    return chance(0.22) ? { method: 'online' } : { method: 'onsite' };
  };

  const maybeBuyPackage = (c: SimClient, serviceId: Id, when: LocalDateTime): void => {
    const interest = interestOf(serviceId);
    const tpl =
      interest === 'fyzio' && serviceId === 's_fyzio45' ? (chance(0.7) ? 'pt_fyzio10' : 'pt_fyzio5') :
      interest === 'masaze' && serviceId === 's_sport60' ? 'pt_masaz5' :
      interest === 'trenink' ? 'pt_trening10' :
      interest === 'skupiny' ? 'pt_skupiny8' : null;
    if (!tpl) return;
    const visits = bookingsOfClient(d, c.id).filter((b) => b.status === 'completed').length;
    const p = interest === 'skupiny' ? 0.4 : visits >= 1 ? (c.regular ? 0.3 : 0.08) : 0;
    if (!chance(p)) return;
    if (eligiblePackages(d, c.id, serviceId, dateOf(when), dateOf(when)).length) return;
    const method: MoneyMethod = pick(['card', 'card', 'card', 'transfer', 'cash'] as const);
    sellPackage(d, { clientId: c.id, templateId: tpl, paidBy: method }, at(when));
  };

  const resolvePast = (b: Booking, c: SimClient): void => {
    const r = rand();
    if (r < 0.022) {
      markNoShow(d, { bookingId: b.id }, at(addMinutes(b.start, 15)));
      return;
    }
    if (r < 0.085) {
      const cancelAt = addHours(b.start, -between(26, 100));
      if (cancelAt > b.createdAt) {
        const ev = evaluateCancellation(d, b, cancelAt, 'client');
        if (ev.options.some((o) => o.kind === 'free')) {
          cancelBooking(d, { bookingId: b.id, option: 'free', reason: pick(['Pracovní povinnosti', 'Nemoc', 'Rodinné důvody', '']) }, at(cancelAt, clientActor(c.id)));
          return;
        }
      }
    }
    if (r >= 0.085 && r < 0.125) {
      const cancelAt = addHours(b.start, -between(3, 20));
      if (cancelAt > b.createdAt) {
        const ev = evaluateCancellation(d, b, cancelAt, 'client');
        const wantExcuse = ev.excuse.allowed && chance(0.6);
        const res = cancelBooking(
          d,
          { bookingId: b.id, option: wantExcuse ? 'excuse' : 'fee', reason: pick(['Nemoc', 'Nemoc dítěte', 'Pracovní povinnosti', 'Doprava']) },
          at(cancelAt, clientActor(c.id)),
        );
        if (res.ok && wantExcuse && chance(0.72)) {
          const right = d.makeups.find((m) => m.sourceBookingId === b.id && m.status === 'open');
          if (right) scheduleMakeup(right.id, c, b, cancelAt);
        }
        if (res.ok) return;
      }
    }
    if (r >= 0.125 && r < 0.13) {
      cancelBooking(d, { bookingId: b.id, option: 'clinic', reason: 'Nemoc terapeuta' }, at(addHours(b.start, -30), owner));
      return;
    }
    const settle: MoneyMethod = chance(0.72) ? 'card' : 'cash';
    markCompleted(d, { bookingId: b.id, settleWith: b.payment.method === 'onsite' ? settle : null }, at(b.end));
  };

  const scheduleMakeup = (makeupId: Id, c: SimClient, source: Booking, when: LocalDateTime): void => {
    for (let k = 2; k <= 12; k++) {
      const day = addDays(dateOf(source.start), k);
      if (day > simEnd) return;
      for (const iv of workingIntervals(d, source.therapistId, day)) {
        const dur = svc(source.serviceId).durationMin;
        for (let t = minutesOf(iv.start); t + dur <= minutesOf(iv.end); t += 15) {
          const start = combine(day, timeFromMinutes(t));
          const res = createBooking(d, { clientId: c.id, serviceId: source.serviceId, therapistId: source.therapistId, start, payment: { method: 'makeup', makeupId } }, at(addMinutes(when, 30), clientActor(c.id)));
          if (res.ok) {
            const nb = d.bookings.find((x) => x.id === res.value);
            if (nb && nb.end <= now) markCompleted(d, { bookingId: nb.id }, at(nb.end));
            return;
          }
        }
      }
    }
  };

  for (let day = simStart; day <= simEnd; day = addDays(day, 1)) {
    const ahead = daysBetween(today, day);
    for (const th of d.therapists) {
      const ivs = workingIntervals(d, th.id, day);
      if (!ivs.length) continue;
      const target =
        ahead < 0 ? (th.id === 't_kos' ? 0.32 : 0.62 + rand() * 0.24) :
        ahead === 0 ? (th.id === 't_kos' ? 0.3 : 0.78) :
        ahead <= 3 ? (th.id === 't_kos' ? 0.25 : 0.66) :
        ahead <= 7 ? 0.5 : ahead <= 14 ? 0.33 : 0.18;
      for (const iv of ivs) {
        let cursor = minutesOf(iv.start);
        const endMin = minutesOf(iv.end);
        while (cursor + 15 <= endMin) {
          if (!chance(target)) {
            cursor += chance(0.5) ? 15 : 30;
            continue;
          }
          let serviceId = weighted(SERVICES_BY_THERAPIST[th.id]);
          const interest = interestOf(serviceId);
          const pool = poolFor(interest, day).filter((c) => {
            const last = lastBooked.get(c.id);
            return !last || daysBetween(last, day) >= c.gapDays;
          });
          if (!pool.length) {
            cursor += 15;
            continue;
          }
          const regulars = pool.filter((c) => c.regular);
          const c = regulars.length && chance(0.6) ? pick(regulars) : pick(pool);
          if (interest === 'fyzio' && isNewClient(d, c.id) && serviceId !== 's_online') serviceId = 's_vstupni';
          const dur = svc(serviceId).durationMin;
          if (cursor + dur > endMin) {
            cursor += 15;
            continue;
          }
          const start = combine(day, timeFromMinutes(cursor));
          const leadHours = between(6, 24 * 12);
          let created = addHours(start, -leadHours);
          const createdFloor = combine(c.createdDate, '08:00');
          if (created < createdFloor) created = createdFloor;
          if (created >= start) {
            cursor += 15;
            continue;
          }
          if (created > now) created = addHours(now, -between(1, 24 * 10));
          if (created < createdFloor) created = createdFloor;
          if (created >= start) {
            cursor += 15;
            continue;
          }
          if (chance(0.05)) topUpCredit(d, { clientId: c.id, amount: pick([2000, 3000, 5000]), method: pick(['card', 'cash', 'transfer'] as const) }, at(addMinutes(created, -10)));
          maybeBuyPackage(c, serviceId, addMinutes(created, -5));
          const payment = choosePayment(c.id, serviceId, start, created);
          const actor = c.online ? clientActor(c.id) : staff;
          let res = createBooking(d, { clientId: c.id, serviceId, therapistId: th.id, start, payment, channel: c.online ? 'online' : chance(0.75) ? 'recepce' : 'telefon' }, at(created, actor));
          if (!res.ok && actor.role === 'client') res = createBooking(d, { clientId: c.id, serviceId, therapistId: th.id, start, payment, channel: 'telefon' }, at(created));
          if (!res.ok) {
            cursor += 15;
            continue;
          }
          lastBooked.set(c.id, day);
          c.episodeLeft--;
          if (c.episodeLeft <= 0) {
            c.pauseUntil = addDays(day, between(30, 120));
            c.episodeLeft = between(4, 12);
          }
          const b = d.bookings.find((x) => x.id === res.value) as Booking;
          if (b.end <= now) resolvePast(b, c);
          else if (b.start > now && chance(0.025)) {
            const cancelAt = addHours(created, between(2, 30));
            if (cancelAt < now && cancelAt < addHours(b.start, -24)) cancelBooking(d, { bookingId: b.id, option: 'free', reason: 'Změna plánů' }, at(cancelAt, clientActor(c.id)));
          }
          cursor += dur + (chance(0.25) ? 15 : 0);
        }
      }
    }

    // skupinové lekce
    for (const ses of sessionsOnDate(d, day)) {
      const ahead2 = daysBetween(today, day);
      const wanted = ahead2 < 0 ? between(4, 8) : ahead2 <= 2 ? between(5, 8) : ahead2 <= 7 ? between(3, 6) : between(1, 4);
      const pool = poolFor('skupiny', day);
      let added = 0;
      for (let k = 0; k < pool.length * 2 && added < wanted; k++) {
        const c = pick(pool);
        if (bookingsOfClient(d, c.id).some((b) => b.sessionId === ses.id)) continue;
        let created = addHours(ses.start, -between(4, 24 * 6));
        if (created < combine(c.createdDate, '08:00')) created = combine(c.createdDate, '08:00');
        if (created >= ses.start) continue;
        if (created > now) created = addHours(now, -between(1, 24 * 6));
        if (created < combine(c.createdDate, '08:00') || created >= ses.start) continue;
        maybeBuyPackage(c, ses.serviceId, addMinutes(created, -5));
        const payment = choosePayment(c.id, ses.serviceId, ses.start, created);
        const res = createBooking(d, { clientId: c.id, serviceId: ses.serviceId, therapistId: ses.therapistId, start: ses.start, sessionId: ses.id, payment }, at(created, clientActor(c.id)));
        if (!res.ok) continue;
        added++;
        const b = d.bookings.find((x) => x.id === res.value) as Booking;
        if (b.end <= now) {
          const r = rand();
          if (r < 0.04) markNoShow(d, { bookingId: b.id }, at(addMinutes(b.start, 10)));
          else if (r < 0.1) {
            const cancelAt = addHours(b.start, -between(8, 40));
            if (cancelAt > b.createdAt) cancelBooking(d, { bookingId: b.id, option: 'free', reason: '' }, at(cancelAt, clientActor(c.id)));
            else markCompleted(d, { bookingId: b.id, settleWith: b.payment.method === 'onsite' ? 'card' : null }, at(b.end));
          } else markCompleted(d, { bookingId: b.id, settleWith: b.payment.method === 'onsite' ? 'cash' : null }, at(b.end));
        }
      }
    }
  }

  /* ---------------- čekací listina ---------------- */
  const tomorrow = shiftToWorkday(addDays(today, 1));
  const waiters = sim.filter((c) => c.id !== martin && c.interests.includes('fyzio')).slice(0, 40);
  const wlCtx = (c: Id): Ctx => at(addHours(now, -between(3, 30)), clientActor(c));
  for (const c of waiters.slice(0, 3)) {
    joinWaitlist(d, { clientId: c.id, serviceId: 's_fyzio45', therapistId: 't_mala', dateFrom: tomorrow, dateTo: addDays(tomorrow, 2), note: 'Ideálně ráno' }, wlCtx(c.id));
  }
  // uvolněný termín zítra → nabídka čekajícím (aktivní nabídka k vyzkoušení)
  const tomorrowsMala = d.bookings.find((b) => b.therapistId === 't_mala' && dateOf(b.start) === tomorrow && b.status === 'confirmed' && b.clientId !== martin && b.serviceId === 's_fyzio45');
  if (tomorrowsMala) {
    const ev = evaluateCancellation(d, tomorrowsMala, addMinutes(now, -25), 'client');
    const option = ev.options.find((o) => o.kind === 'excuse') ?? ev.options.find((o) => o.kind === 'fee') ?? ev.options.find((o) => o.kind === 'free');
    if (option) cancelBooking(d, { bookingId: tomorrowsMala.id, option: option.kind, reason: 'Nemoc' }, at(addMinutes(now, -25), clientActor(tomorrowsMala.clientId)));
  }
  // plná skupinová lekce s čekajícími
  const fullSession = sessionsOnDate(d, tomorrow).concat(sessionsOnDate(d, addDays(tomorrow, 1)))[0];
  if (fullSession) {
    const pool = poolFor('skupiny', today);
    for (const c of pool) {
      const joined = bookingsOfClient(d, c.id).some((b) => b.sessionId === fullSession.id);
      const participants = d.bookings.filter((b) => b.sessionId === fullSession.id && b.status === 'confirmed').length;
      if (participants >= fullSession.capacity) break;
      if (joined) continue;
      createBooking(d, { clientId: c.id, serviceId: fullSession.serviceId, therapistId: fullSession.therapistId, start: fullSession.start, sessionId: fullSession.id, payment: choosePayment(c.id, fullSession.serviceId, fullSession.start, now) }, at(addHours(now, -between(2, 40)), clientActor(c.id)));
    }
    for (const c of pool.slice(-2)) {
      if (!bookingsOfClient(d, c.id).some((b) => b.sessionId === fullSession.id))
        joinWaitlist(d, { clientId: c.id, serviceId: fullSession.serviceId, therapistId: null, dateFrom: dateOf(fullSession.start), sessionId: fullSession.id }, wlCtx(c.id));
    }
  }

  /* ---------------- kampaně ---------------- */
  const campaign = (id: string, name: string, subject: string, sentDaysAgo: number | null, blocks: Campaign['blocks'], segment: Campaign['segment']): void => {
    const created = combine(addDays(today, -(sentDaysAgo ?? 1) - 2), '10:00');
    const base: Campaign = {
      id, name, subject, preheader: '', blocks, segment, status: 'draft', scheduledAt: null, sentAt: null, recipients: 0, createdAt: created, updatedAt: created,
    };
    saveCampaign(d, base, at(created, owner));
    const c = d.campaigns.find((x) => x.id === id);
    if (c && sentDaysAgo !== null) deliverCampaign(d, at(combine(addDays(today, -sentDaysAgo), '08:30'), owner), c);
  };
  const everyone = { match: 'all' as const, rules: [], exclude: [] };
  campaign('cmp_leto', 'Letní provoz kliniky', 'Letní provoz Winning Minds', 100, [
    { type: 'heading', text: 'Letní provoz' },
    { type: 'text', text: 'Dobrý den, [jméno], v červenci a srpnu ordinujeme s mírně upravenou pracovní dobou. Termíny najdete v aplikaci.' },
  ], everyone);
  campaign('cmp_zari', 'Zářijový newsletter', 'Září ve Winning Minds', 40, [
    { type: 'heading', text: 'Zpátky po létě' },
    { type: 'text', text: 'Dobrý den, [jméno], po prázdninách se tělu hodí postupný návrat k zátěži. Přinášíme tři tipy od našich fyzioterapeutů.' },
  ], everyone);
  campaign('cmp_skupiny', 'Nové skupinové lekce Zdravá záda', 'Nové lekce Zdravá záda – pondělí a středa ve 12:00', 12, [
    { type: 'heading', text: 'Zdravá záda v poledne' },
    { type: 'text', text: 'Dobrý den, [jméno], otevřeli jsme nové skupinové lekce pro stabilizaci trupu. Maximálně 8 lidí, vede Marek Kos.' },
    { type: 'button', label: 'Přihlásit se na lekci', url: '#' },
  ], { match: 'any', rules: [{ type: 'visited_category', categoryId: 'cat_fyzio', withinDays: 365 }, { type: 'visited_category', categoryId: 'cat_skupiny', withinDays: 365 }], exclude: [] });
  campaign('cmp_zada', 'Bolí vás záda z home office?', 'Bolí vás záda z home office? 3 cviky na 5 minut', null, [
    { type: 'heading', text: 'Bolí vás záda z home office?' },
    { type: 'text', text: 'Dobrý den, [jméno], Tereza připravila krátkou sestavu, kterou zvládnete i u stolu.' },
    { type: 'list', items: ['Kočka – velbloud · 10×', 'Rotace hrudní páteře vsedě · 8× na každou stranu', 'Protažení ohýbačů kyčle · 30 s'] },
    { type: 'button', label: 'Rezervovat termín', url: '#' },
  ], {
    match: 'all',
    rules: [{ type: 'visited_category', categoryId: 'cat_fyzio', withinDays: 180 }],
    exclude: [{ type: 'has_upcoming_booking', withinDays: 7 }],
  });

  /* ---------------- vybrané poplatky ---------------- */
  for (const b of d.bookings) {
    if (!b.fee || b.fee.status !== 'due' || b.start > addDays(now, -3)) continue;
    const when = addHours(b.start, between(20, 24 * 5));
    if (when > now) continue;
    const r = rand();
    if (r < 0.82) payFee(d, { bookingId: b.id, method: pick(['card', 'card', 'cash', 'transfer'] as const) }, at(when));
    else if (r < 0.9) waiveFee(d, { bookingId: b.id, reason: pick(['Doložená nemoc', 'Dohoda s klientem', 'První nedostavení']) }, at(when, owner));
  }

  /* ---------------- dokončení ---------------- */
  runProcesses(d, {}, at(now, owner));
  const keepFrom = addDays(now, -7);
  d.messages = d.messages.filter((m) => m.at >= keepFrom && m.at <= now);
  // historie změn: posledních 7 dní a celý příběh ukázkového klienta Martina Dvořáka
  d.audit = d.audit.filter((a) => a.at <= now && (a.at >= keepFrom || a.clientId === martin)).slice(-900);
  d.ledger.sort((a, b) => (a.at < b.at ? -1 : 1));
  d.payments.sort((a, b) => (a.at < b.at ? -1 : 1));
  d.bookings.sort((a, b) => (a.start < b.start ? -1 : 1));
  d.demoSeededAt = now;
  d.settings.simulatedNow = null;
  clearSelectorCaches();
  return d;
}
