import { produce } from 'immer';
import { forgetAuth, getAuth, signOut, subscribeAuth } from '../api/auth';
import { api, ApiError } from '../api/client';
import type { ChunkData, CommandResponse, RegisterRequest, SessionInfo, StatePayload } from '../api/protocol';
import type { Actor, ClinicState, Command, CommandResult, LocalDateTime } from '../domain/types';
import { sequentialIds, withIdGenerator } from '../engine/ids';
import { commandName } from '../engine/registry';
import { clearSelectorCaches } from '../engine/selectors';
import { pragueNow } from '../engine/time';
import { toast } from '../ui';
import { getStoreState, setStore } from './core';
import { chunksToState } from './chunks';
import { setServerIdentity } from './session';

/**
 * Ostrý provoz: data kliniky drží server. Akce se v prohlížeči provedou hned (okamžitá odezva),
 * odešlou se na server se stejným ID a server je provede znovu nad aktuálními daty. Potvrzený stav
 * od serveru má vždy přednost; akce, které server odmítne, z obrazovky zmizí s vysvětlením.
 *
 * Personál dostává stav po částech a dočítá jen změny, klient dostává svůj pohled
 * (vlastní údaje + obsazenost termínů bez cizích osobních údajů).
 */

interface Pending {
  commandId: string;
  name: string;
  cmd: Command<unknown, unknown>;
  input: unknown;
  actor: Actor;
  now: LocalDateTime;
  attempts: number;
}

interface Confirmed {
  version: number;
  /** Personál: části stavu podle klíče. Klient: null (dostává celý pohled). */
  chunks: Map<string, unknown> | null;
  state: ClinicState;
  hash: string | null;
}

const POLL_MS = 15_000;

let confirmed: Confirmed | null = null;
const pending: Pending[] = [];
let pumping = false;
let syncing: Promise<void> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let listenersInstalled = false;

/** Čas kliniky v ostrém provozu (Europe/Prague bez ohledu na pásmo zařízení). */
export function serverNow(): LocalDateTime {
  return pragueNow();
}

function randomChunk(len: number): string {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += alphabet[b % 36];
  return out;
}

/** ID akce: určuje i ID nově vzniklých záznamů (prohlížeč i server je vytvoří stejně). */
export function newCommandId(): string {
  return `${Date.now().toString(36)}-${randomChunk(8)}`;
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : 'Neznámá chyba.';
}

/* ------------------------------------------------------------------ */
/* Stav od serveru                                                     */
/* ------------------------------------------------------------------ */

function applyChunks(map: Map<string, unknown>, chunks: ChunkData[]): void {
  for (const c of chunks) {
    if (c.data === null) map.delete(c.key);
    else map.set(c.key, c.data);
  }
}

/** Přijme odpověď serveru se stavem; starší odpověď než to, co už známe, ignoruje. */
function acceptPayload(p: StatePayload & { partial?: boolean }): boolean {
  if (confirmed && p.version < confirmed.version) return false;
  if (p.kind === 'unchanged') {
    if (confirmed) confirmed.version = Math.max(confirmed.version, p.version);
    return false;
  }
  if (p.kind === 'client') {
    confirmed = { version: p.version, chunks: null, state: p.state, hash: p.hash };
    return true;
  }
  const map = p.partial && confirmed?.chunks ? new Map(confirmed.chunks) : new Map<string, unknown>();
  applyChunks(map, p.chunks);
  const state = chunksToState(map);
  if (!state) throw new Error('Server poslal neúplná data kliniky.');
  confirmed = { version: p.version, chunks: map, state, hash: null };
  return true;
}

/** Zobrazený stav = potvrzený stav + akce, které ještě čekají na server. */
function rebase(): ClinicState | null {
  if (!confirmed) return null;
  let s = confirmed.state;
  for (const p of pending) {
    const restore = withIdGenerator(sequentialIds(p.commandId + '-'));
    try {
      let ok = false;
      const next = produce(s, (d) => {
        ok = p.cmd(d as ClinicState, p.input, { now: p.now, actor: p.actor }).ok;
      });
      if (ok) s = next;
    } catch {
      /* akci rozhodne server */
    } finally {
      restore();
    }
  }
  return s;
}

