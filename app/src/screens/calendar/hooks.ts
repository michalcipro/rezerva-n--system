import { useEffect, useState } from 'react';
import { useSession } from '../../store/session';

/** Reaguje na šířku okna (např. telefon ≤ 640 px). */
export function useMediaQuery(query: string): boolean {
  const get = (): boolean => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia(query);
    const onChange = (): void => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

export const PHONE_QUERY = '(max-width: 640px)';

/**
 * Smí přihlášená role číst a psát zápisy ze sezení (klinické poznámky)? Majitelka a terapeuti ano, recepce ne –
 * stejně jako karta klienta (screens/clients `usePermissions().clinical`).
 */
export function useClinicalAccess(): boolean {
  const role = useSession().role;
  return role === 'owner' || role === 'therapist';
}
