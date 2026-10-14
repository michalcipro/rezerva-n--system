/**
 * Čisté pomocné funkce oblasti Klienti (bez Reactu) nad `ClinicState`.
 * Doplňují selektory enginu o hromadné souhrny pro seznam a o texty pro detail.
 */
import type {
  AuditEntry,
  Booking,
  CancellationPolicy,
  Client,
  ClientPackage,
  ClinicState,
  Id,
  LedgerEntry,
  LedgerKind,
  LocalDate,
  LocalDateTime,
  MakeupRight,
  Message,
  MoneyMethod,
  PaymentPurpose,
} from '../../domain/types';
import { countLabel, formatDayShort, formatMoney, formatPercent, formatTime } from '../../engine/format';
import { evaluateCancellation } from '../../engine/policy';
import {
  bookingsOfClient,
  getBooking,
  getPackage,
  getService,
  packageUsage,
  packageValidUntil,
  type PackageUsage,
} from '../../engine/selectors';
import { addDays, dateOf, daysBetween } from '../../engine/time';

/* ------------------------------------------------------------------ */
/* Text a hledání                                                      */
/* ------------------------------------------------------------------ */

/** Malá písmena bez diakritiky – pro hledání „dvorak“ → „Dvořák“. */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export const digitsOf = (text: string): string => text.replace(/\D/g, '');

export const csCollator = new Intl.Collator('cs', { sensitivity: 'base' });

/* ------------------------------------------------------------------ */
/* Souhrn klientů pro seznam (jeden průchod daty)                      */
/* ------------------------------------------------------------------ */

export interface PackageInfo {
  pkg: ClientPackage;
  usage: PackageUsage;
}

export interface ClientRow {
  client: Client;
  name: string;
  /** Normalizovaný text pro hledání (jméno v obou pořadích, e-mail, telefon). */
  haystack: string;
  visits: number;
  lastVisit: LocalDateTime | null;
  next: Booking | null;
  credit: number;
  spent: number;
  debt: number;
  noShows90: number;
  lateCancels12m: number;
  /** Aktivní permanentky (platné, s volnými nebo rezervovanými vstupy). */
  packages: PackageInfo[];
  isNew: boolean;
}

/**
 * Souhrn všech klientů najednou: O(rezervace + platby + kredit + permanentky).
 * `clientSummary` z enginu by u stovek klientů procházel platby a kredit pro každého zvlášť.
 */
export function buildClientRows(s: ClinicState, now: LocalDateTime): ClientRow[] {
  const today = dateOf(now);
  const d90 = addDays(now, -90);
  const d365 = addDays(now, -365);
  const new30 = addDays(now, -30);

  const rows = new Map<Id, ClientRow>();
  for (const c of s.clients) {
    const name = c.firstName + ' ' + c.lastName;
    rows.set(c.id, {
      client: c,
      name,
      haystack: normalize(`${name} ${c.lastName} ${c.firstName} ${c.email}`) + ' ' + digitsOf(c.phone),
      visits: 0,
      lastVisit: null,
      next: null,
      credit: 0,
      spent: 0,
      debt: 0,
      noShows90: 0,
      lateCancels12m: 0,
      packages: [],
      isNew: c.createdAt >= new30,
    });
  }

  for (const e of s.ledger) {
    const r = rows.get(e.clientId);
    if (r) r.credit += e.amount;
  }
  for (const p of s.payments) {
    const r = rows.get(p.clientId);
    if (r) r.spent += p.amount;
  }
  for (const b of s.bookings) {
    const r = rows.get(b.clientId);
    if (!r) continue;
    if (b.status === 'completed') {
      r.visits++;
      if (!r.lastVisit || b.start > r.lastVisit) r.lastVisit = b.start;
      if (!b.payment.paid && b.payment.method === 'onsite') r.debt += b.price - b.payment.paidAmount;
    } else if (b.status === 'confirmed' && b.end > now) {
      if (!r.next || b.start < r.next.start) r.next = b;
    } else if (b.status === 'no_show' && b.start >= d90) {
      r.noShows90++;
    } else if (b.status === 'late_cancelled' && (b.cancel?.at ?? b.start) >= d365) {
      r.lateCancels12m++;
    }
    if (b.fee?.status === 'due') r.debt += b.fee.amount;
  }
  for (const p of s.packages) {
    if (p.cancelled || packageValidUntil(p) < today) continue;
    const r = rows.get(p.clientId);
    if (!r) continue;
    const usage = packageUsage(s, p, today);
    if (!usage.expired && usage.free + usage.reserved > 0) r.packages.push({ pkg: p, usage });
  }

  const out: ClientRow[] = [];
  for (const r of rows.values()) {
    r.credit = Math.round(r.credit);
    r.spent = Math.round(r.spent);
    r.debt = Math.round(r.debt);
    r.packages.sort((a, b) => (a.usage.validUntil < b.usage.validUntil ? -1 : 1));
    out.push(r);
  }
  return out;
}

