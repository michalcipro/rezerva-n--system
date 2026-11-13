import type { ClinicState } from '../domain/types';
import { cardPaymentsOn } from './commands';

/**
 * Přepínače funkcí (`settings.features`). Pravidla jsou stejná jako v příkazech enginu,
 * takže UI nenabídne nic, co by příkaz potom odmítl.
 */

/** Klinické poznámky (zdravotní údaje, GDPR čl. 9) – stejně jako `addClinicalNote`. */
export function clinicalNotesOn(s: ClinicState): boolean {
  const f = s.settings.features;
  return !f || !!f.clinicalNotes;
}

/** Platba kartou online (v testovací verzi simulace) – stejně jako `createBooking`, `sellPackage`, `topUpCredit`. */
export { cardPaymentsOn };
