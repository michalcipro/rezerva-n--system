import type { Booking, ClinicState, LocalDateTime, Service } from '../domain/types';
import { formatDayShort, formatMoney, formatPercent, prepZ } from './format';
import {
  bookingsOfClient,
  excuseStatusFor,
  getPackage,
  getService,
  packageUsage,
  type ExcuseStatus,
} from './selectors';
import { addDays, addHours, dateOf, diffMinutes } from './time';

/**
 * Vyhodnocení storno podmínek pro konkrétní rezervaci v čase `now`.
 * Výsledek používá klientský portál i recepce – obě strany tak vidí totéž.
 */

export type CancelPhase = 'free' | 'late' | 'started' | 'past';

export interface PolicySegment {
  from: LocalDateTime | null;
  to: LocalDateTime;
  feePct: number;
  label: string;
  current: boolean;
}

export type CancelOptionKind = 'free' | 'excuse' | 'grace' | 'fee' | 'clinic';

export interface CancelOption {
  kind: CancelOptionKind;
  title: string;
  description: string;
  feeAmount: number;
  feePct: number;
  /** Doporučená volba (zobrazí se jako první / předvybraná). */
  recommended: boolean;
  /** Pouze pro personál. */
  staffOnly: boolean;
}

export interface CancellationEvaluation {
  phase: CancelPhase;
  minutesBefore: number;
  isGroup: boolean;
  freeUntil: LocalDateTime;
  feePct: number;
  feeAmount: number;
  /** Na co se poplatek počítá (cena termínu nebo hodnota vstupu). */
  feeBase: number;
  segments: PolicySegment[];
  excuse: ExcuseStatus & { allowed: boolean; deadline: LocalDateTime; reason: string; makeupUntil: LocalDateTime | null };
  grace: boolean;
  options: CancelOption[];
  /** Lidský popis dopadu na platbu při pozdním zrušení. */
  lateImpact: string;
}

function feeBase(s: ClinicState, b: Booking): number {
  if (b.payment.method === 'package' && b.payment.packageId) {
    const p = getPackage(s, b.payment.packageId);
    if (p) return packageUsage(s, p, dateOf(b.start)).unitValue;
  }
  return b.price;
}

function lateImpactText(s: ClinicState, b: Booking, pct: number, amount: number, isGroup: boolean): string {
  if (pct <= 0) return 'Bez poplatku.';
  if (b.payment.method === 'package') {
    if (isGroup || s.settings.policy.packageLateHandling === 'forfeit_entry')
      return 'Vstup z permanentky propadne.';
    return `Vstup se vrátí na permanentku, storno poplatek ${formatMoney(amount)} (${formatPercent(pct)}).`;
  }
  if (b.payment.method === 'makeup') return 'Náhradní termín propadne.';
  if (b.payment.paid) return `Vrátí se ${formatMoney(Math.max(0, b.payment.paidAmount - amount))} na kredit, poplatek ${formatMoney(amount)} (${formatPercent(pct)}).`;
  return `Storno poplatek ${formatMoney(amount)} (${formatPercent(pct)}).`;
}

export function isGroupBooking(s: ClinicState, b: Booking): boolean {
  const svc = getService(s, b.serviceId);
  return !!b.sessionId || svc?.kind === 'group';
}

/** První pozdní storno za posledních 12 měsíců je zdarma (pokud je pravidlo zapnuté). */
function graceAvailable(s: ClinicState, b: Booking, now: LocalDateTime): boolean {
  if (!s.settings.policy.graceFirstLateCancel) return false;
  const since = addDays(now, -365);
  return !bookingsOfClient(s, b.clientId).some(
    (x) => x.id !== b.id && (x.status === 'late_cancelled' || x.status === 'no_show') && (x.cancel?.at ?? x.start) >= since,
  );
}

