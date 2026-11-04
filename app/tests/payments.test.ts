import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { Booking, ClinicState, Ctx, PaymentRequest } from '../src/domain/types';
import {
  cancelBooking,
  cancelPaymentRequest,
  cancelSession,
  confirmPaymentRequest,
  createBooking,
  createClient,
  createPaymentRequest,
  joinWaitlist,
  markCompleted,
  markNoShow,
  payFee,
  rescheduleBooking,
  sellPackage,
  settleBooking,
  topUpCredit,
  updateSettings,
  upsertPackageTemplate,
  waiveFee,
} from '../src/engine/commands';
import { createBaseState } from '../src/engine/defaults';
import { groupOverviewSummary, groupSessionsOverview, sessionFill } from '../src/engine/groups';
import { paymentLabel } from '../src/engine/messages';
import {
  findPaymentRequestsByVs,
  MONEY_METHOD_LABEL,
  nextVariableSymbol,
  paymentRequestEmail,
  paymentRequestOutcome,
  paymentRequestSpayd,
  paymentRequestTitle,
  pendingPaymentRequests,
  pendingRequestOfBooking,
  qrAvailable,
} from '../src/engine/payments';
import { runProcesses } from '../src/engine/processes';
import { buildSpayd, czechAccountToIban, formatIban, isValidIban } from '../src/engine/qr';
import { generateDemoState } from '../src/engine/seed';
import { clearSelectorCaches, clientCredit, clientSummary, getPackage, getPackageTemplate, getService, sessionsOnDate } from '../src/engine/selectors';
import { computeStats } from '../src/engine/stats';
import { visitPaymentInfo, visitsOverview, VISIT_SOURCES, type VisitFilters } from '../src/engine/visits';
import { qrMatrix, qrPath, QR_MARGIN } from '../src/components/payments/qrMatrix';
import { COLLECTIONS, createArtifactAdapter, migrateMeta, normalizeState, takeMigrationFlag } from '../src/store/persistence';

const NOW = '2026-11-04T09:00'; // středa
const TODAY = '2026-11-04';
const ACCOUNT = '19-2000145399/0800';
const IBAN = 'CZ6508000000192000145399';
const sp = (x: string): string => x.replace(/ /g, ' ');

const owner = (now = NOW): Ctx => ({ now, actor: { role: 'owner', name: 'Tereza Malá', therapistId: 't_mala' } });
const reception = (now = NOW): Ctx => ({ now, actor: { role: 'reception', name: 'Recepce' } });
const asClient = (clientId: string, now = NOW): Ctx => ({ now, actor: { role: 'client', name: 'Klient', clientId } });

type Cmd<I, R> = (d: ClinicState, i: I, c: Ctx) => { ok: true; value: R; notices: string[] } | { ok: false; error: string };

/** Spustí příkaz nad kopií stavu (jako aplikace přes Immer); chyba příkazu → výjimka. */
function run<I, R>(s: ClinicState, cmd: Cmd<I, R>, input: I, ctx: Ctx = owner()): { state: ClinicState; value: R; notices: string[] } {
  let value: R | undefined;
  let error: string | undefined;
  let notices: string[] = [];
  const next = produce(s, (d) => {
    const r = cmd(d as ClinicState, input, ctx);
    if (r.ok) {
      value = r.value;
      notices = r.notices;
    } else error = r.error;
  });
  if (error !== undefined) throw new Error(error);
  return { state: next, value: value as R, notices };
}

