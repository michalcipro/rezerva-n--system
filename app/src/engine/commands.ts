import type {
  Booking,
  BookingPayment,
  Campaign,
  Category,
  Channel,
  Client,
  ClientConsents,
  ClinicState,
  Command,
  CommandResult,
  Ctx,
  GroupTemplate,
  Id,
  LedgerEntry,
  LocalDate,
  LocalDateTime,
  MakeupRight,
  MessageTemplate,
  MoneyMethod,
  PackageTemplate,
  PaymentMethod,
  PaymentRecord,
  Service,
  Settings,
  TemplateKey,
  Therapist,
  TimeOff,
  WaitlistEntry,
} from '../domain/types';
import { checkBookingSlot } from './availability';
import { formatDayShort, formatMoney, formatPercent, formatTime, countLabel } from './format';
import { newId } from './ids';
import { addManualMessage, bookingVars, queueTemplateMessage } from './messages';
import { evaluateCancellation, isGroupBooking, type CancelOptionKind } from './policy';
import { evaluateSegment, campaignPlainText } from './segments';
import {
  bookingsOfClient,
  clientCredit,
  eligibleMakeups,
  eligiblePackages,
  getBooking,
  getClient,
  getMakeup,
  getPackage,
  getPackageTemplate,
  getService,
  getSession,
  getTherapist,
  packageUsage,
  therapistName,
} from './selectors';
import { addDays, addHours, addMinutes, dateOf, diffMinutes, isValidLocalDateTime, minStr } from './time';

/* ------------------------------------------------------------------ */
/* Pomocné funkce                                                      */
/* ------------------------------------------------------------------ */

export const ok = <R>(value: R, notices: string[] = []): CommandResult<R> => ({ ok: true, value, notices });
export const fail = (error: string): CommandResult<never> => ({ ok: false, error });

const isStaff = (ctx: Ctx): boolean => ctx.actor.role !== 'client';

function audit(d: ClinicState, ctx: Ctx, action: string, detail: string, refs: { bookingId?: Id; clientId?: Id } = {}): void {
  d.audit.push({ id: newId('a'), at: ctx.now, actor: ctx.actor.name, action, detail, ...refs });
  if (d.audit.length > 2500) d.audit.splice(0, d.audit.length - 2500);
}

function addLedger(d: ClinicState, ctx: Ctx, e: Omit<LedgerEntry, 'id' | 'at'> & { at?: LocalDateTime }): LedgerEntry {
  const entry: LedgerEntry = { id: newId('l'), at: e.at ?? ctx.now, ...e };
  d.ledger.push(entry);
  return entry;
}

function addPayment(d: ClinicState, ctx: Ctx, p: Omit<PaymentRecord, 'id' | 'at'> & { at?: LocalDateTime }): PaymentRecord {
  const rec: PaymentRecord = { id: newId('p'), at: p.at ?? ctx.now, ...p };
  d.payments.push(rec);
  return rec;
}

function findBooking(d: ClinicState, id: Id): Booking | undefined {
  return d.bookings.find((b) => b.id === id);
}

function ensureOwnBooking(ctx: Ctx, b: Booking): string | null {
  if (ctx.actor.role === 'client' && ctx.actor.clientId !== b.clientId) return 'Tuto rezervaci nemůžete upravit.';
  return null;
}

const MONEY_LABEL: Record<MoneyMethod | 'credit', string> = {
  cash: 'hotově',
  card: 'kartou',
  online: 'online',
  transfer: 'převodem',
  credit: 'z kreditu',
};

/* ------------------------------------------------------------------ */
/* Klienti                                                             */
/* ------------------------------------------------------------------ */

export interface CreateClientInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  birthDate?: LocalDate | null;
  tags?: string[];
  source?: Client['source'];
  consents: { gdpr: boolean; health: boolean; marketingEmail: boolean; sms: boolean };
  internalNote?: string;
  demo?: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const createClient: Command<CreateClientInput, Id> = (d, input, ctx) => {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName || !lastName) return fail('Vyplňte jméno i příjmení.');
  const email = input.email.trim().toLowerCase();
  if (email && !EMAIL_RE.test(email)) return fail('E-mail nemá platný tvar.');
  if (!email && !input.phone.trim()) return fail('Vyplňte e-mail nebo telefon.');
  if (!input.consents.gdpr) return fail('Bez souhlasu se zpracováním osobních údajů nelze klienta založit.');
  const notices: string[] = [];
  if (email && d.clients.some((c) => c.email === email)) notices.push('Klient se stejným e-mailem už existuje.');
  const source = input.source ?? (ctx.actor.role === 'client' ? 'online' : 'recepce');
  const rec = (v: boolean) => (v ? { at: ctx.now, source: source === 'online' ? 'online formulář' : 'recepce' } : null);
  const client: Client = {
    id: newId('c'),
    firstName,
    lastName,
    email,
    phone: input.phone.trim(),
    birthDate: input.birthDate ?? null,
    tags: input.tags ?? [],
    createdAt: ctx.now,
    source,
    consents: {
      gdpr: rec(input.consents.gdpr),
      health: rec(input.consents.health),
      marketingEmail: rec(input.consents.marketingEmail),
      sms: rec(input.consents.sms),
    },
    notes: [],
    internalNote: input.internalNote ?? '',
    blocked: false,
    demo: input.demo,
  };
  d.clients.push(client);
  audit(d, ctx, 'Nový klient', `${firstName} ${lastName}`, { clientId: client.id });
  return ok(client.id, notices);
};

export interface UpdateClientInput {
  clientId: Id;
  patch: Partial<Pick<Client, 'firstName' | 'lastName' | 'email' | 'phone' | 'birthDate' | 'tags' | 'internalNote' | 'blocked'>>;
}

export const updateClient: Command<UpdateClientInput> = (d, input, ctx) => {
  const c = d.clients.find((x) => x.id === input.clientId);
  if (!c) return fail('Klient neexistuje.');
  if (ctx.actor.role === 'client' && ctx.actor.clientId !== c.id) return fail('Nemáte oprávnění.');
  if (ctx.actor.role === 'client' && input.patch.blocked !== undefined) return fail('Nemáte oprávnění.');
  const p = input.patch;
  if (p.email !== undefined) {
    const email = p.email.trim().toLowerCase();
    if (email && !EMAIL_RE.test(email)) return fail('E-mail nemá platný tvar.');
    c.email = email;
  }
  if (p.firstName !== undefined) {
    if (!p.firstName.trim()) return fail('Jméno nesmí být prázdné.');
    c.firstName = p.firstName.trim();
  }
  if (p.lastName !== undefined) {
    if (!p.lastName.trim()) return fail('Příjmení nesmí být prázdné.');
    c.lastName = p.lastName.trim();
  }
  if (p.phone !== undefined) c.phone = p.phone.trim();
  if (p.birthDate !== undefined) c.birthDate = p.birthDate;
  if (p.tags !== undefined) c.tags = p.tags.map((t) => t.trim()).filter(Boolean);
  if (p.internalNote !== undefined) c.internalNote = p.internalNote;
  if (p.blocked !== undefined) c.blocked = p.blocked;
  audit(d, ctx, 'Úprava klienta', `${c.firstName} ${c.lastName}`, { clientId: c.id });
  return ok(undefined);
};

export const setConsent: Command<{ clientId: Id; key: keyof ClientConsents; value: boolean }> = (d, input, ctx) => {
  const c = d.clients.find((x) => x.id === input.clientId);
  if (!c) return fail('Klient neexistuje.');
  if (ctx.actor.role === 'client' && ctx.actor.clientId !== c.id) return fail('Nemáte oprávnění.');
  if (input.key === 'gdpr' && !input.value) return fail('Souhlas se zpracováním údajů nutných pro rezervace nelze odebrat. Pro výmaz účtu kontaktujte kliniku.');
  c.consents[input.key] = input.value
    ? { at: ctx.now, source: ctx.actor.role === 'client' ? 'klientský účet' : 'recepce' }
    : null;
  const labels: Record<keyof ClientConsents, string> = {
    gdpr: 'zpracování osobních údajů',
    health: 'zdravotní dokumentace',
    marketingEmail: 'obchodní sdělení e-mailem',
    sms: 'SMS zprávy',
  };
  audit(d, ctx, input.value ? 'Souhlas udělen' : 'Souhlas odvolán', `${labels[input.key]} – ${c.firstName} ${c.lastName}`, { clientId: c.id });
  return ok(undefined);
};

