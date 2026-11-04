import type {
  Booking,
  ClinicState,
  Id,
  LocalDateTime,
  MoneyMethod,
  PaymentPurpose,
  PaymentRequest,
  PaymentSettings,
} from '../domain/types';
import { formatDate, formatDateTimeShort, formatMoney } from './format';
import { buildSpayd, formatIban, isValidIban, SPAYD_MSG_MAX } from './qr';
import { getBooking, getClient, getPackageTemplate, getService, indexById } from './selectors';
import { addHours, dateOf, minStr } from './time';

/**
 * QR platba – popisky, dotazy nad platebními výzvami a pomocné funkce pro příkazy
 * (docs/VSTUPY-SKUPINY-QR.md, část 3). Čisté funkce bez Reactu.
 */

/** Způsob platby do věty („zaplaceno kartou“, „dobití QR platbou“). */
export const MONEY_METHOD_LABEL: Record<MoneyMethod | 'credit', string> = {
  cash: 'hotově',
  card: 'kartou',
  online: 'kartou online',
  transfer: 'převodem',
  qr: 'QR platbou',
  credit: 'z kreditu',
};

/** Způsob platby jako samostatný název (volby, sloupce tabulek). */
export const MONEY_METHOD_NAME: Record<MoneyMethod | 'credit', string> = {
  cash: 'Hotově',
  card: 'Kartou',
  online: 'Kartou online',
  transfer: 'Převodem',
  qr: 'QR platba',
  credit: 'Z kreditu',
};

export const PAYMENT_PURPOSE_LABEL: Record<PaymentPurpose, string> = {
  booking: 'Platba za termín',
  package: 'Nákup permanentky',
  credit_topup: 'Dobití kreditu',
  storno_fee: 'Storno poplatek',
};

export const PAYMENT_REQUEST_STATUS_LABEL: Record<PaymentRequest['status'], string> = {
  pending: 'Čeká na platbu',
  paid: 'Zaplaceno',
  cancelled: 'Zrušeno',
};

/** Výchozí nastavení plateb (příjemce = název firmy). */
export function defaultPaymentSettings(clinicName = 'Winning Minds'): PaymentSettings {
  return { qrEnabled: true, accountNumber: '', iban: '', recipientName: clinicName, qrDueHours: 48 };
}

/** Lze teď QR platbu nabídnout (zapnutá a s platným účtem)? */
export function qrAvailable(s: ClinicState): boolean {
  const p = s.settings.payments;
  return !!p && p.qrEnabled && !!p.iban && isValidIban(p.iban);
}

/** Důvod, proč QR platbu nelze použít (null = lze). */
export function qrUnavailableReason(s: ClinicState): string | null {
  const p = s.settings.payments;
  if (!p || !p.qrEnabled) return 'QR platba je vypnutá.';
  if (!p.iban || !isValidIban(p.iban)) return 'Pro QR platbu chybí číslo účtu – doplňte ho v Nastavení → Platby.';
  return null;
}

/* ------------------------------------------------------------------ */
/* Dotazy                                                              */
/* ------------------------------------------------------------------ */

export const getPaymentRequest = (s: ClinicState, id: Id): PaymentRequest | undefined => indexById(s.paymentRequests ?? []).get(id);

const byCreatedDesc = (a: PaymentRequest, b: PaymentRequest): number => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? 1 : -1);
const byDueAsc = (a: PaymentRequest, b: PaymentRequest): number => (a.dueAt < b.dueAt ? -1 : a.dueAt > b.dueAt ? 1 : a.id < b.id ? -1 : 1);

/** Výzvy klienta, nejnovější první. */
export function paymentRequestsOfClient(s: ClinicState, clientId: Id): PaymentRequest[] {
  return (s.paymentRequests ?? []).filter((r) => r.clientId === clientId).sort(byCreatedDesc);
}

/** Čekající výzvy (volitelně jednoho klienta), seřazené podle splatnosti – nejdřív ty po splatnosti. */
export function pendingPaymentRequests(s: ClinicState, clientId?: Id | null): PaymentRequest[] {
  return (s.paymentRequests ?? []).filter((r) => r.status === 'pending' && (!clientId || r.clientId === clientId)).sort(byDueAsc);
}

/** Čekající výzva k rezervaci (účel 'booking' nebo 'storno_fee'). */
export function pendingRequestOfBooking(s: ClinicState, bookingId: Id, purpose: 'booking' | 'storno_fee' = 'booking'): PaymentRequest | undefined {
  return (s.paymentRequests ?? []).find((r) => r.status === 'pending' && r.bookingId === bookingId && r.purpose === purpose);
}

/** Všechny výzvy k rezervaci (nejnovější první). */
export function paymentRequestsOfBooking(s: ClinicState, bookingId: Id): PaymentRequest[] {
  return (s.paymentRequests ?? []).filter((r) => r.bookingId === bookingId).sort(byCreatedDesc);
}

