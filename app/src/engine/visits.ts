import { isDraft } from 'immer';
import type { Booking, BookingFee, BookingStatus, ClinicState, Id, LedgerEntry, LocalDate, PaymentRequest } from '../domain/types';
import { formatDayShort, formatPercent, prepZ } from './format';
import { isPaymentRequestOverdueOn, MONEY_METHOD_LABEL } from './payments';
import { bookingsOfClient, getBooking, getMakeup, getPackage, packageUsage, registerSelectorCache, sessionParticipants } from './selectors';
import { dateOf } from './time';

/**
 * Přehled vstupů (docs/VSTUPY-SKUPINY-QR.md, část 1): u každé rezervace zdroj platby – permanentka, kredit,
 * jednorázová platba, čekající QR platba, nezaplaceno, náhrada, zdarma. Čisté funkce bez Reactu.
 */

export type VisitSource = 'package' | 'credit' | 'single' | 'qr_pending' | 'unpaid' | 'makeup' | 'free';

export interface VisitPaymentInfo {
  source: VisitSource;
  /** Krátký štítek: „Permanentka“, „Kredit“, „Jednorázově“, „Čeká na QR platbu“, „Nezaplaceno“, „Náhrada“, „Zdarma“. */
  label: string;
  /** Např. „Koučink 10× · vstup 3 z 10“, „kartou na místě“, „QR platbou“, „náhrada za Po 12. 10. (z permanentky)“. */
  detail: string;
  /** Kč: u jednorázových zaplacená/účtovaná cena, u permanentky hodnota jednoho vstupu (unitValue), jinak cena služby. */
  amount: number;
  /** true pro permanentku, kredit a náhradu za předplacený vstup. */
  prepaid: boolean;
}

/** Pořadí zdrojů ve filtrech a v souhrnné tabulce. */
export const VISIT_SOURCES: readonly VisitSource[] = ['package', 'credit', 'single', 'qr_pending', 'unpaid', 'makeup', 'free'];

export const VISIT_SOURCE_LABEL: Record<VisitSource, string> = {
  package: 'Permanentka',
  credit: 'Kredit',
  single: 'Jednorázově',
  qr_pending: 'Čeká na QR platbu',
  unpaid: 'Nezaplaceno',
  makeup: 'Náhrada',
  free: 'Zdarma',
};

/** Barevný tón štítku zdroje platby (Badge). */
export const VISIT_SOURCE_TONE: Record<VisitSource, 'accent' | 'info' | 'neutral' | 'warning' | 'danger' | 'success' | 'violet'> = {
  package: 'accent',
  credit: 'info',
  single: 'neutral',
  qr_pending: 'warning',
  unpaid: 'danger',
  makeup: 'violet',
  free: 'success',
};

/* ------------------------------------------------------------------ */
/* Indexy (cache podle identity pole; drafty Immeru se necachují)      */
/* ------------------------------------------------------------------ */

let creditPaidCache = new WeakMap<object, { len: number; ids: Set<Id> }>();
let requestCache = new WeakMap<object, { len: number; byBooking: Map<string, PaymentRequest[]> }>();
registerSelectorCache(() => {
  creditPaidCache = new WeakMap();
  requestCache = new WeakMap();
});

/** Rezervace zaplacené z kreditu (pohyb 'booking_payment' v kreditu). */
function creditPaidBookings(ledger: readonly LedgerEntry[]): Set<Id> {
  const build = (): Set<Id> => {
    const ids = new Set<Id>();
    for (const e of ledger) if (e.kind === 'booking_payment' && e.bookingId) ids.add(e.bookingId);
    return ids;
  };
  if (isDraft(ledger)) return build();
  const hit = creditPaidCache.get(ledger);
  if (hit && hit.len === ledger.length) return hit.ids;
  const ids = build();
  creditPaidCache.set(ledger, { len: ledger.length, ids });
  return ids;
}

/** Výzvy podle rezervace a účelu (klíč `bookingId|purpose`), nejnovější první. */
function requestsOf(s: ClinicState, bookingId: Id, purpose: 'booking' | 'storno_fee'): PaymentRequest[] {
  const list = s.paymentRequests ?? [];
  const build = (): Map<string, PaymentRequest[]> => {
    const m = new Map<string, PaymentRequest[]>();
    for (const r of list) {
      if (!r.bookingId) continue;
      const key = r.bookingId + '|' + r.purpose;
      const arr = m.get(key);
      if (arr) arr.push(r);
      else m.set(key, [r]);
    }
    for (const arr of m.values()) arr.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return m;
  };
  let byBooking: Map<string, PaymentRequest[]>;
  if (isDraft(list)) byBooking = build();
  else {
    const hit = requestCache.get(list);
    if (hit && hit.len === list.length) byBooking = hit.byBooking;
    else {
      byBooking = build();
      requestCache.set(list, { len: list.length, byBooking });
    }
  }
  return byBooking.get(bookingId + '|' + purpose) ?? [];
}

