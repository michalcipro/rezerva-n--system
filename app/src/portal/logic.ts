/**
 * Čisté pomocné funkce klientského portálu (bez Reactu).
 * Vše čte jen z `ClinicState` a enginu – výpočty dostupnosti, plateb a podmínek
 * jsou tak stejné jako u recepce.
 */
import type {
  Booking,
  ClinicState,
  Id,
  LocalDate,
  LocalDateTime,
  Message,
  PackageTemplate,
  PaymentMethod,
  Service,
  Settings,
  Therapist,
  WaitlistEntry,
} from '../domain/types';
import { availableSlots, workingIntervals, type Slot } from '../engine/availability';
import {
  countLabel,
  formatDate,
  formatDateLong,
  formatDateTimeShort,
  formatDayShort,
  formatDuration,
  formatMoney,
  formatPercent,
  formatTime,
  formatTimeRange,
  MONTH_NOMINATIVE,
} from '../engine/format';
import type { IconName } from '../ui';
import { evaluateCancellation, type CancellationEvaluation } from '../engine/policy';
import {
  bookingsOfClient,
  clientCredit,
  eligibleMakeups,
  eligiblePackages,
  excuseStatusFor,
  getBooking,
  getCategory,
  getMakeup,
  getRoom,
  getService,
  getSession,
  getTherapist,
  isNewClient,
  packageUsage,
  therapistName,
  type ExcuseStatus,
} from '../engine/selectors';
import { addDays, addMinutes, dateOf, daysBetween, diffMinutes, minutesOf, timeOf } from '../engine/time';

/* ------------------------------------------------------------------ */
/* Oslovení                                                            */
/* ------------------------------------------------------------------ */

export function greetingFor(now: LocalDateTime): string {
  const h = Number(timeOf(now).slice(0, 2));
  if (h >= 4 && h < 9) return 'Dobré ráno';
  if (h >= 18 || h < 4) return 'Dobrý večer';
  return 'Dobrý den';
}

const VOCATIVE_EXCEPTIONS: Record<string, string> = {
  Pavel: 'Pavle',
  Karel: 'Karle',
  Havel: 'Havle',
  Lev: 'Lve',
  Petr: 'Petře',
  Alexandr: 'Alexandře',
  Jiří: 'Jiří',
};

/** Ženská jména končící souhláskou – v 5. pádě se nemění. */
const FEMALE_CONSONANT = new Set([
  'Nikol', 'Dagmar', 'Ester', 'Karin', 'Miriam', 'Ingrid', 'Carmen', 'Ivet', 'Elen', 'Ellen', 'Rút', 'Edit', 'Judit',
  'Agnes', 'Doris', 'Iris', 'Margit', 'Mercedes', 'Beatrix', 'Ruth',
]);

const SOFTEN: Record<string, string> = { n: 'ň', d: 'ď', t: 'ť' };

/** Oslovení v 5. pádě („Martine“, „Jano“, „Tomáši“). Neznámé tvary vrací beze změny. */
export function vocative(raw: string): string {
  const name = raw.trim();
  if (!name || /\s/.test(name)) return name;
  if (VOCATIVE_EXCEPTIONS[name]) return VOCATIVE_EXCEPTIONS[name];
  if (FEMALE_CONSONANT.has(name)) return name;
  const lower = name.toLocaleLowerCase('cs-CZ');
  const last = lower.slice(-1);
  if (last === 'a') return name.slice(0, -1) + 'o';
  if ('eěiíyýoóuůú'.includes(last)) return name;
  if (lower.endsWith('ěk')) {
    const stem = name.slice(0, -2);
    const c = stem.slice(-1);
    return stem.slice(0, -1) + (SOFTEN[c] ?? c) + 'ku';
  }
  if (/[^aeiouyáéíóúůý]ek$/.test(lower)) return name.slice(0, -2) + 'ku';
  if (lower.endsWith('el')) return name + 'i';
  if (/[^aeiouyáéíóúůýě]r$/.test(lower)) return name.slice(0, -1) + 'ře';
  if (/(ch|k|h|g)$/.test(lower)) return name + 'u';
  if (/[šžčřcjťďňsxz]$/.test(lower)) return name + 'i';
  return name + 'e';
}

/* ------------------------------------------------------------------ */
/* Čas                                                                 */
/* ------------------------------------------------------------------ */

