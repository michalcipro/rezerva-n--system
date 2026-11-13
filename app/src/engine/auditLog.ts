import type { ClinicState, Ctx, Id } from '../domain/types';
import { newId } from './ids';

/** Stejný limit jako `audit()` v commands.ts – nejstarší záznamy se odřezávají. */
export const AUDIT_LIMIT = 2500;

/** Zapíše záznam do historie změn (stejně jako příkazy v commands.ts). */
export function pushAudit(d: ClinicState, ctx: Ctx, action: string, detail: string, refs: { bookingId?: Id; clientId?: Id } = {}): void {
  d.audit.push({ id: newId('a'), at: ctx.now, actor: ctx.actor.name, action, detail, ...refs });
  if (d.audit.length > AUDIT_LIMIT) d.audit.splice(0, d.audit.length - AUDIT_LIMIT);
}