export const addClinicalNote: Command<{ clientId: Id; text: string }, Id> = (d, input, ctx) => {
  if (!isStaff(ctx)) return fail('Poznámky může psát jen personál.');
  const c = d.clients.find((x) => x.id === input.clientId);
  if (!c) return fail('Klient neexistuje.');
  const text = input.text.trim();
  if (!text) return fail('Poznámka je prázdná.');
  const therapistId = ctx.actor.therapistId ?? d.therapists[0]?.id ?? '';
  const id = newId('n');
  c.notes.unshift({ id, at: ctx.now, therapistId, text });
  audit(d, ctx, 'Klinická poznámka', `${c.firstName} ${c.lastName}`, { clientId: c.id });
  return ok(id);
};

/* ------------------------------------------------------------------ */
/* Rezervace                                                           */
/* ------------------------------------------------------------------ */

export interface CreateBookingInput {
  clientId: Id;
  serviceId: Id;
  therapistId: Id;
  start: LocalDateTime;
  sessionId?: Id;
  payment: { method: PaymentMethod; packageId?: Id; makeupId?: Id };
  channel?: Booking['channel'];
  note?: string;
  /** Personál vědomě přechází upozornění (mimo pracovní dobu apod.). */
  override?: boolean;
  fromWaitlist?: boolean;
}

export const createBooking: Command<CreateBookingInput, Id> = (d, input, ctx) => {
  const mode = ctx.actor.role === 'client' ? 'client' : 'staff';
  if (mode === 'client' && ctx.actor.clientId !== input.clientId) return fail('Rezervovat lze jen za sebe.');
  const service = getService(d, input.serviceId);
  if (!service) return fail('Služba neexistuje.');
  const client = getClient(d, input.clientId);
  if (!client) return fail('Klient neexistuje.');

  let start = input.start;
  let therapistId = input.therapistId;
  let roomId = getTherapist(d, therapistId)?.roomId ?? '';
  let end: LocalDateTime;
  if (service.kind === 'group') {
    const ses = input.sessionId ? getSession(d, input.sessionId) : undefined;
    if (!ses) return fail('Vyberte termín lekce.');
    start = ses.start;
    end = ses.end;
    therapistId = ses.therapistId;
    roomId = ses.roomId;
  } else {
    if (!isValidLocalDateTime(start)) return fail('Neplatný čas začátku.');
    end = addMinutes(start, service.durationMin);
  }

  const check = checkBookingSlot(d, {
    serviceId: service.id,
    therapistId,
    start,
    clientId: client.id,
    now: ctx.now,
    mode,
    sessionId: input.sessionId,
  });
  if (!check.ok) return fail(check.errors[0]);
  if (check.warnings.length && !input.override) return fail(check.warnings[0] + ' Potvrďte prosím vytvoření i přesto.');

  const price = service.priceCzk;
  const payment: BookingPayment = { method: input.payment.method, paid: false, paidAmount: 0 };
  const notices: string[] = [...check.warnings];
  let makeupForBookingId: Id | undefined;
  const id = newId('b');

  switch (input.payment.method) {
    case 'package': {
      const eligible = eligiblePackages(d, client.id, service.id, dateOf(start), dateOf(ctx.now));
      const pkg = input.payment.packageId ? eligible.find((p) => p.id === input.payment.packageId) : eligible[0];
      if (!pkg) return fail('Klient nemá platnou permanentku s volným vstupem pro tuto službu.');
      payment.packageId = pkg.id;
      payment.paid = true;
      const u = packageUsage(d, pkg, dateOf(ctx.now));
      notices.push(`Vstup ${u.used + u.forfeited + u.reserved + 1}/${u.total} z permanentky ${pkg.name}.`);
      break;
    }
    case 'credit': {
      const balance = clientCredit(d, client.id);
      if (balance < price) return fail(`Na kreditu je ${formatMoney(balance)}, termín stojí ${formatMoney(price)}.`);
      addLedger(d, ctx, { clientId: client.id, amount: -price, kind: 'booking_payment', bookingId: id, note: `${service.name} ${formatDayShort(start)}` });
      payment.paid = true;
      payment.paidAmount = price;
      payment.paidAt = ctx.now;
      break;
    }
    case 'online': {
      addPayment(d, ctx, { clientId: client.id, amount: price, method: 'online', purpose: 'booking', bookingId: id, note: 'Platba kartou online (simulace platební brány)' });
      payment.paid = true;
      payment.paidAmount = price;
      payment.paidAt = ctx.now;
      payment.settledBy = 'online';
      break;
    }
    case 'makeup': {
      const options = eligibleMakeups(d, client.id, service.id, start, ctx.now);
      const mk = input.payment.makeupId ? options.find((m) => m.id === input.payment.makeupId) : options[0];
      if (!mk) return fail('Klient nemá platnou náhradu pro tuto službu a termín.');
      const right = d.makeups.find((m) => m.id === mk.id);
      if (!right) return fail('Náhrada neexistuje.');
      right.status = 'used';
      right.usedBookingId = id;
      payment.makeupId = right.id;
      payment.paid = true;
      if (right.packageId) payment.packageId = right.packageId;
      payment.paidAmount = right.value;
      if (right.value > 0 && right.value < price) notices.push(`Náhrada kryje ${formatMoney(right.value)}, zbytek ${formatMoney(price - right.value)} se doplatí na místě.`);
      makeupForBookingId = right.sourceBookingId;
      break;
    }
    case 'free': {
      if (mode === 'client') return fail('Tento způsob platby není dostupný.');
      payment.paid = true;
      break;
    }
    case 'onsite':
    default:
      break;
  }

  const booking: Booking = {
    id,
    clientId: client.id,
    serviceId: service.id,
    therapistId,
    roomId,
    start,
    end,
    sessionId: service.kind === 'group' ? input.sessionId : undefined,
    status: 'confirmed',
    createdAt: ctx.now,
    createdBy: mode === 'client' ? 'client' : 'staff',
    channel: mode === 'client' ? 'online' : input.channel ?? 'recepce',
    price,
    payment,
    note: input.note?.trim() ?? '',
    makeupForBookingId,
    fromWaitlist: input.fromWaitlist,
  };
  d.bookings.push(booking);

  // Zrušit případné čekání na tentýž den / lekci
  for (const w of d.waitlist) {
    if (w.clientId !== client.id || (w.status !== 'waiting' && w.status !== 'offered')) continue;
    const sameSession = !!booking.sessionId && w.sessionId === booking.sessionId;
    const sameDay = w.serviceId === service.id && w.dateFrom <= dateOf(start) && dateOf(start) <= w.dateTo && !w.sessionId;
    if (sameSession || sameDay) {
      w.status = 'booked';
      w.bookingId = id;
      w.offer = undefined;
    }
  }

  queueTemplateMessage(d, {
    key: 'booking_confirmation',
    clientId: client.id,
    now: ctx.now,
    bookingId: id,
    vars: { ...bookingVars(d, booking), storno_do: freeUntilLabel(d, booking) },
  });
  audit(d, ctx, 'Nová rezervace', `${client.firstName} ${client.lastName} · ${service.name} · ${formatDayShort(start)} ${formatTime(start)}`, {
    bookingId: id,
    clientId: client.id,
  });
  return ok(id, notices);
};

function freeUntilLabel(d: ClinicState, b: Booking): string {
  const hours = isGroupBooking(d, b) ? d.settings.policy.groupCancelHours : d.settings.policy.freeCancelHours;
  const t = addHours(b.start, -hours);
  return `${formatDayShort(t)} ${formatTime(t)}`;
}

/** Vrátí platbu termínu (kredit / online → na kredit, náhrada se znovu otevře). */
function refundPayment(d: ClinicState, ctx: Ctx, b: Booking, amount: number, note: string): string {
  if (b.payment.method === 'makeup' && b.payment.makeupId) {
    const right = d.makeups.find((m) => m.id === b.payment.makeupId);
    if (right && right.validUntil > ctx.now) {
      right.status = 'open';
      right.usedBookingId = undefined;
      return 'Náhrada je znovu k dispozici.';
    }
    return 'Lhůta náhrady už uplynula.';
  }
  if (b.payment.method === 'package') return 'Vstup se vrátil na permanentku.';
  if (b.payment.paid && b.payment.paidAmount > 0 && amount > 0) {
    addLedger(d, ctx, { clientId: b.clientId, amount, kind: 'refund', bookingId: b.id, note });
    return `${formatMoney(amount)} vráceno na kredit.`;
  }
  return '';
}