export type ClientFilter = 'package' | 'credit' | 'debt' | 'noMarketing' | 'new' | 'blocked';
export type ClientSort = 'lastVisit' | 'name' | 'spent' | 'created';
export type SortDir = 'asc' | 'desc';

export const FILTER_LABEL: Record<ClientFilter, string> = {
  package: 'S aktivní permanentkou',
  credit: 'S kreditem',
  debt: 'S dluhem',
  noMarketing: 'Bez souhlasu s marketingem',
  new: 'Noví za 30 dní',
  blocked: 'Zablokované rezervace',
};

export function matchesFilter(r: ClientRow, f: ClientFilter): boolean {
  switch (f) {
    case 'package':
      return r.packages.length > 0;
    case 'credit':
      return r.credit > 0;
    case 'debt':
      return r.debt > 0;
    case 'noMarketing':
      return !r.client.consents.marketingEmail;
    case 'new':
      return r.isNew;
    case 'blocked':
      return r.client.blocked;
    default:
      return true;
  }
}

/** Všechna slova dotazu musí být v textu klienta (bez diakritiky; telefon i bez mezer). */
export function matchesQuery(r: ClientRow, query: string): boolean {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  return tokens.every((t) => r.haystack.includes(t) || (/\d/.test(t) && digitsOf(r.client.phone).includes(digitsOf(t))));
}

/** Výchozí směr řazení podle sloupce. */
export const DEFAULT_DIR: Record<ClientSort, SortDir> = { lastVisit: 'desc', name: 'asc', spent: 'desc', created: 'desc' };

export function compareRows(a: ClientRow, b: ClientRow, sort: ClientSort, dir: SortDir): number {
  const sign = dir === 'asc' ? 1 : -1;
  const byName = csCollator.compare(a.client.lastName, b.client.lastName) || csCollator.compare(a.client.firstName, b.client.firstName);
  let diff = 0;
  switch (sort) {
    case 'name':
      return sign * byName;
    case 'spent':
      diff = a.spent - b.spent;
      break;
    case 'created':
      diff = a.client.createdAt < b.client.createdAt ? -1 : a.client.createdAt > b.client.createdAt ? 1 : 0;
      break;
    case 'lastVisit': {
      // Klienti bez návštěvy vždy na konci.
      if (!a.lastVisit && !b.lastVisit) return byName;
      if (!a.lastVisit) return 1;
      if (!b.lastVisit) return -1;
      diff = a.lastVisit < b.lastVisit ? -1 : a.lastVisit > b.lastVisit ? 1 : 0;
      break;
    }
    default:
      break;
  }
  return diff !== 0 ? sign * diff : byName;
}

export function allTags(s: ClinicState): string[] {
  const set = new Set<string>();
  for (const c of s.clients) for (const t of c.tags) set.add(t);
  return [...set].sort((a, b) => csCollator.compare(a, b));
}

/* ------------------------------------------------------------------ */
/* Permanentky                                                         */
/* ------------------------------------------------------------------ */

export type PackageState = 'active' | 'used_up' | 'expired' | 'cancelled';

export function packageState(p: ClientPackage, u: PackageUsage): PackageState {
  if (p.cancelled) return 'cancelled';
  if (u.expired) return 'expired';
  if (u.free + u.reserved === 0) return 'used_up';
  return 'active';
}