/** Chyba příkazu (stav se nemění). */
function failure<I, R>(s: ClinicState, cmd: Cmd<I, R>, input: I, ctx: Ctx = owner()): string {
  try {
    run(s, cmd, input, ctx);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error('Příkaz měl selhat.');
}

/** Klinika s účtem pro QR platbu a klienty. */
function setup(clients = 3): { s: ClinicState; ids: string[] } {
  clearSelectorCaches();
  let s = createBaseState('2026-01-01');
  s = run(s, updateSettings, { payments: { accountNumber: ACCOUNT } }).state;
  const ids: string[] = [];
  for (let i = 0; i < clients; i++) {
    const r = run(
      s,
      createClient,
      { firstName: ['Jana', 'Petr', 'Eva', 'Karel', 'Lenka', 'Tomáš', 'Hana'][i % 7], lastName: `Nováková${i}`, email: `k${i}@example.com`, phone: '', consents: { gdpr: true, health: true, marketingEmail: false, sms: false } },
      reception('2026-10-01T09:00'),
    );
    s = r.state;
    ids.push(r.value);
  }
  return { s, ids };
}

function book(s: ClinicState, input: Parameters<typeof createBooking>[1], ctx: Ctx = reception()): { state: ClinicState; id: string } {
  const r = run(s, createBooking, { override: true, ...input }, ctx);
  return { state: r.state, id: r.value };
}

const bookingOf = (s: ClinicState, id: string): Booking => s.bookings.find((b) => b.id === id) as Booking;
const requestOf = (s: ClinicState, id: string): PaymentRequest => s.paymentRequests.find((r) => r.id === id) as PaymentRequest;

/* ------------------------------------------------------------------ */
/* qr.ts                                                               */
/* ------------------------------------------------------------------ */

describe('QR Platba – účet, IBAN a SPAYD', () => {
  it('převede české číslo účtu na IBAN', () => {
    expect(czechAccountToIban('19-2000145399/0800')).toEqual({ ok: true, iban: 'CZ6508000000192000145399' });
    // příklad IBAN pro účet bez předčíslí (ČNB / Wikipedie): 1234567899/0800
    expect(czechAccountToIban('1234567899/0800')).toEqual({ ok: true, iban: 'CZ5508000000001234567899' });
    // mezery a vodicí nuly nevadí
    expect(czechAccountToIban(' 000019 - 2000145399 / 0800 ')).toEqual({ ok: true, iban: 'CZ6508000000192000145399' });
    const r = czechAccountToIban('2900000048/2010');
    expect(r.ok && isValidIban(r.iban)).toBe(true);
  });

  it('odmítne neplatná čísla účtů s českou hláškou', () => {
    const err = (a: string): string => {
      const r = czechAccountToIban(a);
      if (r.ok) throw new Error('mělo selhat: ' + a);
      return r.error;
    };
    expect(err('')).toMatch(/Zadejte číslo účtu/);
    expect(err('2000145399')).toMatch(/tvaru/);
    expect(err('abc/0800')).toMatch(/tvaru/);
    expect(err('2000145399/080')).toMatch(/Kód banky musí mít 4 číslice/);
    expect(err('2000145398/0800')).toMatch(/kontrolní součet/);
    expect(err('18-2000145399/0800')).toMatch(/Předčíslí/);
    expect(err('1234567-2000145399/0800')).toMatch(/tvaru/);
    expect(err('0/0800')).toMatch(/aspoň 2/);
    // příklady z hlášky (stejné jako v nápovědě Nastavení → Platby) samy projdou kontrolním součtem
    const examples = err('2000145399').match(/[\d-]+\/\d{4}/g) ?? [];
    expect(examples).toHaveLength(2);
    for (const ex of examples) expect(czechAccountToIban(ex).ok).toBe(true);
  });

  it('ověří a naformátuje IBAN', () => {
    expect(isValidIban(IBAN)).toBe(true);
    expect(isValidIban('cz65 0800 0000 1920 0014 5399')).toBe(true);
    expect(isValidIban('CZ6608000000192000145399')).toBe(false);
    expect(isValidIban('CZ650800000019200014539')).toBe(false); // krátký
    expect(isValidIban('DE89370400440532013000')).toBe(true);
    expect(isValidIban('')).toBe(false);
    expect(formatIban(IBAN)).toBe('CZ65 0800 0000 1920 0014 5399');
    expect(formatIban('cz65 08000000192000145399')).toBe('CZ65 0800 0000 1920 0014 5399');
  });

  it('sestaví řetězec SPAYD 1.0 podle standardu ČBA', () => {
    expect(buildSpayd({ iban: IBAN, amount: 1900, vs: '26110007', message: 'Mentální koučink 14. 10. 2026 – Martin Dvořák', recipient: 'Winning Minds' })).toBe(
      'SPD*1.0*ACC:CZ6508000000192000145399*AM:1900.00*CC:CZK*X-VS:26110007*MSG:MENTALNI KOUCINK 14. 10. 2026 - MARTIN DVORAK*RN:WINNING MINDS',
    );
    // částka s tečkou a dvěma desetinnými místy, IBAN bez mezer
    expect(buildSpayd({ iban: 'CZ65 0800 0000 1920 0014 5399', amount: 1234.5 })).toBe('SPD*1.0*ACC:CZ6508000000192000145399*AM:1234.50*CC:CZK');
    expect(buildSpayd({ iban: IBAN, amount: 0.1 + 0.2 })).toContain('*AM:0.30*');
    // nulová částka a prázdná pole se vynechají
    expect(buildSpayd({ iban: IBAN, amount: 0, vs: '', message: '  ', recipient: '' })).toBe('SPD*1.0*ACC:CZ6508000000192000145399*CC:CZK');
  });

  it('hvězdičku a diakritiku z hodnot odstraní, zkrátí zprávu, jméno i VS', () => {
    const out = buildSpayd({
      iban: IBAN,
      amount: 450,
      vs: 'VS: 12-34 567 890 123',
      message: 'Příliš žluťoučký kůň*úpěl ďábelské ódy „hned“ a ještě mnohem déle než šedesát znaků',
      recipient: 'Winning Minds – koučink, terapie a mentoring s.r.o.',
    });
    const fields = Object.fromEntries(out.split('*').slice(2).map((f) => [f.slice(0, f.indexOf(':')), f.slice(f.indexOf(':') + 1)]));
    expect(out.startsWith('SPD*1.0*')).toBe(true);
    expect(fields['X-VS']).toBe('1234567890');
    expect(fields.MSG.length).toBeLessThanOrEqual(60);
    expect(fields.MSG.startsWith('PRILIS ZLUTOUCKY KUN UPEL DABELSKE ODY "HNED"')).toBe(true);
    expect(fields.RN.length).toBeLessThanOrEqual(35);
    expect(fields.RN).toBe('WINNING MINDS - KOUCINK, TERAPIE A');
    expect(out.split('*').length).toBe(8); // SPD, 1.0, ACC, AM, CC, X-VS, MSG, RN – v hodnotách žádná '*'
    expect(/^[\x20-\x7e]*$/.test(out)).toBe(true);
  });

  it('QR matice: oprava chyb M, okraj 4 moduly, cesta jen z obdélníků v mřížce', () => {
    const spayd = buildSpayd({ iban: IBAN, amount: 1900, vs: '26110007', message: 'Mentální koučink', recipient: 'Winning Minds' });
    const m = qrMatrix(spayd);
    expect(m.count).toBeGreaterThanOrEqual(21);
    expect((m.count - 17) % 4).toBe(0);
    // vyhledávací vzor v levém horním rohu
    expect(m.isDark(0, 0) && m.isDark(0, 6) && m.isDark(6, 0) && !m.isDark(1, 1) && m.isDark(3, 3)).toBe(true);
    const path = qrPath(m);
    expect(path.startsWith(`M${QR_MARGIN} ${QR_MARGIN}h7v1h-7z`)).toBe(true);
    let dark = 0;
    for (let r = 0; r < m.count; r++) for (let c = 0; c < m.count; c++) if (m.isDark(r, c)) dark++;
    const covered = [...path.matchAll(/h(\d+)v1/g)].reduce((n, x) => n + Number(x[1]), 0);
    expect(covered).toBe(dark);
    // text s diakritikou (bajtový režim UTF-8) se také zakóduje
    expect(qrMatrix('Platba – Dvořák').count).toBeGreaterThanOrEqual(21);
  });
});

/* ------------------------------------------------------------------ */
/* Nastavení plateb                                                    */
/* ------------------------------------------------------------------ */

describe('nastavení plateb', () => {
  it('výchozí hodnoty a výpočet IBAN z čísla účtu', () => {
    const base = createBaseState('2026-01-01');
    expect(base.settings.payments).toEqual({ qrEnabled: true, accountNumber: '', iban: '', recipientName: 'Winning Minds', qrDueHours: 48 });
    expect(base.paymentRequests).toEqual([]);
    expect(qrAvailable(base)).toBe(false);
    const s = run(base, updateSettings, { payments: { accountNumber: ACCOUNT, recipientName: ' Winning Minds s.r.o. ', qrDueHours: 24 } }).state;
    expect(s.settings.payments).toEqual({ qrEnabled: true, accountNumber: ACCOUNT, iban: IBAN, recipientName: 'Winning Minds s.r.o.', qrDueHours: 24 });
    expect(qrAvailable(s)).toBe(true);
    expect(failure(s, updateSettings, { payments: { accountNumber: '2000145398/0800' } })).toMatch(/kontrolní součet/);
    expect(failure(s, updateSettings, { payments: { recipientName: 'x'.repeat(36) } })).toMatch(/35 znaků/);
    expect(failure(s, updateSettings, { payments: { qrDueHours: 0 } })).toMatch(/1–720/);
    expect(failure(s, updateSettings, { payments: { qrEnabled: false } }, asClient('c_x'))).toMatch(/personál/);
    const cleared = run(s, updateSettings, { payments: { accountNumber: '' } }).state;
    expect(cleared.settings.payments.iban).toBe('');
    expect(qrAvailable(cleared)).toBe(false);
    expect(qrAvailable(run(s, updateSettings, { payments: { qrEnabled: false } }).state)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Platební výzvy                                                      */
/* ------------------------------------------------------------------ */

describe('platební výzvy – QR platba', () => {
  it('rezervace s QR platbou: nezaplacená + výzva, potvrzení zaplatí termín', () => {
    const { s: s0, ids } = setup();
    const c = ids[0];
    const created = run(s0, createBooking, { clientId: c, serviceId: 's_koucink', therapistId: 't_mala', start: '2026-11-06T09:00', payment: { method: 'qr' } }, asClient(c));
    let s = created.state;
    const b = bookingOf(s, created.value);
    expect(b.payment).toMatchObject({ method: 'qr', paid: false, paidAmount: 0 });
    const req = pendingRequestOfBooking(s, b.id) as PaymentRequest;
    expect(req).toMatchObject({ clientId: c, createdBy: 'client', amount: 1900, purpose: 'booking', bookingId: b.id, status: 'pending', vs: '26110001', paidAt: null, confirmedBy: null });
    expect(req.dueAt).toBe('2026-11-06T09:00'); // 48 h by bylo až po začátku termínu
    expect(req.message).toBe('Mentální koučink 6. 11. 2026 – Jana Nováková0');
    expect(sp(created.notices.join(' '))).toContain('VS 26110001');
    expect(sp(paymentLabel(s, b))).toBe('QR platbou převodem (1 900 Kč, VS 26110001)');
    expect(visitPaymentInfo(s, b, TODAY)).toMatchObject({ source: 'qr_pending', label: 'Čeká na QR platbu', amount: 1900, prepaid: false });
    expect(paymentRequestSpayd(s, req)).toBe(
      'SPD*1.0*ACC:CZ6508000000192000145399*AM:1900.00*CC:CZK*X-VS:26110001*MSG:MENTALNI KOUCINK 6. 11. 2026 - JANA NOVAKOVA0*RN:WINNING MINDS',
    );
    const mail = paymentRequestEmail(s, req);
    expect(mail.subject).toContain('Mentální koučink');
    expect(mail.body).toContain('Variabilní symbol: 26110001');
    expect(mail.body).toContain('IBAN: CZ65 0800 0000 1920 0014 5399');

    // klient platbu potvrdit nemůže
    expect(failure(s, confirmPaymentRequest, { requestId: req.id }, asClient(c))).toMatch(/personál/);
    expect(failure(s, confirmPaymentRequest, { requestId: req.id, at: '2026-11-05T09:00' }, reception())).toMatch(/budoucnosti/);
    s = run(s, confirmPaymentRequest, { requestId: req.id, at: '2026-11-04T10:30' }, reception('2026-11-04T11:00')).state;
    const paidReq = requestOf(s, req.id);
    expect(paidReq).toMatchObject({ status: 'paid', paidAt: '2026-11-04T10:30', confirmedBy: 'Recepce' });
    const paidB = bookingOf(s, b.id);
    expect(paidB.payment).toMatchObject({ method: 'qr', paid: true, paidAmount: 1900, settledBy: 'qr', paidAt: '2026-11-04T10:30' });
    const rec = s.payments.filter((p) => p.bookingId === b.id);
    expect(rec).toHaveLength(1);
    expect(rec[0]).toMatchObject({ method: 'qr', amount: 1900, purpose: 'booking', at: '2026-11-04T10:30' });
    expect(rec[0].note).toContain('VS 26110001');
    expect(s.audit.some((a) => a.action === 'Potvrzení QR platby' && a.bookingId === b.id)).toBe(true);
    expect(s.audit.some((a) => a.action === 'Platební výzva (QR)' && a.bookingId === b.id)).toBe(true);
    expect(visitPaymentInfo(s, paidB, TODAY)).toMatchObject({ source: 'single', label: 'Jednorázově', detail: 'QR platbou · VS 26110001', amount: 1900 });
    expect(failure(s, confirmPaymentRequest, { requestId: req.id }, reception())).toMatch(/už byla potvrzena/);
    // zrušení zaplaceného termínu vrátí peníze na kredit
    s = run(s, cancelBooking, { bookingId: b.id, option: 'free' }, asClient(c)).state;
    expect(clientCredit(s, c)).toBe(1900);
  });

  it('zaplacení jinak výzvu uzavře, zrušení rezervace ji zruší, zrušená výzva nechá termín nezaplacený', () => {
    const { s: s0, ids } = setup();
    const c = ids[0];
    // 1) zaplaceno kartou na recepci
    let r = book(s0, { clientId: c, serviceId: 's_koucink', therapistId: 't_mala', start: '2026-11-02T09:00', payment: { method: 'qr' } });
    let s = r.state;
    const req1 = pendingRequestOfBooking(s, r.id) as PaymentRequest;
    expect(req1.createdBy).toBe('staff');
    expect(req1.dueAt).toBe('2026-11-06T09:00'); // termín proběhl → 48 h od vystavení
    s = run(s, markCompleted, { bookingId: r.id, settleWith: 'card' }).state;
    expect(requestOf(s, req1.id).status).toBe('cancelled');
    expect(bookingOf(s, r.id).payment).toMatchObject({ method: 'onsite', paid: true, settledBy: 'card' });
    expect(visitPaymentInfo(s, bookingOf(s, r.id), TODAY)).toMatchObject({ source: 'single', detail: 'kartou na místě' });

    // 2) QR platba přímo na recepci (settleBooking 'qr') výzvu označí jako zaplacenou
    r = book(s, { clientId: c, serviceId: 's_koucink', therapistId: 't_mala', start: '2026-11-02T10:00', payment: { method: 'qr' } });
    s = r.state;
    const req2 = pendingRequestOfBooking(s, r.id) as PaymentRequest;
    s = run(s, settleBooking, { bookingId: r.id, method: 'qr' }).state;
    expect(requestOf(s, req2.id)).toMatchObject({ status: 'paid', confirmedBy: 'Tereza Malá' });
    expect(s.payments.find((p) => p.bookingId === r.id)?.note).toContain(`VS ${req2.vs}`);

    // 3) zrušení rezervace zruší výzvu
    r = book(s, { clientId: c, serviceId: 's_koucink', therapistId: 't_mala', start: '2026-11-09T09:00', payment: { method: 'qr' } });
    s = r.state;
    const req3 = pendingRequestOfBooking(s, r.id) as PaymentRequest;
    s = run(s, cancelBooking, { bookingId: r.id, option: 'free' }, asClient(c)).state;
    expect(requestOf(s, req3.id).status).toBe('cancelled');
    expect(clientCredit(s, c)).toBe(0);

    // 4) omluvení pozdě zrušeného termínu zruší výzvu (bez náhrady – nebylo zaplaceno)
    r = book(s, { clientId: c, serviceId: 's_koucink', therapistId: 't_mala', start: '2026-11-04T15:00', payment: { method: 'qr' } });
    s = r.state;
    const req4 = pendingRequestOfBooking(s, r.id) as PaymentRequest;
    expect(req4.dueAt).toBe('2026-11-04T15:00');
    s = run(s, cancelBooking, { bookingId: r.id, option: 'excuse' }, asClient(c)).state;
    expect(requestOf(s, req4.id).status).toBe('cancelled');
    expect(s.makeups.filter((m) => m.sourceBookingId === r.id)).toHaveLength(0);

    // 5) ruční zrušení výzvy: termín zůstane nezaplacený a lze ho zaplatit jinak
    r = book(s, { clientId: c, serviceId: 's_koucink', therapistId: 't_mala', start: '2026-11-03T09:00', payment: { method: 'qr' } });
    s = r.state;
    const req5 = pendingRequestOfBooking(s, r.id) as PaymentRequest;
    expect(failure(s, cancelPaymentRequest, { requestId: req5.id }, asClient(ids[1]))).toMatch(/oprávnění/);
    const cancelled = run(s, cancelPaymentRequest, { requestId: req5.id, reason: 'Klient zaplatí hotově' }, asClient(c));
    s = cancelled.state;
    expect(cancelled.notices[0]).toMatch(/zaplatit jinak/);
    expect(requestOf(s, req5.id).status).toBe('cancelled');
    expect(failure(s, cancelPaymentRequest, { requestId: req5.id })).toMatch(/už je zrušená/);
    // bez čekající výzvy se termín platí na místě – rezervace se přepne zpět na „na místě“
    expect(bookingOf(s, r.id).payment).toMatchObject({ method: 'onsite', paid: false });
    // platba podle zrušené výzvy přesto přišla: termín je pořád nezaplacený, takže ho uhradí
    const late = run(s, confirmPaymentRequest, { requestId: req5.id }, reception());
    expect(bookingOf(late.state, r.id).payment).toMatchObject({ paid: true, settledBy: 'qr' });
    expect(requestOf(late.state, req5.id).status).toBe('paid');
    expect(late.notices.join(' ')).toMatch(/zrušená/);
    // popis platby (detail, šablony zpráv) už QR nezmiňuje
    expect(sp(paymentLabel(s, bookingOf(s, r.id)))).toBe('na místě (1 900 Kč)');
    s = run(s, markCompleted, { bookingId: r.id }).state;
    expect(visitPaymentInfo(s, bookingOf(s, r.id), TODAY)).toMatchObject({ source: 'unpaid', amount: 1900 });
    // dluh se počítá i u nezaplaceného QR termínu
    s = run(s, settleBooking, { bookingId: r.id, method: 'cash' }).state;
    expect(bookingOf(s, r.id).payment).toMatchObject({ method: 'onsite', settledBy: 'cash', paid: true });

    // 6) nedostavení zruší výzvu k termínu, poplatek lze zaplatit QR
    r = book(s, { clientId: c, serviceId: 's_koucink', therapistId: 't_mala', start: '2026-11-03T10:00', payment: { method: 'qr' } });
    s = r.state;
    const req6 = pendingRequestOfBooking(s, r.id) as PaymentRequest;
    s = run(s, markNoShow, { bookingId: r.id }).state;
    expect(requestOf(s, req6.id).status).toBe('cancelled');
    expect(bookingOf(s, r.id).fee).toMatchObject({ status: 'due', amount: 1900 });
    expect(visitPaymentInfo(s, bookingOf(s, r.id), TODAY)).toMatchObject({ source: 'unpaid', amount: 1900 });
  });

  it('účely výzev: permanentka, dobití kreditu s bonusem, storno poplatek', () => {
    const { s: s0, ids } = setup();
    const c = ids[0];
    // permanentka – vznikne až po zaplacení
    let r = run(s0, createPaymentRequest, { clientId: c, purpose: 'package', packageTemplateId: 'pt_koucink10' }, asClient(c));
    let s = r.state;
    const pkReq = requestOf(s, r.value);
    expect(pkReq).toMatchObject({ amount: 16900, purpose: 'package', packageTemplateId: 'pt_koucink10', createdBy: 'client', dueAt: '2026-11-06T09:00' });
    expect(pkReq.message).toBe('Permanentka Koučink 10× – Jana Nováková0');
    expect(s.packages).toHaveLength(0);
    s = run(s, confirmPaymentRequest, { requestId: pkReq.id }, reception()).state;
    const paidPk = requestOf(s, pkReq.id);
    expect(paidPk.packageId).toBeTruthy();
    const pkg = getPackage(s, paidPk.packageId as string);
    expect(pkg).toMatchObject({ clientId: c, templateId: 'pt_koucink10', paidBy: 'qr', priceCzk: 16900 });
    expect(s.payments.find((p) => p.packageId === pkg?.id)).toMatchObject({ method: 'qr', purpose: 'package', amount: 16900 });
    expect(s.payments.find((p) => p.packageId === pkg?.id)?.note).toContain(`VS ${pkReq.vs}`);

    // dobití kreditu – částka povinná, min. 100 Kč, bonus podle nastavení
    expect(failure(s, createPaymentRequest, { clientId: c, purpose: 'credit_topup' }, asClient(c))).toMatch(/Minimální dobití/);
    expect(failure(s, createPaymentRequest, { clientId: c, purpose: 'credit_topup', amount: 99 }, asClient(c))).toMatch(/Minimální dobití/);
    expect(failure(s, createPaymentRequest, { clientId: c, purpose: 'credit_topup', amount: 200000 }, asClient(c))).toMatch(/Maximální/);
    expect(failure(s, createPaymentRequest, { clientId: ids[1], purpose: 'credit_topup', amount: 500 }, asClient(c))).toMatch(/jen za sebe/);
    r = run(s, createPaymentRequest, { clientId: c, purpose: 'credit_topup', amount: 5000 }, asClient(c));
    s = r.state;
    const topReq = requestOf(s, r.value);
    expect(topReq.message).toBe('Dobití kreditu – Jana Nováková0');
    const confirmed = run(s, confirmPaymentRequest, { requestId: topReq.id }, reception());
    s = confirmed.state;
    expect(clientCredit(s, c)).toBe(5500);
    expect(sp(confirmed.notices.join(' '))).toContain('bonus 500 Kč');
    expect(s.ledger.find((e) => e.kind === 'topup' && e.clientId === c)).toMatchObject({ amount: 5000, method: 'qr' });
    expect(s.payments.find((p) => p.purpose === 'credit_topup')).toMatchObject({ method: 'qr', amount: 5000 });

    // storno poplatek: nezaplacený termín zrušený po lhůtě, klient nemá dost kreditu → poplatek k úhradě
    const c2 = ids[1];
    let b = book(s, { clientId: c2, serviceId: 's_koucink', therapistId: 't_mala', start: '2026-11-04T15:00', payment: { method: 'onsite' } });
    s = b.state;
    s = run(s, cancelBooking, { bookingId: b.id, option: 'fee' }, asClient(c2)).state;
    const fee = bookingOf(s, b.id).fee;
    expect(fee).toMatchObject({ status: 'due', amount: 1900, reason: 'late_cancel' });
    expect(failure(s, createPaymentRequest, { clientId: c2, purpose: 'storno_fee', bookingId: 'b_neexistuje' })).toMatch(/Rezervace neexistuje/);
    r = run(s, createPaymentRequest, { clientId: c2, purpose: 'storno_fee', bookingId: b.id }, reception());
    s = r.state;
    const feeReq = requestOf(s, r.value);
    expect(feeReq).toMatchObject({ amount: 1900, purpose: 'storno_fee', bookingId: b.id, createdBy: 'staff' });
    expect(feeReq.message.startsWith('Storno poplatek 4. 11. 2026')).toBe(true);
    // znovu vystavená výzva k témuž poplatku vrátí tu čekající
    expect(run(s, createPaymentRequest, { clientId: c2, purpose: 'storno_fee', bookingId: b.id }, reception()).value).toBe(feeReq.id);
    expect(visitPaymentInfo(s, bookingOf(s, b.id), TODAY)).toMatchObject({ source: 'qr_pending', amount: 1900 });
    s = run(s, confirmPaymentRequest, { requestId: feeReq.id }, reception()).state;
    expect(bookingOf(s, b.id).fee).toMatchObject({ status: 'paid', settledBy: 'qr' });
    expect(s.payments.find((p) => p.purpose === 'storno_fee')).toMatchObject({ method: 'qr', amount: 1900 });
    expect(visitPaymentInfo(s, bookingOf(s, b.id), TODAY)).toMatchObject({ source: 'single', detail: 'storno poplatek QR platbou', amount: 1900 });

    // poplatek zaplacený jinak / odpuštěný výzvu zruší
    b = book(s, { clientId: c2, serviceId: 's_koucink', therapistId: 't_mala', start: '2026-11-04T16:00', payment: { method: 'onsite' } });
    s = run(b.state, cancelBooking, { bookingId: b.id, option: 'fee' }, asClient(c2)).state;
    let fr = run(s, createPaymentRequest, { clientId: c2, purpose: 'storno_fee', bookingId: b.id });
    s = run(fr.state, payFee, { bookingId: b.id, method: 'cash' }).state;
    expect(requestOf(s, fr.value).status).toBe('cancelled');
    b = book(s, { clientId: c2, serviceId: 's_koucink', therapistId: 't_mala', start: '2026-11-04T14:00', payment: { method: 'onsite' } });
    s = run(b.state, cancelBooking, { bookingId: b.id, option: 'fee' }, asClient(c2)).state;
    fr = run(s, createPaymentRequest, { clientId: c2, purpose: 'storno_fee', bookingId: b.id });
    s = run(fr.state, waiveFee, { bookingId: b.id, reason: 'Nemoc' }).state;
    expect(requestOf(s, fr.value).status).toBe('cancelled');
    expect(failure(s, createPaymentRequest, { clientId: c2, purpose: 'storno_fee', bookingId: b.id })).toMatch(/nemá neuhrazený poplatek/);
  });

  it('QR platba na recepci bez výzvy: settleBooking, payFee, sellPackage a topUpCredit přijmou „qr“', () => {
    const { s: s0, ids } = setup();
    const c = ids[0];
    let s = run(s0, sellPackage, { clientId: c, templateId: 'pt_koucink5', paidBy: 'qr' }).state;
    expect(s.packages[0].paidBy).toBe('qr');
    s = run(s, topUpCredit, { clientId: c, amount: 1000, method: 'qr' }).state;
    expect(s.ledger.find((e) => e.kind === 'topup')?.note).toBe('Dobití QR platbou');
    const b = book(s, { clientId: c, serviceId: 's_terapie', therapistId: 't_benesova', start: '2026-11-02T09:00', payment: { method: 'onsite' } });
    s = run(b.state, markCompleted, { bookingId: b.id, settleWith: 'qr' }).state;
    expect(bookingOf(s, b.id).payment).toMatchObject({ method: 'onsite', paid: true, settledBy: 'qr' });
    expect(visitPaymentInfo(s, bookingOf(s, b.id), TODAY)).toMatchObject({ source: 'single', detail: 'QR platbou' });
    expect(s.payments.map((p) => p.method)).toEqual(['qr', 'qr', 'qr']);
    expect(MONEY_METHOD_LABEL.qr).toBe('QR platbou');
    const stats = computeStats(s, { from: '2026-11-01', to: '2026-12-01' }, NOW);
    expect(stats.revenueByMethod.qr).toBe(8900 + 1000 + 1500);
    expect(stats.revenue).toBe(8900 + 1000 + 1500);
  });

  it('bez účtu nebo s vypnutou QR platbou nelze výzvu vystavit', () => {
    const { s, ids } = setup();
    const noAccount = run(s, updateSettings, { payments: { accountNumber: '' } }).state;
    expect(failure(noAccount, createPaymentRequest, { clientId: ids[0], purpose: 'credit_topup', amount: 500 })).toMatch(/chybí číslo účtu/);
    expect(
      failure(noAccount, createBooking, { clientId: ids[0], serviceId: 's_koucink', therapistId: 't_mala', start: '2026-11-06T09:00', payment: { method: 'qr' } }, asClient(ids[0])),
    ).toMatch(/chybí číslo účtu/);
    const off = run(s, updateSettings, { payments: { qrEnabled: false } }).state;
    expect(failure(off, createPaymentRequest, { clientId: ids[0], purpose: 'credit_topup', amount: 500 })).toMatch(/vypnutá/);
    // termín zdarma se QR neplatí
    expect(
      failure(s, createBooking, { clientId: ids[0], serviceId: 's_freetalk', therapistId: 't_mala', start: '2026-11-06T09:00', payment: { method: 'qr' }, override: true }, reception()),
    ).toMatch(/zdarma/);
  });

  it('variabilní symbol je jedinečný: RRMM + pořadí v měsíci na 4 místa', () => {
    const { s: s0, ids } = setup();
    let s = s0;
    const vs: string[] = [];
    for (let i = 0; i < 12; i++) {
      const r = run(s, createPaymentRequest, { clientId: ids[i % ids.length], purpose: 'credit_topup', amount: 100 + i }, reception(`2026-11-0${1 + (i % 9)}T10:00`));
      s = r.state;
      vs.push(requestOf(s, r.value).vs);
    }
    expect(vs).toEqual(Array.from({ length: 12 }, (_, i) => '2611' + String(i + 1).padStart(4, '0')));
    // další měsíc začíná znovu od 0001, předchozí měsíc pokračuje za maximem
    let r = run(s, createPaymentRequest, { clientId: ids[0], purpose: 'credit_topup', amount: 300 }, reception('2026-12-01T08:00'));
    s = r.state;
    expect(requestOf(s, r.value).vs).toBe('26120001');
    expect(nextVariableSymbol(s, '2026-11-30T10:00')).toBe('26110013');
    // jedinečnost i při ručně vložené kolizi
    s = produce(s, (d) => {
      d.paymentRequests.push({ ...d.paymentRequests[0], id: 'pr_manual', vs: '26120002' });
    });
    r = run(s, createPaymentRequest, { clientId: ids[0], purpose: 'credit_topup', amount: 300 }, reception('2026-12-02T08:00'));
    expect(requestOf(r.state, r.value).vs).toBe('26120003');
    const all = r.state.paymentRequests.map((x) => x.vs);
    expect(new Set(all).size).toBe(all.length);
    expect(all.every((v) => /^\d{8}$/.test(v))).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Výzvy – přesun, zrušení, potvrzení po zrušení (opravy z kontroly)   */
/* ------------------------------------------------------------------ */

describe('platební výzvy – okrajové případy', () => {
  it('platba podle výzvy zrušené se zrušením termínu nebo úhradou jinak se připíše na kredit', () => {
    const { s: s0, ids } = setup();
    const c = ids[0];
    // 1) klient zaplatí z banky a pak termín bez poplatku zruší → výzva se zruší, peníze ale přijdou
    let r = book(s0, { clientId: c, serviceId: 's_koucink', therapistId: 't_mala', start: '2026-11-20T09:00', payment: { method: 'qr' } }, asClient(c));
    let s = r.state;
    const req1 = pendingRequestOfBooking(s, r.id) as PaymentRequest;
    s = run(s, cancelBooking, { bookingId: r.id, option: 'free' }, asClient(c, '2026-11-04T10:00')).state;
    expect(requestOf(s, req1.id).status).toBe('cancelled');
    expect(pendingPaymentRequests(s)).toHaveLength(0);
    expect(paymentRequestOutcome(s, requestOf(s, req1.id))).toEqual({ kind: 'credit', reason: 'Rezervace byla zrušena' });
    // personál ji najde podle VS z výpisu (i zrušenou) a potvrdí
    expect(findPaymentRequestsByVs(s, req1.vs).map((x) => x.id)).toEqual([req1.id]);
    expect(findPaymentRequestsByVs(s, ' VS ' + req1.vs.slice(2))[0]?.id).toBe(req1.id);
    expect(findPaymentRequestsByVs(s, 'abc')).toEqual([]);
    let conf = run(s, confirmPaymentRequest, { requestId: req1.id, at: '2026-11-04T10:00' }, reception('2026-11-05T09:00'));
    s = conf.state;
    expect(sp(conf.notices.join(' '))).toContain('Rezervace byla zrušena – 1 900 Kč připsáno klientovi na kredit.');
    expect(requestOf(s, req1.id)).toMatchObject({ status: 'paid', paidAt: '2026-11-04T10:00', confirmedBy: 'Recepce' });
    expect(clientCredit(s, c)).toBe(1900);
    expect(s.payments.find((p) => p.note.includes(`VS ${req1.vs}`))).toMatchObject({ method: 'qr', amount: 1900, purpose: 'credit_topup', at: '2026-11-04T10:00' });
    expect(s.ledger.find((e) => e.kind === 'topup' && e.clientId === c)).toMatchObject({ amount: 1900, method: 'qr', bookingId: r.id });
    expect(failure(s, confirmPaymentRequest, { requestId: req1.id }, reception())).toMatch(/už byla potvrzena/);
    expect(paymentRequestOutcome(s, requestOf(s, req1.id)).kind).toBe('blocked');

    // 2) pozdní storno s poplatkem z kreditu, QR platba ale už byla na cestě → po potvrzení je na kreditu
    const c2 = ids[1];
    s = run(s, topUpCredit, { clientId: c2, amount: 2000, method: 'cash' }).state;
    r = book(s, { clientId: c2, serviceId: 's_koucink', therapistId: 't_mala', start: '2026-11-04T15:00', payment: { method: 'qr' } }, asClient(c2));
    s = r.state;
    const req2 = pendingRequestOfBooking(s, r.id) as PaymentRequest;
    s = run(s, cancelBooking, { bookingId: r.id, option: 'fee' }, asClient(c2, '2026-11-04T10:00')).state;
    expect(bookingOf(s, r.id).fee).toMatchObject({ amount: 1900, status: 'paid', settledBy: 'credit' });
    expect(clientCredit(s, c2)).toBe(100);
    s = run(s, confirmPaymentRequest, { requestId: req2.id }, reception('2026-11-04T12:00')).state;
    expect(clientCredit(s, c2)).toBe(2000);

    // 3) klient zaplatil QR převodem a recepce mezitím vzala i kartu → zaplaceno dvakrát, druhá platba na kredit
    const c3 = ids[2];
    r = book(s, { clientId: c3, serviceId: 's_koucink', therapistId: 't_mala', start: '2026-11-02T09:00', payment: { method: 'qr' } });
    s = r.state;
    const req3 = pendingRequestOfBooking(s, r.id) as PaymentRequest;
    s = run(s, settleBooking, { bookingId: r.id, method: 'card' }).state;
    expect(requestOf(s, req3.id).status).toBe('cancelled');
    expect(paymentRequestOutcome(s, requestOf(s, req3.id)).reason).toBe('Termín byl mezitím zaplacen jinak');
    s = run(s, confirmPaymentRequest, { requestId: req3.id }, reception()).state;
    expect(clientCredit(s, c3)).toBe(1900);
    expect(bookingOf(s, r.id).payment).toMatchObject({ paid: true, settledBy: 'card' });

    // 4) nedostavení: výzva k termínu se zruší, poplatek čeká – platba jde na kredit a personál dostane radu
    r = book(s, { clientId: c3, serviceId: 's_koucink', therapistId: 't_mala', start: '2026-11-03T09:00', payment: { method: 'qr' } });
    s = r.state;
    const req4 = pendingRequestOfBooking(s, r.id) as PaymentRequest;
    s = run(s, markNoShow, { bookingId: r.id }).state;
    expect(bookingOf(s, r.id).fee).toMatchObject({ status: 'paid', settledBy: 'credit' }); // strženo z kreditu 1 900 Kč
    conf = run(s, confirmPaymentRequest, { requestId: req4.id }, reception());
    expect(conf.notices[0]).toMatch(/nedostavení/);
    expect(clientCredit(conf.state, c3)).toBe(1900);
  });

  it('zrušenou výzvu k termínu, který pořád čeká na úhradu, platba uhradí a další čekající výzvu zruší', () => {
    const { s: s0, ids } = setup();
    const c = ids[0];
    const r = book(s0, { clientId: c, serviceId: 's_koucink', therapistId: 't_mala', start: '2026-11-09T09:00', payment: { method: 'qr' } }, asClient(c));
    let s = r.state;
    const first = pendingRequestOfBooking(s, r.id) as PaymentRequest;
    s = run(s, cancelPaymentRequest, { requestId: first.id }, asClient(c)).state;
    expect(bookingOf(s, r.id).payment.method).toBe('onsite');
    // klient si pak vystaví novou výzvu (nový VS) – zaplatí ale podle té první
    const second = run(s, createPaymentRequest, { clientId: c, purpose: 'booking', bookingId: r.id }, asClient(c));
    s = second.state;
    expect(requestOf(s, second.value).vs).not.toBe(first.vs);
    expect(paymentRequestOutcome(s, requestOf(s, first.id))).toEqual({ kind: 'apply', reason: '' });
    s = run(s, confirmPaymentRequest, { requestId: first.id }, reception()).state;
    expect(requestOf(s, first.id).status).toBe('paid');
    expect(requestOf(s, second.value).status).toBe('cancelled');
    expect(bookingOf(s, r.id).payment).toMatchObject({ paid: true, settledBy: 'qr' });
    const rec = s.payments.filter((p) => p.bookingId === r.id);
    expect(rec).toHaveLength(1);
    expect(rec[0].note).toContain(`VS ${first.vs}`);
    expect(visitPaymentInfo(s, bookingOf(s, r.id), TODAY)).toMatchObject({ source: 'single', detail: `QR platbou · VS ${first.vs}` });
  });

  it('zrušená QR výzva vrátí termín na platbu na místě – automatika ho po návštěvě vyrovná jako ostatní', () => {
    const { s: s0, ids } = setup();
    const c = ids[0];
    let a = book(s0, { clientId: c, serviceId: 's_koucink', therapistId: 't_mala', start: '2026-11-05T09:00', payment: { method: 'onsite' } }, asClient(c));
    let s = a.state;
    const b2 = book(s, { clientId: c, serviceId: 's_koucink', therapistId: 't_mala', start: '2026-11-05T11:00', payment: { method: 'onsite' } }, asClient(c));
    s = b2.state;
    // klient otevře QR platbu předem a pak zvolí „Zaplatím jinak“
    const req = run(s, createPaymentRequest, { clientId: c, purpose: 'booking', bookingId: a.id }, asClient(c));
    s = req.state;
    expect(bookingOf(s, a.id).payment.method).toBe('qr');
    s = run(s, cancelPaymentRequest, { requestId: req.value }, asClient(c)).state;
    expect(bookingOf(s, a.id).payment).toMatchObject({ method: 'onsite', paid: false });
    expect(sp(paymentLabel(s, bookingOf(s, a.id)))).toBe('na místě (1 900 Kč)');
    s = run(s, runProcesses, {}, owner('2026-11-05T13:00')).state;
    for (const id of [a.id, b2.id]) expect(bookingOf(s, id)).toMatchObject({ status: 'completed', payment: { method: 'onsite', paid: true, settledBy: 'card' } });
    expect(clientSummary(s, c, '2026-11-05T13:00').debt).toBe(0);

    // starší data: rezervace „QR převodem“ bez čekající výzvy (zrušená dřív, než se metoda přepínala zpět)
    a = book(s, { clientId: c, serviceId: 's_koucink', therapistId: 't_mala', start: '2026-11-06T09:00', payment: { method: 'qr' } }, asClient(c));
    s = produce(a.state, (d) => {
      for (const r of d.paymentRequests) if (r.bookingId === a.id) r.status = 'cancelled';
    });
    s = run(s, runProcesses, {}, owner('2026-11-06T12:00')).state;
    expect(bookingOf(s, a.id)).toMatchObject({ status: 'completed', payment: { method: 'onsite', paid: true, settledBy: 'card' } });
    // s čekající výzvou se QR termín automaticky nezaplatí
    a = book(s, { clientId: c, serviceId: 's_koucink', therapistId: 't_mala', start: '2026-11-09T09:00', payment: { method: 'qr' } }, asClient(c));
    s = run(a.state, runProcesses, {}, owner('2026-11-09T12:00')).state;
    expect(bookingOf(s, a.id)).toMatchObject({ status: 'completed', payment: { method: 'qr', paid: false } });
  });

  it('permanentka z QR objednávky se vystaví podle podmínek z objednávky, i když se šablona mezitím změní', () => {
    const { s: s0, ids } = setup();
    const c = ids[0];
    const r = run(s0, createPaymentRequest, { clientId: c, purpose: 'package', packageTemplateId: 'pt_koucink10' }, asClient(c));
    let s = r.state;
    expect(requestOf(s, r.value).packageTerms).toEqual({
      name: 'Koučink 10×',
      entries: 10,
      serviceIds: ['s_koucink', 's_koucink_online'],
      validityDays: 183,
      excusesAllowed: 2,
    });
    const tpl = getPackageTemplate(s, 'pt_koucink10');
    if (!tpl) throw new Error('chybí šablona');
    s = run(s, upsertPackageTemplate, { ...tpl, name: 'Koučink 5×', entries: 5, priceCzk: 9999, validityDays: 30, serviceIds: ['s_koucink'], excusesAllowed: 0 }).state;
    // název ve výzvě zůstává podle objednávky
    expect(paymentRequestTitle(s, requestOf(s, r.value))).toBe('Permanentka Koučink 10×');
    s = run(s, confirmPaymentRequest, { requestId: r.value }, reception()).state;
    const pkg = getPackage(s, requestOf(s, r.value).packageId as string);
    expect(pkg).toMatchObject({
      name: 'Koučink 10×',
      entriesTotal: 10,
      priceCzk: 16900,
      serviceIds: ['s_koucink', 's_koucink_online'],
      excusesAllowed: 2,
      validUntil: '2027-05-06',
      templateId: 'pt_koucink10',
    });
    // zrušená objednávka, kterou klient přesto zaplatil → kredit (permanentku si z něj může koupit)
    const r2 = run(s, createPaymentRequest, { clientId: c, purpose: 'package', packageTemplateId: 'pt_koucink5' }, asClient(c));
    s = run(r2.state, cancelPaymentRequest, { requestId: r2.value }, asClient(c)).state;
    const before = clientCredit(s, c);
    s = run(s, confirmPaymentRequest, { requestId: r2.value }, reception()).state;
    expect(clientCredit(s, c) - before).toBe(requestOf(s, r2.value).amount);
    expect(s.packages).toHaveLength(1);
  });

  it('datum připsání nesmí být před vystavením výzvy (týž den se posune na okamžik vystavení)', () => {
    const { s: s0, ids } = setup();
    const r = run(s0, createPaymentRequest, { clientId: ids[0], purpose: 'credit_topup', amount: 5000 }, reception('2026-11-03T15:00'));
    const s = r.state;
    expect(sp(failure(s, confirmPaymentRequest, { requestId: r.value, at: '2026-10-01T12:00' }, reception()))).toMatch(/před vystavením výzvy \(3\. 11\. 2026\)/);
    expect(failure(s, confirmPaymentRequest, { requestId: r.value, at: '2026-11-02T23:59' }, reception())).toMatch(/před vystavením/);
    const same = run(s, confirmPaymentRequest, { requestId: r.value, at: '2026-11-03T12:00' }, reception()).state;
    expect(requestOf(same, r.value).paidAt).toBe('2026-11-03T15:00');
    expect(same.payments.find((p) => p.purpose === 'credit_topup')?.at).toBe('2026-11-03T15:00');
    const stats = computeStats(same, { from: '2026-10-01', to: '2026-11-01' }, NOW);
    expect(stats.revenue).toBe(0);
  });

  it('přesun termínu upraví čekající výzvě splatnost i zprávu, VS zůstane', () => {
    const { s: s0, ids } = setup();
    const c = ids[0];
    const r = book(s0, { clientId: c, serviceId: 's_koucink', therapistId: 't_mala', start: '2026-11-20T09:00', payment: { method: 'qr' } });
    let s = r.state;
    const req = pendingRequestOfBooking(s, r.id) as PaymentRequest;
    expect(req.dueAt).toBe('2026-11-06T09:00');
    expect(req.message).toBe('Mentální koučink 20. 11. 2026 – Jana Nováková0');
    s = run(s, rescheduleBooking, { bookingId: r.id, start: '2026-11-05T10:00', override: true }, reception()).state;
    const moved = requestOf(s, req.id);
    expect(moved).toMatchObject({ status: 'pending', vs: req.vs, dueAt: '2026-11-05T10:00', message: 'Mentální koučink 5. 11. 2026 – Jana Nováková0' });
    expect(paymentRequestSpayd(s, moved)).toContain('MSG:MENTALNI KOUCINK 5. 11. 2026');
    // zpět na pozdější termín: splatnost znovu 48 h od vystavení
    s = run(s, rescheduleBooking, { bookingId: r.id, start: '2026-11-25T10:00', override: true }, reception()).state;
    expect(requestOf(s, req.id)).toMatchObject({ dueAt: '2026-11-06T09:00', message: 'Mentální koučink 25. 11. 2026 – Jana Nováková0' });
  });
});

/* ------------------------------------------------------------------ */
/* visits.ts                                                           */
/* ------------------------------------------------------------------ */

describe('přehled vstupů – zdroj platby', () => {
  it('rozliší každý zdroj platby a sečte ho po zaměstnancích', () => {
    const { s: s0, ids } = setup(4);
    const [a, b, c, d] = ids;
    let s = s0;
    // permanentka: dva vstupy u Terezy Malé
    s = run(s, sellPackage, { clientId: a, templateId: 'pt_koucink10', paidBy: 'card' }, reception('2026-10-20T09:00')).state;
    const pkgId = s.packages[0].id;
    const p1 = book(s, { clientId: a, serviceId: 's_koucink', therapistId: 't_mala', start: '2026-11-02T09:00', payment: { method: 'package', packageId: pkgId } });
    s = run(p1.state, markCompleted, { bookingId: p1.id }).state;
    const p2 = book(s, { clientId: a, serviceId: 's_koucink', therapistId: 't_mala', start: '2026-11-03T09:00', payment: { method: 'package', packageId: pkgId } });
    s = run(p2.state, markCompleted, { bookingId: p2.id }).state;
    // permanentka → omluva → náhrada
    const p3 = book(s, { clientId: a, serviceId: 's_koucink', therapistId: 't_mala', start: '2026-11-04T15:00', payment: { method: 'package', packageId: pkgId } });
    s = run(p3.state, cancelBooking, { bookingId: p3.id, option: 'excuse' }, asClient(a)).state;
    const right = s.makeups.find((m) => m.sourceBookingId === p3.id);
    expect(right).toBeTruthy();
    const mk = book(s, { clientId: a, serviceId: 's_koucink', therapistId: 't_mala', start: '2026-11-05T10:00', payment: { method: 'makeup', makeupId: right?.id } });
    s = mk.state;
    // kredit u Jakuba Říhy
    s = run(s, topUpCredit, { clientId: b, amount: 2000, method: 'cash' }, reception('2026-10-30T09:00')).state;
    const cr = book(s, { clientId: b, serviceId: 's_koucink', therapistId: 't_riha', start: '2026-11-02T09:00', payment: { method: 'credit' } });
    s = run(cr.state, markCompleted, { bookingId: cr.id }).state;
    // jednorázově online a kartou na místě
    const on = book(s, { clientId: b, serviceId: 's_koucink', therapistId: 't_riha', start: '2026-11-03T09:00', payment: { method: 'online' } });
    s = run(on.state, markCompleted, { bookingId: on.id }).state;
    const card = book(s, { clientId: c, serviceId: 's_koucink', therapistId: 't_riha', start: '2026-11-03T10:00', payment: { method: 'onsite' } });
    s = run(card.state, markCompleted, { bookingId: card.id, settleWith: 'card' }).state;
    // nezaplaceno, čeká na QR, zdarma
    const un = book(s, { clientId: c, serviceId: 's_koucink', therapistId: 't_mala', start: '2026-11-03T11:00', payment: { method: 'onsite' } });
    s = run(un.state, markCompleted, { bookingId: un.id }).state;
    const qr = book(s, { clientId: d, serviceId: 's_koucink', therapistId: 't_mala', start: '2026-11-06T11:00', payment: { method: 'qr' } });
    s = qr.state;
    const free = book(s, { clientId: d, serviceId: 's_freetalk', therapistId: 't_riha', start: '2026-11-02T14:00', payment: { method: 'free' } });
    s = run(free.state, markCompleted, { bookingId: free.id }).state;
    // zrušený termín se nepočítá
    const gone = book(s, { clientId: c, serviceId: 's_koucink', therapistId: 't_riha', start: '2026-11-20T09:00', payment: { method: 'onsite' } });
    s = run(gone.state, cancelBooking, { bookingId: gone.id, option: 'free' }).state;

    const info = (id: string) => visitPaymentInfo(s, bookingOf(s, id), TODAY);
    expect(info(p1.id)).toEqual({ source: 'package', label: 'Permanentka', detail: 'Koučink 10× · vstup 1 z 10', amount: 1690, prepaid: true });
    expect(info(p2.id).detail).toBe('Koučink 10× · vstup 2 z 10');
    expect(info(mk.id)).toMatchObject({ source: 'makeup', label: 'Náhrada', amount: 1690, prepaid: true });
    expect(sp(info(mk.id).detail)).toBe('náhrada za St 4. 11. (z permanentky Koučink 10×)');
    expect(info(mk.id).detail).not.toContain('vstup 3');
    expect(info(cr.id)).toEqual({ source: 'credit', label: 'Kredit', detail: 'z kreditu', amount: 1900, prepaid: true });
    expect(info(on.id)).toEqual({ source: 'single', label: 'Jednorázově', detail: 'kartou online', amount: 1900, prepaid: false });
    expect(info(card.id)).toEqual({ source: 'single', label: 'Jednorázově', detail: 'kartou na místě', amount: 1900, prepaid: false });
    expect(info(un.id)).toMatchObject({ source: 'unpaid', label: 'Nezaplaceno', amount: 1900, prepaid: false });
    expect(info(qr.id)).toMatchObject({ source: 'qr_pending', label: 'Čeká na QR platbu', amount: 1900, prepaid: false });
    expect(info(free.id)).toEqual({ source: 'free', label: 'Zdarma', detail: 'zdarma', amount: 0, prepaid: false });

    const f: VisitFilters = { from: '2026-11-01', to: '2026-12-01', therapistId: null, serviceId: null, sources: null, status: 'all' };
    const all = visitsOverview(s, f, TODAY);
    expect(all.rows.map((r) => r.booking.id)).not.toContain(gone.id);
    expect(all.rows.map((r) => r.booking.id)).not.toContain(p3.id); // omluvený
    expect(all.rows).toHaveLength(9);
    expect(all.rows.map((r) => r.booking.start)).toEqual([...all.rows.map((r) => r.booking.start)].sort());
    expect(all.totals).toMatchObject({
      therapistId: '',
      total: 9,
      bySource: { package: 2, credit: 1, single: 2, qr_pending: 1, unpaid: 1, makeup: 1, free: 1 },
      prepaidCount: 4,
      singleCount: 2,
      singleRevenue: 3800,
      prepaidValue: 1690 * 3 + 1900,
    });
    const mala = all.byEmployee.find((e) => e.therapistId === 't_mala');
    const riha = all.byEmployee.find((e) => e.therapistId === 't_riha');
    expect(mala).toMatchObject({ total: 5, bySource: { package: 2, makeup: 1, unpaid: 1, qr_pending: 1, credit: 0, single: 0, free: 0 }, prepaidValue: 1690 * 3, singleRevenue: 0 });
    expect(riha).toMatchObject({ total: 4, bySource: { credit: 1, single: 2, free: 1 }, singleRevenue: 3800, prepaidValue: 1900 });
    // všichni aktivní zaměstnanci, i bez vstupů, v pořadí z nastavení
    expect(all.byEmployee.map((e) => e.therapistId)).toEqual(['t_mala', 't_riha', 't_benesova', 't_vavrova', 't_kos']);
    expect(all.byEmployee.find((e) => e.therapistId === 't_kos')?.total).toBe(0);
    const sumTotals = all.byEmployee.reduce((n, e) => n + e.total, 0);
    expect(sumTotals).toBe(all.totals.total);

    // filtry: stav, zaměstnanec, zdroj, služba, období (konec exkluzivně)
    expect(visitsOverview(s, { ...f, status: 'planned' }, TODAY).rows.map((r) => r.booking.id).sort()).toEqual([mk.id, qr.id].sort());
    expect(visitsOverview(s, { ...f, status: 'done' }, TODAY).totals.total).toBe(7);
    const onlyRiha = visitsOverview(s, { ...f, therapistId: 't_riha' }, TODAY);
    expect(onlyRiha.byEmployee.map((e) => e.therapistId)).toEqual(['t_riha']);
    expect(onlyRiha.totals.total).toBe(4);
    expect(visitsOverview(s, { ...f, sources: ['package', 'makeup'] }, TODAY).totals.total).toBe(3);
    expect(visitsOverview(s, { ...f, serviceId: 's_freetalk' }, TODAY).rows.map((r) => r.booking.id)).toEqual([free.id]);
    expect(visitsOverview(s, { ...f, from: '2026-11-03', to: '2026-11-04' }, TODAY).totals.total).toBe(4);
    expect(VISIT_SOURCES).toHaveLength(7);
  });

  it('účtované vstupy s poplatkem: propadlý vstup, poplatek z kreditu, odpuštěný poplatek', () => {
    const { s: s0, ids } = setup(3);
    const [a, b] = ids;
    let s = run(s0, sellPackage, { clientId: a, templateId: 'pt_koucink5', paidBy: 'cash' }, reception('2026-10-20T09:00')).state;
    const ns = book(s, { clientId: a, serviceId: 's_koucink', therapistId: 't_mala', start: '2026-11-03T09:00', payment: { method: 'package', packageId: s.packages[0].id } });
    s = run(ns.state, markNoShow, { bookingId: ns.id }).state;
    expect(visitPaymentInfo(s, bookingOf(s, ns.id), TODAY)).toMatchObject({ source: 'package', detail: 'Koučink 5× · vstup 1 z 5 · vstup propadl', amount: 1780 });
    // poplatek z kreditu
    s = run(s, topUpCredit, { clientId: b, amount: 3000, method: 'card' }, reception('2026-10-20T09:00')).state;
    const late = book(s, { clientId: b, serviceId: 's_koucink', therapistId: 't_mala', start: '2026-11-04T15:00', payment: { method: 'onsite' } });
    s = run(late.state, cancelBooking, { bookingId: late.id, option: 'fee' }, asClient(b)).state;
    expect(visitPaymentInfo(s, bookingOf(s, late.id), TODAY)).toMatchObject({ source: 'credit', detail: 'storno poplatek z kreditu', amount: 1900, prepaid: true });
    // odpuštěný poplatek
    s = run(s, waiveFee, { bookingId: late.id, reason: 'Nemoc' }).state;
    expect(visitPaymentInfo(s, bookingOf(s, late.id), TODAY)).toMatchObject({ source: 'free', amount: 0 });
    // online zaplacený termín zrušený po lhůtě: jednorázově, částka = poplatek
    const onl = book(s, { clientId: b, serviceId: 's_koucink', therapistId: 't_mala', start: '2026-11-05T09:00', payment: { method: 'online' } }, asClient(b, '2026-11-01T09:00'));
    s = run(onl.state, cancelBooking, { bookingId: onl.id, option: 'fee' }, asClient(b, '2026-11-04T20:00')).state;
    const i = visitPaymentInfo(s, bookingOf(s, onl.id), TODAY);
    expect(i.source).toBe('single');
    expect(i.amount).toBe(bookingOf(s, onl.id).fee?.amount);
    expect(sp(i.detail)).toMatch(/^kartou online · storno poplatek \d+ %$/);
  });
});

/* ------------------------------------------------------------------ */
/* groups.ts                                                           */
/* ------------------------------------------------------------------ */

describe('volná místa ve skupinových lekcích', () => {
  it('obsazenost, téměř plno, plno, zrušený termín a čekací listina', () => {
    const { s: s0, ids } = setup(7);
    // úterní workshop s kapacitou 5, čtvrteční s kapacitou 12
    let s = produce(s0, (d) => {
      const t = d.groupTemplates.find((x) => x.id === 'g_odolnost_ut');
      if (t) t.capacity = 5;
    });
    const tue = sessionsOnDate(s, '2026-11-10').find((x) => x.templateId === 'g_odolnost_ut');
    const thu = sessionsOnDate(s, '2026-11-12').find((x) => x.templateId === 'g_odolnost_ct');
    const sat = sessionsOnDate(s, '2026-11-07').find((x) => x.templateId === 'g_odolnost_so');
    if (!tue || !thu || !sat) throw new Error('chybí termíny');
    const join = (st: ClinicState, sessionId: string, clientId: string): ClinicState =>
      run(st, createBooking, { clientId, serviceId: 's_g_odolnost', therapistId: 't_kos', start: '', sessionId, payment: { method: 'onsite' } }, asClient(clientId)).state;
    for (const c of ids.slice(0, 5)) s = join(s, tue.id, c);
    for (const c of ids.slice(0, 3)) s = join(s, thu.id, c);
    expect(failure(s, createBooking, { clientId: ids[5], serviceId: 's_g_odolnost', therapistId: 't_kos', start: '', sessionId: tue.id, payment: { method: 'onsite' } }, asClient(ids[5]))).toMatch(
      /plně obsazená/,
    );
    s = run(s, joinWaitlist, { clientId: ids[5], serviceId: 's_g_odolnost', therapistId: null, dateFrom: '2026-11-10', sessionId: tue.id }, asClient(ids[5])).state;
    s = run(s, joinWaitlist, { clientId: ids[6], serviceId: 's_g_odolnost', therapistId: null, dateFrom: '2026-11-10', sessionId: tue.id }, asClient(ids[6])).state;
    s = run(s, cancelSession, { sessionId: sat.id, reason: 'Nemoc mentora' }).state;

    const list = groupSessionsOverview(s, '2026-11-02', '2026-11-16', {}, NOW);
    const byId = Object.fromEntries(list.map((g) => [g.session.id, g]));
    expect(byId[tue.id]).toMatchObject({ booked: 5, capacity: 5, free: 0, fill: 'full', waitlist: 2, cancelled: false, past: false, serviceName: 'Workshop mentální odolnosti', therapistId: 't_kos' });
    expect(byId[thu.id]).toMatchObject({ booked: 3, capacity: 12, free: 9, fill: 'free', waitlist: 0 });
    expect(byId[sat.id]).toMatchObject({ cancelled: true, booked: 0 });
    // úterý 3. 11. už proběhlo
    const pastTue = list.find((g) => g.session.start === '2026-11-03T17:30');
    expect(pastTue?.past).toBe(true);
    // konec exkluzivně, seřazeno podle začátku
    expect(list.every((g) => g.session.start >= '2026-11-02' && g.session.start < '2026-11-16')).toBe(true);
    expect(list.map((g) => g.session.start)).toEqual([...list.map((g) => g.session.start)].sort());
    expect(list.filter((g) => g.session.start.startsWith('2026-11-16'))).toHaveLength(0);
    // jen s volnými místy: bez plných a zrušených
    const free = groupSessionsOverview(s, '2026-11-02', '2026-11-16', { onlyFree: true }, NOW);
    expect(free.some((g) => g.session.id === tue.id || g.session.id === sat.id)).toBe(false);
    expect(free.some((g) => g.session.id === thu.id)).toBe(true);
    // filtr služby a trenéra
    expect(groupSessionsOverview(s, '2026-11-02', '2026-11-16', { therapistId: 't_mala' })).toHaveLength(0);
    expect(groupSessionsOverview(s, '2026-11-02', '2026-11-16', { serviceId: 's_g_odolnost' })).toHaveLength(list.length);
    expect(groupSessionsOverview(s, '2026-11-02', '2026-11-16', {})[0].past).toBe(false); // bez `now`
    const sum = groupOverviewSummary(list);
    expect(sum.sessions).toBe(list.length - 1);
    expect(sum.fullSessions).toBe(1);
    expect(sum.waiting).toBe(2);
    expect(sum.freeSpots).toBe(list.filter((g) => !g.cancelled).reduce((n, g) => n + g.free, 0));
  });

  it('hranice „téměř plno“: nejvýše 2 volná místa nebo obsazenost od 80 %', () => {
    expect(sessionFill(12, 12)).toBe('full');
    expect(sessionFill(12, 13)).toBe('full');
    expect(sessionFill(12, 10)).toBe('almost');
    expect(sessionFill(12, 9)).toBe('free');
    expect(sessionFill(10, 8)).toBe('almost');
    expect(sessionFill(10, 7)).toBe('free');
    expect(sessionFill(20, 16)).toBe('almost');
    expect(sessionFill(20, 15)).toBe('free');
    expect(sessionFill(6, 4)).toBe('almost');
    expect(sessionFill(6, 3)).toBe('free');
  });
});

/* ------------------------------------------------------------------ */
/* Migrace a ukládání                                                  */
/* ------------------------------------------------------------------ */

/** Sdílená databáze artefaktu v paměti (jako v persistence.test.ts). */
function fakeDb() {
  const docs = new Map<string, Record<string, unknown>>();
  const freeze = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
  const snapOf = (collection: string) => ({
    docs: [...docs.entries()]
      .filter(([p]) => p.startsWith(collection + '/') && p.split('/').length === 2)
      .map(([p, body]) => ({ id: p.split('/')[1], exists: true, data: () => freeze(body) })),
    metadata: { hasPendingWrites: false, fromCache: false },
  });
  return {
    docs,
    doc(path: string) {
      return {
        async get() {
          const body = docs.get(path);
          return { id: path.split('/')[1], exists: !!body, data: () => (body ? freeze(body) : undefined) };
        },
        async set(data: Record<string, unknown>) {
          docs.set(path, freeze(data));
        },
        async delete() {
          docs.delete(path);
        },
      };
    },
    collection(path: string) {
      return {
        async get() {
          return snapOf(path);
        },
        onSnapshot() {
          return () => undefined;
        },
      };
    },
  };
}

describe('migrace a ukládání plateb', () => {
  it('starý stav bez nastavení plateb a bez výzev doplní (idempotentně)', () => {
    const old = JSON.parse(JSON.stringify(createBaseState('2026-01-01'))) as ClinicState;
    old.settings.clinicName = 'Moje studio';
    delete (old.settings as unknown as Record<string, unknown>).payments;
    delete (old as unknown as Record<string, unknown>).paymentRequests;
    takeMigrationFlag();
    const s = normalizeState(old);
    expect(takeMigrationFlag()).toBe(true);
    expect(s.settings.payments).toEqual({ qrEnabled: true, accountNumber: '', iban: '', recipientName: 'Moje studio', qrDueHours: 48 });
    expect(s.paymentRequests).toEqual([]);
    const again = normalizeState(JSON.parse(JSON.stringify(s)) as ClinicState);
    expect(takeMigrationFlag()).toBe(false);
    expect(again.settings.payments).toEqual(s.settings.payments);
    // částečné nastavení: doplní chybějící pole a dopočítá IBAN
    const partial = { settings: { ...s.settings, payments: { accountNumber: ACCOUNT } }, templates: s.templates } as unknown as ClinicState;
    expect(migrateMeta(partial)).toBe(true);
    expect(partial.settings.payments).toEqual({ qrEnabled: true, accountNumber: ACCOUNT, iban: IBAN, recipientName: 'Moje studio', qrDueHours: 48 });
    expect(migrateMeta(partial)).toBe(false);
    expect(COLLECTIONS).toContain('paymentRequests');
  });

  it('výzvy a nastavení plateb projdou uložením do artefaktu i lokálně', async () => {
    const { s: s0, ids } = setup(2);
    let s = s0;
    const later = run(s, createPaymentRequest, { clientId: ids[1], purpose: 'credit_topup', amount: 700 }, reception('2026-11-03T10:00'));
    s = later.state;
    const earlier = run(s, createPaymentRequest, { clientId: ids[0], purpose: 'credit_topup', amount: 500 }, reception('2026-10-20T10:00'));
    s = earlier.state;
    s = run(s, confirmPaymentRequest, { requestId: earlier.value }, reception()).state;
    const db = fakeDb();
    await createArtifactAdapter(db as never).save(s);
    expect([...db.docs.keys()].filter((k) => k.startsWith('paymentRequests/')).sort()).toEqual(['paymentRequests/2026-10', 'paymentRequests/2026-11']);
    const loaded = (await createArtifactAdapter(db as never).load()) as ClinicState;
    expect(loaded.settings.payments).toEqual(s.settings.payments);
    expect(loaded.paymentRequests.map((r) => r.id)).toEqual([earlier.value, later.value]); // podle createdAt
    expect(loaded.paymentRequests.find((r) => r.id === earlier.value)).toEqual(s.paymentRequests.find((r) => r.id === earlier.value));
    // lokální úložiště ukládá celý stav jako JSON a při načtení ho normalizuje
    const local = normalizeState(JSON.parse(JSON.stringify(s)) as ClinicState);
    expect(local.paymentRequests.map((r) => r.vs).sort()).toEqual(s.paymentRequests.map((r) => r.vs).sort());
    expect(local.settings.payments.iban).toBe(IBAN);
  });
});

/* ------------------------------------------------------------------ */
/* Ukázková data                                                       */
/* ------------------------------------------------------------------ */

describe('ukázková data – vstupy, skupiny a QR platby', () => {
  it('obsahují účet, dvě skupinové služby s různou obsazeností a čekající i zaplacené QR platby', () => {
    const now = '2026-10-14T10:40';
    const s = generateDemoState(now);
    const today = now.slice(0, 10);
    expect(isValidIban(s.settings.payments.iban)).toBe(true);
    expect(czechAccountToIban(s.settings.payments.accountNumber)).toEqual({ ok: true, iban: s.settings.payments.iban });
    expect(qrAvailable(s)).toBe(true);
    const group = s.services.filter((x) => x.kind === 'group');
    expect(group.map((x) => x.name)).toEqual(['Workshop mentální odolnosti', 'Neurovizuální trénink ve skupině']);
    expect(getService(s, 's_g_neuro')).toMatchObject({ durationMin: 60, capacity: 6 });
    expect(s.groupTemplates.filter((t) => t.serviceId === 's_g_neuro').length).toBeGreaterThanOrEqual(2);
    const upcoming = groupSessionsOverview(s, today, '2026-10-29', { serviceId: 's_g_neuro' }, now).filter((g) => !g.past);
    expect(upcoming.some((g) => g.fill === 'full')).toBe(true);
    expect(upcoming.some((g) => g.fill !== 'full')).toBe(true);
    expect(upcoming.some((g) => g.fill === 'full' && g.waitlist > 0)).toBe(true);
    expect(upcoming.every((g) => g.booked <= g.capacity)).toBe(true);
    const workshop = groupSessionsOverview(s, today, '2026-10-29', { serviceId: 's_g_odolnost' }, now);
    expect(workshop.length).toBeGreaterThan(0);

    const pending = pendingPaymentRequests(s);
    expect(pending.length).toBeGreaterThanOrEqual(3);
    expect(pending.some((r) => r.dueAt < now)).toBe(true);
    expect(new Set(pending.map((r) => r.purpose)).size).toBeGreaterThanOrEqual(3);
    const paid = s.paymentRequests.filter((r) => r.status === 'paid');
    expect(paid.length).toBeGreaterThanOrEqual(5);
    expect(s.payments.filter((p) => p.method === 'qr').length).toBeGreaterThanOrEqual(paid.length);
    for (const r of paid) {
      expect(r.paidAt && r.paidAt <= now).toBeTruthy();
      expect(s.payments.some((p) => p.method === 'qr' && p.note.includes(`VS ${r.vs}`))).toBe(true);
    }
    const vs = s.paymentRequests.map((r) => r.vs);
    expect(new Set(vs).size).toBe(vs.length);
    expect(s.paymentRequests.every((r) => r.createdAt <= now)).toBe(true);
    for (const r of pending.filter((x) => x.purpose === 'booking')) {
      const b = s.bookings.find((x) => x.id === r.bookingId) as Booking;
      expect(b.payment).toMatchObject({ method: 'qr', paid: false });
    }

    // přehled vstupů za minulý měsíc: všechny zdroje plateb a součty sedí
    const v = visitsOverview(s, { from: '2026-09-01', to: '2026-10-01', therapistId: null, serviceId: null, sources: null, status: 'done' }, today);
    expect(v.totals.total).toBe(v.rows.length);
    expect(v.totals.bySource.package).toBeGreaterThan(0);
    expect(v.totals.bySource.single).toBeGreaterThan(0);
    expect(v.totals.bySource.credit).toBeGreaterThan(0);
    expect(v.totals.bySource.free).toBeGreaterThan(0);
    expect(v.rows.some((r) => r.info.detail.startsWith('QR platbou'))).toBe(true);
    expect(v.byEmployee.reduce((n, e) => n + e.total, 0)).toBe(v.totals.total);
    expect(v.rows.some((r) => r.booking.serviceId === 's_g_neuro' && r.info.source === 'package')).toBe(true);
  });
});