/** Strhne poplatek z kreditu, pokud stačí; jinak ho nechá k úhradě. */
function chargeFee(d: ClinicState, ctx: Ctx, b: Booking, amount: number, pct: number, reason: 'late_cancel' | 'no_show'): string {
  if (amount <= 0) {
    b.fee = { amount: 0, pct, status: 'waived', reason, waivedReason: 'Nulový poplatek' };
    return 'Bez poplatku.';
  }
  const balance = clientCredit(d, b.clientId);
  if (balance >= amount) {
    addLedger(d, ctx, { clientId: b.clientId, amount: -amount, kind: 'storno_fee', bookingId: b.id, note: reason === 'no_show' ? 'Poplatek za nedostavení' : 'Storno poplatek' });
    b.fee = { amount, pct, status: 'paid', reason, settledBy: 'credit' };
    return `Poplatek ${formatMoney(amount)} (${formatPercent(pct)}) uhrazen z kreditu.`;
  }
  b.fee = { amount, pct, status: 'due', reason };
  return `Poplatek ${formatMoney(amount)} (${formatPercent(pct)}) čeká na úhradu.`;
}

/** Nabídne uvolněný termín lidem z čekací listiny. */
export function offerFreedSlot(d: ClinicState, ctx: Ctx, freed: { serviceId: Id; therapistId: Id; start: LocalDateTime; end: LocalDateTime; sessionId?: Id; excludeClientId?: Id }): number {
  const ws = d.settings.waitlist;
  if (!ws.enabled || freed.start <= ctx.now) return 0;
  const date = dateOf(freed.start);
  const candidates = d.waitlist
    .filter((w) => w.status === 'waiting' && w.clientId !== freed.excludeClientId && !w.offeredStarts.includes(freed.start))
    .filter((w) =>
      freed.sessionId
        ? w.sessionId === freed.sessionId
        : !w.sessionId && w.serviceId === freed.serviceId && (!w.therapistId || w.therapistId === freed.therapistId) && w.dateFrom <= date && date <= w.dateTo,
    )
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  let offered = 0;
  for (const w of candidates) {
    if (offered >= Math.max(1, ws.offerTo)) break;
    if (!freed.sessionId) {
      const check = checkBookingSlot(d, { serviceId: freed.serviceId, therapistId: freed.therapistId, start: freed.start, clientId: w.clientId, now: ctx.now, mode: 'staff' });
      if (!check.ok) continue;
    }
    const expiresAt = minStr(addMinutes(ctx.now, ws.offerMinutes), addMinutes(freed.start, -15));
    if (expiresAt <= ctx.now) break;
    w.status = 'offered';
    w.offer = { start: freed.start, therapistId: freed.therapistId, sessionId: freed.sessionId, offeredAt: ctx.now, expiresAt };
    w.offeredStarts.push(freed.start);
    const svc = getService(d, w.serviceId);
    queueTemplateMessage(d, {
      key: 'waitlist_offer',
      clientId: w.clientId,
      now: ctx.now,
      vars: {
        služba: svc?.name ?? '',
        datum: formatDayShort(freed.start),
        čas: formatTime(freed.start),
        terapeut: therapistName(getTherapist(d, freed.therapistId)),
        nabídka_do: `${formatDayShort(expiresAt)} ${formatTime(expiresAt)}`,
      },
    });
    offered++;
  }
  if (offered) audit(d, ctx, 'Čekací listina', `Uvolněný termín ${formatDayShort(freed.start)} ${formatTime(freed.start)} nabídnut ${offered}× `);
  return offered;
}

export interface CancelBookingInput {
  bookingId: Id;
  option: CancelOptionKind;
  reason?: string;
}

export const cancelBooking: Command<CancelBookingInput, { message: string }> = (d, input, ctx) => {
  const b = findBooking(d, input.bookingId);
  if (!b) return fail('Rezervace neexistuje.');
  const denied = ensureOwnBooking(ctx, b);
  if (denied) return fail(denied);
  if (b.status !== 'confirmed') return fail('Zrušit lze jen potvrzenou rezervaci.');
  const role = isStaff(ctx) ? 'staff' : 'client';
  const ev = evaluateCancellation(d, b, ctx.now, role);
  const option = ev.options.find((o) => o.kind === input.option);
  if (!option) return fail(ev.phase === 'started' || ev.phase === 'past' ? 'Termín už začal – zrušit ho nelze.' : 'Tato možnost zrušení teď není k dispozici.');
  const service = getService(d, b.serviceId);
  const client = getClient(d, b.clientId);
  const vars = bookingVars(d, b);
  const by: 'client' | 'staff' = role;
  const reason = input.reason?.trim() ?? '';
  let message = '';

  switch (input.option) {
    case 'free': {
      b.status = 'cancelled';
      b.cancel = { at: ctx.now, by, phase: ev.phase === 'free' ? 'free' : 'late', excuse: false, reason, grace: false };
      message = refundPayment(d, ctx, b, b.payment.paidAmount, 'Vrácení platby za zrušený termín') || 'Rezervace zrušena bez poplatku.';
      queueTemplateMessage(d, { key: 'cancellation', clientId: b.clientId, now: ctx.now, bookingId: b.id, vars: { ...vars, platba_vratka: message } });
      break;
    }
    case 'clinic': {
      b.status = 'clinic_cancelled';
      b.cancel = { at: ctx.now, by: 'staff', phase: 'clinic', excuse: false, reason, grace: false };
      message = refundPayment(d, ctx, b, b.payment.paidAmount, 'Vrácení platby – termín zrušila klinika') || 'Termín zrušen klinikou.';
      queueTemplateMessage(d, { key: 'clinic_cancel', clientId: b.clientId, now: ctx.now, bookingId: b.id, vars: { ...vars, platba_vratka: message } });
      break;
    }
    case 'grace': {
      b.status = 'late_cancelled';
      b.cancel = { at: ctx.now, by, phase: 'late', excuse: false, reason, grace: true };
      b.fee = { amount: 0, pct: ev.feePct, status: 'waived', reason: 'late_cancel', waivedReason: 'První pozdní storno zdarma' };
      message = refundPayment(d, ctx, b, b.payment.paidAmount, 'Vrácení platby – první pozdní storno zdarma') || 'První pozdní storno bez poplatku.';
      queueTemplateMessage(d, { key: 'late_cancel', clientId: b.clientId, now: ctx.now, bookingId: b.id, vars: { ...vars, poplatek: 'první pozdní zrušení je bez poplatku' } });
      break;
    }
    case 'excuse': {
      b.status = 'excused';
      b.cancel = { at: ctx.now, by, phase: 'late', excuse: true, reason, grace: false };
      const prepaid = b.payment.method === 'package' || (b.payment.paid && b.payment.paidAmount > 0);
      if (prepaid && ev.excuse.makeupUntil) {
        const sameCategory = d.services.filter((x) => x.active && x.categoryId === service?.categoryId).map((x) => x.id);
        let serviceIds = sameCategory.length ? sameCategory : [b.serviceId];
        if (b.payment.packageId) {
          const pkg = getPackage(d, b.payment.packageId);
          if (pkg) serviceIds = serviceIds.filter((id) => pkg.serviceIds.includes(id));
          if (!serviceIds.length) serviceIds = [b.serviceId];
        }
        const right: MakeupRight = {
          id: newId('mk'),
          clientId: b.clientId,
          sourceBookingId: b.id,
          createdAt: ctx.now,
          validUntil: ev.excuse.makeupUntil,
          packageId: b.payment.packageId,
          value: b.payment.packageId ? 0 : b.payment.paidAmount,
          serviceIds,
          status: 'open',
        };
        d.makeups.push(right);
        message = `Omluvenka uplatněna. Náhradní termín vyberte do ${formatDayShort(right.validUntil)}.`;
        queueTemplateMessage(d, {
          key: 'excuse',
          clientId: b.clientId,
          now: ctx.now,
          bookingId: b.id,
          vars: { ...vars, náhrada_do: formatDayShort(right.validUntil), náhrada_text: `Náhradní termín si vyberte do ${formatDayShort(right.validUntil)}.` },
        });
      } else {
        message = 'Omluvenka uplatněna, termín je zrušen bez poplatku.';
        queueTemplateMessage(d, { key: 'excuse', clientId: b.clientId, now: ctx.now, bookingId: b.id, vars: { ...vars, náhrada_text: 'Nový termín si můžete kdykoli zarezervovat.' } });
      }
      break;
    }
    case 'fee': {
      b.status = 'late_cancelled';
      b.cancel = { at: ctx.now, by, phase: 'late', excuse: false, reason, grace: false };
      const pct = ev.feePct;
      if (b.payment.method === 'package' && (ev.isGroup || d.settings.policy.packageLateHandling === 'forfeit_entry')) {
        b.fee = { amount: ev.feeBase, pct: 100, status: 'paid', reason: 'late_cancel', settledBy: 'package_entry' };
        message = 'Vstup z permanentky propadl.';
      } else if (b.payment.method === 'package') {
        message = 'Vstup se vrátil na permanentku. ' + chargeFee(d, ctx, b, ev.feeAmount, pct, 'late_cancel');
      } else if (b.payment.method === 'makeup') {
        b.fee = { amount: b.payment.paidAmount, pct: 100, status: 'paid', reason: 'late_cancel', settledBy: b.payment.packageId ? 'package_entry' : 'credit' };
        message = 'Náhradní termín propadl.';
      } else if (b.payment.paid && b.payment.paidAmount > 0) {
        const fee = Math.min(b.payment.paidAmount, ev.feeAmount);
        b.fee = { amount: fee, pct, status: 'paid', reason: 'late_cancel', settledBy: 'credit' };
        const back = b.payment.paidAmount - fee;
        message = `Storno poplatek ${formatMoney(fee)} (${formatPercent(pct)}).` + (back > 0 ? ' ' + refundPayment(d, ctx, b, back, 'Vrácení platby po odečtení storno poplatku') : '');
      } else {
        message = chargeFee(d, ctx, b, ev.feeAmount, pct, 'late_cancel');
      }
      queueTemplateMessage(d, { key: 'late_cancel', clientId: b.clientId, now: ctx.now, bookingId: b.id, vars: { ...vars, poplatek: message } });
      break;
    }
    default:
      return fail('Neznámá volba.');
  }

  audit(d, ctx, 'Zrušení rezervace', `${client?.firstName ?? ''} ${client?.lastName ?? ''} · ${service?.name ?? ''} · ${formatDayShort(b.start)} ${formatTime(b.start)} · ${option.title}`, {
    bookingId: b.id,
    clientId: b.clientId,
  });
  const offered = offerFreedSlot(d, ctx, { serviceId: b.serviceId, therapistId: b.therapistId, start: b.start, end: b.end, sessionId: b.sessionId, excludeClientId: b.clientId });
  const notices = offered ? [`Uvolněný termín nabídnut ${countLabel(offered, ['čekajícímu', 'čekajícím', 'čekajícím'])} z čekací listiny.`] : [];
  return ok({ message }, notices);
};