export function evaluateCancellation(
  s: ClinicState,
  b: Booking,
  now: LocalDateTime,
  role: 'client' | 'staff',
): CancellationEvaluation {
  const policy = s.settings.policy;
  const isGroup = isGroupBooking(s, b);
  const minutesBefore = diffMinutes(b.start, now);
  const freeHours = isGroup ? policy.groupCancelHours : policy.freeCancelHours;
  const freeUntil = addHours(b.start, -freeHours);

  // Stupně poplatků (u skupinových lekcí jediný stupeň 100 %).
  const tiers = isGroup
    ? [{ hoursBefore: freeHours, feePct: 100 }]
    : [...policy.lateTiers].filter((t) => t.hoursBefore <= freeHours).sort((a, c) => c.hoursBefore - a.hoursBefore);
  if (!isGroup && (tiers.length === 0 || tiers[0].hoursBefore < freeHours)) {
    tiers.unshift({ hoursBefore: freeHours, feePct: tiers[0]?.feePct ?? 100 });
  }

  const segments: PolicySegment[] = [];
  segments.push({ from: null, to: freeUntil, feePct: 0, label: 'Zdarma', current: now < freeUntil });
  tiers.forEach((t, i) => {
    const from = addHours(b.start, -t.hoursBefore);
    const next = tiers[i + 1];
    const to = next ? addHours(b.start, -next.hoursBefore) : b.start;
    if (from >= to) return;
    segments.push({ from, to, feePct: t.feePct, label: `Storno ${formatPercent(t.feePct)}`, current: now >= from && now < to });
  });

  let phase: CancelPhase;
  if (b.end <= now) phase = 'past';
  else if (b.start <= now) phase = 'started';
  else if (now < freeUntil) phase = 'free';
  else phase = 'late';

  let feePct = 0;
  if (phase === 'late') {
    const hoursLeft = minutesBefore / 60;
    let applicable = tiers[0];
    for (const t of tiers) if (hoursLeft < t.hoursBefore) applicable = t;
    feePct = applicable?.feePct ?? 100;
  } else if (phase === 'started' || phase === 'past') {
    feePct = policy.noShowFeePct;
  }
  const base = feeBase(s, b);
  const feeAmount = Math.round((base * feePct) / 100);

  // Omluvenky
  const ex = excuseStatusFor(s, b, now);
  const deadline = addHours(b.start, -policy.excuses.deadlineHoursBefore);
  let excuseAllowed = policy.excuses.enabled && phase === 'late' && ex.remaining > 0 && now < deadline;
  let excuseReason = '';
  if (!policy.excuses.enabled) excuseReason = 'Omluvenky nejsou v nastavení zapnuté.';
  else if (phase === 'free') excuseReason = 'Termín lze zatím zrušit zdarma.';
  else if (phase !== 'late') excuseReason = 'Termín už začal.';
  else if (ex.remaining <= 0) excuseReason = ex.scope === 'package' ? 'Omluvenky k permanentce jsou vyčerpané.' : 'Omluvenky za sledované období jsou vyčerpané.';
  else if (now >= deadline) excuseReason = 'Lhůta pro omluvení uplynula.';
  if (b.payment.method === 'makeup') {
    excuseAllowed = false;
    excuseReason = 'Náhradní termín už nelze znovu omluvit.';
  }
  const prepaid = b.payment.method === 'package' || (b.payment.paid && b.payment.paidAmount > 0);
  const makeupUntil = excuseAllowed && prepaid ? addDays(b.start, policy.excuses.makeupDays) : null;

  const grace = phase === 'late' && feePct > 0 && graceAvailable(s, b, now);

  const options: CancelOption[] = [];
  if (phase === 'free') {
    options.push({
      kind: 'free',
      title: 'Zrušit zdarma',
      description: b.payment.method === 'package' ? 'Vstup se vrátí na permanentku.' : b.payment.paid ? 'Zaplacená částka se vrátí na kredit.' : 'Bez poplatku.',
      feeAmount: 0,
      feePct: 0,
      recommended: true,
      staffOnly: false,
    });
  } else if (phase === 'late') {
    if (excuseAllowed) {
      options.push({
        kind: 'excuse',
        title: 'Omluvit s omluvenkou',
        description:
          `Bez poplatku · zbývá ${ex.remaining} ${prepZ(ex.total)} ${ex.total} ${ex.total === 1 ? 'omluvenky' : 'omluvenek'}` +
          (makeupUntil ? ` · náhradní termín do ${formatDayShort(makeupUntil)}` : ''),
        feeAmount: 0,
        feePct: 0,
        recommended: true,
        staffOnly: false,
      });
    }
    if (grace) {
      options.push({
        kind: 'grace',
        title: 'Zrušit – první pozdní storno zdarma',
        description: 'Jednou za 12 měsíců bez poplatku.',
        feeAmount: 0,
        feePct: 0,
        recommended: !excuseAllowed,
        staffOnly: false,
      });
    }
    options.push({
      kind: 'fee',
      title: 'Zrušit se storno poplatkem',
      description: lateImpactText(s, b, feePct, feeAmount, isGroup),
      feeAmount,
      feePct,
      recommended: !excuseAllowed && !grace,
      staffOnly: false,
    });
  }
  if (role === 'staff' && (phase === 'free' || phase === 'late' || phase === 'started')) {
    options.push({
      kind: 'clinic',
      title: 'Zrušeno ze strany kliniky',
      description: 'Bez poplatku, platba se vrací v plné výši. Klient dostane omluvnou zprávu.',
      feeAmount: 0,
      feePct: 0,
      recommended: false,
      staffOnly: true,
    });
    if (phase === 'late' && !options.some((o) => o.kind === 'free')) {
      options.push({
        kind: 'free',
        title: 'Zrušit bez poplatku (výjimka)',
        description: 'Personál může poplatek odpustit, např. při doložené nemoci.',
        feeAmount: 0,
        feePct: 0,
        recommended: false,
        staffOnly: true,
      });
    }
  }

  return {
    phase,
    minutesBefore,
    isGroup,
    freeUntil,
    feePct,
    feeAmount,
    feeBase: base,
    segments,
    excuse: { ...ex, allowed: excuseAllowed, deadline, reason: excuseReason, makeupUntil },
    grace,
    options,
    lateImpact: lateImpactText(s, b, feePct, feeAmount, isGroup),
  };
}

/** Lze rezervaci přesunout bez sankce? (zdarma jen v bezplatné lhůtě) */
export function canRescheduleFree(s: ClinicState, b: Booking, now: LocalDateTime): boolean {
  const ev = evaluateCancellation(s, b, now, 'client');
  return ev.phase === 'free';
}

export function serviceDurationLabel(service: Service | undefined): string {
  return service ? `${service.durationMin} min` : '';
}
