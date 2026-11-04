import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { ClinicState, Ctx } from '../src/domain/types';
import {
  cancelBooking,
  cancelPaymentRequest,
  confirmPaymentRequest,
  createBooking,
  createClient,
  createPaymentRequest,
  joinWaitlist,
  markCompleted,
  markNoShow,
  receiveQrPayment,
  rescheduleBooking,
  settleBooking,
  updateSettings,
} from '../src/engine/commands';
import { createBaseState, DEMO_ACCOUNT } from '../src/engine/defaults';
import { fillOf, groupSessionsOverview, groupTotals } from '../src/engine/groups';
import { buildSpayd, formatIban, isValidIban, nextVs, parseAccount, paymentSpayd, spaydText } from '../src/engine/qr';
import { prepZ } from '../src/engine/format';
import { clientCredit, packagesOfClient } from '../src/engine/selectors';
import { visitPaymentInfo, visitsCsv, visitsOverview } from '../src/engine/visits';

const last = <T,>(arr: readonly T[]): T | undefined => arr[arr.length - 1];
const staff = (now: string): Ctx => ({ now, actor: { role: 'reception', name: 'Recepce' } });
const asClient = (now: string, clientId: string): Ctx => ({ now, actor: { role: 'client', name: 'Klient', clientId } });

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

function tryRun<I>(s: ClinicState, cmd: (d: ClinicState, i: I, c: Ctx) => { ok: boolean; error?: string }, input: I, ctx: Ctx): string | null {
  let error: string | null = null;
  produce(s, (d) => {
    const r = cmd(d, input, ctx);
    if (!r.ok) error = r.error ?? 'chyba';
  });
  return error;
}

function setup(withAccount = true): { s: ClinicState; clientId: string } {
  let s = createBaseState('2026-01-01');
  const r = run(s, createClient, { firstName: 'Eva', lastName: 'Testová', email: 'eva@example.com', phone: '+420 600 000 001', consents: { gdpr: true, health: true, marketingEmail: true, sms: true } }, staff('2026-10-01T09:00'));
  s = r.state;
  if (withAccount) s = run(s, updateSettings, { payments: { accountNumber: '19-2000145399/0800' } }, staff('2026-10-01T09:05')).state;
  return { s, clientId: r.value as unknown as string };
}

describe('QR Platba – účet a formát', () => {
  it('převede české číslo účtu na IBAN a odhalí překlep', () => {
    const r = parseAccount('19-2000145399/0800');
    expect(r).toEqual({ ok: true, iban: 'CZ6508000000192000145399' });
    expect(formatIban('CZ6508000000192000145399')).toBe('CZ65 0800 0000 1920 0014 5399');
    expect(parseAccount('19-2000145398/0800').ok).toBe(false);
    expect(parseAccount('2000145399').ok).toBe(false);
    expect(parseAccount('CZ65 0800 0000 1920 0014 5399')).toEqual({ ok: true, iban: 'CZ6508000000192000145399' });
    expect(isValidIban('CZ6508000000192000145398')).toBe(false);
    expect(parseAccount(DEMO_ACCOUNT.accountNumber)).toEqual({ ok: true, iban: DEMO_ACCOUNT.iban });
  });

  it('sestaví řetězec SPAYD bez diakritiky a hvězdiček', () => {
    expect(spaydText('Dvořák – Fyzio 10 * sleva', 60)).toBe('DVORAK FYZIO 10 SLEVA');
    expect(
      buildSpayd({ iban: 'CZ6508000000192000145399', amount: 1190, vs: '26110007', message: 'Dvořák Fyzioterapie 45 min', recipient: 'Klinika pohyb' }),
    ).toBe('SPD*1.0*ACC:CZ6508000000192000145399*AM:1190.00*CC:CZK*X-VS:26110007*MSG:DVORAK FYZIOTERAPIE 45 MIN*RN:KLINIKA POHYB');
  });

  it('variabilní symboly jdou v měsíci po sobě a ukázkový účet varuje „neplatit“', () => {
    const { s, clientId } = setup();
    expect(nextVs(s, '2026-11-04T10:00')).toBe('26110001');
    const r = run(s, createPaymentRequest, { clientId, purpose: 'credit_topup', amount: 2000 }, asClient('2026-11-04T10:00', clientId));
    expect(r.value.vs).toBe('26110001');
    expect(nextVs(r.state, '2026-11-04T11:00')).toBe('26110002');
    const demo = produce(r.state, (d) => {
      d.settings.payments.demoAccount = true;
    });
    expect(paymentSpayd(demo, { clientId, amount: 2000, vs: '26110001', label: 'Dobití kreditu' })).toContain('MSG:UKAZKA NEPLATIT TESTOVA DOBITI KREDITU');
  });

  it('bez platného účtu se QR platba nenabízí', () => {
    const { s, clientId } = setup(false);
    expect(tryRun(s, createPaymentRequest, { clientId, purpose: 'credit_topup', amount: 500 }, asClient('2026-11-04T10:00', clientId))).toMatch(/Nastavení/);
    expect(tryRun(s, updateSettings, { payments: { accountNumber: '124/0800' } }, staff('2026-11-04T10:00'))).toMatch(/nenulové|platné/);
  });
});