export interface RescheduleInput {
  bookingId: Id;
  start: LocalDateTime;
  therapistId?: Id;
  sessionId?: Id;
  override?: boolean;
  /** Klient přesouvá po bezplatné lhůtě – uplatní omluvenku. */
  useExcuse?: boolean;
}

export const rescheduleBooking: Command<RescheduleInput, Id> = (d, input, ctx) => {
  const b = findBooking(d, input.bookingId);
  if (!b) return fail('Rezervace neexistuje.');
  const denied = ensureOwnBooking(ctx, b);
  if (denied) return fail(denied);
  if (b.status !== 'confirmed') return fail('Přesunout lze jen potvrzenou rezervaci.');
  const service = getService(d, b.serviceId);
  if (!service) return fail('Služba neexistuje.');
  const role = isStaff(ctx) ? 'staff' : 'client';
  const therapistId = input.therapistId ?? b.therapistId;

  if (role === 'client') {
    const ev = evaluateCancellation(d, b, ctx.now, 'client');
    if (ev.phase !== 'free') {
      if (!input.useExcuse) return fail('Bezplatná lhůta pro přesun uplynula. Přesun je možný jen s omluvenkou.');
      if (!ev.excuse.allowed) return fail(ev.excuse.reason || 'Omluvenku nelze uplatnit.');
      const cancelled = cancelBooking(d, { bookingId: b.id, option: 'excuse', reason: 'Přesun termínu' }, ctx);
      if (!cancelled.ok) return cancelled;
      const right = d.makeups.find((m) => m.sourceBookingId === b.id && m.status === 'open');
      const created = createBooking(
        d,
        {
          clientId: b.clientId,
          serviceId: b.serviceId,
          therapistId,
          start: input.start,
          sessionId: input.sessionId,
          payment: right ? { method: 'makeup', makeupId: right.id } : { method: b.payment.method === 'package' ? 'package' : 'onsite', packageId: b.payment.packageId },
        },
        ctx,
      );
      if (!created.ok) return created;
      return ok(created.value, ['Přesun po lhůtě: uplatněna omluvenka.']);
    }
  }

  const check = checkBookingSlot(d, {
    serviceId: b.serviceId,
    therapistId,
    start: input.start,
    clientId: b.clientId,
    now: ctx.now,
    mode: role,
    sessionId: input.sessionId ?? b.sessionId,
    ignoreBookingId: b.id,
  });
  if (!check.ok) return fail(check.errors[0]);
  if (check.warnings.length && !input.override) return fail(check.warnings[0] + ' Potvrďte prosím přesun i přesto.');
  const old = { start: b.start, end: b.end, therapistId: b.therapistId, sessionId: b.sessionId };
  if (service.kind === 'group' && input.sessionId) {
    const ses = getSession(d, input.sessionId);
    if (!ses) return fail('Termín lekce neexistuje.');
    b.sessionId = ses.id;
    b.start = ses.start;
    b.end = ses.end;
    b.therapistId = ses.therapistId;
    b.roomId = ses.roomId;
  } else {
    b.start = input.start;
    b.end = addMinutes(input.start, service.durationMin);
    b.therapistId = therapistId;
    b.roomId = getTherapist(d, therapistId)?.roomId ?? b.roomId;
  }
  b.rescheduledFrom = old.start;
  b.reminderSentAt = undefined;
  queueTemplateMessage(d, { key: 'reschedule', clientId: b.clientId, now: ctx.now, bookingId: b.id, vars: bookingVars(d, b) });
  audit(d, ctx, 'Přesun rezervace', `${formatDayShort(old.start)} ${formatTime(old.start)} → ${formatDayShort(b.start)} ${formatTime(b.start)}`, { bookingId: b.id, clientId: b.clientId });
  const offered = offerFreedSlot(d, ctx, { serviceId: b.serviceId, therapistId: old.therapistId, start: old.start, end: old.end, sessionId: old.sessionId, excludeClientId: b.clientId });
  return ok(b.id, [...check.warnings, ...(offered ? ['Původní termín nabídnut čekající listině.'] : [])]);
};

/** Úhrada ceny termínu na místě / z kreditu. */
function settle(d: ClinicState, ctx: Ctx, b: Booking, method: MoneyMethod | 'credit'): CommandResult<undefined> {
  if (b.payment.paid) return ok(undefined);
  const due = Math.max(0, b.price - b.payment.paidAmount);
  if (method === 'credit') {
    const balance = clientCredit(d, b.clientId);
    if (balance < due) return fail(`Na kreditu je jen ${formatMoney(balance)}.`);
    addLedger(d, ctx, { clientId: b.clientId, amount: -due, kind: 'booking_payment', bookingId: b.id, note: 'Úhrada termínu z kreditu' });
  } else {
    addPayment(d, ctx, { clientId: b.clientId, amount: due, method, purpose: 'booking', bookingId: b.id, note: `Úhrada termínu ${MONEY_LABEL[method]}` });
    b.payment.settledBy = method;
  }
  b.payment.paid = true;
  b.payment.paidAmount = b.price;
  b.payment.paidAt = ctx.now;
  return ok(undefined);
}

export const markCompleted: Command<{ bookingId: Id; settleWith?: MoneyMethod | 'credit' | null }> = (d, input, ctx) => {
  if (!isStaff(ctx)) return fail('Docházku zapisuje personál.');
  const b = findBooking(d, input.bookingId);
  if (!b) return fail('Rezervace neexistuje.');
  if (b.status !== 'confirmed' && b.status !== 'no_show') return fail('Termín nelze označit jako proběhlý.');
  if (b.status === 'no_show') {
    // oprava omylem zapsaného nedostavení
    if (b.fee?.status === 'paid' && b.fee.settledBy === 'credit')
      addLedger(d, ctx, { clientId: b.clientId, amount: b.fee.amount, kind: 'refund', bookingId: b.id, note: 'Zrušení poplatku za nedostavení' });
    b.fee = undefined;
  }
  b.status = 'completed';
  if (input.settleWith && b.payment.method === 'onsite') {
    const r = settle(d, ctx, b, input.settleWith);
    if (!r.ok) return r;
  }
  audit(d, ctx, 'Proběhlo', `${formatDayShort(b.start)} ${formatTime(b.start)}`, { bookingId: b.id, clientId: b.clientId });
  return ok(undefined);
};

