import type { ClinicState, Id, LocalDateTime, PaymentPurpose, PaymentRequest, PaymentSettings } from '../domain/types';
import { getClient } from './selectors';

/**
 * QR Platba – český standard ČBA pro sdílení platebních údajů (formát SPAYD 1.0).
 *   SPD*1.0*ACC:CZ6508000000192000145399*AM:480.00*CC:CZK*X-VS:26110007*MSG:NOVAKOVA FYZIO 10*RN:KLINIKA POHYB
 * Bankovní aplikace po naskenování předvyplní účet, částku, variabilní symbol a zprávu.
 */

/* ------------------------------------------------------------------ */
/* Číslo účtu a IBAN                                                   */
/* ------------------------------------------------------------------ */

const PREFIX_WEIGHTS = [10, 5, 8, 4, 2, 1];
const NUMBER_WEIGHTS = [6, 3, 7, 9, 10, 5, 8, 4, 2, 1];

function weightedMod11(digits: string, weights: number[]): boolean {
  let sum = 0;
  for (let i = 0; i < weights.length; i++) sum += Number(digits[i]) * weights[i];
  return sum % 11 === 0;
}

/** Zbytek po dělení 97 pro dlouhé číslo zapsané jako řetězec číslic. */
function mod97(digits: string): number {
  let rest = 0;
  for (let i = 0; i < digits.length; i += 7) rest = Number(String(rest) + digits.slice(i, i + 7)) % 97;
  return rest;
}

/** Písmena IBAN na čísla (A = 10 … Z = 35). */
const ibanDigits = (s: string): string => s.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));

export function isValidIban(input: string): boolean {
  const iban = input.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  if (iban.startsWith('CZ') && iban.length !== 24) return false;
  return mod97(ibanDigits(iban.slice(4) + iban.slice(0, 4))) === 1;
}

/** Český IBAN z předčíslí, čísla účtu a kódu banky (bez kontroly vah). */
export function czechAccountToIban(prefix: string, number: string, bank: string): string {
  const bban = bank.padStart(4, '0') + prefix.padStart(6, '0') + number.padStart(10, '0');
  const check = 98 - mod97(bban + ibanDigits('CZ') + '00');
  return 'CZ' + String(check).padStart(2, '0') + bban;
}

export type AccountResult = { ok: true; iban: string } | { ok: false; error: string };

/**
 * Přečte číslo účtu zadané česky („19-2000145399/0800“, „2000145399/0800“) nebo jako IBAN
 * a vrátí IBAN. Kontroluje váhy předčíslí i čísla účtu (modulo 11) a kontrolní číslice IBAN.
 */
export function parseAccount(input: string): AccountResult {
  const raw = input.trim().replace(/\s+/g, '');
  if (!raw) return { ok: false, error: 'Zadejte číslo účtu.' };
  if (/^[A-Za-z]{2}/.test(raw)) {
    const iban = raw.toUpperCase();
    return isValidIban(iban) ? { ok: true, iban } : { ok: false, error: 'IBAN není platný – zkontrolujte ho.' };
  }
  const m = /^(?:(\d{1,6})-)?(\d{2,10})\/(\d{4})$/.exec(raw);
  if (!m) return { ok: false, error: 'Číslo účtu zadejte ve tvaru 123456789/0800 nebo 19-123456789/0800.' };
  const [, prefix = '', number, bank] = m;
  if (prefix && !weightedMod11(prefix.padStart(6, '0'), PREFIX_WEIGHTS)) return { ok: false, error: 'Předčíslí účtu není platné – zkontrolujte ho.' };
  if (number.replace(/0/g, '').length < 2) return { ok: false, error: 'Číslo účtu musí mít aspoň dvě nenulové číslice.' };
  if (!weightedMod11(number.padStart(10, '0'), NUMBER_WEIGHTS)) return { ok: false, error: 'Číslo účtu není platné – zkontrolujte ho.' };
  return { ok: true, iban: czechAccountToIban(prefix, number, bank) };
}

/** „CZ65 0800 0000 1920 0014 5399“ */
export function formatIban(iban: string): string {
  return iban.replace(/\s+/g, '').replace(/(.{4})(?=.)/g, '$1 ');
}

/** Je QR platba zapnutá a má platný účet? */
export function qrReady(p: PaymentSettings | undefined): boolean {
  return !!p && p.qrEnabled && isValidIban(p.iban);
}

/* ------------------------------------------------------------------ */
/* Řetězec SPAYD                                                       */
/* ------------------------------------------------------------------ */

/**
 * Text do pole QR Platby: bez diakritiky a hvězdiček, velkými písmeny, oříznutý. Ponechá jen znaky
 * alfanumerického režimu QR (0–9, A–Z, mezera, $ % + - . / :), takže celý řetězec jde zakódovat úsporně.
 */
