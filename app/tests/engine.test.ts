import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { ClinicState, Ctx } from '../src/domain/types';
import { availableSlots, checkBookingSlot } from '../src/engine/availability';
import {
  acceptWaitlistOffer,
  cancelBooking,
  createBooking,
  createClient,
  joinWaitlist,
  markNoShow,
  rescheduleBooking,
  sellPackage,
  topUpCredit,
} from '../src/engine/commands';
import { createBaseState } from '../src/engine/defaults';
import { paymentLabel } from '../src/engine/messages';
import { evaluateCancellation } from '../src/engine/policy';
import { runProcesses } from '../src/engine/processes';
import { clientCredit, packageUsage } from '../src/engine/selectors';
import { paymentOptions } from '../src/portal/logic';

const staff = (now: string): Ctx => ({ now, actor: { role: 'reception', name: 'Recepce' } });
const asClient = (now: string, clientId: string): Ctx => ({ now, actor: { role: 'client', name: 'Klient', clientId } });

/** Spustí příkaz nad kopií stavu a vrátí nový stav (jako aplikace přes Immer). */
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

function setup(): { s: ClinicState; clientId: string } {
  let s = createBaseState('2026-01-01');
  const r = run(s, createClient, { firstName: 'Eva', lastName: 'Testová', email: 'eva@example.com', phone: '+420 600 000 001', consents: { gdpr: true, health: true, marketingEmail: true, sms: true } }, staff('2026-10-01T09:00'));
  s = r.state;
  return { s, clientId: r.value as unknown as string };
}

describe('volné termíny', () => {
  it('nabízí začátky po 15 minutách a respektuje délku služby', () => {
    const { s, clientId } = setup();
    // středa 21. 10. 2026, Mgr. Tereza Malá: 7:30–12:00, 13:00–17:00; mentální koučink trvá 60 min
    const slots = availableSlots(s, { serviceId: 's_koucink', therapistId: 't_mala', date: '2026-10-21', now: '2026-10-14T10:40', mode: 'client', clientId });
    expect(slots[0].start).toBe('2026-10-21T07:30');
    expect(slots[1].start).toBe('2026-10-21T07:45');
    // poslední dopolední začátek 11:00 (konec 12:00), odpoledne 13:00, poslední 16:00
    expect(slots.some((x) => x.start === '2026-10-21T11:00')).toBe(true);
    expect(slots.some((x) => x.start === '2026-10-21T11:15')).toBe(false);
    expect(slots.some((x) => x.start === '2026-10-21T12:15')).toBe(false);
    expect(slots[slots.length - 1].start).toBe('2026-10-21T16:00');
  });

  it('obsazený termín zmizí a respektuje minimální předstih', () => {
    let { s, clientId } = setup();
    s = run(s, createBooking, { clientId, serviceId: 's_koucink', therapistId: 't_mala', start: '2026-10-21T09:00', payment: { method: 'onsite' } }, staff('2026-10-14T10:00')).state;
    const slots = availableSlots(s, { serviceId: 's_koucink', therapistId: 't_mala', date: '2026-10-21', now: '2026-10-14T10:40', mode: 'client' });
    const starts = slots.map((x) => x.start.slice(11));
    expect(starts).not.toContain('08:15'); // 8:15–9:15 by kolidovalo
    expect(starts).toContain('08:00'); // 8:00–9:00 navazuje
    expect(starts).toContain('10:00');
    const today = availableSlots(s, { serviceId: 's_koucink', therapistId: 't_mala', date: '2026-10-14', now: '2026-10-14T10:40', mode: 'client' });
    expect(today.every((x) => x.start >= '2026-10-14T12:40')).toBe(true);
  });

  it('kontrola termínu hlásí mimo pracovní dobu jako chybu pro klienta a varování pro recepci', () => {
    const { s, clientId } = setup();
    const q = { serviceId: 's_koucink', therapistId: 't_mala', start: '2026-10-21T18:00', clientId, now: '2026-10-14T10:00' };
    expect(checkBookingSlot(s, { ...q, mode: 'client' }).ok).toBe(false);
    const staffCheck = checkBookingSlot(s, { ...q, mode: 'staff' });
    expect(staffCheck.ok).toBe(true);
    expect(staffCheck.warnings.length).toBeGreaterThan(0);
  });
});

