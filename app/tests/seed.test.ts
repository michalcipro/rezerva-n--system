import { describe, expect, it } from 'vitest';
import { generateDemoState } from '../src/engine/seed';
import { computeStats, daySummary } from '../src/engine/stats';
import { clientCredit, packageUsage, packagesOfClient } from '../src/engine/selectors';
import { addDays, dateOf, startOfMonth } from '../src/engine/time';

describe('ukázková data', () => {
  it('vygeneruje konzistentní provoz', () => {
    const now = '2026-10-14T10:40';
    const t0 = Date.now();
    const s = generateDemoState(now);
    const ms = Date.now() - t0;
    const json = JSON.stringify(s);
    const martin = s.clients.find((c) => c.firstName === 'Martin' && c.lastName === 'Dvořák')!;
    const pk = packagesOfClient(s, martin.id)[0];
    const u = packageUsage(s, pk, dateOf(now));
    const today = daySummary(s, dateOf(now), now);
    const month = computeStats(s, { from: startOfMonth(addDays(dateOf(now), -30)), to: startOfMonth(dateOf(now)) }, now);
    const counts: Record<string, number> = {};
    for (const b of s.bookings) counts[b.status] = (counts[b.status] ?? 0) + 1;
    console.log(JSON.stringify({
      ms, sizeKB: Math.round(json.length / 1024), clients: s.clients.length, bookings: s.bookings.length, packages: s.packages.length,
      payments: s.payments.length, ledger: s.ledger.length, messages: s.messages.length, makeups: s.makeups.length, waitlist: s.waitlist.map((w) => w.status),
      counts, martin: { credit: clientCredit(s, martin.id), pkg: pk?.name, ...u }, today,
      month: { bookings: month.bookings, util: month.utilization.toFixed(2), revenue: month.revenue, cancel: month.cancellationRate.toFixed(3), noShow: month.noShowRate.toFixed(3), newClients: month.newClients, rebook: month.rebookingRate.toFixed(2) },
    }, null, 1));
    expect(u.free).toBe(4);
    expect(u.reserved).toBe(2);
    expect(clientCredit(s, martin.id)).toBe(1400);
  });
});