export function spaydText(value: string, max: number): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^0-9A-Z $%+\-./:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
}

/** Lze řetězec zakódovat v alfanumerickém režimu QR? */
export const isQrAlphanumeric = (text: string): boolean => /^[0-9A-Z $%*+\-./:]*$/.test(text);

export interface SpaydInput {
  iban: string;
  amount: number;
  vs?: string;
  message?: string;
  recipient?: string;
}

export function buildSpayd(p: SpaydInput): string {
  const parts = ['SPD', '1.0', 'ACC:' + p.iban.replace(/\s+/g, '').toUpperCase()];
  if (p.amount > 0) parts.push('AM:' + (Math.round(p.amount * 100) / 100).toFixed(2));
  parts.push('CC:CZK');
  const vs = (p.vs ?? '').replace(/\D/g, '').slice(0, 10);
  if (vs) parts.push('X-VS:' + vs);
  const msg = spaydText(p.message ?? '', 60);
  if (msg) parts.push('MSG:' + msg);
  const rn = spaydText(p.recipient ?? '', 35);
  if (rn) parts.push('RN:' + rn);
  return parts.join('*');
}

/** Zpráva pro příjemce: u ukázkového účtu varování, aby nikdo neplatil doopravdy. */
export function qrMessage(p: PaymentSettings, label: string): string {
  return p.demoAccount ? 'UKAZKA NEPLATIT ' + label : label;
}

/* ------------------------------------------------------------------ */
/* Variabilní symbol                                                   */
/* ------------------------------------------------------------------ */

/** Další volný variabilní symbol: RRMM + pořadí v měsíci (26110007). */
export function nextVs(s: ClinicState, now: LocalDateTime): string {
  const prefix = now.slice(2, 4) + now.slice(5, 7);
  let max = 0;
  const consider = (vs: string | undefined): void => {
    if (!vs || vs.length !== 8 || !vs.startsWith(prefix)) return;
    const n = Number(vs.slice(4));
    if (Number.isFinite(n) && n > max) max = n;
  };
  for (const r of s.paymentRequests) consider(r.vs);
  for (const p of s.payments) consider(p.vs);
  return prefix + String(max + 1).padStart(4, '0');
}

/** Je variabilní symbol volný (nepoužitý žádnou výzvou ani platbou)? */
export function isVsFree(s: ClinicState, vs: string): boolean {
  return !s.paymentRequests.some((r) => r.vs === vs) && !s.payments.some((p) => p.vs === vs);
}

/* ------------------------------------------------------------------ */
/* QR k platbě                                                         */
/* ------------------------------------------------------------------ */

export interface QrPaymentData {
  clientId: Id;
  amount: number;
  vs: string;
  /** Co se platí, např. „Permanentka Fyzio 10“. */
  label: string;
}

/** Zpráva pro příjemce: příjmení klienta + co se platí (aby šla platba snadno dohledat na výpisu). */
export function paymentMessage(s: ClinicState, data: Pick<QrPaymentData, 'clientId' | 'label'>): string {
  const c = getClient(s, data.clientId);
  return qrMessage(s.settings.payments, `${c ? c.lastName + ' ' : ''}${data.label}`);
}

/** Řetězec QR Platby pro výzvu (nebo pro platbu na recepci, která ještě nemá výzvu). */
export function paymentSpayd(s: ClinicState, data: QrPaymentData): string {
  const p = s.settings.payments;
  return buildSpayd({ iban: p.iban, amount: data.amount, vs: data.vs, message: paymentMessage(s, data), recipient: p.recipientName || s.settings.senderName });
}

/* ------------------------------------------------------------------ */
/* Výzvy pro přehledy                                                  */
/* ------------------------------------------------------------------ */

export const PAYMENT_PURPOSE_LABEL: Record<PaymentPurpose, string> = {
  booking: 'Termín',
  package: 'Permanentka',
  credit_topup: 'Dobití kreditu',
  storno_fee: 'Poplatek',
};

/** Čekající výzvy (volitelně jednoho klienta), nejdřív ty s nejbližší splatností. */
export function pendingPaymentRequests(s: ClinicState, clientId?: string): PaymentRequest[] {
  return s.paymentRequests
    .filter((r) => r.status === 'pending' && (!clientId || r.clientId === clientId))
    .sort((a, b) => (a.dueAt < b.dueAt ? -1 : a.dueAt > b.dueAt ? 1 : 0));
}

/** Čekající výzva k termínu nebo k jeho poplatku. */
export function pendingRequestFor(s: ClinicState, bookingId: string, purpose: 'booking' | 'storno_fee' = 'booking'): PaymentRequest | undefined {
  return s.paymentRequests.find((r) => r.status === 'pending' && r.bookingId === bookingId && r.purpose === purpose);
}
