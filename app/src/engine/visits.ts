import type { Booking, ClinicState, Id, LocalDate, LocalDateTime, MoneyMethod, PaymentRequest } from '../domain/types';
import { formatDateTimeShort, formatDayShort, formatMoney, prepZ } from './format';
import { getMakeup, getPackage, getService, packageUsage } from './selectors';
import { dateOf } from './time';

/**
 * Přehled vstupů: každý termín (individuální i skupinový) s tím, čím je zaplacený –
 * z permanentky, z kreditu, jednorázově, náhradou, nebo zdarma – a jestli je platba vyrovnaná.
 */

/** Čím je vstup placený. „Předplaceno“ = permanentka, kredit, náhrada za předplacený termín. */
export type VisitKind = 'package' | 'credit' | 'single' | 'makeup' | 'free';

/** Stav platby: zaplaceno · zaplatí na místě (budoucí termín) · čeká na QR platbu · nezaplaceno (po termínu). */
export type VisitPayState = 'paid' | 'onsite' | 'qr_pending' | 'unpaid';

/** Stav termínu pro přehled: plánovaný · proběhlý · nedostavení / pozdní storno. */
export type VisitStatus = 'planned' | 'done' | 'missed';

export const VISIT_KIND_LABEL: Record<VisitKind, string> = {
  package: 'Permanentka',
  credit: 'Kredit',
  single: 'Jednorázově',
  makeup: 'Náhrada',
  free: 'Zdarma',
};

export const VISIT_KINDS: VisitKind[] = ['package', 'credit', 'single', 'makeup', 'free'];

export const VISIT_PAY_STATE_LABEL: Record<VisitPayState, string> = {
  paid: 'Zaplaceno',
  onsite: 'Zaplatí na místě',
  qr_pending: 'Čeká na QR platbu',
  unpaid: 'Nezaplaceno',
};

export const VISIT_STATUS_LABEL: Record<VisitStatus, string> = {
  planned: 'Plánovaný',
  done: 'Proběhlý',
  missed: 'Nedostavení / pozdní storno',
};

export interface VisitPaymentInfo {
  kind: VisitKind;
  payState: VisitPayState;
  /** Krátký štítek, např. „Permanentka“, „Jednorázově“. */
  label: string;
  /** Podrobnost, např. „Fyzio 10 · vstup 3 z 10“, „kartou na místě“, „QR platba · VS 26110007“. */
  detail: string;
  /** Kč: u jednorázových cena termínu, u permanentky hodnota jednoho vstupu, u kreditu stržená částka. */
  amount: number;
  /** Placeno předem (permanentka, kredit, náhrada za předplacený termín). */
  prepaid: boolean;
  /** Čekající QR výzva k termínu (pokud je). */
  request?: PaymentRequest;
}

const SETTLED_LABEL: Record<MoneyMethod, string> = {
  cash: 'hotově na místě',
  card: 'kartou na místě',
  online: 'online kartou',
  transfer: 'převodem',
  qr: 'QR platbou',
};

/** Statusy, které se do přehledu vstupů počítají (zrušené a omluvené ne). */
export const VISIT_STATUSES: readonly Booking['status'][] = ['confirmed', 'completed', 'no_show', 'late_cancelled'];

export const visitStatusOf = (b: Booking): VisitStatus =>
  b.status === 'confirmed' ? 'planned' : b.status === 'completed' ? 'done' : 'missed';

/** Spotřebovává termín vstup z permanentky? (stejně jako packageUsage) */
function consumesEntry(b: Booking): boolean {
  if (b.status === 'completed' || b.status === 'no_show' || b.status === 'confirmed') return true;
  return b.status === 'late_cancelled' && b.fee?.settledBy === 'package_entry';
}