export const PACKAGE_STATE_LABEL: Record<PackageState, string> = {
  active: 'Aktivní',
  used_up: 'Vyčerpaná',
  expired: 'Prošlá',
  cancelled: 'Zrušená',
};

/** Pořadí vstupu z permanentky („vstup 5/10“) podle data termínu. */
export function packageEntryNumber(s: ClinicState, b: Booking): { n: number; total: number } | null {
  const pkgId = b.payment.packageId;
  if (!pkgId) return null;
  const pkg = getPackage(s, pkgId);
  if (!pkg) return null;
  const consuming = bookingsOfClient(s, b.clientId).filter(
    (x) =>
      x.payment.packageId === pkgId &&
      (x.status === 'completed' || x.status === 'confirmed' || x.status === 'no_show' || (x.status === 'late_cancelled' && x.fee?.settledBy === 'package_entry')),
  );
  const i = consuming.findIndex((x) => x.id === b.id);
  if (i < 0) return null;
  return { n: i + 1, total: pkg.entriesTotal };
}

export function daysLeftLabel(validUntil: LocalDate, today: LocalDate): string {
  const days = daysBetween(today, validUntil);
  if (days < 0) return 'platnost skončila';
  if (days === 0) return 'končí dnes';
  return 'zbývá ' + countLabel(days, ['den', 'dny', 'dní']);
}

/* ------------------------------------------------------------------ */
/* Peníze a texty k rezervacím                                         */
/* ------------------------------------------------------------------ */

export const MONEY_METHOD_LABEL: Record<MoneyMethod | 'credit', string> = {
  card: 'kartou',
  cash: 'hotově',
  transfer: 'převodem',
  online: 'online',
  credit: 'z kreditu',
};

/** Krátký popis platby a dopadů pro tabulky („permanentka 4/10“, „−545 Kč z kreditu (50 %)“). */
export function bookingMoneyNote(s: ClinicState, b: Booking): string {
  const parts: string[] = [];
  const entry = packageEntryNumber(s, b);
  const pkg = b.payment.packageId ? getPackage(s, b.payment.packageId) : undefined;

  if (b.makeupForBookingId) {
    const src = getBooking(s, b.makeupForBookingId);
    parts.push(src ? `náhradní termín za ${formatDayShort(src.start)}` : 'náhradní termín');
  }

  switch (b.status) {
    case 'excused': {
      if (b.payment.packageId && pkg) {
        const excused = bookingsOfClient(s, b.clientId).filter((x) => x.payment.packageId === pkg.id && x.status === 'excused');
        const ordinal = excused.findIndex((x) => x.id === b.id) + 1;
        parts.push(`omluvenka ${ordinal}/${pkg.excusesAllowed} · vstup vrácen`);
      } else {
        parts.push('omluvenka');
      }
      const right = s.makeups.find((m) => m.sourceBookingId === b.id);
      if (right) parts.push(makeupStatusNote(right));
      return parts.join(' · ');
    }
    case 'cancelled':
    case 'clinic_cancelled':
      if (b.payment.method === 'package') parts.push('vstup vrácen');
      else if (b.payment.paidAmount > 0 && b.payment.method !== 'makeup') parts.push(`${formatMoney(b.payment.paidAmount)} vráceno na kredit`);
      else parts.push('bez poplatku');
      return parts.join(' · ');
    case 'late_cancelled':
    case 'no_show': {
      const fee = b.fee;
      if (!fee) {
        parts.push('bez poplatku');
      } else if (fee.status === 'waived') {
        parts.push(fee.waivedReason === 'První pozdní storno zdarma' ? 'první pozdní storno zdarma' : 'poplatek odpuštěn');
      } else if (fee.settledBy === 'package_entry') {
        parts.push(b.payment.method === 'makeup' ? 'náhrada propadla' : 'vstup propadl');
      } else if (fee.status === 'due') {
        parts.push(`poplatek ${formatMoney(fee.amount)} k úhradě`);
      } else {
        const how = fee.settledBy ? ' ' + MONEY_METHOD_LABEL[fee.settledBy] : '';
        parts.push(`−${formatMoney(fee.amount)}${how} (${formatPercent(fee.pct)})`);
      }
      return parts.join(' · ');
    }
    default:
      break;
  }

  switch (b.payment.method) {
    case 'package':
      parts.push(entry ? `permanentka ${entry.n}/${entry.total}` : 'permanentka');
      break;
    case 'makeup':
      if (entry) parts.push(`${entry.n}/${entry.total}`);
      else if (b.payment.paidAmount > 0 && b.payment.paidAmount < b.price) parts.push(`doplatek ${formatMoney(b.price - b.payment.paidAmount)}`);
      break;
    case 'credit':
      parts.push(`${formatMoney(b.payment.paidAmount || b.price)} z kreditu`);
      break;
    case 'online':
      parts.push(`${formatMoney(b.payment.paidAmount || b.price)} online`);
      break;
    case 'free':
      parts.push('zdarma');
      break;
    case 'onsite':
    default:
      if (b.payment.paid) parts.push(`${formatMoney(b.price)} ${b.payment.settledBy ? MONEY_METHOD_LABEL[b.payment.settledBy] : 'zaplaceno'}`);
      else if (b.status === 'completed') parts.push(`${formatMoney(b.price - b.payment.paidAmount)} neuhrazeno`);
      else parts.push(`na místě ${formatMoney(b.price)}`);
      break;
  }
  return parts.join(' · ');
}