function publish(): void {
  const clinic = rebase();
  clearSelectorCaches();
  setStore({ clinic, remoteAt: Date.now(), pending: pending.length });
}

/* ------------------------------------------------------------------ */
/* Načtení a průběžná synchronizace                                    */
/* ------------------------------------------------------------------ */

function identityOf(s: SessionInfo): Actor | null {
  if (!s.role) return null;
  if (s.role === 'client') return { role: 'client', name: s.name, clientId: s.clientId ?? undefined };
  return { role: s.role, name: s.name, therapistId: s.therapistId ?? undefined };
}

function resetLocal(): void {
  confirmed = null;
  pending.length = 0;
  if (pollTimer) clearInterval(pollTimer);
  if (retryTimer) clearTimeout(retryTimer);
  pollTimer = null;
  retryTimer = null;
  setServerIdentity(null);
  clearSelectorCaches();
}

function signedOutState(): void {
  resetLocal();
  setStore({ status: 'signed-out', clinic: null, session: null, pending: 0, sync: 'idle', error: null });
}

async function loadFull(): Promise<void> {
  const payload = await api<StatePayload>('GET', '/state');
  confirmed = null;
  acceptPayload(payload);
  publish();
}

function installListeners(): void {
  if (listenersInstalled || typeof window === 'undefined') return;
  listenersInstalled = true;
  const wake = (): void => {
    if (document.visibilityState !== 'visible') return;
    void pump();
    void syncNow();
  };
  window.addEventListener('focus', wake);
  window.addEventListener('online', wake);
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('beforeunload', (e) => {
    if (pending.length) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  // odhlášení v jiné záložce nebo vypršení přihlášení
  subscribeAuth(() => {
    const st = getStoreState().status;
    if (!getAuth() && st !== 'signed-out') signedOutState();
    else if (getAuth() && st === 'signed-out') void initServerStore();
  });
}

function startPolling(): void {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    void syncNow();
  }, POLL_MS);
}

/** Načte přihlášeného uživatele a data kliniky. */
export async function initServerStore(): Promise<void> {
  installListeners();
  setStore({ storage: 'server' });
  if (!getAuth()) {
    signedOutState();
    return;
  }
  setStore({ status: 'loading', error: null });
  try {
    const session = await api<SessionInfo>('GET', '/session');
    setServerIdentity(identityOf(session));
    if (session.needsRegistration) {
      setStore({ status: 'register', session });
      return;
    }
    if (!session.role) {
      setStore({ status: 'error', session, error: 'Klinika zatím není v systému založená.' });
      return;
    }
    await loadFull();
    setStore({ status: 'ready', session, sync: 'saved' });
    startPolling();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) signedOutState();
    else setStore({ status: 'error', error: errorText(e) });
  }
}

