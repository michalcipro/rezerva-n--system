import type { SessionInfo } from '../api/protocol';
import type { ClinicState } from '../domain/types';
import type { StorageKind } from './persistence';

/** Globální stav aplikace (data kliniky + stav načítání a ukládání). */

export type StoreStatus = 'loading' | 'empty' | 'ready' | 'error' | 'signed-out' | 'register';
export type SyncStatus = 'idle' | 'saving' | 'saved' | 'error' | 'offline';

export interface StoreState {
  status: StoreStatus;
  clinic: ClinicState | null;
  storage: StorageKind | null;
  sync: SyncStatus;
  error: string | null;
  busy: string | null;
  /** Kdy naposledy dorazila změna od jiného zařízení. */
  remoteAt: number | null;
  /** Ostrý provoz: přihlášený uživatel a jeho role. */
  session: SessionInfo | null;
  /** Ostrý provoz: počet akcí, které ještě nepotvrdil server. */
  pending: number;
}

let state: StoreState = {
  status: 'loading',
  clinic: null,
  storage: null,
  sync: 'idle',
  error: null,
  busy: null,
  remoteAt: null,
  session: null,
  pending: 0,
};
const listeners = new Set<() => void>();

export function setStore(patch: Partial<StoreState>): void {
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
