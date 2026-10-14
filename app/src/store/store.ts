import { produce } from 'immer';
import type { Actor, ClinicState, Command, CommandResult, LocalDateTime } from '../domain/types';
import { createBaseState } from '../engine/defaults';
import { runProcesses } from '../engine/processes';
import { clearSelectorCaches } from '../engine/selectors';
import { generateDemoState } from '../engine/seed';
import { dateOf, nowLocal } from '../engine/time';
import {
  COLLECTIONS,
  createArtifactAdapter,
  createLocalAdapter,
  getArtifactDb,
  sortCollection,
  type PersistenceAdapter,
  type RemoteChange,
  type StorageKind,
} from './persistence';
import { actorFor, getSession } from './session';

export type StoreStatus = 'loading' | 'empty' | 'ready' | 'error';
export type SyncStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface StoreState {
  status: StoreStatus;
  clinic: ClinicState | null;
  storage: StorageKind | null;
  sync: SyncStatus;
  error: string | null;
  busy: string | null;
  /** Kdy naposledy dorazila změna od jiného zařízení. */
  remoteAt: number | null;
}

let state: StoreState = { status: 'loading', clinic: null, storage: null, sync: 'idle', error: null, busy: null, remoteAt: null };
const listeners = new Set<() => void>();
let adapter: PersistenceAdapter | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saving: Promise<void> | null = null;
let pendingSave = false;

function set(patch: Partial<StoreState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function getStoreState(): StoreState {
  return state;
}

export function subscribeStore(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Aktuální čas kliniky (testovací hodiny nebo skutečný čas). */
export function clinicNow(clinic: ClinicState | null = state.clinic): LocalDateTime {
  return clinic?.settings.simulatedNow ?? nowLocal();
}

/* ------------------------------------------------------------------ */
/* Ukládání                                                            */
/* ------------------------------------------------------------------ */

async function flush(): Promise<void> {
  if (!adapter || !state.clinic) return;
  if (saving) {
    pendingSave = true;
    return;
  }
  const snapshot = state.clinic;
  set({ sync: 'saving' });
  saving = adapter
    .save(snapshot)
    .then(() => set({ sync: 'saved', error: null }))
    .catch((e: unknown) => {
      const code = (e as { code?: string })?.code;
      const msg =
        code === 'quota_exceeded'
          ? 'Úložiště je plné. Smažte ukázková data v testovacím panelu.'
          : code === 'revoked' || code === 'not_granted'
            ? 'Přístup k úložišti byl odebrán – změny se neukládají.'
            : 'Změny se nepodařilo uložit. Zkuste to prosím znovu.';
      set({ sync: 'error', error: msg });
    })
    .finally(() => {
      saving = null;
      if (pendingSave) {
        pendingSave = false;
        void flush();
      }
    });
  await saving;
}

function scheduleSave(delay = 500): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void flush();
  }, delay);
}

export async function saveNow(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  await flush();
}

function applyRemote(change: RemoteChange): void {
  if (!state.clinic) return;
  const next = produce(state.clinic, (d) => {
    if (change.kind === 'meta') {
      Object.assign(d, JSON.parse(JSON.stringify(change.meta)));
    } else {
      (d as unknown as Record<string, unknown>)[change.collection] = sortCollection(change.collection, change.items);
    }
  });
  clearSelectorCaches();
  set({ clinic: next, remoteAt: Date.now() });
}

/* ------------------------------------------------------------------ */
/* Inicializace                                                        */
/* ------------------------------------------------------------------ */

let initStarted = false;
let unsubscribeRemote: (() => void) | null = null;

export async function initStore(): Promise<void> {
  if (initStarted) return;
  initStarted = true;
  set({ status: 'loading' });
  const db = await getArtifactDb();
  adapter = db ? createArtifactAdapter(db) : await createLocalAdapter();
  set({ storage: adapter.kind });
  try {
    const loaded = await adapter.load();
    if (!loaded) {
      set({ status: 'empty' });
    } else {
      set({ status: 'ready', clinic: loaded, sync: 'saved' });
      runSystemProcesses();
    }
    if (adapter.subscribe) unsubscribeRemote = adapter.subscribe(applyRemote);
  } catch {
    set({ status: 'error', error: 'Data kliniky se nepodařilo načíst. Obnovte prosím stránku.' });
  }
}

export function disposeStore(): void {
  unsubscribeRemote?.();
}

/** Vygeneruje ukázkový provoz (asi 11 týdnů) a uloží ho. */
export async function loadDemoData(): Promise<void> {
  set({ busy: 'Generuji ukázkový provoz kliniky…' });
  await new Promise((r) => setTimeout(r, 30));
  try {
    const clinic = generateDemoState(nowLocal());
    clearSelectorCaches();
    set({ clinic, status: 'ready' });
    set({ busy: 'Ukládám data…' });
    await saveNow();
  } finally {
    set({ busy: null });
  }
}

/** Prázdná klinika jen s výchozím katalogem služeb a nastavením. */
export async function startEmpty(): Promise<void> {
  set({ busy: 'Připravuji prázdnou kliniku…' });
  try {
    const clinic = createBaseState(dateOf(nowLocal()));
    set({ clinic, status: 'ready' });
    await saveNow();
  } finally {
    set({ busy: null });
  }
}

/** Smaže veškerá data v úložišti a vrátí aplikaci na úvodní volbu. */
export async function wipeAll(): Promise<void> {
  set({ busy: 'Mažu data…' });
  try {
    if (saveTimer) clearTimeout(saveTimer);
    await adapter?.clear();
    clearSelectorCaches();
    set({ clinic: null, status: 'empty', sync: 'idle' });
  } finally {
    set({ busy: null });
  }
}

/* ------------------------------------------------------------------ */
/* Příkazy                                                             */
/* ------------------------------------------------------------------ */

export interface DispatchOptions {
  actor?: Actor;
  now?: LocalDateTime;
}

export function dispatch<I, R>(cmd: Command<I, R>, input: I, opts: DispatchOptions = {}): CommandResult<R> {
  const clinic = state.clinic;
  if (!clinic) return { ok: false, error: 'Data nejsou načtená.' };
  const actor = opts.actor ?? actorFor(getSession(), clinic);
  const now = opts.now ?? clinicNow(clinic);
  let result: CommandResult<R> = { ok: false, error: 'Neznámá chyba.' };
  let next: ClinicState;
  try {
    next = produce(clinic, (draft) => {
      result = cmd(draft as ClinicState, input, { now, actor });
    });
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Akci se nepodařilo provést.' };
  }
  if (!result.ok) return result;
  if (next !== clinic) {
    set({ clinic: next });
    scheduleSave();
  }
  return result;
}

/** Automatické procesy (docházka, připomínky, propadání náhrad…). */
export function runSystemProcesses(): void {
  if (!state.clinic) return;
  dispatch(runProcesses, {}, { actor: { role: 'owner', name: 'Systém' } });
}

export function hasCollections(): boolean {
  return !!state.clinic && COLLECTIONS.every((c) => Array.isArray((state.clinic as unknown as Record<string, unknown>)[c]));
}