/** Dočte změny od jiných zařízení. */
export function syncNow(): Promise<void> {
  if (!confirmed || !getAuth()) return Promise.resolve();
  syncing ??= (async () => {
    try {
      const c = confirmed;
      if (!c) return;
      const q = c.hash ? `&hash=${encodeURIComponent(c.hash)}` : '';
      const payload = await api<StatePayload & { partial?: boolean }>('GET', `/changes?since=${c.version}${q}`);
      if (acceptPayload(payload)) publish();
      if (getStoreState().sync === 'offline' && !pending.length) setStore({ sync: 'saved', error: null });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) signedOutState();
      else if (e instanceof ApiError && e.offline) setStore({ sync: 'offline' });
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

function scheduleRetry(attempts: number): void {
  if (retryTimer) return;
  const delay = Math.min(30_000, 2_000 * 2 ** Math.min(attempts, 4));
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void pump();
  }, delay);
}

/** Odesílá čekající akce na server – postupně, ve stejném pořadí, v jakém vznikly. */
async function pump(): Promise<void> {
  if (pumping || !pending.length || !getAuth()) return;
  pumping = true;
  setStore({ sync: 'saving' });
  try {
    while (pending.length) {
      const p = pending[0];
      let res: CommandResponse & { duplicate?: boolean };
      try {
        res = await api<CommandResponse & { duplicate?: boolean }>('POST', '/command', {
          name: p.name,
          input: p.input,
          commandId: p.commandId,
          retry: p.attempts > 0,
        });
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          signedOutState();
          return;
        }
        if (!(e instanceof ApiError) || e.offline) {
          p.attempts++;
          setStore({ sync: 'offline', error: 'Bez spojení se serverem – změny se odešlou, jakmile bude spojení zpět.' });
          scheduleRetry(p.attempts);
          return;
        }
        // server akci odmítl (neplatný vstup, chybí oprávnění) – zrušit ji i na obrazovce
        pending.shift();
        toast(`Změna se neuložila: ${e.message}`, { tone: 'danger' });
        publish();
        continue;
      }
      pending.shift();
      if (!res.ok) toast(`Změna se neuložila: ${res.error}`, { tone: 'danger' });
      const c = confirmed;
      if (c && res.ok && res.changes && c.chunks && res.version === c.version + 1) {
        const map = new Map(c.chunks);
        applyChunks(map, res.changes);
        const state = chunksToState(map);
        if (state) confirmed = { version: res.version, chunks: map, state, hash: null };
        publish();
      } else if (!c || res.version > c.version || !res.ok) {
        await syncNow();
        publish();
      } else {
        publish();
      }
    }
    setStore({ sync: 'saved', error: null, pending: 0 });
  } finally {
    pumping = false;
  }
}

/** Provede akci hned v prohlížeči a zařadí ji k odeslání na server. */
export function dispatchServer<I, R>(cmd: Command<I, R>, input: I, actor: Actor, now: LocalDateTime): CommandResult<R> {
  const clinic = getStoreState().clinic;
  if (!clinic) return { ok: false, error: 'Data nejsou načtená.' };
  const name = commandName(cmd as Command<unknown, unknown>);
  if (!name) return { ok: false, error: 'Tuto akci nelze v ostrém provozu provést.' };
  const commandId = newCommandId();
  // vstup tak, jak ho uvidí server (bez nedefinovaných hodnot)
  const wireInput = JSON.parse(JSON.stringify(input ?? {})) as I;
  let result: CommandResult<R> = { ok: false, error: 'Neznámá chyba.' };
  let next: ClinicState;
  const restore = withIdGenerator(sequentialIds(commandId + '-'));
  try {
    next = produce(clinic, (draft) => {
      result = cmd(draft as ClinicState, wireInput, { now, actor });
    });
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Akci se nepodařilo provést.' };
  } finally {
    restore();
  }
  if (!result.ok) return result;
  pending.push({ commandId, name, cmd: cmd as Command<unknown, unknown>, input: wireInput, actor, now, attempts: 0 });
  if (next !== clinic) clearSelectorCaches();
  setStore({ clinic: next, pending: pending.length, sync: 'saving' });
  void pump();
  return result;
}

/* ------------------------------------------------------------------ */
/* Přihlášení, registrace, odhlášení                                   */
/* ------------------------------------------------------------------ */

/** Registrace klienta po prvním přihlášení. */
export async function registerClient(body: RegisterRequest): Promise<void> {
  const session = await api<SessionInfo>('POST', '/register', body);
  setServerIdentity(identityOf(session));
  if (session.role !== 'client') throw new Error('Registrace se nepodařila.');
  setStore({ status: 'loading', session });
  await loadFull();
  setStore({ status: 'ready', session, sync: 'saved' });
  startPolling();
}

/** Počet akcí, které ještě nejsou uložené na serveru. */
export function pendingCount(): number {
  return pending.length;
}

export async function logout(): Promise<void> {
  await signOut();
  signedOutState();
}

/** Server zneplatnil přihlášení (např. odebraný přístup). */
export function dropSession(): void {
  forgetAuth();
  signedOutState();
}
