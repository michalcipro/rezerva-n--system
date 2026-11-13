/**
 * Brevo (dříve Sendinblue) – transakční e-maily a SMS přes REST API v3.
 *
 * Nastavení (podle dokumentace Brevo, ověřeno 11/2026):
 *  1. API klíč (začíná `xkeysib-`): Brevo → menu účtu vpravo nahoře → Settings → SMTP & API → záložka
 *     „API keys & MCP“ (dříve „API Keys“) → „Generate a new API key“. Klíč se zobrazí jen jednou; uložte ho
 *     jako tajnou proměnnou serveru `BREVO_API_KEY` (Supabase: Edge Functions → Secrets, nebo
 *     `supabase secrets set`).
 *     SMTP klíč (`xsmtpsib-`) z vedlejší záložky není API klíč.
 *  2. Povolené IP adresy: Brevo po 30 dnech „učení“ samo zapne blokování volání API z neznámých IP adres
 *     (Security → Authorised IPs). Edge Function nemá pevnou IP adresu, proto blokování vypněte
 *     („Deactivate blocking“) – jinak API vrací 401 „unrecognised IP address“.
 *  3. Odesílatel e-mailů: Senders, Domains & Dedicated IPs → ověřte doménu (DKIM, DMARC) a přidejte
 *     odesílatele; `senderEmail` musí být adresa z ověřené domény.
 *  4. SMS: dobijte SMS kredit a zaregistrujte odesílatele (Sender ID = `smsSender`: nejvýše 11 písmen
 *     a číslic bez mezer, nebo telefonní číslo do 15 číslic). Registrace je povinná pro každou cílovou zemi;
 *     čeští operátoři neregistrované alfanumerické odesílatele blokují.
 *
 * API:
 *  - e-mail: POST https://api.brevo.com/v3/smtp/email, hlavička `api-key`,
 *    tělo { sender, to, subject, htmlContent, textContent, replyTo }, odpověď 201 { messageId }.
 *  - SMS: POST https://api.brevo.com/v3/transactionalSMS/send (od 5/2025 nahrazuje zastaralý
 *    …/transactionalSMS/sms), tělo { sender, recipient, content, type, unicodeEnabled }, odpověď { messageId }
 *    (číslo – čte se jako text, aby se neztratila přesnost). Příjemce: předvolba země + číslo, jen číslice.
 *  - chyby: JSON { code, message }; 400 neplatná data, 401 klíč nebo IP adresa, 402 kredit nebo neaktivní účet,
 *    403 oprávnění, 429 limit požadavků (hlavička x-sib-ratelimit-reset = za kolik sekund), 5xx výpadek.
 *
 * Diakritika v SMS: výchozí `smsUnicode: false` převede text do GSM 03.38 bez diakritiky (160 znaků na část)
 * a pošle ho s `unicodeEnabled: false`. Se `smsUnicode: true` jde text beze změny jako Unicode – jen 70 znaků
 * na část, tedy dražší.
 *
 * API klíč se nikdy neloguje a nikdy se neobjeví v chybové zprávě.
 *
 * Zdroje: developers.brevo.com/reference/send-transac-email, …/reference/send-async-transactional-sms,
 * …/changelog/2025/5/1 (zastaralý endpoint SMS), …/changelog/2021/11/10 (unicodeEnabled), …/docs/limit-headers,
 * help.brevo.com/hc/en-us/articles/5740111683858 (povolené IP adresy), …/articles/28255350696466 (Sender ID).
 */

import { defaultFetch, describeError, isTimeoutError, oneLine, readText, scrub, timeoutSignal } from './http';
import { normalizeCzechPhone, toGsm7 } from './phone';
import { renderEmailHtml } from './render';
import type { Messenger, OutgoingEmail, OutgoingSms, SendResult } from './types';

export const BREVO_API_BASE = 'https://api.brevo.com/v3';
export const BREVO_EMAIL_ENDPOINT = `${BREVO_API_BASE}/smtp/email`;
export const BREVO_SMS_ENDPOINT = `${BREVO_API_BASE}/transactionalSMS/send`;

