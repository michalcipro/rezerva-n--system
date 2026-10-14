import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { Actor, ClinicState, Command, CommandResult, LocalDateTime } from '../domain/types';
import { nowLocal } from '../engine/time';
import { toast } from '../ui';
import { actorFor, useSession } from './session';
import { clinicNow, dispatch, getStoreState, subscribeStore, type StoreState } from './store';

/** Výběr z globálního stavu. Selektor musí vracet stabilní hodnotu (část stavu nebo primitivum). */
export function useStore<T>(selector: (s: StoreState) => T): T {
  return useSyncExternalStore(
    subscribeStore,
    () => selector(getStoreState()),
    () => selector(getStoreState()),
  );
}

/** Data kliniky – používat jen uvnitř načtené aplikace. */
export function useClinic(): ClinicState {
  const clinic = useStore((s) => s.clinic);
  if (!clinic) throw new Error('Data kliniky nejsou načtená.');
  return clinic;
}

/** Aktuální čas kliniky. Při skutečném čase se obnovuje každých 30 s. */
export function useNow(): LocalDateTime {
  const simulated = useStore((s) => s.clinic?.settings.simulatedNow ?? null);
  const [real, setReal] = useState(nowLocal());
  useEffect(() => {
    if (simulated) return undefined;
    const id = setInterval(() => setReal(nowLocal()), 30_000);
    return () => clearInterval(id);
  }, [simulated]);
  return simulated ?? real;
}

export function useActor(): Actor {
  const session = useSession();
  const clinic = useStore((s) => s.clinic);
  return actorFor(session, clinic);
}

export interface RunOptions<R> {
  /** Text potvrzení po úspěchu (nebo funkce z výsledku). */
  success?: string | ((value: R) => string);
  /** Nezobrazovat upozornění vrácená příkazem. */
  quiet?: boolean;
}

/**
 * Spuštění příkazu z UI: provede ho, zobrazí chybu nebo potvrzení a vrátí výsledek.
 *   const run = useCommand();
 *   const r = run(cancelBooking, { bookingId, option: 'excuse' }, { success: 'Omluveno' });
 */
export function useCommand(): <I, R>(cmd: Command<I, R>, input: I, opts?: RunOptions<R>) => CommandResult<R> {
  return useCallback(<I, R>(cmd: Command<I, R>, input: I, opts: RunOptions<R> = {}): CommandResult<R> => {
    const result = dispatch(cmd, input);
    if (!result.ok) {
      toast(result.error, { tone: 'danger' });
      return result;
    }
    const msg = typeof opts.success === 'function' ? opts.success(result.value) : opts.success;
    const notices = opts.quiet ? [] : result.notices;
    if (msg) toast(msg, { tone: 'success', description: notices.join(' ') || undefined });
    else if (notices.length) toast(notices[0], { tone: 'info', description: notices.slice(1).join(' ') || undefined });
    return result;
  }, []);
}

/** Čas kliniky mimo React (např. v obslužných funkcích). */
export { clinicNow };
