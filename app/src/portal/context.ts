import { createContext, useContext } from 'react';
import type { Client, Id } from '../domain/types';
import type { PortalRoute } from '../store/session';

/** Podstránky účtu (portál má v relaci jen route „ucet“, podstránky drží sám). */
export type AccountView = 'root' | 'udaje' | 'permanentky' | 'kredit' | 'zpravy' | 'souhlasy' | 'podminky';

/** Akce, kterou má účet po otevření rovnou spustit (např. dobití kreditu z domovské obrazovky). */
export type AccountAction = 'topup' | 'buy';

/**
 * Jednorázový záměr pro další obrazovku (relace zná jen route, tohle drží portál sám):
 * – `bookSession`: průvodce rezervací rovnou vybere termín skupinové lekce,
 * – `showQr`: detail termínu rovnou ukáže QR kód čekající platby.
 * Platí jen do další navigace.
 */
export type PortalIntent = { kind: 'bookSession'; sessionId: Id } | { kind: 'showQr'; bookingId: Id };

export interface PortalContextValue {
  client: Client;
  /** Přechod na jinou obrazovku portálu (posune nahoru); volitelně se záměrem pro novou obrazovku. */
  go: (route: PortalRoute, intent?: PortalIntent) => void;
  /** Otevře účet na dané podstránce, případně s akcí. */
  openAccount: (view: AccountView, action?: AccountAction) => void;
  accountView: AccountView;
  setAccountView: (view: AccountView) => void;
  accountAction: AccountAction | null;
  clearAccountAction: () => void;
  /** Záměr předaný poslední navigací (null = žádný). */
  intent: PortalIntent | null;
  /** Obrazovka záměr převzala – při dalším vykreslení se už neuplatní. */
  clearIntent: () => void;
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
