import { createContext, useContext } from 'react';
import type { Client } from '../domain/types';
import type { PortalRoute } from '../store/session';

/** Podstránky účtu (portál má v relaci jen route „ucet“, podstránky drží sám). */
export type AccountView = 'root' | 'udaje' | 'permanentky' | 'kredit' | 'zpravy' | 'souhlasy' | 'podminky';

/** Akce, kterou má účet po otevření rovnou spustit (např. dobití kreditu z domovské obrazovky). */
export type AccountAction = 'topup' | 'buy';

export interface PortalContextValue {
  client: Client;
  /** Přechod na jinou obrazovku portálu (posune nahoru). */
  go: (route: PortalRoute) => void;
  /** Otevře účet na dané podstránce, případně s akcí. */
  openAccount: (view: AccountView, action?: AccountAction) => void;
  accountView: AccountView;
  setAccountView: (view: AccountView) => void;
  accountAction: AccountAction | null;
  clearAccountAction: () => void;
  /** Posun na začátek obsahu (změna kroku průvodce apod.). */
  scrollToTop: () => void;
  /** Uživatel už v portálu navigoval – nové obrazovky si mohou vzít fokus. */
  hasNavigated: () => boolean;
}

export const PortalContext = createContext<PortalContextValue | null>(null);

export function usePortal(): PortalContextValue {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error('usePortal musí být uvnitř ClientPortal.');
  return ctx;
}