export const settleBooking: Command<{ bookingId: Id; method: MoneyMethod | 'credit' }> = (d, input, ctx) => {
  if (!isStaff(ctx)) return fail('Platby přijímá personál.');
  const b = findBooking(d, input.bookingId);
  if (!b) return fail('Rezervace neexistuje.');
  if (b.payment.paid) return fail('Termín je už zaplacený.');
  const r = settle(d, ctx, b, input.method);
  if (!r.ok) return r;
  audit(d, ctx, 'Úhrada termínu', `${formatMoney(b.price)} ${MONEY_LABEL[input.method]}`, { bookingId: b.id, clientId: b.clientId });
  return ok(undefined);
};

export const markNoShow: Command<{ bookingId: Id }, { message: string }> = (d, input, ctx) => {
  if (!isStaff(ctx)) return fail('Docházku zapisuje personál.');
  const b = findBooking(d, input.bookingId);
  if (!b) return fail('Rezervace neexistuje.');
  if (b.status !== 'confirmed' && b.status !== 'completed') return fail('Nedostavení lze zapsat jen u potvrzeného termínu.');
  if (b.start > ctx.now) return fail('Termín ještě nezačal.');
  const pct = d.settings.policy.noShowFeePct;
  b.status = 'no_show';
  let message: string;
  if (b.payment.method === 'package') {
    const pkg = b.payment.packageId ? getPackage(d, b.payment.packageId) : undefined;
    const unit = pkg ? packageUsage(d, pkg, dateOf(ctx.now)).unitValue : 0;
    b.fee = { amount: unit, pct: 100, status: 'paid', reason: 'no_show', settledBy: 'package_entry' };
    message = 'Vstup z permanentky propadl.';
  } else if (b.payment.method === 'makeup') {
    b.fee = { amount: b.payment.paidAmount, pct: 100, status: 'paid', reason: 'no_show', settledBy: b.payment.packageId ? 'package_entry' : 'credit' };
    message = 'Náhradní termín propadl.';
  } else if (b.payment.paid && b.payment.paidAmount > 0) {
    const fee = Math.round((b.payment.paidAmount * pct) / 100);
    b.fee = { amount: fee, pct, status: 'paid', reason: 'no_show', settledBy: 'credit' };
    const back = b.payment.paidAmount - fee;
    message = `Poplatek ${formatMoney(fee)} (${formatPercent(pct)}).` + (back > 0 ? ' ' + refundPayment(d, ctx, b, back, 'Vrácení části platby') : '');
  } else {
    message = chargeFee(d, ctx, b, Math.round((b.price * pct) / 100), pct, 'no_show');
  }
  queueTemplateMessage(d, { key: 'no_show', clientId: b.clientId, now: ctx.now, bookingId: b.id, vars: { ...bookingVars(d, b), poplatek: message } });
  const notices: string[] = [];
  const limit = d.settings.policy.blockAfterNoShows;
  if (limit > 0) {
    const since = addDays(ctx.now, -90);
    const count = bookingsOfClient(d, b.clientId).filter((x) => x.status === 'no_show' && x.start >= since).length;
    const c = d.clients.find((x) => x.id === b.clientId);
    if (c && count >= limit && !c.blocked) {
      c.blocked = true;
      notices.push(`Klient má ${count} nedostavení za 90 dní – online rezervace byly pozastaveny.`);
    }
  }
  audit(d, ctx, 'Nedostavení', `${formatDayShort(b.start)} ${formatTime(b.start)} · ${message}`, { bookingId: b.id, clientId: b.clientId });
  return ok({ message }, notices);
};

export const waiveFee: Command<{ bookingId: Id; reason: string }> = (d, input, ctx) => {
  if (!isStaff(ctx)) return fail('Poplatky upravuje personál.');
  const b = findBooking(d, input.bookingId);
  if (!b || !b.fee) return fail('Rezervace nemá poplatek.');
  if (b.fee.status === 'waived') return fail('Poplatek už byl odpuštěn.');
  if (b.fee.status === 'paid' && b.fee.settledBy === 'credit' && b.fee.amount > 0)
    addLedger(d, ctx, { clientId: b.clientId, amount: b.fee.amount, kind: 'refund', bookingId: b.id, note: 'Odpuštění poplatku' });
  if (b.fee.status === 'paid' && b.fee.settledBy !== 'credit' && b.fee.settledBy !== 'package_entry' && b.fee.amount > 0)
    addLedger(d, ctx, { clientId: b.clientId, amount: b.fee.amount, kind: 'refund', bookingId: b.id, note: 'Odpuštění poplatku (vráceno na kredit)' });
  b.fee.status = 'waived';
  b.fee.settledBy = undefined;
  b.fee.waivedReason = input.reason.trim() || 'Odpuštěno personálem';
  audit(d, ctx, 'Odpuštění poplatku', b.fee.waivedReason, { bookingId: b.id, clientId: b.clientId });
  return ok(undefined, ['Poplatek odpuštěn.']);
};

export const payFee: Command<{ bookingId: Id; method: MoneyMethod | 'credit' }> = (d, input, ctx) => {
  if (!isStaff(ctx)) return fail('Platby přijímá personál.');
  const b = findBooking(d, input.bookingId);
  if (!b || !b.fee || b.fee.status !== 'due') return fail('Rezervace nemá neuhrazený poplatek.');
  if (input.method === 'credit') {
    const balance = clientCredit(d, b.clientId);
    if (balance < b.fee.amount) return fail(`Na kreditu je jen ${formatMoney(balance)}.`);
    addLedger(d, ctx, { clientId: b.clientId, amount: -b.fee.amount, kind: 'storno_fee', bookingId: b.id, note: 'Úhrada storno poplatku' });
  } else {
    addPayment(d, ctx, { clientId: b.clientId, amount: b.fee.amount, method: input.method, purpose: 'storno_fee', bookingId: b.id, note: 'Úhrada storno poplatku' });
  }
  b.fee.status = 'paid';
  b.fee.settledBy = input.method;
  audit(d, ctx, 'Úhrada poplatku', formatMoney(b.fee.amount), { bookingId: b.id, clientId: b.clientId });
  return ok(undefined);
};

export const updateBookingNote: Command<{ bookingId: Id; note: string }> = (d, input, ctx) => {
  const b = findBooking(d, input.bookingId);
  if (!b) return fail('Rezervace neexistuje.');
  const denied = ensureOwnBooking(ctx, b);
  if (denied) return fail(denied);
  b.note = input.note.trim();
  return ok(undefined);
};

/* ------------------------------------------------------------------ */
/* Permanentky a kredit                                                */
/* ------------------------------------------------------------------ */

export const sellPackage: Command<{ clientId: Id; templateId: Id; paidBy: MoneyMethod | 'credit'; startDate?: LocalDate }, Id> = (d, input, ctx) => {
  if (ctx.actor.role === 'client' && ctx.actor.clientId !== input.clientId) return fail('Nemáte oprávnění.');
  if (ctx.actor.role === 'client' && input.paidBy !== 'online' && input.paidBy !== 'credit') return fail('Online lze platit kartou nebo kreditem.');
  const tpl = getPackageTemplate(d, input.templateId);
  if (!tpl || !tpl.active) return fail('Permanentka není v nabídce.');
  const client = getClient(d, input.clientId);
  if (!client) return fail('Klient neexistuje.');
  const id = newId('pk');
  if (input.paidBy === 'credit') {
    const balance = clientCredit(d, client.id);
    if (balance < tpl.priceCzk) return fail(`Na kreditu je ${formatMoney(balance)}, permanentka stojí ${formatMoney(tpl.priceCzk)}.`);
    addLedger(d, ctx, { clientId: client.id, amount: -tpl.priceCzk, kind: 'package_purchase', packageId: id, note: `Permanentka ${tpl.name}` });
  } else {
    addPayment(d, ctx, { clientId: client.id, amount: tpl.priceCzk, method: input.paidBy, purpose: 'package', packageId: id, note: `Permanentka ${tpl.name}` });
  }
  const start = input.startDate ?? dateOf(ctx.now);
  d.packages.push({
    id,
    clientId: client.id,
    templateId: tpl.id,
    name: tpl.name,
    serviceIds: [...tpl.serviceIds],
    entriesTotal: tpl.entries,
    priceCzk: tpl.priceCzk,
    excusesAllowed: tpl.excusesAllowed,
    purchasedAt: ctx.now,
    validUntil: addDays(start, tpl.validityDays),
    paidBy: input.paidBy,
    cancelled: false,
    extendedDays: 0,
  });
  audit(d, ctx, 'Prodej permanentky', `${tpl.name} · ${client.firstName} ${client.lastName} · ${formatMoney(tpl.priceCzk)} ${MONEY_LABEL[input.paidBy]}`, { clientId: client.id });
  return ok(id);
};