describe('QR platby – výzvy', () => {
  it('rezervace s QR platbou čeká na připsání; po potvrzení je zaplacená', () => {
    let { s, clientId } = setup();
    const b = run(s, createBooking, { clientId, serviceId: 's_fyzio45', therapistId: 't_mala', start: '2026-11-11T09:00', payment: { method: 'qr' } }, asClient('2026-11-04T10:00', clientId));
    s = b.state;
    const booking = s.bookings.find((x) => x.id === b.value)!;
    expect(booking.payment).toMatchObject({ method: 'qr', paid: false });
    const req = s.paymentRequests[0];
    expect(req).toMatchObject({ purpose: 'booking', bookingId: b.value, amount: 1190, status: 'pending', dueAt: '2026-11-06T10:00' });
    expect(visitPaymentInfo(s, booking, '2026-11-04', '2026-11-04T10:00').payState).toBe('qr_pending');
    expect(tryRun(s, confirmPaymentRequest, { requestId: req.id }, asClient('2026-11-04T11:00', clientId))).toMatch(/personál/);
    s = run(s, confirmPaymentRequest, { requestId: req.id }, staff('2026-11-04T12:00')).state;
    const paid = s.bookings.find((x) => x.id === b.value)!;
    expect(paid.payment).toMatchObject({ method: 'qr', paid: true, paidAmount: 1190, settledBy: 'qr' });
    expect(last(s.payments)).toMatchObject({ method: 'qr', amount: 1190, vs: req.vs, purpose: 'booking' });
    expect(s.paymentRequests[0].status).toBe('paid');
    const info = visitPaymentInfo(s, paid, '2026-11-04', '2026-11-04T12:00');
    expect(info).toMatchObject({ kind: 'single', payState: 'paid', detail: 'QR platbou' });
  });

  it('zrušení termínu i úhrada na místě uzavřou čekající výzvu', () => {
    let { s, clientId } = setup();
    const a = run(s, createBooking, { clientId, serviceId: 's_fyzio45', therapistId: 't_mala', start: '2026-11-11T09:00', payment: { method: 'qr' } }, asClient('2026-11-04T10:00', clientId));
    s = run(a.state, cancelBooking, { bookingId: a.value, option: 'free' }, asClient('2026-11-05T10:00', clientId)).state;
    expect(s.paymentRequests[0].status).toBe('cancelled');
    const b = run(s, createBooking, { clientId, serviceId: 's_fyzio45', therapistId: 't_mala', start: '2026-11-12T09:00', payment: { method: 'qr' } }, asClient('2026-11-05T10:00', clientId));
    s = run(b.state, markCompleted, { bookingId: b.value, settleWith: 'cash' }, staff('2026-11-12T10:00')).state;
    const done = s.bookings.find((x) => x.id === b.value)!;
    expect(done.payment).toMatchObject({ method: 'onsite', paid: true, settledBy: 'cash' });
    expect(s.paymentRequests[1].status).toBe('cancelled');
  });

  it('zrušená výzva vrátí termín k úhradě na místě; QR na recepci ho hned zaplatí', () => {
    let { s, clientId } = setup();
    const b = run(s, createBooking, { clientId, serviceId: 's_fyzio30', therapistId: 't_mala', start: '2026-11-11T09:00', payment: { method: 'qr' } }, asClient('2026-11-04T10:00', clientId));
    s = run(b.state, cancelPaymentRequest, { requestId: b.state.paymentRequests[0].id }, asClient('2026-11-04T11:00', clientId)).state;
    expect(s.bookings.find((x) => x.id === b.value)!.payment.method).toBe('onsite');
    const r = run(s, receiveQrPayment, { clientId, purpose: 'booking', bookingId: b.value, vs: '26119999' }, staff('2026-11-11T09:40'));
    expect(r.state.bookings.find((x) => x.id === b.value)!.payment).toMatchObject({ method: 'qr', paid: true, settledBy: 'qr' });
    expect(last(r.state.paymentRequests)).toMatchObject({ vs: '26119999', status: 'paid', createdBy: 'staff' });
  });

  it('přesun termínu přepíše popis výzvy a zkrátí splatnost, variabilní symbol zůstane', () => {
    let { s, clientId } = setup();
    const b = run(s, createBooking, { clientId, serviceId: 's_fyzio45', therapistId: 't_mala', start: '2026-11-11T09:00', payment: { method: 'qr' } }, asClient('2026-11-04T10:00', clientId));
    const vs = b.state.paymentRequests[0].vs;
    s = run(b.state, rescheduleBooking, { bookingId: b.value, start: '2026-11-05T09:00' }, staff('2026-11-04T12:00')).state;
    expect(s.paymentRequests[0]).toMatchObject({ vs, status: 'pending', dueAt: '2026-11-05T09:00' });
    expect(s.paymentRequests[0].label).toContain('Čt 5.');
  });

  it('permanentka zaplacená QR vznikne až po připsání platby', () => {
    let { s, clientId } = setup();
    const r = run(s, createPaymentRequest, { clientId, purpose: 'package', packageTemplateId: 'pt_fyzio5' }, asClient('2026-11-04T10:00', clientId));
    s = r.state;
    expect(packagesOfClient(s, clientId)).toHaveLength(0);
    expect(last(s.messages)?.subject).toMatch(/Platební údaje/);
    s = run(s, confirmPaymentRequest, { requestId: r.value.requestId }, staff('2026-11-05T09:00')).state;
    const pkgs = packagesOfClient(s, clientId);
    expect(pkgs).toHaveLength(1);
    expect(pkgs[0]).toMatchObject({ templateId: 'pt_fyzio5', paidBy: 'qr', purchasedAt: '2026-11-05T09:00' });
    expect(s.paymentRequests[0].packageId).toBe(pkgs[0].id);
  });

  it('dobití kreditu přes QR připíše částku i bonus až po potvrzení', () => {
    let { s, clientId } = setup();
    const r = run(s, createPaymentRequest, { clientId, purpose: 'credit_topup', amount: 5000 }, asClient('2026-11-04T10:00', clientId));
    expect(clientCredit(r.state, clientId)).toBe(0);
    s = run(r.state, confirmPaymentRequest, { requestId: r.value.requestId }, staff('2026-11-04T15:00')).state;
    expect(clientCredit(s, clientId)).toBe(5500);
  });

  it('storno poplatek lze uhradit QR platbou', () => {
    let { s, clientId } = setup();
    const b = run(s, createBooking, { clientId, serviceId: 's_fyzio45', therapistId: 't_mala', start: '2026-11-11T09:00', payment: { method: 'onsite' } }, staff('2026-11-04T10:00'));
    s = run(b.state, markNoShow, { bookingId: b.value }, staff('2026-11-11T09:20')).state;
    expect(s.bookings.find((x) => x.id === b.value)!.fee).toMatchObject({ status: 'due', amount: 1190 });
    const r = run(s, createPaymentRequest, { clientId, purpose: 'storno_fee', bookingId: b.value, sendEmail: true }, staff('2026-11-11T10:00'));
    s = run(r.state, confirmPaymentRequest, { requestId: r.value.requestId }, staff('2026-11-12T10:00')).state;
    expect(s.bookings.find((x) => x.id === b.value)!.fee).toMatchObject({ status: 'paid', settledBy: 'qr' });
  });

  it('platba za mezitím zrušený termín skončí na kreditu', () => {
    let { s, clientId } = setup();
    const b = run(s, createBooking, { clientId, serviceId: 's_fyzio45', therapistId: 't_mala', start: '2026-11-11T09:00', payment: { method: 'onsite' } }, staff('2026-11-04T10:00'));
    const r = run(b.state, createPaymentRequest, { clientId, purpose: 'booking', bookingId: b.value }, staff('2026-11-04T10:05'));
    s = produce(r.state, (d) => {
      d.bookings[0].status = 'cancelled';
    });
    const c = run(s, confirmPaymentRequest, { requestId: r.value.requestId }, staff('2026-11-05T10:00'));
    expect(c.value.message).toMatch(/kredit/);
    expect(clientCredit(c.state, clientId)).toBe(1190);
  });
});