/* ------------------------------------------------------------------ */
/* Zdroj platby jednoho vstupu                                         */
/* ------------------------------------------------------------------ */

const info = (source: VisitSource, detail: string, amount: number, prepaid: boolean): VisitPaymentInfo => ({
  source,
  label: VISIT_SOURCE_LABEL[source],
  detail,
  amount: Math.max(0, Math.round(amount)),
  prepaid,
});

/** Stavy, ve kterých se vstup účtuje (proběhl nebo propadl). */
const CHARGED: readonly BookingStatus[] = ['completed', 'no_show', 'late_cancelled'];

/** Pořadí vstupu v rámci permanentky (podle začátku; počítají se vstupy, které permanentku čerpají). */
function packageEntryOrdinal(s: ClinicState, b: Booking): { n: number; total: number; name: string; unitValue: number } | null {
  const pkg = b.payment.packageId ? getPackage(s, b.payment.packageId) : undefined;
  if (!pkg) return null;
  const consuming = bookingsOfClient(s, b.clientId).filter(
    (x) =>
      x.payment.packageId === pkg.id &&
      (x.status === 'completed' || x.status === 'confirmed' || x.status === 'no_show' || (x.status === 'late_cancelled' && x.fee?.settledBy === 'package_entry')),
  );
  const idx = consuming.findIndex((x) => x.id === b.id);
  const unitValue = packageUsage(s, pkg, dateOf(b.start)).unitValue;
  return { n: idx >= 0 ? idx + 1 : 0, total: pkg.entriesTotal, name: pkg.name, unitValue };
}

const feeWhat = (fee: BookingFee): string => (fee.reason === 'no_show' ? 'poplatek za nedostavení' : 'storno poplatek');

/** Vstup, za který se platí jen poplatek (nezaplacený termín zrušený po lhůtě / nedostavení). */
function feeInfo(s: ClinicState, b: Booking, fee: BookingFee, today: LocalDate): VisitPaymentInfo {
  const what = feeWhat(fee);
  if (fee.status === 'waived') return info('free', fee.waivedReason === 'První pozdní storno zdarma' ? 'první pozdní storno zdarma' : `${what} odpuštěn`, 0, false);
  if (fee.status === 'due') {
    const pending = requestsOf(s, b.id, 'storno_fee').find((r) => r.status === 'pending');
    if (pending) return info('qr_pending', `${what} · VS ${pending.vs}${isPaymentRequestOverdueOn(pending, today) ? ' · po splatnosti' : ''}`, fee.amount, false);
    return info('unpaid', `${what} čeká na úhradu`, fee.amount, false);
  }
  if (fee.settledBy === 'credit') return info('credit', `${what} z kreditu`, fee.amount, true);
  return info('single', `${what} ${fee.settledBy && fee.settledBy !== 'package_entry' ? MONEY_METHOD_LABEL[fee.settledBy] : 'uhrazen'}`, fee.amount, false);
}

/** Jak byl zaplacen termín placený na místě. */
function settledDetail(s: ClinicState, b: Booking): { source: 'single' | 'credit'; detail: string } {
  switch (b.payment.settledBy) {
    case 'cash':
      return { source: 'single', detail: 'hotově na místě' };
    case 'card':
      return { source: 'single', detail: 'kartou na místě' };
    case 'transfer':
      return { source: 'single', detail: 'převodem' };
    case 'online':
      return { source: 'single', detail: 'kartou online' };
    case 'qr': {
      const paid = requestsOf(s, b.id, 'booking').find((r) => r.status === 'paid');
      return { source: 'single', detail: paid ? `QR platbou · VS ${paid.vs}` : 'QR platbou' };
    }
    default:
      return creditPaidBookings(s.ledger).has(b.id) ? { source: 'credit', detail: 'z kreditu na místě' } : { source: 'single', detail: 'zaplaceno' };
  }
}

/** Dovětek k detailu u účtovaného vstupu s poplatkem strženým z platby („· storno poplatek 50 %“). */
function feeSuffix(b: Booking): string {
  if (!b.fee || (b.status !== 'late_cancelled' && b.status !== 'no_show')) return '';
  return ` · ${feeWhat(b.fee)} ${formatPercent(b.fee.pct)}`;
}