/** Pořadí vstupů každé permanentky (id rezervace → pořadí od 1). */
export function packageEntryIndex(s: ClinicState): Map<Id, number> {
  const byPackage = new Map<Id, Booking[]>();
  for (const b of s.bookings) {
    const pid = b.payment.packageId;
    if (!pid || !consumesEntry(b)) continue;
    const list = byPackage.get(pid);
    if (list) list.push(b);
    else byPackage.set(pid, [b]);
  }
  const index = new Map<Id, number>();
  for (const list of byPackage.values()) {
    list.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
    list.forEach((b, i) => index.set(b.id, i + 1));
  }
  return index;
}

function pendingRequestsByBooking(s: ClinicState): Map<Id, PaymentRequest> {
  const map = new Map<Id, PaymentRequest>();
  for (const r of s.paymentRequests) if (r.status === 'pending' && r.purpose === 'booking' && r.bookingId) map.set(r.bookingId, r);
  return map;
}

/** Text k poplatku u nedostavení / pozdního storna. */
function feeText(b: Booking): string {
  if (!b.fee) return '';
  if (b.fee.settledBy === 'package_entry') return 'vstup propadl';
  if (b.fee.status === 'waived') return 'poplatek odpuštěn';
  if (b.fee.amount <= 0) return 'bez poplatku';
  const what = b.fee.reason === 'no_show' ? 'poplatek za nedostavení' : 'storno poplatek';
  return `${what} ${formatMoney(b.fee.amount)} ${b.fee.status === 'paid' ? 'uhrazen' : 'neuhrazen'}`;
}

export interface VisitContext {
  entryIndex?: Map<Id, number>;
  pending?: Map<Id, PaymentRequest>;
}

/** Zdroj platby jednoho vstupu. */
export function visitPaymentInfo(s: ClinicState, b: Booking, today: LocalDate, now: LocalDateTime, vc: VisitContext = {}): VisitPaymentInfo {
  const p = b.payment;
  const request = (vc.pending ?? pendingRequestsByBooking(s)).get(b.id);
  const missed = b.status === 'no_show' || b.status === 'late_cancelled';
  const past = b.start <= now;
  let info: VisitPaymentInfo;

  switch (p.method) {
    case 'package': {
      const pkg = p.packageId ? getPackage(s, p.packageId) : undefined;
      const unit = pkg ? packageUsage(s, pkg, today).unitValue : 0;
      const n = (vc.entryIndex ?? packageEntryIndex(s)).get(b.id);
      const entry = pkg && n ? ` · vstup ${n} ${prepZ(pkg.entriesTotal)} ${pkg.entriesTotal}` : '';
      info = { kind: 'package', payState: 'paid', label: VISIT_KIND_LABEL.package, detail: `${pkg?.name ?? 'Permanentka'}${entry}`, amount: unit, prepaid: true };
      break;
    }
    case 'credit':
      info = { kind: 'credit', payState: 'paid', label: VISIT_KIND_LABEL.credit, detail: 'strženo z kreditu', amount: p.paidAmount || b.price, prepaid: true };
      break;
    case 'makeup': {
      const right = p.makeupId ? getMakeup(s, p.makeupId) : undefined;
      const source = right ? s.bookings.find((x) => x.id === right.sourceBookingId) : undefined;
      const pkg = p.packageId ? getPackage(s, p.packageId) : undefined;
      const from = pkg ? ` (permanentka ${pkg.name})` : right && right.value > 0 ? ' (předplaceno)' : '';
      const topUp = !pkg && right && right.value > 0 && right.value < b.price ? ` · doplatek ${formatMoney(b.price - right.value)} na místě` : '';
      info = {
        kind: 'makeup',
        payState: 'paid',
        label: VISIT_KIND_LABEL.makeup,
        detail: `${source ? `za ${formatDayShort(source.start)}` : 'náhradní termín'}${from}${topUp}`,
        amount: pkg ? packageUsage(s, pkg, today).unitValue : right?.value ?? 0,
        prepaid: !!pkg || (right?.value ?? 0) > 0,
      };
      break;
    }
    case 'free':
      info = { kind: 'free', payState: 'paid', label: VISIT_KIND_LABEL.free, detail: 'bez platby', amount: 0, prepaid: false };
      break;
    case 'online':
      info = { kind: 'single', payState: 'paid', label: VISIT_KIND_LABEL.single, detail: 'online kartou předem', amount: p.paidAmount || b.price, prepaid: false };
      break;
    case 'qr':
    case 'onsite':
    default: {
      if (p.paid) {
        info = { kind: 'single', payState: 'paid', label: VISIT_KIND_LABEL.single, detail: p.settledBy ? SETTLED_LABEL[p.settledBy] : 'zaplaceno', amount: p.paidAmount || b.price, prepaid: false };
      } else if (request) {
        const overdue = request.dueAt < now;
        info = {
          kind: 'single',
          payState: 'qr_pending',
          label: VISIT_KIND_LABEL.single,
          detail: `QR platba · VS ${request.vs}${overdue ? ' · po splatnosti' : ` · splatná do ${formatDateTimeShort(request.dueAt)}`}`,
          amount: b.price,
          prepaid: false,
          request,
        };
      } else if (missed) {
        info = { kind: 'single', payState: 'unpaid', label: VISIT_KIND_LABEL.single, detail: 'nezaplaceno', amount: b.price, prepaid: false };
      } else {
        const state: VisitPayState = past ? 'unpaid' : 'onsite';
        info = { kind: 'single', payState: state, label: VISIT_KIND_LABEL.single, detail: state === 'onsite' ? 'zaplatí na místě' : 'nezaplaceno', amount: b.price, prepaid: false };
      }
    }
  }

  if (missed) {
    const fee = feeText(b);
    // u nedostavení / pozdního storna platí klient poplatek – hodnotou vstupu je poplatek
    if (b.fee && b.fee.settledBy !== 'package_entry') {
      info.amount = b.fee.status === 'waived' ? 0 : b.fee.amount;
      if (info.kind === 'single') info.payState = b.fee.status === 'due' ? 'unpaid' : 'paid';
    }
    if (fee) info.detail = `${info.detail} · ${fee}`;
  }
  return info;
}

