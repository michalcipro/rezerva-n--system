import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { Actor, ClinicState, Command } from '../src/domain/types';
import { createBooking, createClient, updateSettings } from '../src/engine/commands';
import { createBaseState } from '../src/engine/defaults';
import { bookingPolicy, evaluateCancellation } from '../src/engine/policy';

const owner: Actor = { role: 'owner', name: 'Majitelka' };

function run<I, R>(s: ClinicState, cmd: Command<I, R>, input: I, now: string): { s: ClinicState; value: R } {
  let value: R | undefined;
  const next = produce(s, (d) => {
    const r = cmd(d as ClinicState, input, { now, actor: owner });
    if (!r.ok) throw new Error(r.error);
    value = r.value;
  });
  return { s: next, value: value as R };
}

describe('storno podmínky platné v době rezervace', () => {
  it('změna podmínek nemění už vzniklé rezervace, nové se řídí novými', () => {
    let s = createBaseState('2026-01-01');
    const c = run(s, createClient, { firstName: 'Eva', lastName: 'Testová', email: 'eva@example.cz', phone: '', consents: { gdpr: true, health: false, marketingEmail: false, sms: false } }, '2026-11-01T09:00');
    s = c.s;
    const slot = { clientId: c.value, serviceId: 's_fyzio45', therapistId: 't_mala', payment: { method: 'onsite' as const } };
    const old = run(s, createBooking, { ...slot, start: '2026-11-20T09:00' }, '2026-11-02T10:00');
    s = old.s;
    const freeBefore = s.settings.policy.freeCancelHours;

    // majitelka zpřísní podmínky: zrušení zdarma 48 h předem a 100% poplatek za nedostavení
    s = run(s, updateSettings, { policy: { freeCancelHours: 48, noShowFeePct: 100 } }, '2026-11-05T08:00').s;
    expect(s.settings.policyHistory).toHaveLength(1);
    expect(s.settings.policyHistory![0].until).toBe('2026-11-05T08:00');

    const fresh = run(s, createBooking, { ...slot, start: '2026-11-20T11:00' }, '2026-11-05T09:00');
    s = fresh.s;
    const oldB = s.bookings.find((b) => b.id === old.value)!;
    const newB = s.bookings.find((b) => b.id === fresh.value)!;
    expect(bookingPolicy(s, oldB).freeCancelHours).toBe(freeBefore);
    expect(bookingPolicy(s, newB).freeCancelHours).toBe(48);

    // 30 hodin předem: stará rezervace ještě zdarma (24 h), nová už ne (48 h)
    const now = '2026-11-19T03:00';
    expect(evaluateCancellation(s, oldB, now, 'client').phase).toBe('free');
    expect(evaluateCancellation(s, { ...newB, start: '2026-11-20T09:00', end: '2026-11-20T09:45' }, now, 'client').phase).toBe('late');
  });

  it('uložení beze změny podmínek historii nepřidá', () => {
    const s = createBaseState('2026-01-01');
    const same = run(s, updateSettings, { policy: { freeCancelHours: s.settings.policy.freeCancelHours } }, '2026-11-05T08:00').s;
    expect(same.settings.policyHistory ?? []).toHaveLength(0);
  });
});
