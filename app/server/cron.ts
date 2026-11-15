import type { Actor, ClinicState, Message } from '../src/domain/types';
import { businessIdentity } from '../src/engine/business';
import { SMS_OFF_REASON, channelEnabled } from '../src/engine/channels';
import { MAX_DELIVERY_ATTEMPTS, confirmPaymentRequest, queuedMessages, recordDeliveries, type DeliveryResult } from '../src/engine/commands';
import { clientName, getClient } from '../src/engine/selectors';
import { addDays, dateOf } from '../src/engine/time';
import type { CronContext } from './api';
import { unsubscribeUrl } from './core/unsubscribe';
import { FioError, fetchFioTransactions, matchBankPayments, renderEmailHtml, type Messenger, type SendResult } from './providers';

/**
 * Úlohy automatiky po spuštění procesů enginu (POST /api/cron každých 5 minut):
 *  - odeslání zpráv ve frontě (e-maily) a zápis výsledku; SMS ze starších dat se s vypnutými SMS
 *    (src/engine/channels.ts) neodešle a označí se jako neodeslaná s důvodem,
 *  - párování příchozích plateb z Fio s čekajícími QR platbami.
 */

const SYSTEM: Actor = { role: 'owner', name: 'Systém' };
const BANK: Actor = { role: 'reception', name: 'Banka (Fio)' };

/** Chyby, které se týkají celého účtu u poskytovatele (klíč, povolené IP, kredit) – dávku ukončit. */
const ACCOUNT_ERRORS = new Set([401, 402, 403]);

export interface DeliveryConfig {
  messenger: Messenger;
  /** Kolik zpráv nejvýš odeslat při jednom spuštění. */
  batchSize?: number;
  /** Veřejná adresa API (odkazy pro odhlášení z novinek). */
  publicApiUrl?: string;
  /** Tajemství pro podpis odkazů na odhlášení. */
  unsubscribeSecret?: string;
  log?: (message: string, detail?: Record<string, unknown>) => void;
}