describe('storno, omluvenky a náhrady', () => {
  it('stupně poplatků 24 h / 12 h', () => {
    let { s, clientId } = setup();
    const r = run(s, createBooking, { clientId, serviceId: 's_koucink', therapistId: 't_mala', start: '2026-10-15T09:00', payment: { method: 'onsite' } }, staff('2026-10-10T10:00'));
    s = r.state;
    const b = s.bookings[0];
    expect(evaluateCancellation(s, b, '2026-10-14T08:00', 'client').phase).toBe('free');
    const late = evaluateCancellation(s, b, '2026-10-14T10:40', 'client');
    expect(late.phase).toBe('late');
    expect(late.feePct).toBe(50);
    expect(late.feeAmount).toBe(950);
    expect(evaluateCancellation(s, b, '2026-10-14T22:00', 'client').feePct).toBe(100);
  });

  it('omluvenka vrátí vstup a vytvoří náhradu, která se dá použít', () => {
    let { s, clientId } = setup();
    s = run(s, sellPackage, { clientId, templateId: 'pt_koucink10', paidBy: 'card' }, staff('2026-10-01T09:00')).state;
    const pkgId = s.packages[0].id;
    s = run(s, createBooking, { clientId, serviceId: 's_koucink', therapistId: 't_mala', start: '2026-10-15T09:00', payment: { method: 'package', packageId: pkgId } }, asClient('2026-10-10T10:00', clientId)).state;
    const bookingId = s.bookings[0].id;
    expect(packageUsage(s, s.packages[0], '2026-10-14').reserved).toBe(1);
    s = run(s, cancelBooking, { bookingId, option: 'excuse', reason: 'Nemoc' }, asClient('2026-10-14T10:40', clientId)).state;
    const u = packageUsage(s, s.packages[0], '2026-10-14');
    expect(u.reserved).toBe(0);
    expect(u.free).toBe(10);
    expect(u.excusesLeft).toBe(1);
    expect(s.makeups).toHaveLength(1);
    expect(s.makeups[0].validUntil).toBe('2026-10-29T09:00');
    s = run(s, createBooking, { clientId, serviceId: 's_koucink', therapistId: 't_mala', start: '2026-10-16T10:15', payment: { method: 'makeup' } }, asClient('2026-10-14T11:00', clientId)).state;
    expect(s.makeups[0].status).toBe('used');
    expect(packageUsage(s, s.packages[0], '2026-10-14').reserved).toBe(1);
  });

  it('nevyčerpaná náhrada propadne a spotřebuje vstup', () => {
    let { s, clientId } = setup();
    s = run(s, sellPackage, { clientId, templateId: 'pt_koucink10', paidBy: 'card' }, staff('2026-10-01T09:00')).state;
    s = run(s, createBooking, { clientId, serviceId: 's_koucink', therapistId: 't_mala', start: '2026-10-15T09:00', payment: { method: 'package' } }, staff('2026-10-10T10:00')).state;
    s = run(s, cancelBooking, { bookingId: s.bookings[0].id, option: 'excuse' }, asClient('2026-10-14T20:00', s.clients[0].id)).state;
    s = run(s, runProcesses, {}, staff('2026-10-30T08:00')).state;
    expect(s.makeups[0].status).toBe('expired');
    expect(packageUsage(s, s.packages[0], '2026-10-30').forfeited).toBe(1);
  });

  it('pozdní storno bez permanentky strhne poplatek z kreditu', () => {
    let { s, clientId } = setup();
    s = run(s, topUpCredit, { clientId, amount: 1000, method: 'cash' }, staff('2026-10-01T09:00')).state;
    s = run(s, createBooking, { clientId, serviceId: 's_neuro', therapistId: 't_vavrova', start: '2026-10-15T16:00', payment: { method: 'onsite' } }, staff('2026-10-10T10:00')).state;
    s = run(s, cancelBooking, { bookingId: s.bookings[0].id, option: 'fee' }, asClient('2026-10-14T20:00', clientId)).state;
    expect(s.bookings[0].status).toBe('late_cancelled');
    expect(s.bookings[0].fee?.amount).toBe(600);
    expect(clientCredit(s, clientId)).toBe(400);
  });

  it('nedostavení s permanentkou spotřebuje vstup', () => {
    let { s, clientId } = setup();
    s = run(s, sellPackage, { clientId, templateId: 'pt_koucink5', paidBy: 'card' }, staff('2026-10-01T09:00')).state;
    s = run(s, createBooking, { clientId, serviceId: 's_koucink', therapistId: 't_mala', start: '2026-10-14T09:00', payment: { method: 'package' } }, staff('2026-10-10T10:00')).state;
    s = run(s, markNoShow, { bookingId: s.bookings[0].id }, staff('2026-10-14T09:20')).state;
    const u = packageUsage(s, s.packages[0], '2026-10-14');
    expect(u.forfeited).toBe(1);
    expect(u.free).toBe(4);
  });

  it('klient po lhůtě přesune termín jen s omluvenkou', () => {
    let { s, clientId } = setup();
    s = run(s, sellPackage, { clientId, templateId: 'pt_koucink10', paidBy: 'card' }, staff('2026-10-01T09:00')).state;
    s = run(s, createBooking, { clientId, serviceId: 's_koucink', therapistId: 't_mala', start: '2026-10-15T09:00', payment: { method: 'package' } }, staff('2026-10-10T10:00')).state;
    const id = s.bookings[0].id;
    expect(() => run(s, rescheduleBooking, { bookingId: id, start: '2026-10-16T10:15' }, asClient('2026-10-14T20:00', clientId))).toThrow();
    s = run(s, rescheduleBooking, { bookingId: id, start: '2026-10-16T10:15', useExcuse: true }, asClient('2026-10-14T20:00', clientId)).state;
    expect(s.bookings.find((b) => b.id === id)?.status).toBe('excused');
    expect(s.bookings.some((b) => b.start === '2026-10-16T10:15' && b.status === 'confirmed' && b.payment.method === 'makeup')).toBe(true);
  });
});