export const extendPackage: Command<{ packageId: Id; days: number; reason: string }> = (d, input, ctx) => {
  if (!isStaff(ctx)) return fail('Platnost prodlužuje personál.');
  const p = d.packages.find((x) => x.id === input.packageId);
  if (!p) return fail('Permanentka neexistuje.');
  if (!Number.isFinite(input.days) || input.days <= 0 || input.days > 365) return fail('Zadejte počet dní 1–365.');
  p.extendedDays += Math.round(input.days);
  audit(d, ctx, 'Prodloužení permanentky', `${p.name} +${input.days} dní · ${input.reason}`, { clientId: p.clientId });
  return ok(undefined);
};

export const cancelPackage: Command<{ packageId: Id; refundToCredit: boolean }> = (d, input, ctx) => {
  if (!isStaff(ctx)) return fail('Permanentky ruší personál.');
  const p = d.packages.find((x) => x.id === input.packageId);
  if (!p || p.cancelled) return fail('Permanentka neexistuje nebo je už zrušená.');
  const u = packageUsage(d, p, dateOf(ctx.now));
  if (u.reserved > 0) return fail('Na permanentku jsou rezervované termíny – nejdřív je zrušte nebo přepište.');
  p.cancelled = true;
  if (input.refundToCredit && u.free > 0) {
    addLedger(d, ctx, { clientId: p.clientId, amount: u.free * u.unitValue, kind: 'refund', packageId: p.id, note: `Vrácení ${u.free} nevyčerpaných vstupů` });
  }
  audit(d, ctx, 'Zrušení permanentky', p.name, { clientId: p.clientId });
  return ok(undefined);
};

export function creditBonusFor(s: ClinicState, amount: number): number {
  let pct = 0;
  for (const r of s.settings.creditBonus) if (amount >= r.minTopup && r.pct > pct) pct = r.pct;
  return Math.round((amount * pct) / 100);
}

export const topUpCredit: Command<{ clientId: Id; amount: number; method: MoneyMethod }, { bonus: number }> = (d, input, ctx) => {
  if (ctx.actor.role === 'client' && (ctx.actor.clientId !== input.clientId || input.method !== 'online')) return fail('Kredit lze online dobít jen kartou.');
  const client = getClient(d, input.clientId);
  if (!client) return fail('Klient neexistuje.');
  const amount = Math.round(input.amount);
  if (!Number.isFinite(amount) || amount < 100) return fail('Minimální dobití je 100 Kč.');
  if (amount > 100000) return fail('Maximální jednorázové dobití je 100 000 Kč.');
  addPayment(d, ctx, { clientId: client.id, amount, method: input.method, purpose: 'credit_topup', note: 'Dobití kreditu' });
  addLedger(d, ctx, { clientId: client.id, amount, kind: 'topup', method: input.method, note: `Dobití ${MONEY_LABEL[input.method]}` });
  const bonus = creditBonusFor(d, amount);
  if (bonus > 0) addLedger(d, ctx, { clientId: client.id, amount: bonus, kind: 'bonus', note: 'Bonus za dobití' });
  audit(d, ctx, 'Dobití kreditu', `${formatMoney(amount)}${bonus ? ` + bonus ${formatMoney(bonus)}` : ''}`, { clientId: client.id });
  return ok({ bonus }, bonus ? [`Připsán bonus ${formatMoney(bonus)}.`] : []);
};

export const adjustCredit: Command<{ clientId: Id; amount: number; note: string }> = (d, input, ctx) => {
  if (!isStaff(ctx)) return fail('Kredit upravuje personál.');
  if (!input.amount || !Number.isFinite(input.amount)) return fail('Zadejte částku.');
  if (!input.note.trim()) return fail('Uveďte důvod úpravy.');
  const balance = clientCredit(d, input.clientId);
  if (balance + input.amount < 0) return fail('Zůstatek kreditu nesmí být záporný.');
  addLedger(d, ctx, { clientId: input.clientId, amount: Math.round(input.amount), kind: 'adjustment', note: input.note.trim() });
  audit(d, ctx, 'Úprava kreditu', `${formatMoney(input.amount)} · ${input.note}`, { clientId: input.clientId });
  return ok(undefined);
};

/* ------------------------------------------------------------------ */
/* Čekací listina                                                      */
/* ------------------------------------------------------------------ */

export const joinWaitlist: Command<
  { clientId: Id; serviceId: Id; therapistId: Id | null; dateFrom: LocalDate; dateTo?: LocalDate; sessionId?: Id; note?: string },
  Id
> = (d, input, ctx) => {
  if (!d.settings.waitlist.enabled) return fail('Čekací listina je vypnutá.');
  if (ctx.actor.role === 'client' && ctx.actor.clientId !== input.clientId) return fail('Nemáte oprávnění.');
  if (!getService(d, input.serviceId)) return fail('Služba neexistuje.');
  const dateTo = input.dateTo ?? input.dateFrom;
  if (dateTo < input.dateFrom) return fail('Konec období je před začátkem.');
  if (dateTo < dateOf(ctx.now)) return fail('Období už proběhlo.');
  const dup = d.waitlist.find(
    (w) =>
      w.clientId === input.clientId &&
      (w.status === 'waiting' || w.status === 'offered') &&
      (input.sessionId ? w.sessionId === input.sessionId : w.serviceId === input.serviceId && w.dateFrom === input.dateFrom && w.dateTo === dateTo),
  );
  if (dup) return fail('Na tento termín už čekáte.');
  const entry: WaitlistEntry = {
    id: newId('w'),
    clientId: input.clientId,
    serviceId: input.serviceId,
    therapistId: input.therapistId,
    dateFrom: input.dateFrom,
    dateTo,
    sessionId: input.sessionId,
    createdAt: ctx.now,
    status: 'waiting',
    offeredStarts: [],
    note: input.note?.trim() ?? '',
  };
  d.waitlist.push(entry);
  audit(d, ctx, 'Čekací listina', `Přihlášení · ${getService(d, input.serviceId)?.name ?? ''} · ${formatDayShort(input.dateFrom)}`, { clientId: input.clientId });
  return ok(entry.id);
};

export const leaveWaitlist: Command<{ entryId: Id }> = (d, input, ctx) => {
  const w = d.waitlist.find((x) => x.id === input.entryId);
  if (!w) return fail('Záznam neexistuje.');
  if (ctx.actor.role === 'client' && ctx.actor.clientId !== w.clientId) return fail('Nemáte oprávnění.');
  w.status = 'cancelled';
  w.offer = undefined;
  return ok(undefined);
};

export const acceptWaitlistOffer: Command<{ entryId: Id; payment: CreateBookingInput['payment'] }, Id> = (d, input, ctx) => {
  const w = d.waitlist.find((x) => x.id === input.entryId);
  if (!w || w.status !== 'offered' || !w.offer) return fail('Nabídka už neplatí.');
  if (ctx.actor.role === 'client' && ctx.actor.clientId !== w.clientId) return fail('Nemáte oprávnění.');
  if (w.offer.expiresAt <= ctx.now) return fail('Nabídka vypršela.');
  const offer = w.offer;
  const created = createBooking(
    d,
    { clientId: w.clientId, serviceId: w.serviceId, therapistId: offer.therapistId, start: offer.start, sessionId: offer.sessionId, payment: input.payment, fromWaitlist: true, channel: 'online' },
    ctx,
  );
  if (!created.ok) return fail(created.error.includes('jinou rezervaci') || created.error.includes('obsazená') ? 'Termín mezitím potvrdil jiný klient.' : created.error);
  w.status = 'booked';
  w.bookingId = created.value;
  w.offer = undefined;
  // ostatním stejná nabídka propadá
  for (const other of d.waitlist) {
    if (other.id !== w.id && other.status === 'offered' && other.offer?.start === offer.start && other.offer.therapistId === offer.therapistId) {
      other.status = 'waiting';
      other.offer = undefined;
    }
  }
  return ok(created.value, created.notices);
};

