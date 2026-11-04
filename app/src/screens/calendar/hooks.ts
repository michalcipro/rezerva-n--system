import { useEffect, useState } from 'react';
import { qrAvailable } from '../../engine/payments';
import { useClinic } from '../../store/hooks';
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

export interface QrOption {
  /** QR platbu lze nabídnout (zapnutá v Nastavení → Platby a s platným účtem). */
  available: boolean;
  /**
   * Jen pro majitelku: QR platba je zapnutá, ale chybí platné číslo účtu – volba se ukáže jako nedostupná
   * s tímto vysvětlením. Ostatním rolím (a při vypnuté QR platbě) se volba neukazuje vůbec.
   */
  setupHint: string | null;
}

/** Nabízet volbu „QR platba“ v platebních nabídkách personálu? */
export function useQrOption(): QrOption {
  const clinic = useClinic();
  const role = useSession().role;
  const available = qrAvailable(clinic);
  const enabled = !!clinic.settings.payments?.qrEnabled;
  return {
    available,
    setupHint: !available && enabled && role === 'owner' ? 'Pro QR platbu doplňte číslo účtu v Nastavení → Platby.' : null,
  };
}