/** Popis platby u nadcházejícího termínu („permanentka (vstup 5/10)“, „platba na místě 1 090 Kč“). */
export function upcomingPaymentNote(s: ClinicState, b: Booking): string {
  const entry = packageEntryNumber(s, b);
  switch (b.payment.method) {
    case 'package':
      return entry ? `permanentka (vstup ${entry.n}/${entry.total})` : 'permanentka';
    case 'makeup':
      return entry ? `náhrada (vstup ${entry.n}/${entry.total})` : 'náhradní termín';
    case 'credit':
      return `z kreditu ${formatMoney(b.payment.paidAmount)}`;
    case 'online':
      return `zaplaceno online ${formatMoney(b.payment.paidAmount)}`;
    case 'free':
      return 'zdarma';
    default:
      return `platba na místě ${formatMoney(b.price)}`;
  }
}

export function makeupStatusNote(m: MakeupRight): string {
  switch (m.status) {
    case 'open':
      return `náhrada do ${formatDayShort(m.validUntil)}`;
    case 'used':
      return 'náhrada vyčerpána';
    case 'expired':
      return 'náhrada propadla';
    default:
      return 'náhrada zrušena';
  }
}

export interface StornoChip {
  tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  text: string;
  /** Výrazný štítek (pozdní storno) vs. tečka a text (zdarma). */
  emphasis: boolean;
}

/** Čip storno stavu nadcházejícího termínu z pohledu recepce. */
export function stornoChip(s: ClinicState, b: Booking, now: LocalDateTime): StornoChip {
  const ev = evaluateCancellation(s, b, now, 'staff');
  switch (ev.phase) {
    case 'free':
      return { tone: 'success', text: `Zdarma zrušitelné do ${formatDayShort(ev.freeUntil)} ${formatTime(ev.freeUntil)}`, emphasis: false };
    case 'late': {
      if (ev.feePct <= 0) return { tone: 'neutral', text: 'Po lhůtě · bez poplatku', emphasis: true };
      let text = `Storno teď ${formatPercent(ev.feePct)}`;
      if (ev.excuse.allowed) text += ` · lze omluvit (zbývá ${ev.excuse.remaining})`;
      else if (ev.grace) text += ' · první pozdní storno zdarma';
      return { tone: ev.feePct >= 100 ? 'danger' : 'warning', text, emphasis: true };
    }
    case 'started':
      return { tone: 'info', text: 'Právě probíhá', emphasis: true };
    default:
      return { tone: 'neutral', text: 'Čeká na zápis docházky', emphasis: true };
  }
}

/* ------------------------------------------------------------------ */
/* Dluh                                                                */
/* ------------------------------------------------------------------ */