export interface BrevoConfig {
  apiKey: string;
  senderEmail: string;
  senderName: string;
  /** Odesílatel SMS (Sender ID): nejvýše 11 písmen a číslic bez mezer, nebo telefonní číslo do 15 číslic. */
  smsSender: string;
  /** SMS s diakritikou jako Unicode (70 znaků na část). Výchozí false: bez diakritiky, 160 znaků na část. */
  smsUnicode?: boolean;
  fetchImpl?: typeof fetch;
  /** Časový limit jednoho požadavku v ms (výchozí 15 000). Po vypršení se zpráva zkusí poslat znovu. */
  timeoutMs?: number;
}

type Channel = 'email' | 'sms';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const isEmail = (s: string): boolean => s.length <= 254 && EMAIL_PATTERN.test(s);

/** Chyba odesílatele SMS, nebo null, když je v pořádku. */
function smsSenderProblem(sender: string): string | null {
  if (!sender) return 'Není nastaven odesílatel SMS (Sender ID).';
  if (/^\+?\d{1,15}$/.test(sender)) return null;
  if (/^[A-Za-z0-9]{1,11}$/.test(sender)) return null;
  return 'Neplatný odesílatel SMS – povoleno nejvýše 11 písmen a číslic bez mezer a diakritiky, nebo číslo do 15 číslic.';
}

/** Opakovat má smysl při výpadku, limitu požadavků a chybějícím kreditu; ostatní 4xx jsou trvalé. */
function isRetryableStatus(status: number): boolean {
  return status < 400 || status === 402 || status === 408 || status === 425 || status === 429 || status >= 500;
}

function statusText(channel: Channel, status: number): string {
  if (status === 400) return channel === 'email' ? 'Neplatná adresa nebo obsah e-mailu' : 'Neplatné číslo nebo obsah SMS';
  if (status === 401) return 'Brevo odmítlo API klíč (neplatný klíč nebo nepovolená IP adresa serveru)';
  if (status === 402) return 'Brevo: nedostatek kreditu nebo neaktivní účet';
  if (status === 403) return 'Brevo: k odeslání chybí oprávnění';
  if (status === 429) return 'Brevo: příliš mnoho požadavků, zkusí se znovu';
  if (status >= 500) return 'Brevo je dočasně nedostupné, zkusí se znovu';
  return channel === 'email' ? 'Brevo e-mail odmítlo' : 'Brevo SMS odmítlo';
}

/** „(HTTP 400 invalid_parameter: …)“ z chybové odpovědi Brevo. */
function errorDetail(status: number, body: string): string {
  let code = '';
  let message = '';
  try {
    const data: unknown = JSON.parse(body);
    if (data && typeof data === 'object') {
      if ('code' in data && typeof data.code === 'string') code = data.code;
      if ('message' in data && typeof data.message === 'string') message = data.message;
    }
  } catch {
    // tělo není JSON (např. stránka proxy) – stačí stav
  }
  return `HTTP ${status}${code ? ' ' + oneLine(code, 40) : ''}${message ? ': ' + oneLine(message, 160) : ''}`;
}

/**
 * `messageId` z odpovědi jako text. U SMS je to číslo, které může přesáhnout přesnost čísel v JS,
 * proto se čte přímo z JSON textu.
 */
function extractMessageId(body: string): string | undefined {
  const m = /"messageId"\s*:\s*("(?:[^"\\]|\\.)*"|-?\d+)/u.exec(body);
  if (!m) return undefined;
  if (!m[1].startsWith('"')) return m[1];
  try {
    const id: unknown = JSON.parse(m[1]);
    return typeof id === 'string' && id ? id : undefined;
  } catch {
    return undefined;
  }
}

