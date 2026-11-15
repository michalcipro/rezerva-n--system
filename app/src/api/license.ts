import { addDays, daysBetween } from '../engine/time';

/**
 * Licence provozovny na platformě. Server podle ní povolí nebo omezí práci, aplikace ukáže upozornění.
 *   ok        platná
 *   expiring  platná, končí do 14 dnů (upozornění majiteli)
 *   grace     po konci platnosti ještě 14 dní vše funguje (výrazné upozornění)
 *   readonly  potom jen čtení a export – žádné nové rezervace ani změny
 *   blocked   přístup pozastavil vlastník platformy (neplacení, ukončení smlouvy)
 */

export type LicensePlan = 'trial' | 'monthly' | 'yearly' | 'lifetime';
export type LicenseStatus = 'active' | 'suspended' | 'cancelled';
export type LicenseState = 'ok' | 'expiring' | 'grace' | 'readonly' | 'blocked';

export const LICENSE_WARN_DAYS = 14;
export const LICENSE_GRACE_DAYS = 14;

export const LICENSE_PLAN_LABEL: Record<LicensePlan, string> = {
  trial: 'Zkušební',
  monthly: 'Měsíční',
  yearly: 'Roční',
  lifetime: 'Doživotní',
};

export interface LicenseView {
  plan: LicensePlan;
  status: LicenseStatus;
  /** YYYY-MM-DD; null = bez omezení */
  validUntil: string | null;
  state: LicenseState;
  /** Kolik dní zbývá do konce platnosti (záporné = po konci); null = bez omezení. */
  daysLeft: number | null;
  /** Do kdy běží lhůta po konci platnosti. */
  graceUntil: string | null;
}

export function licenseView(l: { plan: LicensePlan; status: LicenseStatus; validUntil: string | null }, today: string): LicenseView {
  const base = { plan: l.plan, status: l.status, validUntil: l.validUntil };
  if (l.status !== 'active') return { ...base, state: 'blocked', daysLeft: null, graceUntil: null };
  if (l.plan === 'lifetime' || !l.validUntil) return { ...base, state: 'ok', daysLeft: null, graceUntil: null };
  const daysLeft = daysBetween(today, l.validUntil);
  const graceUntil = addDays(l.validUntil, LICENSE_GRACE_DAYS);
  let state: LicenseState = 'ok';
  if (daysLeft < -LICENSE_GRACE_DAYS) state = 'readonly';
  else if (daysLeft < 0) state = 'grace';
  else if (daysLeft <= LICENSE_WARN_DAYS) state = 'expiring';
  return { ...base, state, daysLeft, graceUntil };
}

/** Lze vytvářet nové rezervace a měnit data? */
export const licenseWritable = (state: LicenseState): boolean => state === 'ok' || state === 'expiring' || state === 'grace';