export interface DebtItem {
  kind: 'fee' | 'visit';
  booking: Booking;
  amount: number;
  label: string;
}

/** Neuhrazené poplatky a neuhrazené proběhlé termíny (stejná definice jako `clientSummary.debt`). */
export function debtItems(s: ClinicState, clientId: Id): DebtItem[] {
  const out: DebtItem[] = [];
  for (const b of bookingsOfClient(s, clientId)) {
    const svc = getService(s, b.serviceId)?.name ?? 'Termín';
    if (b.fee?.status === 'due') {
      out.push({
        kind: 'fee',
        booking: b,
        amount: b.fee.amount,
        label: `${b.fee.reason === 'no_show' ? 'Poplatek za nedostavení' : 'Storno poplatek'} · ${svc} ${formatDayShort(b.start)}`,
      });
    }
    if (b.status === 'completed' && b.payment.method === 'onsite' && !b.payment.paid) {
      out.push({ kind: 'visit', booking: b, amount: b.price - b.payment.paidAmount, label: `Neuhrazený termín · ${svc} ${formatDayShort(b.start)}` });
    }
  }
  return out.sort((a, b) => (a.booking.start < b.booking.start ? 1 : -1));
}

/* ------------------------------------------------------------------ */
/* Kredit a platby                                                     */
/* ------------------------------------------------------------------ */

export const LEDGER_KIND_LABEL: Record<LedgerKind, string> = {
  topup: 'Dobití',
  bonus: 'Bonus za dobití',
  booking_payment: 'Platba termínu',
  refund: 'Vrácení na kredit',
  storno_fee: 'Poplatek',
  package_purchase: 'Nákup permanentky',
  adjustment: 'Ruční úprava',
};

