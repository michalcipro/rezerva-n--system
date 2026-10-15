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
  addFollowUp,
  addNote,
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
  sendSessionNotes,
  setClientStage,
  setFollowUpDone,
  topUpCredit,
  updateNote,
  waiveFee,
} from './commands';
import { sessionNotesEmail } from './crm';
import { createBaseState } from './defaults';
import { evaluateCancellation } from './policy';
import { runProcesses } from './processes';
import {
  bookingsOfClient,
  clearSelectorCaches,
  clientCredit,
  eligiblePackages,
  getService,
  getTherapist,
  sessionsOnDate,
  therapistName,
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
 *
 * Noví klienti procházejí úvodní cestou Freetalk → Diagnostika → Vyhodnocení diagnostiky
 * a teprve potom chodí na pravidelná sezení; fáze spolupráce v CRM se odvozují z těchto schůzek.
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
const SPORT_TAGS = ['Tenis', 'Hokej', 'Fotbal', 'Florbal', 'Běh', 'Golf', 'Plavání', 'Basketbal', 'Esport', 'Junior', 'Doporučení od trenéra'];
const WORK_TAGS = ['Manažer', 'Podnikatel', 'Vedoucí týmu', 'Firemní klient'];
const COMMON_TAGS = ['Preferuje online', 'Preferuje ráno', 'Preferuje odpoledne', 'Student'];

/** O co klient stojí: mentální koučink (hlavně sportovci), lídři (strategický koučink, mentoring), terapie, neurovizuální trénink, workshopy. */
type Interest = 'koucink' | 'leadership' | 'terapie' | 'neuro' | 'workshopy';

/** Úvodní cesta nového klienta – v tomto pořadí. */
const INTAKE: readonly Id[] = ['s_freetalk', 's_diagnostika', 's_vyhodnoceni'];
const INTAKE_THERAPISTS: readonly Id[] = ['t_mala', 't_riha', 't_benesova'];

interface SimClient {
  id: Id;
  interests: Interest[];
  regular: boolean;
  /** Minimální odstup dvou návštěv ve dnech. */
  gapDays: number;
  /** Odstup pravidelných sezení po úvodní cestě. */
  cadence: number;
  createdDate: LocalDate;
  online: boolean;
  /** Zbývající sezení v aktuální sérii. */
  episodeLeft: number;
  /** Do kdy klient nepřijde (pauza mezi sériemi). */
  pauseUntil: LocalDate | null;
  /** Kolik kroků úvodní cesty má nový klient za sebou; null = stávající klient (úvodní cestu prošel dřív). */
  intake: number | null;
  /** Po kolika krocích úvodní cesty klient skončí (3 = projde celou a začne spolupracovat). */
  intakeStop: number;
  /** Kdo s klientem vede úvodní cestu. */
  intakeTherapist: Id;
  /** Konec posledního úvodního termínu – další krok se domlouvá až po něm. */
  intakeEnd: LocalDateTime | null;
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
  const rollInterests = (): Interest[] => {
    const r = rand();
    const interests: Interest[] =
      r < 0.4 ? ['koucink'] : r < 0.52 ? ['koucink', 'neuro'] : r < 0.64 ? ['neuro'] : r < 0.78 ? ['terapie'] : r < 0.92 ? ['leadership'] : ['workshopy'];
    if (chance(0.15) && !interests.includes('workshopy')) interests.push('workshopy');
    return interests;
  };
  const tagsFor = (interests: Interest[]): string[] => {
    const main = interests[0];
    const tags: string[] = [];
    if ((main === 'koucink' || main === 'neuro') && chance(0.85)) tags.push(pick(SPORT_TAGS));
    if (main === 'leadership' && chance(0.85)) tags.push(pick(WORK_TAGS));
    if (main === 'workshopy' && chance(0.5)) tags.push(pick([...SPORT_TAGS, ...WORK_TAGS]));
    if (chance(0.3)) tags.push(pick(COMMON_TAGS));
    return tags.filter((t, i, a) => a.indexOf(t) === i);
  };
  /** Odstup pravidelných sezení podle hlavního zájmu (pravidelný / nepravidelný klient). */
  const cadenceFor = (main: Interest, regular: boolean): number => {
    switch (main) {
      case 'neuro':
        return regular ? between(3, 6) : between(6, 12);
      case 'terapie':
        return regular ? between(6, 8) : between(12, 16);
      case 'leadership':
        return regular ? between(12, 16) : between(21, 35);
      default:
        return regular ? between(6, 10) : between(12, 21);
    }
  };
  const makeClient = (first: string, last: string, createdAt: LocalDateTime, extra: Partial<SimClient> = {}): Id | null => {
    const key = first + ' ' + last;
    if (usedNames.has(key)) return null;
    usedNames.add(key);
    const interests = extra.interests ?? rollInterests();
    const res = createClient(
      d,
      {
        firstName: first,
        lastName: last,
        email: `${ascii(first)}.${ascii(last)}@example.com`,
        phone: `+420 ${between(601, 799)} ${String(between(0, 999)).padStart(3, '0')} ${String(between(0, 999)).padStart(3, '0')}`,
        tags: tagsFor(interests),
        source: pick(['online', 'online', 'recepce', 'telefon', 'doporučení'] as const),
        consents: { gdpr: true, health: chance(0.92), marketingEmail: chance(0.72), sms: chance(0.86) },
        demo: true,
      },
      at(createdAt),
    );
    if (!res.ok) return null;
    const main = interests[0];
    const regular = chance(0.5);
    const cadence = cadenceFor(main, regular);
    const createdDate = dateOf(createdAt);
    // kdo přišel v ukázkovém období, prochází úvodní cestou (kromě lidí, kteří chodí jen na workshopy)
    const isNew = createdDate >= simStart && main !== 'workshopy';
    const stopRoll = rand();
    sim.push({
      id: res.value,
      interests,
      regular,
      gapDays: isNew ? between(3, 8) : cadence,
      cadence,
      createdDate,
      online: chance(0.3),
      episodeLeft: between(4, 12),
      pauseUntil: !isNew && chance(0.35) ? addDays(createdDate, between(0, 90)) : null,
      intake: isNew ? 0 : null,
      intakeStop: stopRoll < 0.12 ? 0 : stopRoll < 0.32 ? 1 : stopRoll < 0.4 ? 2 : 3,
      intakeTherapist: main === 'terapie' ? 't_benesova' : main === 'leadership' ? 't_riha' : chance(0.65) ? 't_mala' : 't_riha',
      intakeEnd: null,
      ...extra,
    });
    return res.value;
  };

  // Scénář: Martin Dvořák (úvodní cesta, permanentka, omluvenka, náhrada, pozdní storno)
  const martinCreated = combine(addDays(today, -31), '18:20');
  const martin = makeClient('Martin', 'Dvořák', martinCreated, { interests: ['koucink', 'neuro'], regular: true, gapDays: 999, intake: null }) as Id;
  const mc = d.clients.find((c) => c.id === martin);
  if (mc) mc.tags = ['Běh', 'Doporučení od trenéra', 'Preferuje ráno'];

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
    const ctxM = at(martinCreated);
    // úvodní cesta: freetalk zdarma, diagnostika, vyhodnocení
    const ft = createBooking(d, { clientId: martin, serviceId: 's_freetalk', therapistId: 't_mala', start: story(-30, '09:00'), payment: { method: 'free' }, channel: 'telefon', override: true }, ctxM);
    if (ft.ok) markCompleted(d, { bookingId: ft.value }, at(story(-30, '09:30')));
    const dg = createBooking(d, { clientId: martin, serviceId: 's_diagnostika', therapistId: 't_mala', start: story(-27, '09:00'), payment: { method: 'onsite' }, override: true }, at(story(-30, '09:45')));
    if (dg.ok) markCompleted(d, { bookingId: dg.value, settleWith: 'card' }, at(story(-27, '10:30')));
    topUpCredit(d, { clientId: martin, amount: 2000, method: 'card' }, at(story(-27, '10:35')));
    const vy = createBooking(d, { clientId: martin, serviceId: 's_vyhodnoceni', therapistId: 't_mala', start: story(-24, '09:00'), payment: { method: 'onsite' }, override: true }, at(story(-27, '10:40')));
    if (vy.ok) markCompleted(d, { bookingId: vy.value, settleWith: 'card' }, at(story(-24, '10:00')));
    // po vyhodnocení permanentka na mentální koučink
    const buyAt = story(-24, '10:15');
    const pkg = sellPackage(d, { clientId: martin, templateId: 'pt_koucink10', paidBy: 'card' }, at(buyAt));
    const plan: [number, 'done' | 'excuse' | 'future'][] = [
      [-20, 'done'],
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
      const r = createBooking(d, { clientId: martin, serviceId: 's_koucink', therapistId: 't_mala', start, payment: { method: 'package', packageId: pkg.ok ? pkg.value : undefined }, override: true }, at(createdAt, clientActor(martin)));
      if (!r.ok) continue;
      if (kind === 'done') markCompleted(d, { bookingId: r.value }, at(addMinutes(start, 60)));
      if (kind === 'excuse') {
        const exAt = combine(addDays(dateOf(start), -1), '18:00');
        const c = cancelBooking(d, { bookingId: r.value, option: 'excuse', reason: 'Nemoc' }, at(exAt, clientActor(martin)));
        if (c.ok) {
          const right = d.makeups.find((x) => x.sourceBookingId === r.value);
          const mStart = story(-6, '09:00');
          const mk = createBooking(d, { clientId: martin, serviceId: 's_koucink', therapistId: 't_mala', start: mStart, payment: { method: 'makeup', makeupId: right?.id }, override: true }, at(addMinutes(exAt, 20), clientActor(martin)));
          if (mk.ok) markCompleted(d, { bookingId: mk.value }, at(addMinutes(mStart, 60)));
        }
      }
    }
    // neurovizuální trénink zrušený po lhůtě (50 % z kreditu)
    const neuroStart = story(-19, '16:00');
    const nt = createBooking(d, { clientId: martin, serviceId: 's_neuro', therapistId: 't_vavrova', start: neuroStart, payment: { method: 'onsite' }, override: true }, at(addDays(neuroStart, -4), clientActor(martin)));
    if (nt.ok) cancelBooking(d, { bookingId: nt.value, option: 'fee', reason: 'Pracovní cesta' }, at(addHours(neuroStart, -20), clientActor(martin)));
    createBooking(d, { clientId: martin, serviceId: 's_neuro', therapistId: 't_vavrova', start: story(6, '16:00'), payment: { method: 'onsite' }, override: true }, at(addHours(now, -50), clientActor(martin)));
  }

  /* ---------------- běžný provoz ---------------- */
  const lastBooked = new Map<Id, LocalDate>();
  const gapOk = (c: SimClient, date: LocalDate): boolean => {
    const last = lastBooked.get(c.id);
    return !last || daysBetween(last, date) >= c.gapDays;
  };
  /** Klienti, kteří mohou na pravidelné sezení (noví až po vyhodnocení diagnostiky). */
  const poolFor = (interest: Interest, date: LocalDate): SimClient[] =>
    sim.filter(
      (c) =>
        c.id !== martin &&
        c.interests.includes(interest) &&
        c.createdDate <= date &&
        (!c.pauseUntil || c.pauseUntil <= date) &&
        (interest === 'workshopy' || c.intake === null || (c.intake >= INTAKE.length && !!c.intakeEnd && c.intakeEnd < combine(date, '00:00'))),
    );
  /** Noví klienti, kteří čekají na další krok úvodní cesty u daného kouče. */
  const intakePoolFor = (therapistId: Id, date: LocalDate): SimClient[] =>
    sim.filter(
      (c) =>
        c.intake !== null &&
        c.intake < c.intakeStop &&
        c.intakeTherapist === therapistId &&
        c.createdDate < date &&
        (c.intake === 0 || (!!c.intakeEnd && c.intakeEnd <= now && c.intakeEnd < combine(date, '00:00'))) &&
        gapOk(c, date),
    );

  const SERVICES_BY_THERAPIST: Record<Id, [Id, number][]> = {
    t_mala: [['s_koucink', 7], ['s_koucink_online', 2]],
    t_riha: [['s_strategicky', 3], ['s_koucink', 3], ['s_koucink_online', 1], ['s_mentoring', 1.5]],
    t_benesova: [['s_terapie', 1]],
    t_vavrova: [['s_neuro', 1]],
    t_kos: [['s_mentoring', 1]],
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
    if (serviceId === 's_strategicky') return 'leadership';
    const cat = svc(serviceId).categoryId;
    if (cat === 'cat_terapie') return 'terapie';
    if (cat === 'cat_neuro') return 'neuro';
    if (cat === 'cat_mentoring') return 'leadership';
    if (cat === 'cat_workshopy') return 'workshopy';
    return 'koucink';
  };

  const choosePayment = (clientId: Id, serviceId: Id, start: LocalDateTime, created: LocalDateTime): { method: 'package' | 'credit' | 'online' | 'onsite'; packageId?: Id } => {
    const pk = eligiblePackages(d, clientId, serviceId, dateOf(start), dateOf(created));
    if (pk.length && chance(0.93)) return { method: 'package', packageId: pk[0].id };
    const price = svc(serviceId).priceCzk;
    if (clientCredit(d, clientId) >= price && chance(0.6)) return { method: 'credit' };
    return chance(0.22) ? { method: 'online' } : { method: 'onsite' };
  };

  const maybeBuyPackage = (c: SimClient, serviceId: Id, when: LocalDateTime): void => {
    const tpl =
      serviceId === 's_koucink' || serviceId === 's_koucink_online' ? (chance(0.6) ? 'pt_koucink10' : 'pt_koucink5') :
      serviceId === 's_neuro' ? 'pt_neuro10' :
      serviceId === 's_mentoring' ? 'pt_mentoring6' : null;
    if (!tpl) return;
    const done = bookingsOfClient(d, c.id).filter((b) => b.status === 'completed');
    const regularDone = done.filter((b) => !INTAKE.includes(b.serviceId)).length;
    // po vyhodnocení diagnostiky si část nových klientů rovnou koupí permanentku
    const p = c.intake !== null && regularDone === 0 ? 0.45 : done.length >= 1 ? (c.regular ? 0.3 : 0.08) : 0;
    if (!chance(p)) return;
    if (eligiblePackages(d, c.id, serviceId, dateOf(when), dateOf(when)).length) return;
    const method: MoneyMethod = pick(['card', 'card', 'card', 'transfer', 'cash'] as const);
    sellPackage(d, { clientId: c.id, templateId: tpl, paidBy: method }, at(when));
  };

  const cancelledBy = (therapistId: Id): string =>
    therapistId === 't_benesova' ? 'Nemoc terapeutky' : therapistId === 't_vavrova' ? 'Nemoc trenérky' : therapistId === 't_kos' ? 'Nemoc mentora' : 'Nemoc kouče';

  const resolvePast = (b: Booking, c: SimClient): void => {
    const r = rand();
    if (INTAKE.includes(b.serviceId)) {
      // úvodní schůzky: výjimečně nedostavení nebo včasné zrušení, jinak proběhnou
      if (r < 0.02) markNoShow(d, { bookingId: b.id }, at(addMinutes(b.start, 15)));
      else if (r < 0.07 && addHours(b.start, -30) > b.createdAt)
        cancelBooking(d, { bookingId: b.id, option: 'free', reason: pick(['Pracovní povinnosti', 'Nemoc', 'Změna plánů']) }, at(addHours(b.start, -30), clientActor(c.id)));
      else markCompleted(d, { bookingId: b.id, settleWith: b.payment.method === 'onsite' ? (chance(0.6) ? 'card' : 'transfer') : null }, at(b.end));
      return;
    }
    if (r < 0.022) {
      markNoShow(d, { bookingId: b.id }, at(addMinutes(b.start, 15)));
      return;
    }
    if (r < 0.085) {
      const cancelAt = addHours(b.start, -between(26, 100));
      if (cancelAt > b.createdAt) {
        const ev = evaluateCancellation(d, b, cancelAt, 'client');
        if (ev.options.some((o) => o.kind === 'free')) {
          cancelBooking(d, { bookingId: b.id, option: 'free', reason: pick(['Pracovní povinnosti', 'Nemoc', 'Soustředění', 'Rodinné důvody', '']) }, at(cancelAt, clientActor(c.id)));
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
          { bookingId: b.id, option: wantExcuse ? 'excuse' : 'fee', reason: pick(['Nemoc', 'Nemoc dítěte', 'Pracovní povinnosti', 'Zápas přeložen', 'Doprava']) },
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
      cancelBooking(d, { bookingId: b.id, option: 'clinic', reason: cancelledBy(b.therapistId) }, at(addHours(b.start, -30), owner));
      return;
    }
    const settle: MoneyMethod = chance(0.6) ? 'card' : chance(0.6) ? 'transfer' : 'cash';
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
        ahead < 0 ? (th.id === 't_kos' ? 0.32 : 0.6 + rand() * 0.24) :
        ahead === 0 ? (th.id === 't_kos' ? 0.3 : 0.76) :
        ahead <= 3 ? (th.id === 't_kos' ? 0.25 : 0.64) :
        ahead <= 7 ? 0.5 : ahead <= 14 ? 0.33 : 0.18;
      const leadsIntake = INTAKE_THERAPISTS.includes(th.id);
      for (const iv of ivs) {
        let cursor = minutesOf(iv.start);
        const endMin = minutesOf(iv.end);
        while (cursor + 15 <= endMin) {
          if (!chance(target)) {
            cursor += chance(0.5) ? 15 : 30;
            continue;
          }
          let c: SimClient | undefined;
          let serviceId: Id = '';
          if (leadsIntake && chance(0.45)) {
            const waiting = intakePoolFor(th.id, day);
            if (waiting.length) {
              c = pick(waiting);
              serviceId = INTAKE[c.intake as number];
            }
          }
          if (!c) {
            serviceId = weighted(SERVICES_BY_THERAPIST[th.id]);
            const pool = poolFor(interestOf(serviceId), day).filter((x) => gapOk(x, day));
            if (!pool.length) {
              cursor += 15;
              continue;
            }
            const regulars = pool.filter((x) => x.regular);
            c = regulars.length && chance(0.6) ? pick(regulars) : pick(pool);
          }
          const isIntake = INTAKE.includes(serviceId);
          const dur = svc(serviceId).durationMin;
          if (cursor + dur > endMin) {
            cursor += 15;
            continue;
          }
          const start = combine(day, timeFromMinutes(cursor));
          const leadHours = between(6, 24 * 12);
          let created = addHours(start, -leadHours);
          let createdFloor = combine(c.createdDate, '08:00');
          // další krok úvodní cesty se domlouvá až po předchozí schůzce
          if (isIntake && c.intakeEnd && addMinutes(c.intakeEnd, 10) > createdFloor) createdFloor = addMinutes(c.intakeEnd, between(10, 120));
          if (created < createdFloor) created = createdFloor;
          if (created >= start) {
            cursor += 15;
            continue;
          }
          if (created > now) created = addHours(now, -between(1, 24 * 10));
          if (created < createdFloor) created = createdFloor;
          if (created >= start || created > now) {
            cursor += 15;
            continue;
          }
          let res: ReturnType<typeof createBooking>;
          if (serviceId === 's_freetalk') {
            // úvodní rozhovor zdarma domlouvá kouč (telefon, e-mail, formulář na webu)
            res = createBooking(d, { clientId: c.id, serviceId, therapistId: th.id, start, payment: { method: 'free' }, channel: chance(0.6) ? 'telefon' : 'recepce' }, at(created));
          } else {
            if (!isIntake && chance(0.05)) topUpCredit(d, { clientId: c.id, amount: pick([2000, 3000, 5000]), method: pick(['card', 'cash', 'transfer'] as const) }, at(addMinutes(created, -10)));
            if (!isIntake) maybeBuyPackage(c, serviceId, addMinutes(created, -5));
            const payment = choosePayment(c.id, serviceId, start, created);
            const actor = c.online && !isIntake ? clientActor(c.id) : staff;
            res = createBooking(d, { clientId: c.id, serviceId, therapistId: th.id, start, payment, channel: actor.role === 'client' ? 'online' : chance(0.75) ? 'recepce' : 'telefon' }, at(created, actor));
            if (!res.ok && actor.role === 'client') res = createBooking(d, { clientId: c.id, serviceId, therapistId: th.id, start, payment, channel: 'telefon' }, at(created));
          }
          if (!res.ok) {
            cursor += 15;
            continue;
          }
          lastBooked.set(c.id, day);
          const b = d.bookings.find((x) => x.id === res.value) as Booking;
          if (b.end <= now) resolvePast(b, c);
          else if (b.start > now && !isIntake && chance(0.025)) {
            const cancelAt = addHours(created, between(2, 30));
            if (cancelAt < now && cancelAt < addHours(b.start, -24)) cancelBooking(d, { bookingId: b.id, option: 'free', reason: 'Změna plánů' }, at(cancelAt, clientActor(c.id)));
          }
          if (isIntake) {
            if (b.status === 'completed' || b.status === 'confirmed') {
              c.intake = (c.intake ?? 0) + 1;
              c.intakeEnd = b.end;
              if (c.intake >= INTAKE.length) c.gapDays = c.cadence;
            }
          } else {
            c.episodeLeft--;
            if (c.episodeLeft <= 0) {
              c.pauseUntil = addDays(day, between(30, 120));
              c.episodeLeft = between(4, 12);
            }
          }
          cursor += dur + (chance(0.25) ? 15 : 0);
        }
      }
    }

    // workshopy
    for (const ses of sessionsOnDate(d, day)) {
      const ahead2 = daysBetween(today, day);
      const wanted = ahead2 < 0 ? between(6, 11) : ahead2 <= 2 ? between(6, 11) : ahead2 <= 7 ? between(4, 8) : between(2, 5);
      const pool = poolFor('workshopy', day);
      let added = 0;
      for (let k = 0; k < pool.length * 2 && added < wanted; k++) {
        const c = pick(pool);
        if (bookingsOfClient(d, c.id).some((b) => b.sessionId === ses.id)) continue;
        let created = addHours(ses.start, -between(4, 24 * 10));
        if (created < combine(c.createdDate, '08:00')) created = combine(c.createdDate, '08:00');
        if (created >= ses.start) continue;
        if (created > now) created = addHours(now, -between(1, 24 * 6));
        if (created < combine(c.createdDate, '08:00') || created >= ses.start) continue;
        const payment = choosePayment(c.id, ses.serviceId, ses.start, created);
        const res = createBooking(d, { clientId: c.id, serviceId: ses.serviceId, therapistId: ses.therapistId, start: ses.start, sessionId: ses.id, payment }, at(created, clientActor(c.id)));
        if (!res.ok) continue;
        added++;
        const b = d.bookings.find((x) => x.id === res.value) as Booking;
        if (b.end <= now) {
          const r = rand();
          if (r < 0.03) markNoShow(d, { bookingId: b.id }, at(addMinutes(b.start, 10)));
          else if (r < 0.09) {
            const cancelAt = addHours(b.start, -between(8, 40));
            if (cancelAt > b.createdAt) cancelBooking(d, { bookingId: b.id, option: 'free', reason: '' }, at(cancelAt, clientActor(c.id)));
            else markCompleted(d, { bookingId: b.id, settleWith: b.payment.method === 'onsite' ? 'card' : null }, at(b.end));
          } else markCompleted(d, { bookingId: b.id, settleWith: b.payment.method === 'onsite' ? (chance(0.5) ? 'card' : 'cash') : null }, at(b.end));
        }
      }
    }
  }

  /* ---------------- čekací listina ---------------- */
  const tomorrow = shiftToWorkday(addDays(today, 1));
  const waiters = sim.filter((c) => c.id !== martin && c.intake === null && c.interests.includes('koucink')).slice(0, 40);
  const wlCtx = (c: Id): Ctx => at(addHours(now, -between(3, 30)), clientActor(c));
  for (const c of waiters.slice(0, 3)) {
    joinWaitlist(d, { clientId: c.id, serviceId: 's_koucink', therapistId: 't_mala', dateFrom: tomorrow, dateTo: addDays(tomorrow, 2), note: 'Ideálně ráno před tréninkem' }, wlCtx(c.id));
  }
  // uvolněný termín zítra → nabídka čekajícím (aktivní nabídka k vyzkoušení)
  const tomorrowsMala = d.bookings.find((b) => b.therapistId === 't_mala' && dateOf(b.start) === tomorrow && b.status === 'confirmed' && b.clientId !== martin && b.serviceId === 's_koucink');
  if (tomorrowsMala) {
    const ev = evaluateCancellation(d, tomorrowsMala, addMinutes(now, -25), 'client');
    const option = ev.options.find((o) => o.kind === 'excuse') ?? ev.options.find((o) => o.kind === 'fee') ?? ev.options.find((o) => o.kind === 'free');
    if (option) cancelBooking(d, { bookingId: tomorrowsMala.id, option: option.kind, reason: 'Nemoc' }, at(addMinutes(now, -25), clientActor(tomorrowsMala.clientId)));
  }
  // plně obsazený workshop s čekajícími
  const fullSession = sessionsOnDate(d, tomorrow).concat(sessionsOnDate(d, addDays(tomorrow, 1)))[0];
  if (fullSession) {
    const pool = poolFor('workshopy', today);
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
  campaign('cmp_leto', 'Letní provoz', 'Letní provoz Winning Minds', 100, [
    { type: 'heading', text: 'Letní provoz' },
    { type: 'text', text: 'Dobrý den, [jméno], v červenci a srpnu máme mírně upravený provoz. Sezení probíhají osobně i online, volné termíny najdete v aplikaci.' },
  ], everyone);
  campaign('cmp_zari', 'Zářijový newsletter', 'Září ve Winning Minds', 40, [
    { type: 'heading', text: 'Nová sezóna, nové cíle' },
    { type: 'text', text: 'Dobrý den, [jméno], začátek sezóny je ideální chvíle zastavit se a nastavit si cíle. Přinášíme tři tipy od našich koučů, jak na to.' },
  ], everyone);
  campaign('cmp_workshopy', 'Workshopy mentální odolnosti', 'Nové workshopy mentální odolnosti – úterý, čtvrtek a sobota', 12, [
    { type: 'heading', text: 'Workshopy mentální odolnosti' },
    { type: 'text', text: 'Dobrý den, [jméno], spouštíme pravidelné workshopy mentální odolnosti: dvě hodiny praktických technik pro zvládání tlaku a stresu. Nejvýše 12 účastníků, vede Marek Kos.' },
    { type: 'button', label: 'Přihlásit se na workshop', url: '#' },
  ], { match: 'any', rules: [{ type: 'visited_category', categoryId: 'cat_koucink', withinDays: 365 }, { type: 'visited_category', categoryId: 'cat_workshopy', withinDays: 365 }], exclude: [] });
  campaign('cmp_nervozita', 'Nervozita před výkonem?', 'Nervozita před výkonem? 3 techniky na 5 minut', null, [
    { type: 'heading', text: 'Nervozita před výkonem?' },
    { type: 'text', text: 'Dobrý den, [jméno], Tereza připravila krátkou sestavu, kterou zvládnete v šatně před zápasem i před důležitou poradou.' },
    { type: 'list', items: ['Krabicové dýchání · 4 kola po 4 sekundách', 'Kotva – jedno gesto pro návrat do přítomnosti', 'Otázka „Co teď můžu ovlivnit?“ · 3× v duchu'] },
    { type: 'button', label: 'Rezervovat termín', url: '#' },
  ], {
    match: 'all',
    rules: [{ type: 'visited_category', categoryId: 'cat_koucink', withinDays: 180 }],
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

  /* ---------------- CRM: fáze spolupráce, poznámky, follow-upy ---------------- */
  seedCrm(d, now, { rand, pick, chance, between, martin, owner });

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

/* ------------------------------------------------------------------ */
/* CRM ukázková data (smyšlené koučovací poznámky)                     */
/* ------------------------------------------------------------------ */

/** Druh práce s klientem – podle služby se volí témata poznámek. */
type Theme = 'sport' | 'leader' | 'therapy' | 'neuro';

interface ThemeContent {
  topics: string[];
  activities: string[];
  observations: string[];
  homework: string[];
  goals: string[];
}

const CONTENT: Record<Theme, ThemeContent> = {
  sport: {
    topics: [
      'zvládání nervozity před závodem',
      'koncentrace v rozhodujících chvílích zápasu',
      'práce s vnitřním kritikem',
      'návrat po zranění a strach z opakování',
      'cíle na novou sezónu',
      'rozhodování pod tlakem',
      'rovnováha mezi školou, rodinou a tréninkem',
      'komunikace s trenérem a týmem',
      'motivace v období bez výsledků',
      'sebedůvěra po neúspěchu',
    ],
    activities: [
      'vizualizace celého výkonu od rozcvičení po cíl',
      'dechové cvičení 4–7–8 a krabicové dýchání',
      'mapování situací, ve kterých se ztrácí soustředění',
      'přeformulování obav na věty „co mi pomáhá“',
      'rozbor posledního výkonu podle videa',
      'nastavení minutové rutiny před výkonem',
      'kotvení – návrat do přítomnosti jedním gestem',
      'škálování nervozity 1–10 a hledání ideální zóny',
      'sepsání silných stránek a důkazů z posledních měsíců',
    ],
    observations: [
      'Před závodem teď lépe spí, nervozita přichází až ráno.',
      'Nervozita se objevuje hlavně v prvních minutách, pak odezní.',
      'Vizualizace zatím nejde plynule, myšlenky odbíhají k výsledku.',
      'Silná motivace, ale sklon se přetěžovat.',
      'Vlastní nápad: zapisovat si drobné úspěchy po každém tréninku.',
      'Po rozhovoru o očekáváních rodičů znatelné uvolnění.',
      'V náročné situaci se rychleji vrací k dechu než dřív.',
      'Hodně mluví o výsledku, méně o tom, co může ovlivnit.',
    ],
    homework: [
      'každý večer 5 minut vizualizace',
      'deník emocí po tréninku (tři věty)',
      'dechové cvičení ráno a před tréninkem',
      'vyzkoušet rutinu před výkonem na tréninku',
      'zapsat tři situace, kdy se dařilo zůstat v klidu',
      'připravit si otázky na rozhovor s trenérem',
    ],
    goals: [
      'Zvládnout nervozitu na startu a závodit na úrovni tréninkových výkonů.',
      'Vrátit se po zranění kolene bez strachu z doskoku.',
      'Udržet koncentraci i ve třetí třetině zápasu.',
      'Najít rovnováhu mezi studiem a vrcholovým sportem.',
    ],
  },
  leader: {
    topics: [
      'priority na další kvartál',
      'vedení týmu v období změn',
      'delegování a důvěra v tým',
      'příprava na jednání s investorem',
      'stres před pracovní prezentací',
      'další kariérní krok',
      'zpětná vazba členům týmu',
      'rozhodování mezi dvěma nabídkami',
    ],
    activities: [
      'model GROW na téma priorit',
      'mapa lidí, kterých se změna týká',
      'rozbor kalendáře – kam jde čas',
      'výběr tří priorit na kvartál',
      'nácvik náročného rozhovoru',
      'rozbor rozhodnutí podle kritérií a rizik',
      'příprava struktury pravidelných schůzek 1:1',
    ],
    observations: [
      'Jasná představa o cíli, méně jasné první kroky.',
      'Většinu operativy pořád dělá za tým – téma na příště.',
      'Delegování dvou agend od minula funguje.',
      'Nejvíc energie bere neustálé přepínání mezi úkoly.',
      'Otevřenost zpětné vazbě, rychle hledá praktické kroky.',
    ],
    homework: [
      'sepsat tři priority na příští měsíc',
      'vyzkoušet novou strukturu schůzek 1:1',
      'delegovat jednu agendu a sledovat, co se stane',
      'připravit kritéria pro rozhodnutí',
      'každý pátek 10 minut na zhodnocení týdne',
    ],
    goals: [
      'Připravit se na výběrové řízení a prezentaci před vedením.',
      'Vést tým klidně i v období změn a tlaku na výsledky.',
      'Uvolnit si čas na strategii – delegovat operativu.',
    ],
  },
  therapy: {
    topics: [
      'dlouhodobý stres a únava',
      'úzkost v náročných situacích',
      'potíže se spánkem',
      'vyhoření v práci',
      'sebehodnocení a vnitřní kritik',
      'vztahy v rodině',
      'zvládání vzteku a frustrace',
    ],
    activities: [
      'mapování spouštěčů stresu během týdne',
      'nácvik zklidňujícího dechu',
      'práce s automatickými myšlenkami',
      'technika bezpečného místa',
      'rozbor týdne – co dodávalo a co ubíralo energii',
      'hledání hranic mezi prací a odpočinkem',
    ],
    observations: [
      'Spánek se zlepšuje, večerní rutina pomáhá.',
      'Úzkost přichází hlavně v neděli večer před pracovním týdnem.',
      'Lépe rozpozná první signály stresu v těle.',
      'Náročný týden, přesto se daří držet hranice.',
      'Vnitřní kritik je slyšet méně často, v zátěži se ale vrací.',
    ],
    homework: [
      'večer 30 minut bez obrazovek před spaním',
      'zapisovat si situace, které spustily stres',
      'zklidňující dech 3× denně',
      'jedna příjemná aktivita týdně jen pro sebe',
      'všímat si vnitřního kritika a zapsat jeho věty',
    ],
    goals: [
      'Zvládat pracovní tlak bez nespavosti a úzkosti.',
      'Nastavit hranice mezi prací a odpočinkem.',
      'Mluvit o sobě laskavěji i po chybě.',
    ],
  },
  neuro: {
    topics: [
      'periferní vidění a čtení hry',
      'rychlost reakce',
      'koordinace oko–ruka',
      'soustředění při více podnětech',
      'vizuální paměť a orientace v prostoru',
    ],
    activities: [
      'reakční tabule – 3 série po 60 sekundách',
      'sakadické pohyby očí s metronomem',
      'sledování dvou míčků současně',
      'periferní vidění s barevnými kartami',
      'Brockova šňůrka – konvergence a divergence',
      'reakce na světelné podněty v pohybu',
    ],
    observations: [
      'Reakční čas na tabuli se zlepšil z 0,62 na 0,55 sekundy.',
      'Periferní vidění vpravo je výrazně slabší než vlevo.',
      'Při únavě rychle klesá přesnost – zařadit kratší série.',
      'Konvergence bez potíží, sakády zatím nepřesné.',
      'Lepší výsledky ráno než po tréninku.',
    ],
    homework: [
      'cvičení s Brockovou šňůrkou 5 minut denně',
      'sakády podle videa 3× týdně',
      'periferní vidění s kartami před tréninkem',
      'reakční trénink v aplikaci 10 minut denně',
    ],
    goals: [
      'Lépe číst hru a dřív vidět volného spoluhráče.',
      'Zrychlit reakci na startu o desetiny sekundy.',
    ],
  },
};

const MARTIN_TOPICS = ['nervozita před závodem', 'rutina před startem', 'práce s myšlenkami během závodu', 'příprava na podzimní půlmaraton', 'spánek před závodem'];

const FREETALK_EXPECTATIONS = [
  'Chce lépe zvládat tlak v rozhodujících chvílích.',
  'Hledá podporu před důležitou sezónou.',
  'Potřebuje se zorientovat v kariérním rozhodnutí.',
  'Chce se zastavit a srovnat si priority.',
  'Chce zjistit, jestli by pomohl neurovizuální trénink.',
];
const FREETALK_NEXT = ['domluvena diagnostika', 'klient si to rozmyslí a ozve se', 'poslat informace o diagnostice a ceník'];
const DIAG_OBSERVATIONS = [
  'Vysoká míra sebekritiky, výborná pracovní morálka.',
  'Pozornost klesá po zhruba 20 minutách zátěže.',
  'Reakční čas v normě, slabší periferní vidění.',
  'Stres se projevuje hlavně horším spánkem a podrážděností.',
  'Dobrá sebereflexe, nejistota v nových situacích.',
];
const STRENGTHS = ['vytrvalost a pracovitost', 'schopnost rychle se učit', 'dobrá sebereflexe', 'rychlé reakce a dobrá koordinace', 'silná vnitřní motivace'];
const GROWTH_AREAS = ['zvládání nervozity a práce s očekáváním', 'udržení pozornosti v únavě', 'hranice mezi výkonem a odpočinkem', 'periferní vidění a čtení situace', 'sebedůvěra po chybě'];
const PLANS: Record<Theme, string[]> = {
  sport: ['mentální koučink 1× za 14 dní, 10 sezení', 'mentální koučink 1× týdně a k tomu neurovizuální trénink'],
  leader: ['strategický koučink 1× měsíčně', 'mentoring 1× měsíčně po dobu půl roku'],
  therapy: ['terapie 1× týdně, po 8 sezeních společné zhodnocení'],
  neuro: ['neurovizuální trénink 2× týdně po dobu 5 týdnů', 'neurovizuální trénink 1× týdně a mentální koučink 1× za 14 dní'],
};

const CALLS_FIRST = [
  'Kontakt na doporučení známé. Zájem o mentální koučink před sezónou, domluvit úvodní freetalk.',
  'Telefonát s rodičem – hraje tenis (16 let) a po prohraných zápasech ztrácí chuť. Poslali jsme informace o diagnostice.',
  'Zájem o strategický koučink pro vedoucí týmu. Poslat ceník a možné termíny.',
  'Dotaz na neurovizuální trénink – hraje florbal a chce lépe číst hru.',
  'Krátký telefonát: posouvá začátek spolupráce kvůli pracovní cestě, ozve se příští týden.',
];
const CALLS_INTAKE = [
  'Po freetalku chce pokračovat diagnostikou, preferuje odpolední termíny.',
  'Potvrzen termín diagnostiky, poslat vstupní dotazník e-mailem.',
  'Ptá se, jak dlouho trvá vyhodnocení diagnostiky – výsledky probereme na společném sezení.',
];
const PLAIN_NOTES = [
  'Preferuje komunikaci e-mailem, telefonovat jen v naléhavých případech.',
  'Fakturovat na firmu – fakturační údaje pošle před dalším sezením.',
  'Trenér souhlasí se sdílením hlavních závěrů, podrobnosti ze sezení ne.',
  'Na sezení chodí rovnou z tréninku – plánovat aspoň 15 minut rezervu.',
  'Před sezónou chce zhuštěný režim: sezení jednou týdně.',
];
const FOLLOW_UPS: Record<string, string[]> = {
  st_potencialni: ['Zavolat a nabídnout úvodní freetalk', 'Poslat informace o spolupráci a ceník'],
  st_freetalk: ['Ozvat se po freetalku a domluvit diagnostiku', 'Poslat shrnutí freetalku'],
  st_diagnostika: ['Vyhodnotit dotazník z diagnostiky', 'Připravit plán spolupráce na vyhodnocení'],
  st_vyhodnoceni: ['Poslat návrh plánu spolupráce', 'Domluvit první sezení'],
  st_aktivni: [
    'Zkontrolovat deník emocí',
    'Poslat zápis z posledního sezení',
    'Domluvit termíny na další měsíc',
    'Připomenout neurovizuální cvičení',
    'Probrat s trenérem průběh spolupráce',
  ],
  st_pozastaveno: ['Ozvat se po pauze, jak to jde', 'Zeptat se, zda pokračovat po sezóně'],
  st_konec: ['Poslat dotazník spokojenosti'],
};

function themeOfService(serviceId: Id): Theme | null {
  switch (serviceId) {
    case 's_koucink':
    case 's_koucink_online':
      return 'sport';
    case 's_strategicky':
    case 's_mentoring':
      return 'leader';
    case 's_terapie':
      return 'therapy';
    case 's_neuro':
      return 'neuro';
    default:
      return null;
  }
}

interface CrmSeedTools {
  rand: () => number;
  pick: <T>(arr: readonly T[]) => T;
  chance: (p: number) => boolean;
  between: (a: number, b: number) => number;
  martin: Id;
  owner: Actor;
}

function seedCrm(d: ClinicState, now: LocalDateTime, tools: CrmSeedTools): void {
  const { rand, pick, chance, between, martin, owner } = tools;
  clearSelectorCaches();
  // příkazy níže zapisují historii změn do minulosti – oddělit ji, aby limit historie nevytlačil poslední dny provozu
  const auditBefore = d.audit;
  d.audit = [];
  const today = dateOf(now);
  const coach = (therapistId: Id | undefined): Actor => {
    const t = therapistId ? getTherapist(d, therapistId) : undefined;
    return t ? { role: 'therapist', name: therapistName(t), therapistId: t.id } : owner;
  };
  const ctxAt = (time: LocalDateTime, actor: Actor): Ctx => ({ now: time > now ? now : time, actor });
  const clamp = (t: LocalDateTime): LocalDateTime => (t > now ? now : t);
  const hours = (t: LocalDateTime, h: number): LocalDateTime => addMinutes(t, Math.round(h * 60));
  const isHeld = (b: Booking): boolean => b.status === 'completed' || b.status === 'confirmed';
  /** Hlavní druh práce s klientem podle jeho pravidelných sezení (nebo podle toho, kdo vedl úvodní cestu). */
  const themeOfClient = (clientId: Id): Theme => {
    const list = bookingsOfClient(d, clientId);
    for (const b of list) {
      const t = themeOfService(b.serviceId);
      if (t) return t;
    }
    const intake = list.find((b) => INTAKE.includes(b.serviceId));
    if (intake?.therapistId === 't_benesova') return 'therapy';
    return 'sport';
  };

  /* ---- fáze spolupráce ---- */
  type Step = [Id, LocalDateTime, string?];
  const applyPath = (clientId: Id, createdAt: LocalDateTime, steps: Step[], actor: Actor): void => {
    let prev = createdAt;
    for (const [stageId, wanted, note] of steps) {
      const t = wanted > prev ? wanted : addMinutes(prev, between(5, 90));
      if (t > now) break;
      prev = t;
      setClientStage(d, { clientId, stageId, note }, ctxAt(t, actor));
    }
  };
  const lastTherapist = new Map<Id, Id>();
  for (const c of d.clients) {
    const list = bookingsOfClient(d, c.id);
    const individual = list.filter((b) => !b.sessionId);
    const done = individual.filter((b) => b.status === 'completed');
    const upcoming = individual.filter((b) => b.status === 'confirmed' && b.start > now);
    const lastB = done[done.length - 1] ?? upcoming[0] ?? individual[individual.length - 1];
    if (lastB) lastTherapist.set(c.id, lastB.therapistId);
    const actor = coach(lastB?.therapistId ?? pick(d.therapists).id);
    const created = c.createdAt;
    const firstHeld = (serviceId: Id): Booking | undefined => individual.find((b) => b.serviceId === serviceId && isHeld(b));
    const regular = individual.filter((b) => !INTAKE.includes(b.serviceId) && isHeld(b));
    const regularDone = regular.filter((b) => b.status === 'completed');
    const lastDone = regularDone[regularDone.length - 1]?.end;
    const lapsed = !upcoming.length && !!lastDone && lastDone < addDays(now, -28);
    /** Aktivní klient, který přestal chodit → pauza, případně konec spolupráce. */
    const pauseSteps = (): Step[] => {
      if (!lapsed || !lastDone) return [];
      const pauseAt = addDays(lastDone, between(10, 20));
      const out: Step[] = [['st_pozastaveno', pauseAt, pick(['Pauza kvůli sezóně.', 'Pracovně vytížené období, ozve se.', undefined])]];
      if (chance(0.35)) out.push(['st_konec', addDays(pauseAt, between(5, 25)), pick(['Cíle spolupráce splněny.', 'Ukončeno po domluvě.', undefined])]);
      return out;
    };

    const ft = firstHeld('s_freetalk');
    if (ft) {
      // nový klient: fáze odpovídají schůzkám úvodní cesty
      const dg = firstHeld('s_diagnostika');
      const vy = firstHeld('s_vyhodnoceni');
      const steps: Step[] = [['st_freetalk', ft.createdAt, chance(0.3) ? 'Domluven úvodní freetalk.' : undefined]];
      if (dg) steps.push(['st_diagnostika', dg.createdAt, chance(0.3) ? 'Po freetalku chce pokračovat diagnostikou.' : undefined]);
      else if (ft.status === 'completed' && ft.end < addDays(now, -21) && chance(0.6)) steps.push(['st_konec', addDays(ft.end, between(7, 20)), 'Po freetalku spolupráce nezačala.']);
      if (dg?.status === 'completed') steps.push(['st_vyhodnoceni', addMinutes(dg.end, between(30, 300)), chance(0.3) ? 'Diagnostika hotová, připravujeme vyhodnocení.' : undefined]);
      if (dg?.status === 'completed' && !vy && dg.end < addDays(now, -30) && chance(0.6)) steps.push(['st_konec', addDays(dg.end, between(14, 25)), 'Vyhodnocení zatím nedomluveno, bez odezvy.']);
      if (vy?.status === 'completed') {
        if (regular.length || (vy.end > addDays(now, -14) && chance(0.5)))
          steps.push(['st_aktivni', addMinutes(vy.end, between(10, 180)), chance(0.4) ? 'Probrali jsme výsledky diagnostiky a domluvili plán spolupráce.' : undefined]);
        else if (vy.end < addDays(now, -21)) steps.push(['st_konec', addDays(vy.end, between(7, 14)), 'Po vyhodnocení spolupráce nezačala.']);
      }
      steps.push(...pauseSteps());
      applyPath(c.id, created, steps, actor);
      continue;
    }

    const firstRegular = regular[0]?.start;
    if (firstRegular) {
      // stávající klient: úvodní cestu prošel před ukázkovým obdobím
      const span = Math.max(1, Math.min(between(16, 28), daysBetween(dateOf(created), dateOf(firstRegular)) - 1));
      const step = (k: number): LocalDateTime => hours(created, span * 24 * k);
      const steps: Step[] = [
        ['st_freetalk', step(0.1), chance(0.3) ? 'Úvodní rozhovor proběhl online.' : undefined],
        ['st_diagnostika', step(0.35)],
        ['st_vyhodnoceni', step(0.7)],
        ['st_aktivni', step(1), chance(0.3) ? 'Domluvena pravidelná sezení.' : undefined],
        ...pauseSteps(),
      ];
      applyPath(c.id, created, steps, actor);
      continue;
    }

    const workshop = list.find((b) => b.sessionId && b.status === 'completed');
    if (workshop) {
      // chodí jen na workshopy – zatím potenciální klient, někteří projevili zájem o individuální spolupráci
      if (chance(0.25)) applyPath(c.id, created, [['st_freetalk', addDays(workshop.end, between(1, 4)), 'Po workshopu má zájem o individuální spolupráci.']], actor);
      continue;
    }

    // bez schůzek v ukázkovém období
    const ageDays = daysBetween(dateOf(created), today);
    const r = rand();
    if (ageDays <= 70) {
      if (r < 0.55) continue; // zůstává potenciálním klientem
      applyPath(c.id, created, [['st_freetalk', hours(created, between(4, 24 * 6)), 'Freetalk proběhl po telefonu.']], actor);
      continue;
    }
    if (r < 0.15) continue; // nikdy nepokračoval
    const span = Math.max(30, ageDays - 30);
    const base = (k: number): LocalDateTime => addDays(created, Math.round((span * k) / 10));
    if (r < 0.3) {
      applyPath(c.id, created, [['st_freetalk', base(0.3)], ['st_konec', base(1), 'Po freetalku spolupráce nezačala.']], actor);
      continue;
    }
    const steps: Step[] = [
      ['st_freetalk', base(0.2)],
      ['st_diagnostika', base(0.6)],
      ['st_vyhodnoceni', base(1.1)],
      ['st_aktivni', base(1.5)],
      ['st_pozastaveno', base(between(6, 9))],
    ];
    if (r > 0.62) steps.push(['st_konec', base(between(9, 10)), pick(['Cíle spolupráce splněny.', 'Ukončeno po domluvě.', 'Stěhování, spolupráce skončila.'])]);
    applyPath(c.id, created, steps, actor);
  }

  /* ---- zápisy ze sezení ---- */
  const both = (a: string, b: string, sep: string): string => (a !== b ? a + sep + b : a);
  const sessionText = (b: Booking): string => {
    const theme = themeOfService(b.serviceId) ?? themeOfClient(b.clientId);
    const k = CONTENT[theme];
    if (b.serviceId === 's_freetalk') {
      return [
        'Úvodní rozhovor (freetalk).',
        `S čím přichází: ${pick(k.topics)}.`,
        `Očekávání: ${pick(FREETALK_EXPECTATIONS)}`,
        `Další krok: ${pick(FREETALK_NEXT)}.`,
      ].join('\n');
    }
    if (b.serviceId === 's_diagnostika') {
      return [
        'Diagnostika.',
        'Proběhlo: vstupní rozhovor, dotazník zvládání stresu, test pozornosti a neurovizuální testy (reakční čas, periferní vidění).',
        `První postřehy: ${pick(DIAG_OBSERVATIONS)}`,
        'Výsledky připravíme na vyhodnocení.',
      ].join('\n');
    }
    if (b.serviceId === 's_vyhodnoceni') {
      return [
        'Vyhodnocení diagnostiky.',
        `Silné stránky: ${pick(STRENGTHS)}.`,
        `Oblasti k rozvoji: ${pick(GROWTH_AREAS)}.`,
        `Domluvený plán: ${pick(PLANS[theme])}.`,
      ].join('\n');
    }
    const [a1, a2] = [pick(k.activities), pick(k.activities)];
    const [h1, h2] = [pick(k.homework), pick(k.homework)];
    const topic = b.clientId === martin && theme === 'sport' ? pick(MARTIN_TOPICS) : pick(k.topics);
    return [
      `${theme === 'neuro' ? 'Zaměření' : 'Téma'}: ${topic}.`,
      `${theme === 'neuro' ? 'Cvičení' : 'Co jsme dělali'}: ${both(a1, a2, '; ')}.`,
      `Postřeh: ${pick(k.observations)}`,
      `Do příštího sezení: ${both(h1, h2, ', ')}.`,
    ].join('\n');
  };
  const since = addDays(now, -42);
  const completed = d.bookings.filter((b) => b.status === 'completed' && !b.sessionId && b.start >= since && b.end <= now);
  let sessionNotes = 0;
  for (const b of completed) {
    if (sessionNotes >= 320) break;
    if (!(b.clientId === martin || chance(0.24))) continue;
    const written = clamp(addMinutes(b.end, between(5, 180)));
    const res = addNote(d, { clientId: b.clientId, kind: 'session', title: '', text: sessionText(b), bookingId: b.id }, ctxAt(written, coach(b.therapistId)));
    if (!res.ok) continue;
    sessionNotes++;
    if (chance(0.35) || (b.clientId === martin && chance(0.6))) {
      const note = d.notes.find((n) => n.id === res.value);
      if (note) {
        const mail = sessionNotesEmail(d, note);
        sendSessionNotes(d, { noteId: note.id, subject: mail.subject, body: mail.body }, ctxAt(addMinutes(written, between(10, 600)), coach(b.therapistId)));
      }
    }
  }

  /* ---- Plaud importy (shrnutí, přepis zatím bez souboru) ---- */
  const recent = completed.filter((b) => b.start >= addDays(now, -21) && !!themeOfService(b.serviceId));
  const plaudBookings = [...recent.filter((b) => b.clientId === martin).slice(-1), ...recent.filter(() => chance(0.04)).slice(0, 7)];
  for (const b of plaudBookings) {
    const k = CONTENT[themeOfService(b.serviceId) ?? 'sport'];
    const text = [
      'Shrnutí (Plaud AI)',
      `• Hlavní téma: ${b.clientId === martin ? pick(MARTIN_TOPICS) : pick(k.topics)}.`,
      `• ${pick(k.observations)}`,
      `• Doporučený postup: ${pick(k.activities)}.`,
      '',
      'Akční kroky',
      `• ${pick(k.homework)}`,
      `• ${pick(k.homework)}`,
    ].join('\n');
    addNote(
      d,
      { clientId: b.clientId, kind: 'plaud', title: 'Shrnutí sezení', text, bookingId: b.id, at: b.start, plaud: { recordedAt: b.start, transcriptFileId: null } },
      ctxAt(addMinutes(b.end, between(30, 240)), coach(b.therapistId)),
    );
  }

  /* ---- telefonáty a obecné poznámky ---- */
  const byStage = (ids: Id[]): typeof d.clients => d.clients.filter((c) => ids.includes(c.stageId));
  const early = byStage(['st_potencialni', 'st_freetalk', 'st_diagnostika']).filter((c) => c.createdAt >= addDays(now, -60));
  for (const c of early) {
    if (!chance(0.25)) continue;
    const t = clamp(hours(c.createdAt, between(1, 30)));
    const text = c.stageId === 'st_potencialni' ? pick(CALLS_FIRST) : pick([...CALLS_FIRST.slice(0, 2), ...CALLS_INTAKE]);
    addNote(d, { clientId: c.id, kind: 'call', title: '', text, at: t }, ctxAt(t, coach(lastTherapist.get(c.id) ?? pick(d.therapists).id)));
  }
  const engaged = byStage(['st_aktivni', 'st_vyhodnoceni', 'st_pozastaveno']);
  for (const c of engaged) {
    const isMartin = c.id === martin;
    if (isMartin || chance(0.07)) {
      const t = clamp(stageSinceOf(c, 'st_vyhodnoceni') ?? c.createdAt);
      const goal = isMartin ? 'Zvládnout nervozitu na startu a běžet závody na úrovni tréninkových výkonů.' : pick(CONTENT[themeOfClient(c.id)].goals);
      const res = addNote(d, { clientId: c.id, kind: 'note', title: 'Cíl spolupráce', text: goal, at: t }, ctxAt(t, coach(lastTherapist.get(c.id))));
      if (res.ok) updateNote(d, { noteId: res.value, patch: { pinned: true } }, ctxAt(t, coach(lastTherapist.get(c.id))));
    }
    if (isMartin || chance(0.08)) {
      const t = clamp(addDays(now, -between(1, 40)));
      addNote(d, { clientId: c.id, kind: 'note', title: '', text: isMartin ? PLAIN_NOTES[3] : pick(PLAIN_NOTES), at: t }, ctxAt(t, coach(lastTherapist.get(c.id))));
    }
    if (isMartin) {
      // telefonát, při kterém vznikla karta klienta a domluvil se freetalk
      addNote(d, { clientId: c.id, kind: 'call', title: '', text: 'Volal po doporučení od trenéra – běžec, před závody ho svazuje nervozita. Domluvili jsme freetalk.', at: c.createdAt }, ctxAt(addMinutes(c.createdAt, 10), owner));
    }
  }

  /* ---- follow-upy ---- */
  const candidates = d.clients.filter((c) => c.stageId !== 'st_konec' || chance(0.2));
  const plan: ('overdue' | 'today' | 'upcoming' | 'done')[] = [
    ...Array<'overdue'>(8).fill('overdue'),
    ...Array<'today'>(5).fill('today'),
    ...Array<'upcoming'>(16).fill('upcoming'),
    ...Array<'done'>(16).fill('done'),
  ];
  const used = new Set<Id>();
  const addFu = (clientId: Id, kind: (typeof plan)[number]): void => {
    const c = d.clients.find((x) => x.id === clientId);
    if (!c) return;
    const titles = FOLLOW_UPS[c.stageId] ?? FOLLOW_UPS.st_aktivni;
    const assigneeId = lastTherapist.get(c.id) ?? pick(d.therapists).id;
    let due: LocalDate;
    if (kind === 'overdue') due = addDays(today, -between(1, 9));
    else if (kind === 'today') due = today;
    else if (kind === 'upcoming') due = addDays(today, between(1, 21));
    else due = addDays(today, -between(0, 20));
    const dueTime = chance(0.35) ? pick(['09:00', '10:30', '13:00', '16:00', '17:30']) : null;
    const created = combine(addDays(due < today ? due : today, -between(2, 12)), '08:30');
    const res = addFollowUp(
      d,
      { clientId: c.id, title: pick(titles), due, dueTime, assigneeId, note: chance(0.3) ? 'Domluveno na posledním sezení.' : '' },
      ctxAt(created, coach(assigneeId)),
    );
    if (res.ok && kind === 'done') {
      const doneAt = clamp(combine(due, dueTime ?? '15:00') < created ? addMinutes(created, 30) : combine(due, dueTime ?? '15:00'));
      setFollowUpDone(d, { followUpId: res.value, done: true }, ctxAt(doneAt, coach(assigneeId)));
    }
  };
  addFu(martin, 'today');
  used.add(martin);
  for (const kind of plan) {
    for (let k = 0; k < 20; k++) {
      const c = pick(candidates);
      if (used.has(c.id)) continue;
      used.add(c.id);
      addFu(c.id, kind);
      break;
    }
  }
  const keepFrom = addDays(now, -7);
  const crmAudit = d.audit.filter((a) => a.at >= keepFrom || a.clientId === martin);
  d.audit = [...auditBefore, ...crmAudit].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  clearSelectorCaches();
}

/** Kdy klient vstoupil do dané fáze (poslední vstup). */
function stageSinceOf(c: { stageHistory: { stageId: Id; at: LocalDateTime }[] }, stageId: Id): LocalDateTime | null {
  for (let i = c.stageHistory.length - 1; i >= 0; i--) if (c.stageHistory[i].stageId === stageId) return c.stageHistory[i].at;
  return null;
}