export function isPaymentRequestOverdue(r: PaymentRequest, now: LocalDateTime): boolean {
  return r.status === 'pending' && r.dueAt < now;
}

/** Popis výzvy pro seznamy: „Mentální koučink · St 14. 10. 9:00“, „Permanentka Koučink 10×“, „Dobití kreditu“. */
export function paymentRequestTitle(s: ClinicState, r: PaymentRequest): string {
  switch (r.purpose) {
    case 'booking':
    case 'storno_fee': {
      const b = r.bookingId ? getBooking(s, r.bookingId) : undefined;
      const svc = b ? getService(s, b.serviceId)?.name ?? 'Termín' : 'Termín';
      const head = r.purpose === 'storno_fee' ? (b?.fee?.reason === 'no_show' ? 'Poplatek za nedostavení' : 'Storno poplatek') : svc;
      if (!b) return head;
      return r.purpose === 'storno_fee' ? `${head} · ${svc} ${formatDateTimeShort(b.start)}` : `${head} · ${formatDateTimeShort(b.start)}`;
    }
    case 'package': {
      const name = r.packageTerms?.name ?? (r.packageTemplateId ? getPackageTemplate(s, r.packageTemplateId)?.name : undefined);
      return name ? `Permanentka ${name}` : 'Permanentka';
    }
    case 'credit_topup':
      return 'Dobití kreditu';
    default:
      return 'Platba';
  }
}

/** Výzvy, jejichž variabilní symbol obsahuje zadané číslice (všechny stavy, nejnovější první). */
export function findPaymentRequestsByVs(s: ClinicState, query: string, limit = 10): PaymentRequest[] {
  const digits = query.replace(/\D/g, '');
  if (!digits) return [];
  const exact = (s.paymentRequests ?? []).find((r) => r.vs === digits);
  const rest = (s.paymentRequests ?? []).filter((r) => r !== exact && r.vs.includes(digits)).sort(byCreatedDesc);
  return (exact ? [exact, ...rest] : rest).slice(0, limit);
}

/**
 * Co udělá potvrzení přijaté QR platby (`confirmPaymentRequest`):
 * - `apply` – zaplatí účel výzvy (termín, poplatek, permanentku, dobití kreditu);
 * - `credit` – účel už netrvá (termín zrušený nebo zaplacený jinak, poplatek vyřízený, objednávka permanentky
 *   zrušená), přijatá částka se připíše klientovi na kredit – peníze, které klient poslal, se neztratí;
 * - `blocked` – potvrdit nelze (už zaplaceno).
 * Zrušenou výzvu lze potvrdit také: klient mohl zaplatit dřív, než se výzva zrušila.
 */
export interface PaymentRequestOutcome {
  kind: 'apply' | 'credit' | 'blocked';
  /** U `credit` a `blocked` důvod jako věta bez tečky („Rezervace byla zrušena“), jinak ''. */
  reason: string;
}

export function paymentRequestOutcome(s: ClinicState, r: PaymentRequest): PaymentRequestOutcome {
  const apply: PaymentRequestOutcome = { kind: 'apply', reason: '' };
  const credit = (reason: string): PaymentRequestOutcome => ({ kind: 'credit', reason });
  if (r.status === 'paid') return { kind: 'blocked', reason: 'Platba už byla potvrzena' };
  const b = r.bookingId ? getBooking(s, r.bookingId) : undefined;
  switch (r.purpose) {
    case 'booking':
      if (!b) return credit('Rezervace k platbě už neexistuje');
      if (b.status === 'no_show') return credit('Termín je zapsaný jako nedostavení');
      if (b.status !== 'confirmed' && b.status !== 'completed') return credit('Rezervace byla zrušena');
      if (b.payment.paid) return credit('Termín byl mezitím zaplacen jinak');
      if (b.payment.method !== 'onsite' && b.payment.method !== 'qr') return credit('Termín se už platí jinak');
      if (b.price - b.payment.paidAmount <= 0) return credit('Termín už není co doplácet');
      return apply;
    case 'storno_fee':
      if (!b || !b.fee || b.fee.status !== 'due') return credit('Poplatek už byl uhrazen nebo odpuštěn');
      return apply;
    case 'package':
      if (r.status === 'cancelled') return credit('Objednávka permanentky byla zrušena');
      if (!r.packageTerms && !(r.packageTemplateId && getPackageTemplate(s, r.packageTemplateId))) return credit('Permanentka z výzvy už neexistuje');
      return apply;
    case 'credit_topup':
      return apply;
    default:
      return credit('Neznámý účel platby');
  }
}

