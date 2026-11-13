/**
 * Fio banka – „API Bankovnictví“ (jen čtení pohybů) a párování QR plateb podle variabilního symbolu.
 *
 * Nastavení (dokumentace Fio a návody integrátorů Fakturoid a Dativery, ověřeno 11/2026):
 *  1. Internetové bankovnictví Fio → Nastavení → API → přidat token: vyberte účet, oprávnění
 *     „Pouze sledovat účet“ (nikdy ne zadávání příkazů), platnost (podle integrátorů nejvýše 180 dní)
 *     a zapněte prodlužování platnosti při přihlášení; token potvrďte autorizací. V API funguje asi 5 minut
 *     po autorizaci. Uložte ho jako tajnou proměnnou serveru `FIO_TOKEN` (Supabase: Edge Functions → Secrets,
 *     nebo `supabase secrets set`). Token platí jen pro jeden účet.
 *  2. Jeden token pro jeden systém: limit dotazů se počítá na token, proto ho nesdílejte s účetním programem.
 *  3. Pohyby starší 90 dní Fio podle integrátorů vydá jen krátce (10 minut) po dodatečném ověření tokenu
 *     v internetovém bankovnictví – párování proto stahuje jen posledních několik dní.
 *
 * API (dokumentace „FIO API Bankovnictví“, https://www.fio.cz/docs/cz/API_Bankovnictvi.pdf):
 *  - GET https://fioapi.fio.cz/v1/rest/periods/{token}/{od}/{do}/transactions.json (od, do = RRRR-MM-DD).
 *    Dotaz za období je bezstavový – opakované stažení vrátí stejná data. Endpoint /last/ se nepoužívá,
 *    protože posouvá zarážku na serveru. (Původní adresa www.fio.cz/ib_api/rest platila do 30. 11. 2024.)
 *  - Limit: jeden dotaz na token za 30 sekund (bez ohledu na formát), jinak HTTP 409 Conflict.
 *    Další známé chyby: 500 (nejčastěji neplatný nebo neaktivní token), 413 (příliš mnoho položek), 404.
 *  - JSON: accountStatement.info (accountId, bankId, currency, iban, openingBalance, closingBalance, …)
 *    a accountStatement.transactionList.transaction[]; každý sloupec je { value, name, id } nebo null:
 *      column22 ID pohybu · column0 Datum (RRRR-MM-DD+zóna) · column1 Objem (záporný = odchozí) · column14 Měna
 *      column2 Protiúčet · column3 Kód banky · column10 Název protiúčtu · column12 Název banky
 *      column4 KS · column5 VS · column6 SS · column7 Uživatelská identifikace · column16 Zpráva pro příjemce
 *      column8 Typ · column9 Provedl · column17 ID pokynu · column18 Upřesnění · column25 Komentář
 *      column26 BIC · column27 Reference plátce
 *
 * Token je součástí URL, proto se URL nikdy neloguje a token se z chybových zpráv odstraňuje.
 *
 * Zdroje: www.fio.cz/docs/cz/API_Bankovnictvi.pdf, fio.cz/bank-services/internetbanking-api (změna adresy API),
 * fakturoid.cz/podpora/parovani/fio-api (založení tokenu), dativery.com (limit 90 dní).
 */

import type { PaymentRequest } from '../../src/domain/types';
import { defaultFetch, describeError, isTimeoutError, timeoutSignal } from './http';
import type { BankMatch, BankTransaction } from './types';

export const FIO_API_BASE = 'https://fioapi.fio.cz/v1/rest';

export interface FioConfig {
  token: string;
  /** První den období (RRRR-MM-DD), včetně. */
  from: string;
  /** Poslední den období (RRRR-MM-DD), včetně. */
  to: string;
  fetchImpl?: typeof fetch;
  /** Časový limit dotazu v ms (výchozí 30 000). */
  timeoutMs?: number;
}

export type FioErrorCode =
  | 'config' // chybí token nebo je neplatné období (dotaz se vůbec neposlal)
  | 'too_frequent' // HTTP 409 – dotaz dřív než 30 s po předchozím
  | 'unauthorized' // HTTP 401 / 403
  | 'too_many_items' // HTTP 413
  | 'rejected' // jiná chyba 4xx
  | 'server_error' // HTTP 500 – podle Fio nejčastěji neplatný token
  | 'unavailable' // jiná chyba 5xx
  | 'network' // spojení selhalo nebo vypršel časový limit
  | 'invalid_response'; // odpověď není výpis ve formátu JSON

export class FioError extends Error {
  readonly code: FioErrorCode;
  /** HTTP stav odpovědi (chybí, když se odpověď vůbec nepřijala). */
  readonly status: number | undefined;
  /** Má smysl to zkusit znovu při dalším běhu automatiky. */
  readonly retryable: boolean;