/* ------------------------------------------------------------------ */
/* Přehled za období                                                   */
/* ------------------------------------------------------------------ */

export interface VisitFilters {
  from: LocalDate;
  /** Konec období (exkluzivně). */
  to: LocalDate;
  /** null = všichni zaměstnanci */
  therapistId: Id | null;
  serviceId: Id | null;
  /** null = všechny zdroje platby */
  kinds: VisitKind[] | null;
  status: VisitStatus | 'all';
  /** Jen termíny, které ještě nejsou zaplacené (nezaplaceno + čeká na QR). */
  unpaidOnly: boolean;
}

export interface VisitRow {
  booking: Booking;
  info: VisitPaymentInfo;
  status: VisitStatus;
}

export interface VisitSummary {
  /** null = součet za všechny zaměstnance */
  therapistId: Id | null;
  total: number;
  byKind: Record<VisitKind, number>;
  /** Předplacené vstupy (permanentka, kredit, náhrada za předplacený termín). */
  prepaid: number;
  /** Jednorázové vstupy. */
  single: number;
  /** Ještě nezaplacené (nezaplaceno po termínu + čekající QR). */
  unpaid: number;
  /** Plánované, které klient zaplatí na místě. */
  onsite: number;
  /** Tržba z jednorázových vstupů (Kč, zaplacené). */
  singleRevenue: number;
  /** Hodnota předplacených vstupů (Kč). */
  prepaidValue: number;
}

export function emptyVisitSummary(therapistId: Id | null): VisitSummary {
  return {
    therapistId,
    total: 0,
    byKind: { package: 0, credit: 0, single: 0, makeup: 0, free: 0 },
    prepaid: 0,
    single: 0,
    unpaid: 0,
    onsite: 0,
    singleRevenue: 0,
    prepaidValue: 0,
  };
}

