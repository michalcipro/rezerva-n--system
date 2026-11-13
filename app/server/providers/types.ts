/**
 * Společná rozhraní poskytovatelů ostrého provozu (e-mail, SMS, bankovní výpis).
 *
 * Moduly ve složce `server/providers` používají jen standardní webová API (`fetch`, `URL`, `Response`…),
 * takže běží stejně v Node (vývoj, testy) i v Deno (Supabase Edge Function).
 */

export interface OutgoingEmail {
  to: string;
  toName?: string;
  subject: string;
  /** Prostý text (vždy se posílá jako textová část e-mailu). */
  text: string;
  /** HTML verze, např. z `renderEmailHtml`. */
  html?: string;
  replyTo?: string;
  /** Jméno odesílatele u této zprávy (jinak jméno z konfigurace). */
  fromName?: string;
  /** Doplňkové hlavičky, např. List-Unsubscribe u obchodních sdělení. */
  headers?: Record<string, string>;
}

export interface OutgoingSms {
  /** Telefon v libovolném běžném zápisu (`+420 777 123 456`, `777123456`…). */
  to: string;
  text: string;
}

export interface SendResult {
  ok: boolean;
  /** Identifikátor zprávy u poskytovatele. */
  providerId?: string;
  error?: string;
  /** retrying makes no sense (invalid address/number, rejected) */
  permanent?: boolean;
  /**
   * HTTP stav odpovědi poskytovatele (chybí u síťové chyby a u kontroly před odesláním).
   * 401/403 a 402 se týkají celého účtu (klíč, povolené IP, kredit) – automatika může dávku ukončit.
   */
  httpStatus?: number;
}

export interface Messenger {
  sendEmail(m: OutgoingEmail): Promise<SendResult>;
  sendSms(m: OutgoingSms): Promise<SendResult>;
}

export interface BankTransaction {
  /** ID pohybu v bance. */
  id: string;
  /** YYYY-MM-DD */
  date: string;
  /** CZK, positive = incoming (částka v měně `currency`; na účtu vedeném v CZK vždy CZK) */
  amount: number;
  currency: string;
  vs?: string;
  ks?: string;
  ss?: string;
  message?: string;
  counterAccount?: string;
  counterName?: string;
}

export interface BankMatch {
  requestId: string;
  transactionId: string;
  /** Skutečně přijatá částka (z pohybu na účtu). */
  amount: number;
}