export const declineWaitlistOffer: Command<{ entryId: Id }> = (d, input, ctx) => {
  const w = d.waitlist.find((x) => x.id === input.entryId);
  if (!w || w.status !== 'offered' || !w.offer) return fail('Nabídka už neplatí.');
  if (ctx.actor.role === 'client' && ctx.actor.clientId !== w.clientId) return fail('Nemáte oprávnění.');
  const offer = w.offer;
  w.status = 'waiting';
  w.offer = undefined;
  const svc = getService(d, w.serviceId);
  if (svc) offerFreedSlot(d, ctx, { serviceId: svc.id, therapistId: offer.therapistId, start: offer.start, end: addMinutes(offer.start, svc.durationMin), sessionId: offer.sessionId, excludeClientId: w.clientId });
  return ok(undefined);
};

/* ------------------------------------------------------------------ */
/* Katalog a nastavení                                                 */
/* ------------------------------------------------------------------ */

function requireStaff(ctx: Ctx): string | null {
  return isStaff(ctx) ? null : 'Nastavení může měnit jen personál.';
}

export const upsertService: Command<Service, Id> = (d, input, ctx) => {
  const denied = requireStaff(ctx);
  if (denied) return fail(denied);
  if (!input.name.trim()) return fail('Zadejte název služby.');
  if (input.durationMin <= 0 || input.durationMin % 15 !== 0) return fail('Délka služby musí být násobkem 15 minut.');
  if (input.durationMin > 480) return fail('Délka služby může být nejvýše 8 hodin.');
  if (input.priceCzk < 0) return fail('Cena nesmí být záporná.');
  if (input.bufferMin < 0 || input.bufferMin > 60) return fail('Rezerva po službě musí být 0–60 minut.');
  if (input.kind === 'group' && input.capacity < 2) return fail('Skupinová lekce musí mít kapacitu alespoň 2.');
  if (!d.categories.some((c) => c.id === input.categoryId)) return fail('Vyberte kategorii.');
  const svc: Service = { ...input, name: input.name.trim(), capacity: input.kind === 'group' ? input.capacity : 1 };
  const i = d.services.findIndex((x) => x.id === input.id);
  if (i >= 0) d.services[i] = svc;
  else d.services.push({ ...svc, id: input.id || newId('s'), order: d.services.length });
  audit(d, ctx, i >= 0 ? 'Úprava služby' : 'Nová služba', svc.name);
  return ok(i >= 0 ? svc.id : d.services[d.services.length - 1].id);
};

export const upsertCategory: Command<Category, Id> = (d, input, ctx) => {
  const denied = requireStaff(ctx);
  if (denied) return fail(denied);
  if (!input.name.trim()) return fail('Zadejte název kategorie.');
  const i = d.categories.findIndex((x) => x.id === input.id);
  if (i >= 0) d.categories[i] = { ...input, name: input.name.trim() };
  else d.categories.push({ ...input, id: input.id || newId('cat'), name: input.name.trim(), order: d.categories.length });
  return ok(i >= 0 ? input.id : d.categories[d.categories.length - 1].id);
};

export const upsertTherapist: Command<Therapist, Id> = (d, input, ctx) => {
  const denied = requireStaff(ctx);
  if (denied) return fail(denied);
  if (!input.firstName.trim() || !input.lastName.trim()) return fail('Zadejte jméno a příjmení.');
  for (const ranges of Object.values(input.workingHours)) {
    for (const r of ranges) if (!(r.start < r.end)) return fail('Pracovní doba: začátek musí být před koncem.');
  }
  const i = d.therapists.findIndex((x) => x.id === input.id);
  if (i >= 0) d.therapists[i] = input;
  else d.therapists.push({ ...input, id: input.id || newId('t'), order: d.therapists.length });
  audit(d, ctx, i >= 0 ? 'Úprava terapeuta' : 'Nový terapeut', `${input.firstName} ${input.lastName}`);
  return ok(i >= 0 ? input.id : d.therapists[d.therapists.length - 1].id);
};

export const setServiceTherapists: Command<{ serviceId: Id; therapistIds: Id[] }> = (d, input, ctx) => {
  const denied = requireStaff(ctx);
  if (denied) return fail(denied);
  const svc = d.services.find((s) => s.id === input.serviceId);
  if (!svc) return fail('Služba neexistuje.');
  svc.therapistIds = [...new Set(input.therapistIds)];
  return ok(undefined);
};

export const upsertPackageTemplate: Command<PackageTemplate, Id> = (d, input, ctx) => {
  const denied = requireStaff(ctx);
  if (denied) return fail(denied);
  if (!input.name.trim()) return fail('Zadejte název permanentky.');
  if (input.entries < 1 || input.entries > 100) return fail('Počet vstupů musí být 1–100.');
  if (input.validityDays < 7 || input.validityDays > 730) return fail('Platnost musí být 7–730 dní.');
  if (input.priceCzk <= 0) return fail('Zadejte cenu.');
  if (!input.serviceIds.length) return fail('Vyberte alespoň jednu službu, na kterou permanentka platí.');
  if (input.excusesAllowed < 0 || input.excusesAllowed > input.entries) return fail('Počet omluvenek musí být 0 až počet vstupů.');
  const i = d.packageTemplates.findIndex((x) => x.id === input.id);
  if (i >= 0) d.packageTemplates[i] = { ...input, name: input.name.trim() };
  else d.packageTemplates.push({ ...input, id: input.id || newId('pt'), name: input.name.trim(), order: d.packageTemplates.length });
  audit(d, ctx, i >= 0 ? 'Úprava permanentky' : 'Nová permanentka', input.name);
  return ok(i >= 0 ? input.id : d.packageTemplates[d.packageTemplates.length - 1].id);
};

export const upsertGroupTemplate: Command<GroupTemplate, Id> = (d, input, ctx) => {
  const denied = requireStaff(ctx);
  if (denied) return fail(denied);
  const svc = getService(d, input.serviceId);
  if (!svc || svc.kind !== 'group') return fail('Vyberte skupinovou službu.');
  if (input.capacity < 1) return fail('Kapacita musí být alespoň 1.');
  const i = d.groupTemplates.findIndex((x) => x.id === input.id);
  if (i >= 0) d.groupTemplates[i] = input;
  else d.groupTemplates.push({ ...input, id: input.id || newId('g') });
  return ok(i >= 0 ? input.id : d.groupTemplates[d.groupTemplates.length - 1].id);
};

export const cancelSession: Command<{ sessionId: Id; reason: string }, number> = (d, input, ctx) => {
  const denied = requireStaff(ctx);
  if (denied) return fail(denied);
  const ses = getSession(d, input.sessionId);
  if (!ses) return fail('Lekce neexistuje.');
  if (d.cancelledSessions.includes(ses.id)) return fail('Lekce je už zrušená.');
  let count = 0;
  for (const b of d.bookings) {
    if (b.sessionId !== ses.id || b.status !== 'confirmed') continue;
    const r = cancelBooking(d, { bookingId: b.id, option: 'clinic', reason: input.reason }, ctx);
    if (r.ok) count++;
  }
  d.cancelledSessions.push(ses.id);
  audit(d, ctx, 'Zrušení lekce', `${ses.title} ${formatDayShort(ses.start)} ${formatTime(ses.start)} · ${count} přihlášených`);
  return ok(count);
};

export const addTimeOff: Command<Omit<TimeOff, 'id'>, Id> = (d, input, ctx) => {
  const denied = requireStaff(ctx);
  if (denied) return fail(denied);
  if (!(input.start < input.end)) return fail('Začátek musí být před koncem.');
  const id = newId('off');
  d.timeOff.push({ ...input, id });
  const affected = d.bookings.filter(
    (b) => b.status === 'confirmed' && (input.therapistId === null || b.therapistId === input.therapistId) && b.start < input.end && input.start < b.end,
  ).length;
  return ok(id, affected ? [`V tomto čase je ${affected} potvrzených rezervací – zkontrolujte je.`] : []);
};

export const removeTimeOff: Command<{ id: Id }> = (d, input, ctx) => {
  const denied = requireStaff(ctx);
  if (denied) return fail(denied);
  const i = d.timeOff.findIndex((x) => x.id === input.id);
  if (i < 0) return fail('Záznam neexistuje.');
  d.timeOff.splice(i, 1);
  return ok(undefined);
};