  constructor(code: FioErrorCode, message: string, opts: { status?: number; retryable?: boolean } = {}) {
    super(message);
    this.name = 'FioError';
    this.code = code;
    this.status = opts.status;
    this.retryable = opts.retryable ?? false;
  }
}

function isIsoDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function httpError(status: number): FioError {
  switch (status) {
    case 409:
      return new FioError(
        'too_frequent',
        'Fio API: příliš časté dotazy – mezi dvěma dotazy se stejným tokenem musí uplynout aspoň 30 sekund. Zkusí se to znovu později.',
        { status, retryable: true },
      );
    case 401:
    case 403:
      return new FioError('unauthorized', `Fio API odmítlo token (HTTP ${status}) – zkontrolujte FIO_TOKEN.`, { status });
    case 413:
      return new FioError('too_many_items', 'Fio API: v období je příliš mnoho pohybů (HTTP 413) – zkraťte období.', { status });
    case 500:
      return new FioError(
        'server_error',
        'Fio API vrátilo chybu 500 – nejčastěji jde o neplatný, zrušený nebo ještě neaktivní token (nový token funguje asi 5 minut po autorizaci).',
        { status, retryable: true },
      );
  }
  if (status >= 500) return new FioError('unavailable', `Fio API je dočasně nedostupné (HTTP ${status}).`, { status, retryable: true });
  return new FioError(
    'rejected',
    `Fio API dotaz odmítlo (HTTP ${status}) – zkontrolujte token a období (pohyby starší 90 dní vyžadují dodatečné ověření v internetovém bankovnictví).`,
    { status },
  );
}

/**
 * Stáhne pohyby na účtu za období (včetně obou dnů). Při chybě vyhodí `FioError` s českou zprávou
 * (bez tokenu); `retryable` říká, jestli má smysl to zkusit při dalším běhu znovu.
 */
export async function fetchFioTransactions(cfg: FioConfig): Promise<BankTransaction[]> {
  const token = (cfg.token ?? '').trim();
  if (!token || /[\s/]/u.test(token)) throw new FioError('config', 'Chybí nebo je neplatný token Fio API (FIO_TOKEN).');
  if (!isIsoDate(cfg.from) || !isIsoDate(cfg.to)) throw new FioError('config', 'Neplatné období – datum musí být ve tvaru RRRR-MM-DD.');
  if (cfg.from > cfg.to) throw new FioError('config', 'Neplatné období – začátek je až po konci.');

  const url = `${FIO_API_BASE}/periods/${encodeURIComponent(token)}/${cfg.from}/${cfg.to}/transactions.json`;
  const doFetch = cfg.fetchImpl ?? defaultFetch;
  let res: Response;
  try {
    res = await doFetch(url, { method: 'GET', headers: { accept: 'application/json' }, signal: timeoutSignal(cfg.timeoutMs ?? 30_000) });
  } catch (e) {
    const message = isTimeoutError(e)
      ? 'Fio API neodpovědělo včas.'
      : `Nepodařilo se spojit s Fio API (${describeError(e, token)}).`;
    throw new FioError('network', message, { retryable: true });
  }
  if (!res.ok) {
    try {
      await res.body?.cancel();
    } catch {
      // tělo chybové odpovědi nepotřebujeme
    }
    throw httpError(res.status);
  }
  let text: string;
  try {
    text = await res.text();
  } catch (e) {
    const message = isTimeoutError(e) ? 'Fio API neodpovědělo včas.' : `Odpověď Fio API se nepodařilo načíst (${describeError(e, token)}).`;
    throw new FioError('network', message, { status: res.status, retryable: true });
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new FioError('invalid_response', 'Fio API vrátilo neočekávanou odpověď (není to JSON).', { status: res.status, retryable: true });
  }
  return parseFioStatement(data);
}

type Row = Record<string, unknown>;

const asRow = (v: unknown): Row | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : null);

/** Hodnota sloupce `columnN` ({ value, name, id } nebo null). */
function column(row: Row, id: number): unknown {
  const c = asRow(row['column' + id]);
  return c ? c.value : undefined;
}

function textValue(v: unknown): string | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  return s || undefined;
}