function addToSummary(sum: VisitSummary, row: VisitRow): void {
  const { info } = row;
  sum.total++;
  sum.byKind[info.kind]++;
  if (info.prepaid) {
    sum.prepaid++;
    sum.prepaidValue += info.amount;
  }
  if (info.kind === 'single') {
    sum.single++;
    if (info.payState === 'paid') sum.singleRevenue += info.amount;
  }
  if (info.payState === 'unpaid' || info.payState === 'qr_pending') sum.unpaid++;
  if (info.payState === 'onsite') sum.onsite++;
}

export interface VisitsOverview {
  rows: VisitRow[];
  /** Řádek za každého aktivního zaměstnance (i bez vstupů) + neaktivní, kteří v období měli vstupy. */
  byEmployee: VisitSummary[];
  totals: VisitSummary;
}

export function visitsOverview(s: ClinicState, f: VisitFilters, today: LocalDate, now: LocalDateTime): VisitsOverview {
  const vc: VisitContext = { entryIndex: packageEntryIndex(s), pending: pendingRequestsByBooking(s) };
  const rows: VisitRow[] = [];
  for (const b of s.bookings) {
    const day = dateOf(b.start);
    if (day < f.from || day >= f.to) continue;
    if (!VISIT_STATUSES.includes(b.status)) continue;
    if (f.therapistId && b.therapistId !== f.therapistId) continue;
    if (f.serviceId && b.serviceId !== f.serviceId) continue;
    const status = visitStatusOf(b);
    if (f.status !== 'all' && status !== f.status) continue;
    const info = visitPaymentInfo(s, b, today, now, vc);
    if (f.kinds && !f.kinds.includes(info.kind)) continue;
    if (f.unpaidOnly && info.payState !== 'unpaid' && info.payState !== 'qr_pending') continue;
    rows.push({ booking: b, info, status });
  }
  rows.sort((a, b) => (a.booking.start < b.booking.start ? -1 : a.booking.start > b.booking.start ? 1 : a.booking.id < b.booking.id ? -1 : 1));

  const totals = emptyVisitSummary(null);
  const map = new Map<Id, VisitSummary>();
  for (const t of [...s.therapists].sort((a, b) => a.order - b.order)) {
    if (t.active && (!f.therapistId || f.therapistId === t.id)) map.set(t.id, emptyVisitSummary(t.id));
  }
  for (const row of rows) {
    let sum = map.get(row.booking.therapistId);
    if (!sum) {
      sum = emptyVisitSummary(row.booking.therapistId);
      map.set(row.booking.therapistId, sum);
    }
    addToSummary(sum, row);
    addToSummary(totals, row);
  }
  return { rows, byEmployee: [...map.values()], totals };
}

/** Název služby / lekce pro řádek přehledu. */
export function visitTitle(s: ClinicState, b: Booking): string {
  return getService(s, b.serviceId)?.name ?? 'Služba';
}

/* ------------------------------------------------------------------ */
/* Export CSV                                                          */
/* ------------------------------------------------------------------ */

const csvCell = (v: string | number): string => {
  const t = String(v);
  return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

/** CSV pro Excel: středník jako oddělovač, UTF-8 s BOM. */
export function visitsCsv(
  s: ClinicState,
  rows: VisitRow[],
  names: { client: (id: Id) => string; therapist: (id: Id) => string },
): string {
  const head = ['Datum', 'Čas', 'Klient', 'Služba', 'Zaměstnanec', 'Stav', 'Zdroj platby', 'Stav platby', 'Podrobnosti', 'Částka (Kč)'];
  const lines = [head.join(';')];
  for (const r of rows) {
    const b = r.booking;
    lines.push(
      [
        b.start.slice(8, 10) + '.' + b.start.slice(5, 7) + '.' + b.start.slice(0, 4),
        b.start.slice(11, 16),
        names.client(b.clientId),
        visitTitle(s, b),
        names.therapist(b.therapistId),
        VISIT_STATUS_LABEL[r.status],
        r.info.label,
        VISIT_PAY_STATE_LABEL[r.info.payState],
        r.info.detail,
        Math.round(r.info.amount),
      ]
        .map(csvCell)
        .join(';'),
    );
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}