function visitInfo(s: ClinicState, b: Booking, today: LocalDate, depth: number): VisitPaymentInfo {
  const pay = b.payment;
  const charged = (b.status === 'late_cancelled' || b.status === 'no_show') && !!b.fee;
  const fee = b.fee;
  switch (pay.method) {
    case 'package': {
      if (charged && fee && fee.settledBy !== 'package_entry') return feeInfo(s, b, fee, today);
      const e = packageEntryOrdinal(s, b);
      if (!e) return info('package', 'permanentka', 0, true);
      const entry = e.n ? ` · vstup ${e.n} ${prepZ(e.total)} ${e.total}` : '';
      return info('package', `${e.name}${entry}${charged ? ' · vstup propadl' : ''}`, e.unitValue, true);
    }
    case 'makeup': {
      const src = b.makeupForBookingId ? getBooking(s, b.makeupForBookingId) : undefined;
      const right = pay.makeupId ? getMakeup(s, pay.makeupId) : undefined;
      const pkg = pay.packageId ? getPackage(s, pay.packageId) : undefined;
      let from = '';
      let prepaid = !!pay.packageId;
      if (pkg) from = ` (z permanentky ${pkg.name})`;
      else if (src && depth < 4) {
        const srcInfo = visitInfo(s, src, today, depth + 1);
        prepaid = srcInfo.prepaid;
        from = srcInfo.source === 'credit' ? ' (z kreditu)' : srcInfo.source === 'single' ? ` (zaplaceno ${srcInfo.detail})` : srcInfo.source === 'makeup' ? ' (náhrada)' : '';
      }
      const amount = pkg ? packageUsage(s, pkg, dateOf(b.start)).unitValue : pay.paidAmount || right?.value || 0;
      const when = src ? `náhrada za ${formatDayShort(src.start)}` : 'náhradní termín';
      return info('makeup', `${when}${from}${charged ? ' · náhrada propadla' : ''}`, amount, prepaid);
    }
    case 'credit': {
      if (charged && fee?.status === 'waived') return info('free', 'vráceno na kredit (bez poplatku)', 0, false);
      return info('credit', 'z kreditu' + feeSuffix(b), charged && fee ? fee.amount : pay.paidAmount || b.price, true);
    }
    case 'online': {
      if (charged && fee?.status === 'waived') return info('free', 'vráceno na kredit (bez poplatku)', 0, false);
      return info('single', 'kartou online' + feeSuffix(b), charged && fee ? fee.amount : pay.paidAmount || b.price, false);
    }
    case 'free': {
      if (charged && fee && fee.amount > 0) return feeInfo(s, b, fee, today);
      return info('free', 'zdarma', 0, false);
    }
    case 'qr':
    case 'onsite':
    default: {
      if (pay.paid) {
        if (charged && fee?.status === 'waived') return info('free', 'vráceno na kredit (bez poplatku)', 0, false);
        const st = settledDetail(s, b);
        const amount = charged && fee ? fee.amount : pay.paidAmount || b.price;
        return info(st.source, st.detail + feeSuffix(b), amount, st.source === 'credit');
      }
      if (charged && fee) return feeInfo(s, b, fee, today);
      if (pay.method === 'qr') {
        const pending = requestsOf(s, b.id, 'booking').find((r) => r.status === 'pending');
        if (pending) return info('qr_pending', `QR platba · VS ${pending.vs} · ${isPaymentRequestOverdueOn(pending, today) ? 'po splatnosti' : 'splatnost ' + formatDayShort(pending.dueAt)}`, b.price - pay.paidAmount, false);
        return info('unpaid', 'QR platba zrušena – zaplatit jinak', b.price - pay.paidAmount, false);
      }
      return info('unpaid', b.status === 'confirmed' ? 'platba na místě' : 'na místě – zatím nezaplaceno', b.price - pay.paidAmount, false);
    }
  }
}

/** Zdroj platby vstupu (rezervace). `today` rozhoduje o „po splatnosti“ u čekající QR platby. */
export function visitPaymentInfo(s: ClinicState, b: Booking, today: LocalDate): VisitPaymentInfo {
  return visitInfo(s, b, today, 0);
}

/* ------------------------------------------------------------------ */
/* Přehled vstupů                                                      */
/* ------------------------------------------------------------------ */

export interface VisitFilters {
  /** Včetně. */
  from: LocalDate;
  /** Exkluzivně, stejně jako ostatní statistiky. */
  to: LocalDate;
  /** null = všichni zaměstnanci. */
  therapistId: Id | null;
  serviceId: Id | null;
  /** null = všechny. */
  sources: VisitSource[] | null;
  /** done = completed + no_show + late_cancelled (účtované), planned = confirmed. */
  status: 'done' | 'planned' | 'all';
}

