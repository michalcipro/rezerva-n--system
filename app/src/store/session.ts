import { useSyncExternalStore } from 'react';
import type { Actor, ActorRole, ClinicState, Id, LocalDate } from '../domain/types';
import { clientName, getClient, getTherapist, therapistName } from '../engine/selectors';

/**
 * Nastavení konkrétního prohlížeče (role v testovacím režimu, otevřená obrazovka, motiv).
 * Ukládá se do localStorage – je to jen pohodlí jednoho uživatele, ne data kliniky.
 */

/** Karty v detailu klienta (pro odkaz rovnou na konkrétní kartu). */
export type ClientTab = 'prehled' | 'poznamky' | 'rezervace' | 'followupy' | 'soubory' | 'finance' | 'komunikace' | 'souhlasy' | 'historie';

export type AdminRoute =
  | { name: 'prehled' }
  | { name: 'kalendar' }
  | { name: 'klienti' }
  | { name: 'klient'; clientId: Id; tab?: ClientTab }
  | { name: 'pipeline' }
  | { name: 'followupy' }
  | { name: 'permanentky' }
  | { name: 'sluzby' }
  | { name: 'tym' }
  | { name: 'komunikace' }
  | { name: 'statistiky' }
  | { name: 'nastaveni' };

export type PortalRoute =
  | { name: 'domu' }
  | { name: 'rezervace'; serviceId?: Id; makeupId?: Id; rescheduleBookingId?: Id }
  | { name: 'moje' }
  | { name: 'termin'; bookingId: Id }
  | { name: 'ucet' };

export interface Session {
  role: ActorRole;
  clientId: Id | null;
  therapistId: Id | null;
  route: AdminRoute;
  portalRoute: PortalRoute;
  calendarDate: LocalDate | null;
  calendarView: 'day' | 'week';
  calendarTherapist: Id | 'all';
  theme: 'system' | 'light' | 'dark';
  testBarOpen: boolean;
}

const KEY = 'winningminds.session.v1';

const DEFAULT_SESSION: Session = {
  role: 'owner',
  clientId: null,
  therapistId: 't_mala',
  route: { name: 'kalendar' },
  portalRoute: { name: 'domu' },
  calendarDate: null,
  calendarView: 'day',
  calendarTherapist: 'all',
  theme: 'system',
  testBarOpen: true,
};

function initialRoleFromHash(s: Session): Session {
  try {
    const hash = typeof location !== 'undefined' ? location.hash.replace('#', '') : '';
    if (hash === 'klient') return { ...s, role: 'client' };
    if (hash === 'recepce') return { ...s, role: 'reception' };
    const adminRoutes = ['prehled', 'kalendar', 'klienti', 'pipeline', 'followupy', 'permanentky', 'sluzby', 'tym', 'komunikace', 'statistiky', 'nastaveni'];
    if (adminRoutes.includes(hash)) return { ...s, role: s.role === 'client' ? 'owner' : s.role, route: { name: hash } as AdminRoute };
  } catch {
    /* ignore */
  }
  return s;
}

function load(): Session {
  let s = DEFAULT_SESSION;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) s = { ...DEFAULT_SESSION, ...(JSON.parse(raw) as Partial<Session>) };
  } catch {
    /* prohlížeč bez úložiště */
  }
  return initialRoleFromHash(s);
}

let session: Session = load();
const listeners = new Set<() => void>();

export function getSession(): Session {
  return session;
}

export function setSession(patch: Partial<Session> | ((s: Session) => Partial<Session>)): void {
  const p = typeof patch === 'function' ? patch(session) : patch;
  session = { ...session, ...p };
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function subscribeSession(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useSession(): Session {
  return useSyncExternalStore(subscribeSession, getSession, getSession);
}

export function navigate(route: AdminRoute): void {
  setSession({ route });
  if (typeof window !== 'undefined') window.scrollTo?.({ top: 0 });
}

export function navigatePortal(portalRoute: PortalRoute): void {
  setSession({ portalRoute });
  if (typeof window !== 'undefined') window.scrollTo?.({ top: 0 });
}

/** Kdo právě jedná (podle zvolené testovací role). */
export function actorFor(s: Session, clinic: ClinicState | null): Actor {
  switch (s.role) {
    case 'client': {
      const c = clinic && s.clientId ? getClient(clinic, s.clientId) : undefined;
      return { role: 'client', name: c ? clientName(c) : 'Klient', clientId: s.clientId ?? undefined };
    }
    case 'therapist': {
      const t = clinic && s.therapistId ? getTherapist(clinic, s.therapistId) : undefined;
      return { role: 'therapist', name: t ? therapistName(t) : 'Terapeut', therapistId: s.therapistId ?? undefined };
    }
    case 'reception':
      return { role: 'reception', name: 'Recepce' };
    default:
      return { role: 'owner', name: 'Tereza Malá', therapistId: 't_mala' };
  }
}
