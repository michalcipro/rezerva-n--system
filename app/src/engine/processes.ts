import type { Command, Ctx, MoneyMethod } from '../domain/types';
import { deliverCampaign, offerFreedSlot, ok } from './commands';
import { countLabel, formatDate, formatDayShort } from './format';
import { newId } from './ids';
import { bookingVars, queueTemplateMessage } from './messages';
import { getService, packageUsage } from './selectors';
import { addDays, addHours, addMinutes, dateOf, daysBetween } from './time';

/**
 * Automatické procesy (běží při spuštění, každou minutu a po posunu testovacích hodin):
 * docházka, připomínky, propadání náhrad, nabídky z čekací listiny, upozornění k permanentkám,
 * plánované kampaně a údržba objemu dat. Všechny kroky jsou idempotentní.
 */
export interface ProcessReport {
  completed: number;
  reminders: number;
  expiredMakeups: number;
  expiredOffers: number;
  campaigns: number;
}

export const runProcesses: Command<Record<string, never>, ProcessReport> = (d, _input, ctx) => {
  const report: ProcessReport = { completed: 0, reminders: 0, expiredMakeups: 0, expiredOffers: 0, campaigns: 0 };
  const now = ctx.now;
  const systemCtx: Ctx = { now, actor: { role: 'owner', name: 'Systém' } };

  // 1) Proběhlé termíny → docházka (pokud je zapnuto)
  if (d.settings.bookingRules.autoCompletePast) {
    for (const b of d.bookings) {
      if (b.status !== 'confirmed' || b.end > now) continue;
      b.status = 'completed';
      report.completed++;
      if (b.payment.method === 'onsite' && !b.payment.paid) {
        const method: MoneyMethod = 'card';
        d.payments.push({ id: newId('p'), clientId: b.clientId, at: b.end, amount: b.price, method, purpose: 'booking', bookingId: b.id, note: 'Úhrada na recepci (automaticky)' });
        b.payment.paid = true;
        b.payment.paidAmount = b.price;
        b.payment.paidAt = b.end;
        b.payment.settledBy = method;
      }
      // poděkování po návštěvě jen u čerstvě skončených termínů
      if (!b.followUpSentAt && b.end > addHours(now, -24) && addHours(b.end, 2) <= now) {
        queueTemplateMessage(d, { key: 'after_visit', clientId: b.clientId, now, bookingId: b.id, vars: bookingVars(d, b) });
        b.followUpSentAt = now;
      }
    }
  }

  // 2) Připomínky před termínem
  if (d.settings.reminders.enabled) {
    const until = addHours(now, d.settings.reminders.hoursBefore);
    for (const b of d.bookings) {
      if (b.status !== 'confirmed' || b.reminderSentAt || b.start <= now || b.start > until) continue;
      queueTemplateMessage(d, { key: 'reminder', clientId: b.clientId, now, bookingId: b.id, vars: bookingVars(d, b) });
      b.reminderSentAt = now;
      report.reminders++;
    }
  }

  // 3) Náhrady: připomenout a nechat propadnout
  for (const m of d.makeups) {
    if (m.status !== 'open') continue;
    if (m.validUntil <= now) {
      m.status = 'expired';
      report.expiredMakeups++;
      continue;
    }
    if (!m.reminderSentAt && daysBetween(dateOf(now), dateOf(m.validUntil)) <= 4) {
      queueTemplateMessage(d, { key: 'makeup_reminder', clientId: m.clientId, now, vars: { náhrada_do: formatDayShort(m.validUntil) } });
      m.reminderSentAt = now;
    }
  }

  // 4) Čekací listina: vypršelé nabídky a propadlá období
  for (const w of d.waitlist) {
    if (w.status === 'offered' && w.offer && w.offer.expiresAt <= now) {
      const offer = w.offer;
      w.status = 'waiting';
      w.offer = undefined;
      report.expiredOffers++;
      const svc = getService(d, w.serviceId);
      if (svc && offer.start > now) {
        offerFreedSlot(d, systemCtx, {
          serviceId: svc.id,
          therapistId: offer.therapistId,
          start: offer.start,
          end: addMinutes(offer.start, svc.durationMin),
          sessionId: offer.sessionId,
          excludeClientId: w.clientId,
        });
      }
    }
    if ((w.status === 'waiting' || w.status === 'offered') && w.dateTo < dateOf(now)) {
      w.status = 'expired';
      w.offer = undefined;
    }
  }

  // 5) Permanentky: poslední vstupy a konec platnosti
  const today = dateOf(now);
  for (const p of d.packages) {
    if (p.cancelled) continue;
    const u = packageUsage(d, p, today);
    if (u.expired) continue;
    if (!p.lowNoticeAt && u.free <= 2 && u.free > 0 && u.reserved === 0) {
      queueTemplateMessage(d, {
        key: 'package_low',
        clientId: p.clientId,
        now,
        vars: { permanentka: p.name, zbývá: countLabel(u.free, ['vstup', 'vstupy', 'vstupů']), platnost_do: formatDate(u.validUntil) },
      });
      p.lowNoticeAt = now;
    }
    if (!p.expiringNoticeAt && u.free > 0 && daysBetween(today, u.validUntil) <= 14) {
      queueTemplateMessage(d, {
        key: 'package_expiring',
        clientId: p.clientId,
        now,
        vars: { permanentka: p.name, zbývá: countLabel(u.free, ['vstup', 'vstupy', 'vstupů']), platnost_do: formatDate(u.validUntil) },
      });
      p.expiringNoticeAt = now;
    }
  }

  // 6) Naplánované kampaně
  for (const c of d.campaigns) {
    if (c.status === 'scheduled' && c.scheduledAt && c.scheduledAt <= now) {
      deliverCampaign(d, systemCtx, c);
      report.campaigns++;
    }
  }

  // 7) Údržba objemu dat (odeslané zprávy a audit)
  const MAX_MESSAGES = 2500;
  if (d.messages.length > MAX_MESSAGES) d.messages.splice(0, d.messages.length - MAX_MESSAGES);
  const keepAudit = addDays(now, -120);
  if (d.audit.length > 1500) d.audit = d.audit.filter((a) => a.at >= keepAudit).slice(-1500);

  return ok(report);
};