describe('přehled vstupů', () => {
  it('rozliší permanentku, kredit, jednorázovou platbu a nezaplacené po zaměstnancích', () => {
    let { s, clientId } = setup();
    const ctx = staff('2026-11-02T08:00');
    s = run(s, createBooking, { clientId, serviceId: 's_fyzio45', therapistId: 't_mala', start: '2026-11-02T09:00', payment: { method: 'onsite' } }, ctx).state;
    s = run(s, createBooking, { clientId, serviceId: 's_fyzio45', therapistId: 't_riha', start: '2026-11-03T09:00', payment: { method: 'online' } }, asClient('2026-11-02T08:00', clientId)).state;
    s = run(s, createBooking, { clientId, serviceId: 's_fyzio45', therapistId: 't_mala', start: '2026-11-04T09:00', payment: { method: 'free' } }, ctx).state;
    const ids = s.bookings.map((b) => b.id);
    s = run(s, settleBooking, { bookingId: ids[0], method: 'card' }, staff('2026-11-02T10:00')).state;
    const o = visitsOverview(s, { from: '2026-11-02', to: '2026-11-09', therapistId: null, serviceId: null, kinds: null, status: 'all', unpaidOnly: false }, '2026-11-03', '2026-11-03T12:00');
    expect(o.rows.map((r) => [r.info.kind, r.info.payState, r.info.detail])).toEqual([
      ['single', 'paid', 'kartou na místě'],
      ['single', 'paid', 'online kartou předem'],
      ['free', 'paid', 'bez platby'],
    ]);
    const mala = o.byEmployee.find((e) => e.therapistId === 't_mala')!;
    expect(mala).toMatchObject({ total: 2, single: 1, singleRevenue: 1190 });
    expect(o.byEmployee.find((e) => e.therapistId === 't_kos')).toMatchObject({ total: 0 });
    expect(o.totals).toMatchObject({ total: 3, single: 2, singleRevenue: 2380 });
    const csv = visitsCsv(s, o.rows, { client: () => 'Eva Testová', therapist: (id) => id });
    expect(csv.startsWith('﻿Datum;Čas;Klient')).toBe(true);
    expect(csv).toContain('02.11.2026;09:00;Eva Testová;Fyzioterapie 45 min;t_mala;Plánovaný;Jednorázově;Zaplaceno;kartou na místě;1190');
  });
});