describe('čekací listina', () => {
  it('uvolněný termín se nabídne a čekající ho může potvrdit', () => {
    let { s, clientId } = setup();
    const second = run(s, createClient, { firstName: 'Jan', lastName: 'Čekající', email: 'jan@example.com', phone: '', consents: { gdpr: true, health: true, marketingEmail: false, sms: true } }, staff('2026-10-01T09:00'));
    s = second.state;
    const waiterId = second.value as unknown as string;
    s = run(s, createBooking, { clientId, serviceId: 's_koucink', therapistId: 't_mala', start: '2026-10-16T09:00', payment: { method: 'onsite' } }, staff('2026-10-10T10:00')).state;
    s = run(s, joinWaitlist, { clientId: waiterId, serviceId: 's_koucink', therapistId: 't_mala', dateFrom: '2026-10-16' }, asClient('2026-10-12T10:00', waiterId)).state;
    s = run(s, cancelBooking, { bookingId: s.bookings[0].id, option: 'free' }, asClient('2026-10-14T10:00', clientId)).state;
    const entry = s.waitlist[0];
    expect(entry.status).toBe('offered');
    expect(entry.offer?.start).toBe('2026-10-16T09:00');
    s = run(s, acceptWaitlistOffer, { entryId: entry.id, payment: { method: 'onsite' } }, asClient('2026-10-14T10:30', waiterId)).state;
    expect(s.waitlist[0].status).toBe('booked');
    expect(s.bookings.some((b) => b.clientId === waiterId && b.status === 'confirmed')).toBe(true);
  });
});

describe('služba zdarma (Freetalk)', () => {
  it('klient si ji v portálu rezervuje zdarma, placenou službu zdarma ne', () => {
    let { s, clientId } = setup();
    const now = '2026-10-14T10:00';
    const opts = paymentOptions(s, { clientId, serviceId: 's_freetalk', start: '2026-10-21T09:00', now });
    expect(opts.map((o) => o.payment.method)).toEqual(['free']);
    s = run(s, createBooking, { clientId, serviceId: 's_freetalk', therapistId: 't_mala', start: '2026-10-21T09:00', payment: { method: 'free' } }, asClient(now, clientId)).state;
    const b = s.bookings[0];
    expect(b.payment.paid).toBe(true);
    expect(paymentLabel(s, b)).toBe('zdarma');
    expect(() =>
      run(s, createBooking, { clientId, serviceId: 's_koucink', therapistId: 't_mala', start: '2026-10-21T13:00', payment: { method: 'free' } }, asClient(now, clientId)),
    ).toThrow('Tento způsob platby není dostupný.');
  });

  it('platba na místě u služby za 0 Kč se v e-mailu ukáže jako „zdarma“', () => {
    let { s, clientId } = setup();
    s = run(s, createBooking, { clientId, serviceId: 's_freetalk', therapistId: 't_mala', start: '2026-10-21T09:00', payment: { method: 'onsite' } }, staff('2026-10-14T10:00')).state;
    expect(paymentLabel(s, s.bookings[0])).toBe('zdarma');
  });
});