/** Řetězec QR Platby (SPAYD) pro výzvu podle aktuálního nastavení účtu. */
export function paymentRequestSpayd(s: ClinicState, r: Pick<PaymentRequest, 'amount' | 'vs' | 'message'>): string {
  const p = s.settings.payments;
  return buildSpayd({ iban: p?.iban ?? '', amount: r.amount, vs: r.vs, message: r.message, recipient: p?.recipientName || s.settings.clinicName });
}

/** Text e-mailu s platebními údaji (pro „Poslat platební údaje e-mailem“ přes sendManualMessage). */
export function paymentRequestEmail(s: ClinicState, r: PaymentRequest): { subject: string; body: string } {
  const p = s.settings.payments;
  const client = getClient(s, r.clientId);
  const lines = [
    `Dobrý den${client ? ', ' + client.firstName : ''},`,
    '',
    `posíláme platební údaje k úhradě: ${paymentRequestTitle(s, r)}.`,
    '',
    `Částka: ${formatMoney(r.amount)}`,
    `Číslo účtu: ${p?.accountNumber ?? ''}`,
    `IBAN: ${formatIban(p?.iban ?? '')}`,
    `Variabilní symbol: ${r.vs}`,
    `Zpráva pro příjemce: ${r.message}`,
    `Splatnost: ${formatDate(r.dueAt)}`,
    '',
    'Platbu můžete zadat i naskenováním QR kódu v klientském portálu. Po připsání platby vám ji potvrdíme.',
    '',
    `S pozdravem\n${s.settings.clinicName}`,
  ];
  return { subject: `Platební údaje – ${paymentRequestTitle(s, r)}`, body: lines.join('\n').replace(/ /g, ' ') };
}

/* ------------------------------------------------------------------ */
/* Pomocné funkce pro příkazy                                          */
/* ------------------------------------------------------------------ */

/**
 * Další variabilní symbol: RRMM + pořadí výzvy v měsíci na 4 místa (např. '26110007'),
 * jedinečný napříč všemi výzvami. null = řada pro měsíc je vyčerpaná (9 999 výzev).
 */
export function nextVariableSymbol(s: ClinicState, now: LocalDateTime): string | null {
  const prefix = now.slice(2, 4) + now.slice(5, 7);
  const used = new Set<string>();
  let max = 0;
  for (const r of s.paymentRequests ?? []) {
    used.add(r.vs);
    if (r.vs.length === 8 && r.vs.startsWith(prefix)) max = Math.max(max, Number(r.vs.slice(4)) || 0);
  }
  for (let n = max + 1; n <= 9999; n++) {
    const vs = prefix + String(n).padStart(4, '0');
    if (!used.has(vs)) return vs;
  }
  return null;
}

/** Datum do zprávy pro příjemce bez nezlomitelných mezer: '14. 10. 2026'. */
const plainDate = (dt: LocalDateTime): string => formatDate(dt).replace(/ /g, ' ');

/** Zpráva pro příjemce (max. 60 znaků). */
export function paymentRequestMessage(
  s: ClinicState,
  input: { clientId: Id; purpose: PaymentPurpose; booking?: Booking; packageTemplateId?: Id },
): string {
  const c = getClient(s, input.clientId);
  const who = c ? `${c.firstName} ${c.lastName}` : '';
  const tail = who ? ` – ${who}` : '';
  let text: string;
  switch (input.purpose) {
    case 'booking': {
      const svc = input.booking ? getService(s, input.booking.serviceId)?.name ?? 'Termín' : 'Termín';
      text = `${svc}${input.booking ? ' ' + plainDate(input.booking.start) : ''}${tail}`;
      break;
    }
    case 'storno_fee': {
      const what = input.booking?.fee?.reason === 'no_show' ? 'Poplatek za nedostavení' : 'Storno poplatek';
      text = `${what}${input.booking ? ' ' + plainDate(input.booking.start) : ''}${tail}`;
      break;
    }
    case 'package': {
      const tpl = input.packageTemplateId ? getPackageTemplate(s, input.packageTemplateId) : undefined;
      text = `Permanentka ${tpl?.name ?? ''}`.trim() + tail;
      break;
    }
    default:
      text = 'Dobití kreditu' + tail;
  }
  return text.slice(0, SPAYD_MSG_MAX).trim();
}

/** Splatnost výzvy: za `qrDueHours` od vytvoření, u budoucí rezervace nejpozději její začátek. */
export function paymentRequestDueAt(s: ClinicState, now: LocalDateTime, booking?: Booking): LocalDateTime {
  const hours = Math.max(1, Math.round(s.settings.payments?.qrDueHours ?? 48));
  const due = addHours(now, hours);
  return booking && booking.start > now ? minStr(due, booking.start) : due;
}

/** Je výzva po splatnosti k danému dni (pro selektory, které znají jen datum)? */
export function isPaymentRequestOverdueOn(r: PaymentRequest, today: string): boolean {
  return r.status === 'pending' && dateOf(r.dueAt) < today;
}