describe('skupinové lekce', () => {
  it('ukáže volná místa, plné termíny a čekající', () => {
    let s = createBaseState('2026-01-01');
    const clients: string[] = [];
    for (let i = 0; i < 13; i++) {
      const r = run(s, createClient, { firstName: 'Klient', lastName: `Číslo${i}`, email: `k${i}@example.com`, phone: '', consents: { gdpr: true, health: true, marketingEmail: false, sms: false } }, staff('2026-10-01T09:00'));
      s = r.state;
      clients.push(r.value as unknown as string);
    }
    // kruhový trénink v úterý 10. 11. 2026 v 7:00, kapacita 12
    const sessionId = 'g_kruh_ut@2026-11-10';
    for (const c of clients.slice(0, 12)) {
      s = run(s, createBooking, { clientId: c, serviceId: 's_g_kruhovy', therapistId: 't_kos', start: '2026-11-10T07:00', sessionId, payment: { method: 'onsite' } }, asClient('2026-11-04T10:00', c)).state;
    }
    s = run(s, joinWaitlist, { clientId: clients[12], serviceId: 's_g_kruhovy', therapistId: null, dateFrom: '2026-11-10', sessionId }, asClient('2026-11-04T11:00', clients[12])).state;
    const rows = groupSessionsOverview(s, '2026-11-09', '2026-11-16', { serviceId: 's_g_kruhovy' }, '2026-11-04T12:00');
    expect(rows.map((r) => r.session.start)).toEqual(['2026-11-10T07:00', '2026-11-12T07:00', '2026-11-13T17:00']);
    expect(rows[0]).toMatchObject({ booked: 12, free: 0, fill: 'full', waitlist: 1 });
    expect(rows[1]).toMatchObject({ booked: 0, free: 12, fill: 'free' });
    expect(groupSessionsOverview(s, '2026-11-09', '2026-11-16', { serviceId: 's_g_kruhovy', onlyFree: true }, '2026-11-04T12:00')).toHaveLength(2);
    expect(groupTotals(rows)).toMatchObject({ sessions: 3, freeSpots: 24, full: 1, waitlist: 1 });
    expect(fillOf(8, 6)).toBe('almost');
    expect(fillOf(12, 5)).toBe('free');
  });
});

describe('předložka z/ze před číslem', () => {
  it('ze 2, ze 12, z 10, z 50, ze 100 až 199, z 1000', () => {
    expect([2, 12, 10, 50, 100, 168, 200, 1000].map(prepZ)).toEqual(['ze', 'ze', 'z', 'z', 'ze', 'ze', 'ze', 'z']);
  });
});