/** „dnes“, „zítra“, nebo prázdný řetězec. */
export function relativeDay(date: LocalDate | LocalDateTime, now: LocalDateTime): string {
  const d = daysBetween(dateOf(now), dateOf(date));
  if (d === 0) return 'dnes';
  if (d === 1) return 'zítra';
  return '';
}

/** „dnes v 9:00“, „zítra v 7:30“, „St 14. 10. v 9:00“. */
export function whenLabel(start: LocalDateTime, now: LocalDateTime): string {
  const rel = relativeDay(start, now);
  return (rel || formatDayShort(start)) + ' v ' + formatTime(start);
}

/** Za jak dlouho termín začíná – „za 3 dny“, „zítra“, „za 2 h 15 min“. */
export function startsIn(start: LocalDateTime, now: LocalDateTime): string {
  const days = daysBetween(dateOf(now), dateOf(start));
  if (days >= 2) return 'za ' + countLabel(days, ['den', 'dny', 'dní']);
  if (days === 1) return 'zítra';
  const mins = diffMinutes(start, now);
  if (mins <= 0) return 'teď';
  if (mins < 60) return `za ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `za ${h} h` + (m ? ` ${m} min` : '');
}

/** Název měsíce (či rozsahu) pro pás dní: „Říjen 2026“, „Říjen – listopad 2026“. */
export function monthRangeLabel(dates: LocalDate[]): string {
  if (!dates.length) return '';
  const first = dates[0];
  const last = dates[dates.length - 1];
  const m1 = Number(first.slice(5, 7)) - 1;
  const m2 = Number(last.slice(5, 7)) - 1;
  const y1 = first.slice(0, 4);
  const y2 = last.slice(0, 4);
  const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
  if (m1 === m2 && y1 === y2) return `${cap(MONTH_NOMINATIVE[m1])} ${y1}`;
  if (y1 === y2) return `${cap(MONTH_NOMINATIVE[m1])} – ${MONTH_NOMINATIVE[m2]} ${y1}`;
  return `${cap(MONTH_NOMINATIVE[m1])} ${y1} – ${MONTH_NOMINATIVE[m2]} ${y2}`;
}

/* ------------------------------------------------------------------ */
/* Služby a terapeuti                                                  */
/* ------------------------------------------------------------------ */

export function activeTherapistsFor(s: ClinicState, service: Service): Therapist[] {
  return service.therapistIds
    .map((id) => getTherapist(s, id))
    .filter((t): t is Therapist => !!t && t.active)
    .sort((a, b) => a.order - b.order);
}

/** Služby, které si klient může sám rezervovat (Freetalk jen noví klienti). */
export function bookableServices(s: ClinicState, clientId: Id): Service[] {
  const fresh = isNewClient(s, clientId);
  const catOrder = (svc: Service): number => getCategory(s, svc.categoryId)?.order ?? 99;
  return s.services
    .filter((svc) => svc.active && svc.onlineBookable && (!svc.newClientsOnly || fresh))
    .filter((svc) => activeTherapistsFor(s, svc).length > 0)
    .sort((a, b) => catOrder(a) - catOrder(b) || a.order - b.order);
}

/** Název termínu – u skupinové lekce název lekce. */
export function bookingTitle(s: ClinicState, b: Pick<Booking, 'serviceId' | 'sessionId'>): string {
  if (b.sessionId) {
    const ses = getSession(s, b.sessionId);
    if (ses) return ses.title;
  }
  return getService(s, b.serviceId)?.name ?? 'Termín';
}

export function placeLabel(s: ClinicState, b: Pick<Booking, 'serviceId' | 'roomId'>): string {
  const svc = getService(s, b.serviceId);
  if (svc?.remote) return 'Online videohovor';
  return getRoom(s, b.roomId)?.name ?? '';
}

/* ------------------------------------------------------------------ */
/* Dostupnost dní a časů                                               */
/* ------------------------------------------------------------------ */

export type DayStatus = 'free' | 'full' | 'closed' | 'none' | 'off';

export interface DayInfo {
  date: LocalDate;
  status: DayStatus;
  /** Počet volných časů / lekcí s volným místem. */
  count: number;
  /** Proč je den mimo nabídku. */
  offReason?: 'horizon' | 'deadline' | 'past';
}

export interface DayQuery {
  serviceId: Id;
  therapistId: Id | 'any';
  now: LocalDateTime;
  clientId: Id;
  ignoreBookingId?: Id;
  /** Poslední den, který lze vybrat (lhůta náhrady). */
  lastDate?: LocalDate | null;
}

export function slotsFor(s: ClinicState, q: DayQuery, date: LocalDate): Slot[] {
  return availableSlots(s, {
    serviceId: q.serviceId,
    therapistId: q.therapistId,
    date,
    now: q.now,
    mode: 'client',
    clientId: q.clientId,
    ignoreBookingId: q.ignoreBookingId,
  });
}

export function dayInfo(s: ClinicState, q: DayQuery, date: LocalDate): DayInfo {
  const service = getService(s, q.serviceId);
  const today = dateOf(q.now);
  if (!service || date < today) return { date, status: 'off', count: 0, offReason: 'past' };
  if (daysBetween(today, date) > s.settings.bookingRules.horizonDays) return { date, status: 'off', count: 0, offReason: 'horizon' };
  if (q.lastDate && date > q.lastDate) return { date, status: 'off', count: 0, offReason: 'deadline' };
  const slots = slotsFor(s, q, date);
  if (service.kind === 'group') {
    const open = slots.filter((sl) => (sl.freeSpots ?? 0) > 0).length;
    if (open) return { date, status: 'free', count: open };
    return { date, status: slots.length ? 'full' : 'none', count: 0 };
  }
  if (slots.length) return { date, status: 'free', count: slots.length };
  const ids = q.therapistId === 'any' ? service.therapistIds : [q.therapistId];
  const works = ids.some((id) => workingIntervals(s, id, date).length > 0);
  return { date, status: works ? 'full' : 'closed', count: 0 };
}

/** Nejbližší den s volným časem (respektuje lhůtu náhrady). */
export function nearestFreeDate(s: ClinicState, q: DayQuery, from: LocalDate): LocalDate | null {
  const today = dateOf(q.now);
  const horizon = s.settings.bookingRules.horizonDays;
  let date = from < today ? today : from;
  for (let i = 0; i <= horizon + 1; i++) {
    if (daysBetween(today, date) > horizon) return null;
    if (q.lastDate && date > q.lastDate) return null;
    if (dayInfo(s, q, date).status === 'free') return date;
    date = addDays(date, 1);
  }
  return null;
}

export type DayPart = 'morning' | 'afternoon' | 'evening';

export const DAY_PARTS: { part: DayPart; label: string }[] = [
  { part: 'morning', label: 'Dopoledne' },
  { part: 'afternoon', label: 'Odpoledne' },
  { part: 'evening', label: 'Večer' },
];

export function dayPartOf(start: LocalDateTime): DayPart {
  const m = minutesOf(start);
  if (m < 12 * 60) return 'morning';
  if (m < 17 * 60) return 'afternoon';
  return 'evening';
}

export function groupByDayPart(slots: Slot[]): { part: DayPart; label: string; slots: Slot[] }[] {
  return DAY_PARTS.map((p) => ({ ...p, slots: slots.filter((sl) => dayPartOf(sl.start) === p.part) })).filter((g) => g.slots.length > 0);
}

/* ------------------------------------------------------------------ */
/* Platba                                                              */
/* ------------------------------------------------------------------ */

export interface PaymentChoice {
  method: PaymentMethod;
  packageId?: Id;
  makeupId?: Id;
}

export interface PayOption {
  key: string;
  payment: PaymentChoice;
  title: string;
  description: string;
  /** Pravý sloupec karty: cena nebo „1 vstup“. */
  aside: string;
  disabled: boolean;
  /** Kolik klient zaplatí teď (online / z kreditu) nebo na místě. */
  amount: number;
  /** Krátký popis do souhrnu („z permanentky Koučink 10× · zbývá 5 vstupů“). */
  summary: string;
  /** Řádek k úhradě v posledním kroku („Zaplatíte na místě 1 190 Kč“). */
  total: string;
  icon: IconName;
}

export function paymentOptions(
  s: ClinicState,
  q: { clientId: Id; serviceId: Id; start: LocalDateTime; now: LocalDateTime },
): PayOption[] {
  const service = getService(s, q.serviceId);
  if (!service) return [];
  const price = service.priceCzk;
  // služba zdarma (Freetalk): nic neplatí a nepoužije se ani permanentka, kredit nebo náhrada
  if (price <= 0) {
    return [
      {
        key: 'free',
        payment: { method: 'free' },
        title: 'Zdarma',
        description: 'Tato schůzka se neplatí.',
        aside: 'zdarma',
        disabled: false,
        amount: 0,
        summary: 'zdarma',
        total: 'Schůzka je zdarma',
        icon: 'gift',
      },
    ];
  }
  const today = dateOf(q.now);
  const out: PayOption[] = [];

  for (const m of eligibleMakeups(s, q.clientId, q.serviceId, q.start, q.now)) {
    const src = getBooking(s, m.sourceBookingId);
    const extra = m.value > 0 && m.value < price ? price - m.value : 0;
    out.push({
      key: 'makeup:' + m.id,
      payment: { method: 'makeup', makeupId: m.id },
      title: 'Náhrada za omluvený termín',
      description:
        (src ? `Za ${bookingTitle(s, src)} ${formatDayShort(src.start)}` : 'Za omluvený termín') +
        ` · využijte do ${formatDayShort(m.validUntil)}` +
        (extra ? ` · doplatek ${formatMoney(extra)} na místě` : ''),
      aside: extra ? `+${formatMoney(extra)}` : 'zahrnuto',
      disabled: false,
      amount: extra,
      summary: 'náhrada za omluvený termín',
      total: extra ? `Doplatek na místě ${formatMoney(extra)}` : 'Hrazeno náhradou za omluvený termín',
      icon: 'repeat',
    });
  }

  for (const p of eligiblePackages(s, q.clientId, q.serviceId, dateOf(q.start), today)) {
    const u = packageUsage(s, p, today);
    out.push({
      key: 'package:' + p.id,
      payment: { method: 'package', packageId: p.id },
      title: `Permanentka ${p.name}`,
      description: `Zbývá ${u.free} ${zPrep(u.total)} ${countLabel(u.total, ['vstupu', 'vstupů', 'vstupů'])} · platí do ${formatDate(u.validUntil)}`,
      aside: '1 vstup',
      disabled: false,
      amount: 0,
      summary: `z permanentky ${p.name} · zbývá ${countLabel(u.free, ['vstup', 'vstupy', 'vstupů'])}`,
      total: `Permanentka ${p.name} · ${entriesLeftAfter(u.free - 1)}`,
      icon: 'ticket',
    });
  }

  const balance = clientCredit(s, q.clientId);
  if (balance > 0) {
    const enough = balance >= price;
    out.push({
      key: 'credit',
      payment: { method: 'credit' },
      title: 'Z kreditu',
      description: enough
        ? `Zůstatek ${formatMoney(balance)}, po platbě ${formatMoney(balance - price)}`
        : `Zůstatek ${formatMoney(balance)} – chybí ${formatMoney(price - balance)}. Kredit dobijete v Účtu.`,
      aside: formatMoney(price),
      disabled: !enough,
      amount: price,
      summary: `z kreditu (${formatMoney(price)})`,
      total: `Z kreditu ${formatMoney(price)} · zůstatek potom ${formatMoney(Math.max(0, balance - price))}`,
      icon: 'wallet',
    });
  }

  out.push({
    key: 'online',
    payment: { method: 'online' },
    title: 'Kartou online',
    description: 'Zaplatíte hned při potvrzení · v ukázce jen simulace platby',
    aside: formatMoney(price),
    disabled: false,
    amount: price,
    summary: `kartou online (${formatMoney(price)})`,
    total: `K úhradě kartou ${formatMoney(price)}`,
    icon: 'card',
  });
  out.push({
    key: 'onsite',
    payment: { method: 'onsite' },
    title: 'Na místě',
    description: 'Kartou nebo hotově na recepci po návštěvě',
    aside: formatMoney(price),
    disabled: false,
    amount: price,
    summary: `na místě (${formatMoney(price)})`,
    total: `Zaplatíte na místě ${formatMoney(price)}`,
    icon: 'cash',
  });
  return out;
}

/** „zůstanou 3 vstupy“, „zůstane 5 vstupů“, „poslední vstup“. */
export function entriesLeftAfter(n: number): string {
  if (n <= 0) return 'využijete poslední vstup';
  if (n === 1) return 'zůstane 1 vstup';
  if (n <= 4) return `zůstanou ${n} vstupy`;
  return `zůstane ${n} vstupů`;
}

/** Výchozí volba platby: zvolená náhrada → náhrada → permanentka → na místě. */
export function defaultPaymentKey(options: PayOption[], preferredMakeupId?: Id): string | null {
  if (preferredMakeupId) {
    const hit = options.find((o) => o.payment.makeupId === preferredMakeupId);
    if (hit) return hit.key;
  }
  const prepaid = options.find((o) => !o.disabled && (o.payment.method === 'makeup' || o.payment.method === 'package'));
  if (prepaid) return prepaid.key;
  return options.find((o) => o.key === 'onsite')?.key ?? options.find((o) => !o.disabled)?.key ?? null;
}

/* ------------------------------------------------------------------ */
/* Podmínky zrušení srozumitelně                                       */
/* ------------------------------------------------------------------ */

/** Rezervace „nanečisto“ – pro výpočet podmínek před potvrzením. */
export function draftBooking(
  s: ClinicState,
  q: {
    clientId: Id;
    serviceId: Id;
    therapistId: Id;
    start: LocalDateTime;
    end?: LocalDateTime;
    sessionId?: Id;
    payment: PaymentChoice;
    now: LocalDateTime;
  },
): Booking {
  const svc = getService(s, q.serviceId);
  const price = svc?.priceCzk ?? 0;
  const method = q.payment.method;
  const makeup = q.payment.makeupId ? getMakeup(s, q.payment.makeupId) : undefined;
  const paidAmount = method === 'credit' || method === 'online' ? price : method === 'makeup' ? makeup?.value ?? 0 : 0;
  return {
    id: '__draft__',
    clientId: q.clientId,
    serviceId: q.serviceId,
    therapistId: q.therapistId,
    roomId: getTherapist(s, q.therapistId)?.roomId ?? '',
    start: q.start,
    end: q.end ?? addMinutes(q.start, svc?.durationMin ?? 60),
    sessionId: q.sessionId,
    status: 'confirmed',
    createdAt: q.now,
    createdBy: 'client',
    channel: 'online',
    price,
    payment: {
      method,
      packageId: q.payment.packageId ?? makeup?.packageId,
      makeupId: q.payment.makeupId,
      paid: method !== 'onsite',
      paidAmount,
    },
    note: '',
  };
}

export interface TermsInfo {
  ev: CancellationEvaluation;
  /** Jedna věta do lišty („Zdarma zrušíte do St 14. 10. 9:00“). */
  short: string;
  /** Srozumitelné body podmínek pro tento termín. */
  lines: string[];
}

function tiersSentence(s: ClinicState): string {
  const p = s.settings.policy;
  const tiers = [...p.lateTiers]
    .filter((t) => t.hoursBefore <= p.freeCancelHours)
    .sort((a, b) => b.hoursBefore - a.hoursBefore);
  if (!tiers.length) return 'Při pozdějším zrušení se účtuje 100 % ceny.';
  const parts = tiers.map((t, i) =>
    i === 0 && t.hoursBefore >= p.freeCancelHours ? formatPercent(t.feePct) : `méně než ${t.hoursBefore} h předem ${formatPercent(t.feePct)}`,
  );
  if (tiers[0].hoursBefore < p.freeCancelHours) parts.unshift(formatPercent(tiers[0].feePct));
  return 'Potom storno ' + parts.join(', ') + ' ceny.';
}

/** Předložka „z“ / „ze“ před číslovkou (ze 2, ze 3, ze 4, ze 6, ze 7, ze 100…). */
export function zPrep(n: number): string {
  return [2, 3, 4, 6, 7].includes(n) || (n >= 100 && n < 200) ? 'ze' : 'z';
}

/** „zbývá 1 ze 2 omluvenek“, „zbývá 0 z 1 omluvenky“. */
export function excusesLeftText(remaining: number, total: number): string {
  return `zbývá ${remaining} ${zPrep(total)} ${total} ${total === 1 ? 'omluvenky' : 'omluvenek'}`;
}

export function excuseSentence(s: ClinicState, ex: ExcuseStatus): string {
  const p = s.settings.policy.excuses;
  const left = `zbývá ${ex.remaining} ${zPrep(ex.total)} ${ex.total}`;
  return ex.scope === 'package'
    ? `omluvenky k permanentce ${ex.packageName ?? ''}: ${left}`.replace('  ', ' ')
    : `omluvenky: ${left} za ${countLabel(p.perClientMonths, ['měsíc', 'měsíce', 'měsíců'])}`;
}

export function termsInfo(s: ClinicState, b: Booking, now: LocalDateTime): TermsInfo {
  const ev = evaluateCancellation(s, b, now, 'client');
  const p = s.settings.policy;
  const hours = ev.isGroup ? p.groupCancelHours : p.freeCancelHours;
  const lines: string[] = [];
  const short =
    ev.phase === 'free'
      ? `Zdarma zrušíte do ${formatDateTimeShort(ev.freeUntil)}`
      : ev.isGroup
        ? `Méně než ${hours} h předem – při odhlášení vstup propadá`
        : `Méně než ${hours} h předem – platí storno podmínky`;

  lines.push(
    ev.phase === 'free'
      ? `Zdarma zrušíte nebo přesunete do ${formatDateTimeShort(ev.freeUntil)}.`
      : `Do začátku zbývá méně než ${hours} h, bezplatné zrušení už neplatí.`,
  );
  if (ev.isGroup) lines.push('Při pozdějším odhlášení vstup propadá.');
  else if (b.payment.method === 'package' && p.packageLateHandling === 'forfeit_entry') lines.push('Při pozdějším zrušení propadá vstup z permanentky.');
  else if (b.payment.method === 'makeup') lines.push('Při pozdějším zrušení náhradní termín propadá.');
  else lines.push(tiersSentence(s));

  if (b.payment.method === 'makeup') {
    lines.push('Náhradní termín už nelze znovu omluvit.');
  } else if (p.excuses.enabled) {
    const ex = excuseStatusFor(s, b, now);
    const deadline = p.excuses.deadlineHoursBefore > 0 ? `nejpozději ${p.excuses.deadlineHoursBefore} h před začátkem` : 'až do začátku';
    lines.push(`Při nemoci termín omluvíte bez poplatku ${deadline} – ${excuseSentence(s, ex)}.`);
  }
  lines.push(
    b.payment.method === 'package' || b.payment.method === 'makeup'
      ? 'Když nepřijdete bez omluvy, vstup propadá.'
      : `Když nepřijdete bez omluvy, účtuje se ${formatPercent(p.noShowFeePct)} ceny.`,
  );
  return { ev, short, lines };
}

export type ChipTone = 'success' | 'warning' | 'danger' | 'neutral';

/** Stav storna pro seznamy: „Zdarma zrušíte do …“ / „Storno teď 50 % · lze omluvit“. */
export function cancelState(s: ClinicState, b: Booking, now: LocalDateTime): { label: string; tone: ChipTone; ev: CancellationEvaluation } {
  const ev = evaluateCancellation(s, b, now, 'client');
  if (ev.phase === 'free') return { label: `Zdarma zrušíte do ${formatDateTimeShort(ev.freeUntil)}`, tone: 'success', ev };
  if (ev.phase === 'late') {
    const forfeit = ev.isGroup || (b.payment.method === 'package' && s.settings.policy.packageLateHandling === 'forfeit_entry');
    const fee = `Storno teď ${formatPercent(ev.feePct)}`;
    if (ev.excuse.allowed) return { label: (forfeit ? 'Po lhůtě' : fee) + ' · lze omluvit', tone: 'warning', ev };
    if (ev.grace) return { label: (forfeit ? 'Po lhůtě' : fee) + ' · první pozdní storno zdarma', tone: 'warning', ev };
    const base = b.payment.method === 'makeup' ? 'Po lhůtě · náhrada propadne' : forfeit ? 'Po lhůtě · vstup propadne' : fee;
    return { label: base, tone: 'danger', ev };
  }
  if (ev.phase === 'started') return { label: 'Právě probíhá', tone: 'neutral', ev };
  return { label: '', tone: 'neutral', ev };
}

/* ------------------------------------------------------------------ */
/* Podmínky kliniky (text z nastavení)                                  */
/* ------------------------------------------------------------------ */

export interface PolicyItem {
  icon: IconName;
  title: string;
  text: string;
}

export function clinicPolicy(settings: Settings): PolicyItem[] {
  const p = settings.policy;
  const r = settings.bookingRules;
  const items: PolicyItem[] = [];
  items.push({
    icon: 'calendarX',
    title: 'Zrušení a přesun zdarma',
    text: `Termín zrušíte nebo přesunete bez poplatku nejpozději ${p.freeCancelHours} h před začátkem – v aplikaci v Moje termíny.`,
  });
  const tiers = [...p.lateTiers].filter((t) => t.hoursBefore <= p.freeCancelHours).sort((a, b) => b.hoursBefore - a.hoursBefore);
  const tierText = tiers.length
    ? tiers.map((t) => `méně než ${t.hoursBefore} h předem ${formatPercent(t.feePct)} ceny`).join(', ')
    : 'po lhůtě 100 % ceny';
  items.push({
    icon: 'percent',
    title: 'Pozdní zrušení',
    text:
      tierText.charAt(0).toUpperCase() +
      tierText.slice(1) +
      '. ' +
      (p.packageLateHandling === 'forfeit_entry'
        ? 'U permanentky při pozdním zrušení propadá vstup.'
        : 'U permanentky se vstup vrací a účtuje se storno poplatek.'),
  });
  items.push({
    icon: 'userX',
    title: 'Nedostavení',
    text:
      `Když nepřijdete bez omluvy, účtuje se ${formatPercent(p.noShowFeePct)} ceny (u permanentky propadá vstup).` +
      (p.blockAfterNoShows > 0 ? ` Po ${p.blockAfterNoShows} nedostaveních během 90 dní se online rezervace pozastaví.` : ''),
  });
  if (p.excuses.enabled) {
    items.push({
      icon: 'heart',
      title: 'Omluvenky při nemoci',
      text:
        `Po lhůtě můžete termín omluvit bez poplatku ${p.excuses.deadlineHoursBefore > 0 ? `nejpozději ${p.excuses.deadlineHoursBefore} h před začátkem` : 'až do začátku'}. ` +
        `K permanentce máte obvykle ${countLabel(p.excuses.perPackage, ['omluvenku', 'omluvenky', 'omluvenek'])}, bez permanentky ${countLabel(p.excuses.perClientCount, ['omluvenku', 'omluvenky', 'omluvenek'])} za ${countLabel(p.excuses.perClientMonths, ['měsíc', 'měsíce', 'měsíců'])}. ` +
        `Za předplacený termín si pak vyberete náhradní do ${countLabel(p.excuses.makeupDays, ['dne', 'dnů', 'dnů'])}.`,
    });
  }
  if (p.graceFirstLateCancel) {
    items.push({ icon: 'gift', title: 'První pozdní zrušení', text: 'První pozdní zrušení za 12 měsíců je bez poplatku.' });
  }
  items.push({
    icon: 'users',
    title: 'Skupinové lekce',
    text: `Z lekce se odhlásíte zdarma nejpozději ${p.groupCancelHours} h předem, potom vstup propadá.`,
  });
  items.push({
    icon: 'clock',
    title: 'Online rezervace',
    text: `Rezervovat můžete nejpozději ${formatDuration(r.minNoticeMin)} předem a nejvýše ${r.horizonDays} dní dopředu, najednou až ${countLabel(r.maxUpcomingPerClient, ['termín', 'termíny', 'termínů'])}.`,
  });
  if (settings.waitlist.enabled) {
    items.push({
      icon: 'hourglass',
      title: 'Čekací listina',
      text: `Když se uvolní hlídaný termín, pošleme vám nabídku. Platí ${formatDuration(settings.waitlist.offerMinutes)} a termín získá ten, kdo potvrdí první.`,
    });
  }
  const bonus = [...settings.creditBonus].filter((b) => b.pct > 0).sort((a, b) => a.minTopup - b.minTopup);
  if (bonus.length) {
    items.push({
      icon: 'coins',
      title: 'Bonus za dobití kreditu',
      text: 'Při dobití ' + bonus.map((b) => `od ${formatMoney(b.minTopup)} získáte bonus ${formatPercent(b.pct)}`).join(', ') + '.',
    });
  }
  return items;
}

/* ------------------------------------------------------------------ */
/* Klient: čekací listina, zprávy, omluvenky                           */
/* ------------------------------------------------------------------ */

export function clientOffers(s: ClinicState, clientId: Id, now: LocalDateTime): WaitlistEntry[] {
  return s.waitlist
    .filter((w) => w.clientId === clientId && w.status === 'offered' && !!w.offer && w.offer.expiresAt > now && w.offer.start > now)
    .sort((a, b) => ((a.offer?.expiresAt ?? '') < (b.offer?.expiresAt ?? '') ? -1 : 1));
}

export function clientWaiting(s: ClinicState, clientId: Id, now: LocalDateTime): WaitlistEntry[] {
  const today = dateOf(now);
  return s.waitlist
    .filter((w) => w.clientId === clientId && w.status === 'waiting' && w.dateTo >= today)
    .sort((a, b) => (a.dateFrom < b.dateFrom ? -1 : 1));
}

/** Aktivní hlídání pro danou službu a den (nebo lekci). */
export function watchFor(s: ClinicState, clientId: Id, serviceId: Id, date: LocalDate, sessionId?: Id): WaitlistEntry | undefined {
  return s.waitlist.find(
    (w) =>
      w.clientId === clientId &&
      (w.status === 'waiting' || w.status === 'offered') &&
      w.serviceId === serviceId &&
      (sessionId ? w.sessionId === sessionId : !w.sessionId && w.dateFrom <= date && date <= w.dateTo),
  );
}

export function waitlistLabel(s: ClinicState, w: WaitlistEntry): string {
  if (w.sessionId) {
    const ses = getSession(s, w.sessionId);
    if (ses) return `${ses.title} · ${formatDayShort(ses.start)} ${formatTime(ses.start)}`;
  }
  const svc = getService(s, w.serviceId)?.name ?? 'Termín';
  const range = w.dateFrom === w.dateTo ? formatDayShort(w.dateFrom) : `${formatDayShort(w.dateFrom)} – ${formatDayShort(w.dateTo)}`;
  const who = w.therapistId ? ` · ${therapistName(getTherapist(s, w.therapistId))}` : '';
  return `${svc} · ${range}${who}`;
}

export function clientMessages(s: ClinicState, clientId: Id): Message[] {
  return s.messages.filter((m) => m.clientId === clientId && m.status === 'sent').sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

/** Omluvenky klienta bez permanentky (počet za sledované období). */
export function clientExcuses(s: ClinicState, clientId: Id, now: LocalDateTime): ExcuseStatus {
  const probe: Booking = {
    id: '__probe__',
    clientId,
    serviceId: '',
    therapistId: '',
    roomId: '',
    start: now,
    end: now,
    status: 'confirmed',
    createdAt: now,
    createdBy: 'client',
    channel: 'online',
    price: 0,
    payment: { method: 'onsite', paid: false, paidAmount: 0 },
    note: '',
  };
  return excuseStatusFor(s, probe, now);
}

export function upcomingCount(s: ClinicState, clientId: Id, now: LocalDateTime, ignoreBookingId?: Id): number {
  return bookingsOfClient(s, clientId).filter((b) => b.status === 'confirmed' && b.end > now && b.id !== ignoreBookingId).length;
}

/* ------------------------------------------------------------------ */
/* Ostatní                                                              */
/* ------------------------------------------------------------------ */

/** Text události pro ruční přidání do kalendáře. */
export function calendarText(s: ClinicState, b: Booking): string {
  const t = getTherapist(s, b.therapistId);
  const lines = [
    `${bookingTitle(s, b)} – ${s.settings.clinicName}`,
    `${formatDateLong(b.start, { capital: true })}, ${formatTimeRange(b.start, b.end)}`,
    [therapistName(t), placeLabel(s, b)].filter(Boolean).join(' · '),
  ];
  return lines.join('\n');
}

/** Úspora permanentky proti jednotlivým vstupům. */
export function packageSavings(s: ClinicState, tpl: PackageTemplate): number {
  const prices = tpl.serviceIds.map((id) => getService(s, id)?.priceCzk ?? 0).filter((p) => p > 0);
  if (!prices.length) return 0;
  return Math.max(0, Math.min(...prices) * tpl.entries - tpl.priceCzk);
}

export function packageServicesLabel(s: ClinicState, serviceIds: Id[]): string {
  return serviceIds
    .map((id) => getService(s, id)?.name)
    .filter(Boolean)
    .join(', ');
}

export const MONEY_LABEL: Record<string, string> = {
  cash: 'hotově',
  card: 'kartou',
  online: 'kartou online',
  transfer: 'převodem',
  credit: 'z kreditu',
};