export function ledgerOfClient(s: ClinicState, clientId: Id): LedgerEntry[] {
  return s.ledger.filter((e) => e.clientId === clientId).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

/** Pohyby kreditu (nejnovější první) se zůstatkem po každém pohybu. */
export function ledgerWithBalance(s: ClinicState, clientId: Id): { entry: LedgerEntry; balance: number }[] {
  const chronological = ledgerOfClient(s, clientId).slice().reverse();
  let balance = 0;
  const out = chronological.map((entry) => {
    balance += entry.amount;
    return { entry, balance: Math.round(balance) };
  });
  return out.reverse();
}

export const PAYMENT_PURPOSE_LABEL: Record<PaymentPurpose, string> = {
  booking: 'Termín',
  package: 'Permanentka',
  credit_topup: 'Dobití kreditu',
  storno_fee: 'Storno poplatek',
};

/* ------------------------------------------------------------------ */
/* Omluvenky bez konkrétního termínu                                   */
/* ------------------------------------------------------------------ */

export interface ClientExcuses {
  /** Omluvenky pro termíny placené jinak než permanentkou (X za Y měsíců). */
  perClient: { total: number; used: number; remaining: number; months: number };
  /** Omluvenky aktivních permanentek. */
  packages: { pkg: ClientPackage; total: number; used: number; remaining: number }[];
}

/** Obdoba `excuseStatusFor` bez konkrétní rezervace (pro kartu klienta). */
export function clientExcuses(s: ClinicState, clientId: Id, now: LocalDateTime, active: PackageInfo[]): ClientExcuses {
  const policy = s.settings.policy.excuses;
  const since = addDays(now, -Math.round(policy.perClientMonths * 30.4));
  const used = bookingsOfClient(s, clientId).filter(
    (b) => b.status === 'excused' && b.cancel?.excuse && !b.payment.packageId && b.cancel.at >= since,
  ).length;
  return {
    perClient: { total: policy.perClientCount, used, remaining: Math.max(0, policy.perClientCount - used), months: policy.perClientMonths },
    packages: active.map(({ pkg, usage }) => ({ pkg, total: pkg.excusesAllowed, used: usage.excusesUsed, remaining: usage.excusesLeft })),
  };
}

export function makeupsOfClient(s: ClinicState, clientId: Id): MakeupRight[] {
  return s.makeups.filter((m) => m.clientId === clientId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/* ------------------------------------------------------------------ */
/* Komunikace a historie změn                                          */
/* ------------------------------------------------------------------ */

export function messagesOfClient(s: ClinicState, clientId: Id): Message[] {
  return s.messages.filter((m) => m.clientId === clientId).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

export function messageKindLabel(s: ClinicState, m: Message): string {
  if (m.kind === 'manual') return 'Zpráva od kliniky';
  if (m.kind === 'campaign') {
    const c = m.campaignId ? s.campaigns.find((x) => x.id === m.campaignId) : undefined;
    return c ? `Kampaň „${c.name}“` : 'Kampaň';
  }
  return s.templates.find((t) => t.key === m.kind)?.name ?? 'Automatická zpráva';
}

export function auditOfClient(s: ClinicState, clientId: Id): AuditEntry[] {
  const bookingIds = new Set(bookingsOfClient(s, clientId).map((b) => b.id));
  return s.audit
    .filter((a) => a.clientId === clientId || (!!a.bookingId && bookingIds.has(a.bookingId)))
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

/* ------------------------------------------------------------------ */
/* Storno podmínky srozumitelně                                        */
/* ------------------------------------------------------------------ */

export interface PolicyLine {
  strong: string;
  text: string;
}

export function policyLines(p: CancellationPolicy): PolicyLine[] {
  const free = p.freeCancelHours;
  const tiers = [...p.lateTiers].filter((t) => t.hoursBefore <= free).sort((a, b) => b.hoursBefore - a.hoursBefore);
  const lines: PolicyLine[] = [{ strong: 'Zdarma', text: `do ${free} h před termínem` }];
  if (!tiers.length || tiers[0].hoursBefore < free) {
    const pct = tiers[0]?.feePct ?? 100;
    const to = tiers[0]?.hoursBefore ?? 0;
    lines.push({ strong: to > 0 ? `${free}–${to} h:` : `Méně než ${free} h:`, text: formatPercent(pct) });
  }
  tiers.forEach((t, i) => {
    const next = tiers[i + 1];
    const label = next ? `${t.hoursBefore}–${next.hoursBefore} h:` : `Méně než ${t.hoursBefore} h:`;
    lines.push({ strong: label, text: formatPercent(t.feePct) });
  });
  lines.push({
    strong: 'Nedostavení:',
    text: formatPercent(p.noShowFeePct) + (p.packageLateHandling === 'forfeit_entry' ? ' (vstup z permanentky propadá)' : ''),
  });
  if (p.excuses.enabled) {
    lines.push({ strong: 'Omluvenka', text: `ruší sankci · náhradní termín do ${countLabel(p.excuses.makeupDays, ['dne', 'dnů', 'dnů'])}` });
  }
  if (p.groupCancelHours) lines.push({ strong: 'Skupinové lekce:', text: `zdarma do ${p.groupCancelHours} h předem` });
  return lines;
}

/** Barevné úseky storno podmínek pro mini osu (zdarma → částečně → plně). */
export function policyBar(p: CancellationPolicy): ('free' | 'partial' | 'full')[] {
  const tiers = [...p.lateTiers].filter((t) => t.hoursBefore <= p.freeCancelHours).sort((a, b) => b.hoursBefore - a.hoursBefore);
  const out: ('free' | 'partial' | 'full')[] = ['free'];
  if (!tiers.length || tiers[0].hoursBefore < p.freeCancelHours) out.push((tiers[0]?.feePct ?? 100) >= 100 ? 'full' : 'partial');
  for (const t of tiers) out.push(t.feePct >= 100 ? 'full' : t.feePct > 0 ? 'partial' : 'free');
  return out;
}

/* ------------------------------------------------------------------ */
/* Ostatní                                                             */
/* ------------------------------------------------------------------ */

export function ageOf(birthDate: LocalDate, today: LocalDate): number {
  const y = Number(today.slice(0, 4)) - Number(birthDate.slice(0, 4));
  return today.slice(5) >= birthDate.slice(5) ? y : y - 1;
}

export const SOURCE_LABEL: Record<Client['source'], string> = {
  online: 'Online rezervace',
  recepce: 'Recepce',
  telefon: 'Telefon',
  doporučení: 'Doporučení',
};