export function createBrevoMessenger(cfg: BrevoConfig): Messenger {
  const apiKey = (cfg.apiKey ?? '').trim();
  if (!apiKey) throw new Error('Brevo: chybí API klíč (BREVO_API_KEY).');
  const senderEmail = (cfg.senderEmail ?? '').trim();
  if (!isEmail(senderEmail)) throw new Error('Brevo: neplatná adresa odesílatele e-mailů (senderEmail).');
  const senderName = (cfg.senderName ?? '').trim();
  const smsSenderRaw = (cfg.smsSender ?? '').trim();
  const smsSender = /^\+\d+$/.test(smsSenderRaw) ? smsSenderRaw.slice(1) : smsSenderRaw;
  const smsSenderError = smsSenderProblem(smsSenderRaw);
  const smsUnicode = cfg.smsUnicode === true;
  const doFetch = cfg.fetchImpl ?? defaultFetch;
  const timeoutMs = cfg.timeoutMs ?? 15_000;

  async function post(url: string, payload: unknown, channel: Channel): Promise<SendResult> {
    let res: Response;
    try {
      res = await doFetch(url, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json', 'api-key': apiKey },
        body: JSON.stringify(payload),
        signal: timeoutSignal(timeoutMs),
      });
    } catch (e) {
      const error = isTimeoutError(e)
        ? 'Brevo neodpovědělo včas, zkusí se znovu.'
        : `Nepodařilo se spojit s Brevo (${describeError(e, apiKey)}), zkusí se znovu.`;
      return { ok: false, permanent: false, error };
    }
    const body = await readText(res);
    if (res.ok) {
      const providerId = extractMessageId(body);
      return providerId ? { ok: true, providerId, httpStatus: res.status } : { ok: true, httpStatus: res.status };
    }
    const reset = res.status === 429 ? Number(res.headers.get('x-sib-ratelimit-reset')) : NaN;
    const wait = Number.isFinite(reset) && reset > 0 ? ` za ${Math.ceil(reset)} s` : '';
    const error = `${statusText(channel, res.status)}${wait} (${errorDetail(res.status, body)}).`;
    return { ok: false, permanent: !isRetryableStatus(res.status), error: scrub(error, apiKey), httpStatus: res.status };
  }

  return {
    async sendEmail(m: OutgoingEmail): Promise<SendResult> {
      const to = (m.to ?? '').trim();
      if (!isEmail(to)) return { ok: false, permanent: true, error: 'Neplatná e-mailová adresa příjemce.' };
      const text = (m.text ?? '').replace(/\r\n?/g, '\n');
      const subject = (m.subject ?? '').replace(/\s+/gu, ' ').trim() || senderName || senderEmail;
      if (!text.trim() && !m.html?.trim()) return { ok: false, permanent: true, error: 'E-mail nemá žádný text.' };
      // Bez HTML verze ji sestavíme z textu – e-mail pak vypadá stejně jako ostatní.
      const fromName = m.fromName?.replace(/\s+/gu, ' ').trim() || senderName;
      const html = m.html?.trim() ? m.html : renderEmailHtml({ clinicName: fromName || senderEmail, subject, body: text });
      const toName = m.toName?.trim();
      const replyTo = m.replyTo?.trim();
      const payload: Record<string, unknown> = {
        sender: fromName ? { name: fromName, email: senderEmail } : { email: senderEmail },
        to: [toName ? { email: to, name: toName } : { email: to }],
        subject,
        htmlContent: html,
      };
      if (text.trim()) payload.textContent = text;
      if (replyTo && isEmail(replyTo)) payload.replyTo = { email: replyTo };
      if (m.headers && Object.keys(m.headers).length) payload.headers = m.headers;
      return post(BREVO_EMAIL_ENDPOINT, payload, 'email');
    },

    async sendSms(m: OutgoingSms): Promise<SendResult> {
      const recipient = normalizeCzechPhone(m.to ?? '');
      if (!recipient) return { ok: false, permanent: true, error: 'Neplatné telefonní číslo.' };
      if (smsSenderError) return { ok: false, permanent: false, error: smsSenderError };
      const text = (m.text ?? '').replace(/\r\n?/g, '\n').trim();
      const content = smsUnicode ? text.normalize('NFC') : toGsm7(text).trim();
      if (!content) return { ok: false, permanent: true, error: 'SMS nemá žádný text.' };
      return post(
        BREVO_SMS_ENDPOINT,
        { sender: smsSender, recipient, content, type: 'transactional', unicodeEnabled: smsUnicode },
        'sms',
      );
    },
  };
}