type SettingsPatch = Partial<Omit<Settings, 'bookingRules' | 'policy' | 'waitlist' | 'reminders'>> & {
  bookingRules?: Partial<Settings['bookingRules']>;
  policy?: Partial<Omit<Settings['policy'], 'excuses'>> & { excuses?: Partial<Settings['policy']['excuses']> };
  waitlist?: Partial<Settings['waitlist']>;
  reminders?: Partial<Settings['reminders']>;
};

export const updateSettings: Command<SettingsPatch> = (d, patch, ctx) => {
  const denied = requireStaff(ctx);
  if (denied && Object.keys(patch).some((k) => k !== 'simulatedNow')) return fail(denied);
  const s = d.settings;
  const { bookingRules, policy, waitlist, reminders, ...rest } = patch;
  Object.assign(s, rest);
  if (bookingRules) Object.assign(s.bookingRules, bookingRules);
  if (waitlist) Object.assign(s.waitlist, waitlist);
  if (reminders) Object.assign(s.reminders, reminders);
  if (policy) {
    const { excuses, ...p } = policy;
    Object.assign(s.policy, p);
    if (excuses) Object.assign(s.policy.excuses, excuses);
  }
  // validace
  const pol = s.policy;
  if (pol.freeCancelHours < 0 || pol.freeCancelHours > 168) return fail('Bezplatná lhůta musí být 0–168 hodin.');
  for (const t of pol.lateTiers) {
    if (t.feePct < 0 || t.feePct > 100) return fail('Storno poplatek musí být 0–100 %.');
    if (t.hoursBefore < 0 || t.hoursBefore > pol.freeCancelHours) return fail('Stupeň poplatku musí ležet uvnitř bezplatné lhůty.');
  }
  pol.lateTiers.sort((a, b) => b.hoursBefore - a.hoursBefore);
  if (pol.noShowFeePct < 0 || pol.noShowFeePct > 100) return fail('Poplatek za nedostavení musí být 0–100 %.');
  if (pol.excuses.makeupDays < 1 || pol.excuses.makeupDays > 180) return fail('Lhůta pro náhradu musí být 1–180 dní.');
  if (s.bookingRules.minNoticeMin < 0) return fail('Minimální předstih nesmí být záporný.');
  if (s.bookingRules.horizonDays < 1 || s.bookingRules.horizonDays > 365) return fail('Horizont rezervací musí být 1–365 dní.');
  if (patch.simulatedNow !== undefined && patch.simulatedNow !== null && !isValidLocalDateTime(patch.simulatedNow)) return fail('Neplatný testovací čas.');
  if (Object.keys(patch).some((k) => k !== 'simulatedNow')) audit(d, ctx, 'Nastavení', Object.keys(patch).join(', '));
  return ok(undefined);
};

export const updateTemplate: Command<{ key: TemplateKey; patch: Partial<Omit<MessageTemplate, 'key'>> }> = (d, input, ctx) => {
  const denied = requireStaff(ctx);
  if (denied) return fail(denied);
  const t = d.templates.find((x) => x.key === input.key);
  if (!t) return fail('Šablona neexistuje.');
  Object.assign(t, input.patch);
  return ok(undefined);
};

/* ------------------------------------------------------------------ */
/* Komunikace                                                          */
/* ------------------------------------------------------------------ */

export const saveCampaign: Command<Campaign, Id> = (d, input, ctx) => {
  const denied = requireStaff(ctx);
  if (denied) return fail(denied);
  if (!input.name.trim()) return fail('Zadejte název kampaně.');
  const i = d.campaigns.findIndex((c) => c.id === input.id);
  const next: Campaign = { ...input, updatedAt: ctx.now };
  if (i >= 0) {
    if (d.campaigns[i].status === 'sent') return fail('Odeslanou kampaň už nelze upravit.');
    d.campaigns[i] = next;
    return ok(next.id);
  }
  const id = input.id || newId('cmp');
  d.campaigns.push({ ...next, id, createdAt: ctx.now });
  return ok(id);
};

export const deleteCampaign: Command<{ campaignId: Id }> = (d, input, ctx) => {
  const denied = requireStaff(ctx);
  if (denied) return fail(denied);
  const i = d.campaigns.findIndex((c) => c.id === input.campaignId);
  if (i < 0) return fail('Kampaň neexistuje.');
  if (d.campaigns[i].status === 'sent') return fail('Odeslanou kampaň nelze smazat.');
  d.campaigns.splice(i, 1);
  return ok(undefined);
};

export function deliverCampaign(d: ClinicState, ctx: Ctx, campaign: Campaign): number {
  const ids = evaluateSegment(d, campaign.segment, ctx.now);
  let sent = 0;
  for (const clientId of ids) {
    const c = getClient(d, clientId);
    if (!c || !c.email || !c.consents.marketingEmail) continue;
    d.messages.push({
      id: newId('m'),
      clientId,
      channel: 'email',
      kind: 'campaign',
      subject: campaign.subject.replace(/\[jméno\]/g, c.firstName),
      body: campaignPlainText(campaign, { jméno: c.firstName, klinika: d.settings.clinicName }),
      at: ctx.now,
      status: 'sent',
      campaignId: campaign.id,
    });
    sent++;
  }
  campaign.status = 'sent';
  campaign.sentAt = ctx.now;
  campaign.recipients = sent;
  return sent;
}

export const sendCampaign: Command<{ campaignId: Id }, number> = (d, input, ctx) => {
  const denied = requireStaff(ctx);
  if (denied) return fail(denied);
  const c = d.campaigns.find((x) => x.id === input.campaignId);
  if (!c) return fail('Kampaň neexistuje.');
  if (c.status === 'sent') return fail('Kampaň už byla odeslána.');
  if (!c.subject.trim()) return fail('Doplňte předmět e-mailu.');
  if (!c.blocks.length) return fail('E-mail nemá žádný obsah.');
  const sent = deliverCampaign(d, ctx, c);
  if (!sent) return fail('Segment neobsahuje žádného klienta se souhlasem s obchodními sděleními.');
  audit(d, ctx, 'Odeslání kampaně', `${c.name} · ${sent} příjemců`);
  return ok(sent, [`Odesláno ${countLabel(sent, ['příjemci', 'příjemcům', 'příjemcům'])} (simulace odeslání).`]);
};

export const scheduleCampaign: Command<{ campaignId: Id; at: LocalDateTime | null }> = (d, input, ctx) => {
  const denied = requireStaff(ctx);
  if (denied) return fail(denied);
  const c = d.campaigns.find((x) => x.id === input.campaignId);
  if (!c) return fail('Kampaň neexistuje.');
  if (c.status === 'sent') return fail('Kampaň už byla odeslána.');
  if (input.at && input.at <= ctx.now) return fail('Čas odeslání musí být v budoucnu.');
  c.scheduledAt = input.at;
  c.status = input.at ? 'scheduled' : 'draft';
  return ok(undefined);
};

export const sendManualMessage: Command<{ clientId: Id; channel: Channel; subject: string; body: string }, Id> = (d, input, ctx) => {
  const denied = requireStaff(ctx);
  if (denied) return fail(denied);
  const c = getClient(d, input.clientId);
  if (!c) return fail('Klient neexistuje.');
  if (!input.body.trim()) return fail('Zpráva je prázdná.');
  if (input.channel === 'email' && !c.email) return fail('Klient nemá e-mail.');
  if (input.channel === 'sms' && !c.phone) return fail('Klient nemá telefon.');
  const msg = addManualMessage(d, { clientId: c.id, channel: input.channel, subject: input.subject.trim(), body: input.body.trim(), now: ctx.now });
  audit(d, ctx, 'Zpráva klientovi', input.subject || input.channel, { clientId: c.id });
  return ok(msg.id, ['Zpráva odeslána (simulace).']);
};

/* ------------------------------------------------------------------ */
/* Testovací hodiny                                                    */
/* ------------------------------------------------------------------ */

export const setSimulatedNow: Command<{ value: LocalDateTime | null }> = (d, input) => {
  if (input.value !== null && !isValidLocalDateTime(input.value)) return fail('Neplatný čas.');
  d.settings.simulatedNow = input.value;
  return ok(undefined);
};

/** Doplňkové dotazy pro UI */
export function bookingTitle(s: ClinicState, b: Booking): string {
  const svc = getService(s, b.serviceId);
  const client = getClient(s, b.clientId);
  return `${client ? client.firstName + ' ' + client.lastName : ''} · ${svc?.name ?? ''}`;
}

export function minutesToStart(b: Booking, now: LocalDateTime): number {
  return diffMinutes(b.start, now);
}

export { getBooking, getMakeup };