function numberValue(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

/** Převede JSON výpisu z Fio API na pohyby. Neúplné položky (bez ID, data nebo částky) přeskočí. */
export function parseFioStatement(data: unknown): BankTransaction[] {
  const statement = asRow(asRow(data)?.accountStatement);
  if (!statement) {
    throw new FioError('invalid_response', 'Fio API vrátilo neočekávaná data (chybí accountStatement).', { retryable: true });
  }
  const accountCurrency = textValue(asRow(statement.info)?.currency);
  const list = asRow(statement.transactionList)?.transaction;
  const items: unknown[] = Array.isArray(list) ? list : list ? [list] : [];
  const result: BankTransaction[] = [];
  for (const item of items) {
    const row = asRow(item);
    if (!row) continue;
    const id = textValue(column(row, 22));
    const date = textValue(column(row, 0))?.slice(0, 10);
    const amount = numberValue(column(row, 1));
    if (!id || !date || !isIsoDate(date) || amount === undefined) continue;
    const tx: BankTransaction = { id, date, amount, currency: (textValue(column(row, 14)) ?? accountCurrency ?? '').toUpperCase() };
    const vs = textValue(column(row, 5));
    const ks = textValue(column(row, 4));
    const ss = textValue(column(row, 6));
    const message = textValue(column(row, 16));
    const account = textValue(column(row, 2));
    const bankCode = textValue(column(row, 3));
    const counterName = textValue(column(row, 10));
    if (vs) tx.vs = vs;
    if (ks) tx.ks = ks;
    if (ss) tx.ss = ss;
    if (message) tx.message = message;
    if (account) tx.counterAccount = bankCode ? `${account}/${bankCode}` : account;
    if (counterName) tx.counterName = counterName;
    result.push(tx);
  }
  return result;
}

/**
 * Variabilní symbol bez mezer a úvodních nul („0026110007“ → „26110007“).
 * Jiné znaky než číslice, víc než 10 platných číslic nebo samé nuly → null.
 */
export function normalizeVs(vs: string | number | null | undefined): string | null {
  if (vs === null || vs === undefined) return null;
  const s = String(vs).replace(/\s+/gu, '');
  if (!/^\d+$/.test(s)) return null;
  const significant = s.replace(/^0+/, '');
  return significant.length >= 1 && significant.length <= 10 ? significant : null;
}

/** Číselná ID (pohyby Fio) porovná podle hodnoty, ostatní jako text. */
function compareIds(a: string, b: string): number {
  if (/^\d+$/.test(a) && /^\d+$/.test(b) && a.length !== b.length) return a.length - b.length;
  return a < b ? -1 : a > b ? 1 : 0;
}

const toCents = (amount: number): number => Math.round(amount * 100);

/** Tolerance zaokrouhlení na celé koruny: ±0,50 Kč. */
const ROUNDING_CENTS = 50;

/**
 * Spáruje čekající platební výzvy s příchozími platbami v CZK podle variabilního symbolu (bez úvodních nul).
 * Platba musí pokrýt částku výzvy (o nejvýše 0,50 Kč méně kvůli zaokrouhlení), přeplatek se páruje také.
 * Každá platba i výzva se použije nejvýše jednou: napřed se párují platby s přesnou částkou, potom přeplatky;
 * při shodě vyhrává starší výzva a dřívější platba. Výsledek je seřazený podle data a ID platby.
 */
export function matchBankPayments(requests: readonly PaymentRequest[], txs: readonly BankTransaction[]): BankMatch[] {
  const byVs = new Map<string, PaymentRequest[]>();
  const pending = requests
    .filter((r) => r.status === 'pending' && Number.isFinite(r.amount))
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : compareIds(a.id, b.id)));
  for (const r of pending) {
    const vs = normalizeVs(r.vs);
    if (!vs) continue;
    const list = byVs.get(vs);
    if (list) list.push(r);
    else byVs.set(vs, [r]);
  }

  const seen = new Set<string>();
  const incoming: { tx: BankTransaction; vs: string; cents: number }[] = [];
  const ordered = [...txs].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : compareIds(a.id, b.id)));
  for (const tx of ordered) {
    if (seen.has(tx.id)) continue;
    seen.add(tx.id);
    const vs = normalizeVs(tx.vs);
    if (!vs || !(tx.amount > 0) || (tx.currency ?? '').trim().toUpperCase() !== 'CZK') continue;
    incoming.push({ tx, vs, cents: toCents(tx.amount) });
  }

  const usedRequests = new Set<string>();
  const matched: { order: number; match: BankMatch }[] = [];
  const matchedTx = new Set<number>();
  for (const pass of ['exact', 'overpaid'] as const) {
    incoming.forEach(({ tx, vs, cents }, order) => {
      if (matchedTx.has(order)) return;
      const request = byVs.get(vs)?.find((r) => {
        if (usedRequests.has(r.id)) return false;
        const diff = cents - toCents(r.amount);
        return pass === 'exact' ? Math.abs(diff) <= ROUNDING_CENTS : diff > ROUNDING_CENTS;
      });
      if (!request) return;
      usedRequests.add(request.id);
      matchedTx.add(order);
      matched.push({ order, match: { requestId: request.id, transactionId: tx.id, amount: tx.amount } });
    });
  }
  return matched.sort((a, b) => a.order - b.order).map((m) => m.match);
}