export interface VisitRow {
  booking: Booking;
  info: VisitPaymentInfo;
}

export interface EmployeeVisitSummary {
  /** '' u řádku Celkem. */
  therapistId: Id;
  total: number;
  /** Počty vstupů podle zdroje platby. */
  bySource: Record<VisitSource, number>;
  prepaidCount: number;
  singleCount: number;
  /** Kč za jednorázové vstupy. */
  singleRevenue: number;
  /** Kč – hodnota vstupů z permanentek, kreditu a náhrad za předplacené vstupy. */
  prepaidValue: number;
}

const STATUS_SETS: Record<VisitFilters['status'], ReadonlySet<BookingStatus>> = {
  done: new Set<BookingStatus>(CHARGED),
  planned: new Set<BookingStatus>(['confirmed']),
  all: new Set<BookingStatus>([...CHARGED, 'confirmed']),
};

export function emptyVisitSummary(therapistId: Id): EmployeeVisitSummary {
  return {
    therapistId,
    total: 0,
    bySource: { package: 0, credit: 0, single: 0, qr_pending: 0, unpaid: 0, makeup: 0, free: 0 },
    prepaidCount: 0,
    singleCount: 0,
    singleRevenue: 0,
    prepaidValue: 0,
  };
}

function addToSummary(sum: EmployeeVisitSummary, i: VisitPaymentInfo): void {
  sum.total++;
  sum.bySource[i.source]++;
  if (i.prepaid) {
    sum.prepaidCount++;
    sum.prepaidValue += i.amount;
  }
  if (i.source === 'single') {
    sum.singleCount++;
    sum.singleRevenue += i.amount;
  }
}

/**
 * Vstupy v období s jejich zdrojem platby, souhrn po zaměstnancích a celkem. Zrušené termíny (cancelled,
 * excused, clinic_cancelled) se nepočítají. Řádky jsou seřazené chronologicky. `byEmployee` obsahuje všechny
 * aktivní zaměstnance (při filtru jen zvoleného) a neaktivní, pokud mají v přehledu vstupy; pořadí podle nastavení.
 */
export function visitsOverview(
  s: ClinicState,
  f: VisitFilters,
  today: LocalDate,
): { rows: VisitRow[]; byEmployee: EmployeeVisitSummary[]; totals: EmployeeVisitSummary } {
  const statuses = STATUS_SETS[f.status] ?? STATUS_SETS.all;
  const sources = f.sources ? new Set<VisitSource>(f.sources) : null;
  const rows: VisitRow[] = [];
  for (const b of s.bookings) {
    if (!statuses.has(b.status)) continue;
    const day = dateOf(b.start);
    if (day < f.from || day >= f.to) continue;
    if (f.therapistId && b.therapistId !== f.therapistId) continue;
    if (f.serviceId && b.serviceId !== f.serviceId) continue;
    const i = visitPaymentInfo(s, b, today);
    if (sources && !sources.has(i.source)) continue;
    rows.push({ booking: b, info: i });
  }
  rows.sort((a, b) => (a.booking.start < b.booking.start ? -1 : a.booking.start > b.booking.start ? 1 : a.booking.id < b.booking.id ? -1 : 1));

  const byId = new Map<Id, EmployeeVisitSummary>();
  const totals = emptyVisitSummary('');
  for (const r of rows) {
    let sum = byId.get(r.booking.therapistId);
    if (!sum) {
      sum = emptyVisitSummary(r.booking.therapistId);
      byId.set(r.booking.therapistId, sum);
    }
    addToSummary(sum, r.info);
    addToSummary(totals, r.info);
  }
  const therapists = [...s.therapists].sort((a, b) => a.order - b.order);
  const byEmployee: EmployeeVisitSummary[] = [];
  for (const t of therapists) {
    if (f.therapistId && t.id !== f.therapistId) continue;
    const sum = byId.get(t.id);
    if (sum) byEmployee.push(sum);
    else if (t.active) byEmployee.push(emptyVisitSummary(t.id));
    byId.delete(t.id);
  }
  // vstupy u zaměstnance, který už v seznamu není (smazaný záznam)
  for (const sum of byId.values()) byEmployee.push(sum);
  return { rows, byEmployee, totals };
}

/** Účastníci skupinového termínu (obsazující rezervace) se zdrojem platby – pro panel „Účastníci“. */
export function sessionParticipantRows(s: ClinicState, sessionId: Id, today: LocalDate): VisitRow[] {
  return sessionParticipants(s, sessionId)
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
    .map((b) => ({ booking: b, info: visitPaymentInfo(s, b, today) }));
}