async function campaignExtras(cfg: DeliveryConfig, clinicId: string, m: Message): Promise<{ footer: string; headers: Record<string, string> } | null> {
  if (m.kind !== 'campaign' || !m.clientId || !cfg.publicApiUrl || !cfg.unsubscribeSecret) return null;
  const url = await unsubscribeUrl(cfg.publicApiUrl, cfg.unsubscribeSecret, clinicId, m.clientId);
  return {
    footer: `Odhlásit odběr novinek: ${url}`,
    headers: { 'List-Unsubscribe': `<${url}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
}

async function sendOne(cfg: DeliveryConfig, clinicId: string, s: ClinicState, m: Message): Promise<SendResult> {
  const client = m.clientId ? getClient(s, m.clientId) : undefined;
  if (!client) return { ok: false, permanent: true, error: 'Klient už v kartotéce není.' };
  if (m.channel === 'sms') {
    if (!client.phone) return { ok: false, permanent: true, error: 'Klient nemá telefon.' };
    return cfg.messenger.sendSms({ to: client.phone, text: m.body });
  }
  if (!client.email) return { ok: false, permanent: true, error: 'Klient nemá e-mail.' };
  const extras = await campaignExtras(cfg, clinicId, m);
  const fromName = s.settings.senderName || s.settings.clinicName;
  // patička: identifikace provozovny (firma, sídlo, IČO, zápis v rejstříku), u novinek i odkaz na odhlášení
  const footer = [...businessIdentity(s.settings.business), ...(extras ? [extras.footer] : [])].join('\n');
  return cfg.messenger.sendEmail({
    to: client.email,
    toName: clientName(client),
    subject: m.subject,
    text: footer ? `${m.body}\n\n${footer}` : m.body,
    html: renderEmailHtml({ clinicName: fromName, subject: m.subject, body: m.body, footer: footer || undefined }),
    replyTo: s.settings.senderEmail || undefined,
    fromName,
    headers: extras?.headers,
  });
}

/** Odešle zprávy ve frontě a zapíše výsledek (odesláno / chyba / další pokus). */
export function deliveryJob(cfg: DeliveryConfig): (ctx: CronContext) => Promise<Record<string, unknown>> {
  const log = cfg.log ?? (() => undefined);
  return async ({ clinicId, engine, now }) => {
    const loaded = await engine.current(clinicId);
    if (!loaded) return { messages: 'klinika nemá data' };
    const s = loaded.state;
    if (!s.settings.messaging?.deliver) return { messages: 'odesílání vypnuté' };
    const queue = queuedMessages(s, cfg.batchSize ?? 40).filter((m) => (m.attempts ?? 0) < MAX_DELIVERY_ATTEMPTS);
    if (!queue.length) return { messages: { sent: 0, failed: 0 } };
    const results: DeliveryResult[] = [];
    let stopped: string | null = null;
    for (const m of queue) {
      if (!channelEnabled(m.channel)) {
        // SMS, která zůstala ve frontě ze starších dat: platforma posílá jen e-maily
        results.push({ messageId: m.id, ok: false, skipReason: SMS_OFF_REASON });
        continue;
      }
      let r: SendResult;
      try {
        r = await sendOne(cfg, clinicId, s, m);
      } catch (e) {
        r = { ok: false, error: e instanceof Error ? e.message : 'Odeslání selhalo.' };
      }
      if (!r.ok && r.httpStatus && ACCOUNT_ERRORS.has(r.httpStatus)) {
        // chyba účtu u poskytovatele – zprávy nechat ve frontě, ať se odešlou po opravě nastavení
        stopped = r.error ?? `Poskytovatel odmítl přístup (HTTP ${r.httpStatus}).`;
        log('Odesílání zpráv zastaveno – chyba účtu u poskytovatele', { status: r.httpStatus });
        break;
      }
      results.push({ messageId: m.id, ok: r.ok, error: r.ok ? undefined : r.error, permanent: r.permanent });
    }
    if (!results.length) return { messages: { sent: 0, failed: 0, stopped } };
    // náhodné ID: stejná zpráva se může zkoušet znovu i během stejné minuty
    const saved = await engine.execute(clinicId, recordDeliveries, { results }, { actor: SYSTEM, now: now(), commandId: `deliv-${crypto.randomUUID()}`.slice(0, 40) });
    if (!saved.ok) {
      log('Výsledek odeslání se nepodařilo zapsat', { error: saved.error });
      return { messages: { error: saved.error } };
    }
    const value = saved.value as { sent: number; failed: number; skipped: number } | null;
    return { messages: { ...(value ?? { sent: 0, failed: 0 }), stopped } };
  };
}

export interface BankConfig {
  /** Token Fio provozovny (každá má vlastní účet) – null = párování se u ní nedělá. */
  tokenFor: (ctx: CronContext) => Promise<string | null>;
  /** Jak daleko do minulosti hledat platby (dny). */
  daysBack?: number;
  fetchImpl?: typeof fetch;
  log?: (message: string, detail?: Record<string, unknown>) => void;
}

/** Spáruje příchozí platby z Fio s čekajícími QR platbami a potvrdí je. */
export function bankJob(cfg: BankConfig): (ctx: CronContext) => Promise<Record<string, unknown>> {
  const log = cfg.log ?? (() => undefined);
  return async (ctx) => {
    const { clinicId, engine, now } = ctx;
    const token = await cfg.tokenFor(ctx);
    if (!token) return { bank: 'bez napojení na banku' };
    const loaded = await engine.current(clinicId);
    if (!loaded) return { bank: 'provozovna nemá data' };
    const pending = loaded.state.paymentRequests.filter((r) => r.status === 'pending');
    if (!pending.length) return { bank: { pending: 0 } };
    const today = dateOf(now());
    const oldest = pending.reduce((min, r) => (r.at < min ? r.at : min), pending[0].at);
    const limit = addDays(today, -(cfg.daysBack ?? 30));
    const from = dateOf(oldest) < limit ? limit : dateOf(oldest);
    let txs;
    try {
      txs = await fetchFioTransactions({ token, from, to: today, fetchImpl: cfg.fetchImpl });
    } catch (e) {
      const code = e instanceof FioError ? e.code : 'network';
      log('Výpis z Fio se nepodařilo načíst', { code });
      return { bank: { error: code } };
    }
    const matches = matchBankPayments(pending, txs);
    let confirmed = 0;
    const overpaid: string[] = [];
    for (const m of matches) {
      const r = await engine.execute(clinicId, confirmPaymentRequest, { requestId: m.requestId }, { actor: BANK, now: now(), commandId: `fio-${m.transactionId}`.slice(0, 40) });
      if (r.ok && !r.duplicate) confirmed++;
      const req = pending.find((p) => p.id === m.requestId);
      if (req && m.amount > req.amount + 0.5) overpaid.push(req.vs);
    }
    if (overpaid.length) log('Přeplatky u QR plateb – vyřešte ručně', { vs: overpaid });
    return { bank: { pending: pending.length, transactions: txs.length, confirmed, overpaid: overpaid.length } };
  };
}
