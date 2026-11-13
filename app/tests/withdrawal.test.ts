import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { ClinicState, Ctx } from '../src/domain/types';
import {
  confirmPaymentRequest,
  createBooking,
  createClient,
  createPaymentRequest,
  markCompleted,
  markWithdrawalRefunded,
  sellPackage,
  updateSettings,
  withdrawalInfo,
  withdrawFromPackage,
} from '../src/engine/commands';
import { createBaseState } from '../src/engine/defaults';

const staff = (now: string): Ctx => ({ now, actor: { role: 'reception', name: 'Recepce' } });
const asClient = (now: string, clientId: string): Ctx => ({ now, actor: { role: 'client', name: 'Eva Testová', clientId } });

function run<I, R>(s: ClinicState, cmd: (d: ClinicState, i: I, c: Ctx) => { ok: boolean; value?: R; error?: string }, input: I, ctx: Ctx): { state: ClinicState; value: R } {
  let value: R | undefined;
  let error: string | undefined;
  const next = produce(s, (d) => {
    const r = cmd(d, input, ctx);
    if (r.ok) value = r.value as R;
    else error = r.error;
  });
  if (error) throw new Error(error);
  return { state: next, value: value as R };
}

/** Klientka si v portálu koupí permanentku QR platbou, recepce platbu potvrdí. */
function boughtOnline(templateId: string): { s: ClinicState; clientId: string; packageId: string } {
  let s = createBaseState('2026-01-01');
  const c = run(s, createClient, { firstName: 'Eva', lastName: 'Testová', email: 'eva@example.com', phone: '', consents: { gdpr: true, health: false, marketingEmail: false, sms: false } }, staff('2026-10-01T09:00'));
  s = run(c.state, updateSettings, { payments: { accountNumber: '19-2000145399/0800' } }, staff('2026-10-01T09:05')).state;
  const clientId = c.value as unknown as string;
  const req = run(s, createPaymentRequest, { clientId, purpose: 'package', packageTemplateId: templateId }, asClient('2026-11-02T10:00', clientId));
  s = run(req.state, confirmPaymentRequest, { requestId: (req.value as { requestId: string }).requestId }, staff('2026-11-03T09:00')).state;
  const pkg = s.packages.find((p) => p.clientId === clientId)!;
  return { s, clientId, packageId: pkg.id };
}

describe('odstoupení od smlouvy u permanentky koupené online', () => {
  it('do 14 dnů vrátí celou cenu, zruší budoucí termíny a pošle potvrzení', () => {
    const { s: s0, clientId, packageId } = boughtOnline('pt_masaz5');
    expect(s0.packages[0].onlinePurchase).toBe(true);
    const booked = run(s0, createBooking, { clientId, serviceId: 's_sport60', therapistId: 't_vavrova', start: '2026-11-12T10:00', payment: { method: 'package', packageId } }, asClient('2026-11-03T12:00', clientId));
    const info = withdrawalInfo(booked.state, booked.state.packages[0], '2026-11-05T10:00');
    expect(info).toMatchObject({ allowed: true, usedEntries: 0, reservedEntries: 1, refundAmount: booked.state.packages[0].priceCzk });

    const w = run(booked.state, withdrawFromPackage, { packageId }, asClient('2026-11-05T10:00', clientId));
    const pkg = w.state.packages[0];
    expect(pkg.cancelled).toBe(true);
    expect(pkg.withdrawal).toMatchObject({ refundAmount: pkg.priceCzk, refundDue: '2026-11-19' });
    expect(w.state.bookings[0]).toMatchObject({ status: 'cancelled' });
    expect(w.state.messages.find((m) => m.kind === 'withdrawal_received')?.body).toMatch(/do Čt 19\.\s11\./u);
    // podruhé už ne
    expect(() => run(w.state, withdrawFromPackage, { packageId }, asClient('2026-11-05T10:05', clientId))).toThrow(/už odstoupili/);

    // recepce zapíše vrácení peněz – v tržbách se objeví záporná platba
    const refunded = run(w.state, markWithdrawalRefunded, { packageId, method: 'transfer' }, staff('2026-11-06T09:00')).state;
    expect(refunded.packages[0].withdrawal?.refundedAt).toBe('2026-11-06T09:00');
    expect(refunded.payments.at(-1)).toMatchObject({ amount: -pkg.priceCzk, method: 'transfer', purpose: 'package' });
  });

  it('za využité vstupy se z ceny strhne poměrná částka', () => {
    const { s: s0, clientId, packageId } = boughtOnline('pt_masaz5');
    const b = run(s0, createBooking, { clientId, serviceId: 's_sport60', therapistId: 't_vavrova', start: '2026-11-04T10:00', payment: { method: 'package', packageId } }, staff('2026-11-03T12:00'));
    const done = run(b.state, markCompleted, { bookingId: b.value as unknown as string }, staff('2026-11-04T11:30')).state;
    const p = done.packages[0];
    const info = withdrawalInfo(done, p, '2026-11-06T10:00');
    expect(info.usedEntries).toBe(1);
    expect(info.refundAmount).toBe(Math.round(p.priceCzk - p.priceCzk / p.entriesTotal));
  });

  it('neplatí pro zdravotní služby, po 14 dnech ani pro nákup na recepci', () => {
    const fyzio = boughtOnline('pt_fyzio5');
    expect(withdrawalInfo(fyzio.s, fyzio.s.packages[0], '2026-11-04T10:00')).toMatchObject({ allowed: false, reason: expect.stringContaining('zdravotních') });

    const late = boughtOnline('pt_masaz5');
    expect(withdrawalInfo(late.s, late.s.packages[0], '2026-11-17T10:01').allowed).toBe(false);

    const desk = run(late.s, sellPackage, { clientId: late.clientId, templateId: 'pt_trening10', paidBy: 'cash' }, staff('2026-11-03T10:00'));
    const deskPkg = desk.state.packages.find((p) => p.templateId === 'pt_trening10')!;
    expect(deskPkg.onlinePurchase).toBeUndefined();
    expect(withdrawalInfo(desk.state, deskPkg, '2026-11-04T10:00')).toMatchObject({ allowed: false, reason: 'Permanentka nebyla koupena online.' });
  });

  it('klient nemůže odstoupit za někoho jiného', () => {
    const { s, packageId } = boughtOnline('pt_masaz5');
    expect(() => run(s, withdrawFromPackage, { packageId }, asClient('2026-11-05T10:00', 'c_jiny'))).toThrow(/oprávnění/);
  });
});
