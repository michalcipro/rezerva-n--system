import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { Campaign, ClinicState, Ctx, ModuleSettings } from '../src/domain/types';
import {
  adjustCredit,
  cancelBooking,
  cancelPackage,
  cancelSession,
  createBooking,
  createClient,
  createPaymentRequest,
  joinWaitlist,
  payFee,
  receiveQrPayment,
  rescheduleBooking,
  saveCampaign,
  scheduleCampaign,
  sellPackage,
  sendCampaign,
  settleBooking,
  topUpCredit,
  updateSettings,
  updateTemplate,
  upsertGroupTemplate,
  upsertPackageTemplate,
  upsertService,
} from '../src/engine/commands';
import { DEMO_ACCOUNT, createBaseState } from '../src/engine/defaults';
import { importCredits, importPackages } from '../src/engine/importer';
import { MARKETING_TEMPLATES } from '../src/engine/messages';
import { MODULE_IDS, MODULE_OFF, moduleOn, modulesOf, templateInUse, templateModule } from '../src/engine/modules';
import { runProcesses } from '../src/engine/processes';
import { availableSlots } from '../src/engine/availability';
import { clientCredit, getService, sessionsOnDate } from '../src/engine/selectors';

const NOW = '2026-11-16T10:00'; // pondělí
const owner: Ctx = { now: NOW, actor: { role: 'owner', name: 'Majitelka' } };
const staff = (now = NOW): Ctx => ({ now, actor: { role: 'reception', name: 'Recepce' } });
const asClient = (clientId: string, now = NOW): Ctx => ({ now, actor: { role: 'client', name: 'Klient', clientId } });

type Result = { ok: true; value: unknown; notices: string[] } | { ok: false; error: string };

/** Spustí příkaz nad kopií stavu (jako aplikace přes Immer); při chybě vrátí původní stav. */
function exec<I>(s: ClinicState, cmd: (d: ClinicState, i: I, c: Ctx) => Result, input: I, ctx: Ctx): { s: ClinicState; r: Result } {
  let r = { ok: false, error: '' } as Result;
  const next = produce(s, (d) => {
    r = cmd(d as ClinicState, input, ctx);
  });
  return { s: r.ok ? next : s, r };
}

function ok<I, R = unknown>(s: ClinicState, cmd: (d: ClinicState, i: I, c: Ctx) => Result, input: I, ctx: Ctx): { s: ClinicState; value: R } {
  const out = exec(s, cmd, input, ctx);
  if (!out.r.ok) throw new Error(out.r.error);
  return { s: out.s, value: out.r.value as R };
}

const errorOf = (out: { r: Result }): string => (out.r.ok ? '' : out.r.error);

function setup(): { s: ClinicState; clientId: string } {
  let s = createBaseState('2026-01-01');
  s = produce(s, (d) => {
    d.settings.payments = { ...d.settings.payments, accountNumber: DEMO_ACCOUNT.accountNumber, iban: DEMO_ACCOUNT.iban };
  });
  const c = ok<Parameters<typeof createClient>[1], string>(
    s,
    createClient,
    { firstName: 'Eva', lastName: 'Testová', email: 'eva@example.com', phone: '+420 600 000 001', birthDate: '1990-11-16', consents: { gdpr: true, health: true, marketingEmail: true, sms: true } },
    staff('2026-01-02T09:00'),
  );
  return { s: c.s, clientId: c.value };
}

function withModules(s: ClinicState, modules: Partial<ModuleSettings>): ClinicState {
  return ok(s, updateSettings, { modules }, owner).s;
}

const campaign = (): Campaign => ({
  id: '',
  name: 'Podzimní novinky',
  subject: 'Novinky ze studia',
  preheader: '',
  blocks: [{ type: 'text', text: 'Dobrý den, [jméno], máme novinky.' }],
  segment: { match: 'all', rules: [], exclude: [] },
  status: 'draft',
  scheduledAt: null,
  sentAt: null,
  recipients: 0,
  createdAt: NOW,
  updatedAt: NOW,
});

describe('moduly provozovny', () => {
  it('výchozí stav má všechny moduly zapnuté, chybějící nastavení znamená zapnuto', () => {
    const s = createBaseState('2026-01-01');
    expect(modulesOf(s)).toEqual({ groups: true, packages: true, credit: true, marketing: true });
    const old = { settings: { ...s.settings, modules: undefined } } as unknown as ClinicState;
    for (const id of MODULE_IDS) expect(moduleOn(old, id)).toBe(true);
    expect(moduleOn(withModules(s, { credit: false }), 'credit')).toBe(false);
  });

  it('marketingové šablony odpovídají modulu marketing', () => {
    for (const key of MARKETING_TEMPLATES) expect(templateModule(key)).toBe('marketing');
    expect(templateModule('package_low')).toBe('packages');
    expect(templateModule('booking_confirmation')).toBeNull();
    const s = withModules(createBaseState('2026-01-01'), { marketing: false });
    expect(templateInUse(s, 'birthday')).toBe(false);
    expect(templateInUse(s, 'package_expiring')).toBe(true);
  });

  it('skupinové lekce: vypnutý modul nemá rozvrh a odmítne přihlášky i úpravy rozvrhu', () => {
    const { s: base, clientId } = setup();
    const ses = sessionsOnDate(base, '2026-11-17').find((x) => x.serviceId === 's_g_pilates');
    expect(ses).toBeDefined();
    // se zapnutým modulem jde přihlásit
    expect(exec(base, createBooking, { clientId, serviceId: ses!.serviceId, therapistId: ses!.therapistId, start: ses!.start, sessionId: ses!.id, payment: { method: 'onsite' } }, staff()).r.ok).toBe(true);

    const s = withModules(base, { groups: false });
    expect(sessionsOnDate(s, '2026-11-17')).toEqual([]);
    expect(availableSlots(s, { serviceId: 's_g_pilates', therapistId: 'any', date: '2026-11-17', now: NOW, mode: 'client', clientId })).toEqual([]);
    const booking = { clientId, serviceId: ses!.serviceId, therapistId: ses!.therapistId, start: ses!.start, sessionId: ses!.id, payment: { method: 'onsite' as const } };
    expect(errorOf(exec(s, createBooking, booking, staff()))).toBe(MODULE_OFF.groups);
    expect(errorOf(exec(s, createBooking, booking, asClient(clientId)))).toBe('Skupinové lekce jsou v nastavení vypnuté.');
    expect(errorOf(exec(s, upsertGroupTemplate, { ...s.groupTemplates[0], start: '19:00' }, staff()))).toBe(MODULE_OFF.groups);
    expect(errorOf(exec(s, cancelSession, { sessionId: ses!.id, reason: 'nemoc' }, staff()))).toBe(MODULE_OFF.groups);
    expect(errorOf(exec(s, joinWaitlist, { clientId, serviceId: ses!.serviceId, therapistId: null, dateFrom: '2026-11-17', sessionId: ses!.id }, asClient(clientId)))).toBe(MODULE_OFF.groups);
    // novou skupinovou službu nejde založit, stávající lze upravit (např. skrýt)
    const group = getService(s, 's_g_pilates')!;
    expect(errorOf(exec(s, upsertService, { ...group, id: '', name: 'Jóga' }, staff()))).toBe(MODULE_OFF.groups);
    expect(exec(s, upsertService, { ...group, active: false }, staff()).r.ok).toBe(true);
    // individuální služby fungují dál
    expect(exec(s, createBooking, { clientId, serviceId: 's_fyzio45', therapistId: 't_mala', start: '2026-11-18T09:00', payment: { method: 'onsite' } }, staff()).r.ok).toBe(true);
  });

  it('skupinové lekce: přesun stávající přihlášky po vypnutí modulu nejde', () => {
    const { s: base, clientId } = setup();
    const [a, b] = sessionsOnDate(base, '2026-11-17').filter((x) => x.serviceId === 's_g_kruhovy' || x.serviceId === 's_g_pilates');
    const booked = ok<Parameters<typeof createBooking>[1], string>(
      base,
      createBooking,
      { clientId, serviceId: a.serviceId, therapistId: a.therapistId, start: a.start, sessionId: a.id, payment: { method: 'onsite' } },
      staff(),
    );
    const s = withModules(booked.s, { groups: false });
    expect(errorOf(exec(s, rescheduleBooking, { bookingId: booked.value, start: b.start, sessionId: b.id }, staff()))).toBe(MODULE_OFF.groups);
    // zrušit stávající přihlášku jde
    expect(exec(s, cancelBooking, { bookingId: booked.value, option: 'free' }, asClient(clientId)).r.ok).toBe(true);
  });

  it('permanentky: vypnutý modul odmítne prodej, QR nákup, platbu permanentkou, šablony i import', () => {
    const { s: base, clientId } = setup();
    const sold = ok<Parameters<typeof sellPackage>[1], string>(base, sellPackage, { clientId, templateId: 'pt_fyzio10', paidBy: 'cash' }, staff());
    const s = withModules(sold.s, { packages: false });
    expect(errorOf(exec(s, sellPackage, { clientId, templateId: 'pt_fyzio5', paidBy: 'cash' }, staff()))).toBe(MODULE_OFF.packages);
    expect(errorOf(exec(s, sellPackage, { clientId, templateId: 'pt_fyzio5', paidBy: 'online' }, asClient(clientId)))).toBe('Permanentky jsou v nastavení vypnuté.');
    expect(errorOf(exec(s, createPaymentRequest, { clientId, purpose: 'package', packageTemplateId: 'pt_fyzio5' }, asClient(clientId)))).toBe(MODULE_OFF.packages);
    expect(errorOf(exec(s, receiveQrPayment, { clientId, purpose: 'package', packageTemplateId: 'pt_fyzio5' }, staff()))).toBe(MODULE_OFF.packages);
    const withPackage = { clientId, serviceId: 's_fyzio45', therapistId: 't_mala', start: '2026-11-18T09:00', payment: { method: 'package' as const, packageId: sold.value } };
    expect(exec(sold.s, createBooking, withPackage, staff()).r.ok).toBe(true);
    expect(errorOf(exec(s, createBooking, withPackage, staff()))).toBe(MODULE_OFF.packages);
    expect(errorOf(exec(s, upsertPackageTemplate, { ...s.packageTemplates[0], priceCzk: 9990 }, staff()))).toBe(MODULE_OFF.packages);
    expect(errorOf(exec(s, importPackages, { rows: [] }, staff()))).toBe(MODULE_OFF.packages);
    // ostatní platby fungují
    expect(exec(s, createBooking, { ...withPackage, payment: { method: 'onsite' } }, staff()).r.ok).toBe(true);
  });

  it('permanentky: s vypnutým modulem se neposílají upozornění k permanentkám', () => {
    const { s: base, clientId } = setup();
    // permanentka na 5 vstupů s platností 120 dní, za 110 dní končí → upozornění „brzy končí“
    const sold = ok(base, sellPackage, { clientId, templateId: 'pt_fyzio5', paidBy: 'cash' }, staff('2026-08-01T10:00'));
    const notices = (s: ClinicState): number => ok(s, runProcesses, {}, owner).s.messages.filter((m) => m.kind === 'package_expiring').length;
    expect(notices(sold.s)).toBeGreaterThan(0);
    expect(notices(withModules(sold.s, { packages: false }))).toBe(0);
  });

  it('kredit: vypnutý modul odmítne dobití, platbu kreditem, QR dobití i ruční úpravu', () => {
    const { s: base, clientId } = setup();
    const topped = ok(base, topUpCredit, { clientId, amount: 5000, method: 'cash' }, staff()).s;
    const s = withModules(topped, { credit: false });
    expect(errorOf(exec(s, topUpCredit, { clientId, amount: 1000, method: 'cash' }, staff()))).toBe(MODULE_OFF.credit);
    expect(errorOf(exec(s, topUpCredit, { clientId, amount: 1000, method: 'online' }, asClient(clientId)))).toBe('Kredit je v nastavení vypnutý.');
    expect(errorOf(exec(s, createPaymentRequest, { clientId, purpose: 'credit_topup', amount: 1000 }, asClient(clientId)))).toBe(MODULE_OFF.credit);
    expect(errorOf(exec(s, receiveQrPayment, { clientId, purpose: 'credit_topup', amount: 1000 }, staff()))).toBe(MODULE_OFF.credit);
    expect(errorOf(exec(s, adjustCredit, { clientId, amount: -500, note: 'Vyplaceno' }, staff()))).toBe(MODULE_OFF.credit);
    expect(errorOf(exec(s, importCredits, { rows: [] }, staff()))).toBe(MODULE_OFF.credit);
    const byCredit = { clientId, serviceId: 's_fyzio45', therapistId: 't_mala', start: '2026-11-18T09:00', payment: { method: 'credit' as const } };
    expect(exec(topped, createBooking, byCredit, staff()).r.ok).toBe(true);
    expect(errorOf(exec(s, createBooking, byCredit, staff()))).toBe(MODULE_OFF.credit);
    expect(errorOf(exec(s, sellPackage, { clientId, templateId: 'pt_fyzio5', paidBy: 'credit' }, staff()))).toBe(MODULE_OFF.credit);
    // úhrada termínu na místě z kreditu
    const onsite = ok<Parameters<typeof createBooking>[1], string>(s, createBooking, { ...byCredit, payment: { method: 'onsite' } }, staff());
    expect(errorOf(exec(onsite.s, settleBooking, { bookingId: onsite.value, method: 'credit' }, staff()))).toBe(MODULE_OFF.credit);
    expect(exec(onsite.s, settleBooking, { bookingId: onsite.value, method: 'cash' }, staff()).r.ok).toBe(true);
    // vrácení nevyčerpaných vstupů na kredit při zrušení permanentky
    const pkg = ok<Parameters<typeof sellPackage>[1], string>(s, sellPackage, { clientId, templateId: 'pt_fyzio5', paidBy: 'cash' }, staff());
    expect(errorOf(exec(pkg.s, cancelPackage, { packageId: pkg.value, refundToCredit: true }, staff()))).toBe(MODULE_OFF.credit);
    expect(exec(pkg.s, cancelPackage, { packageId: pkg.value, refundToCredit: false }, staff()).r.ok).toBe(true);
  });

  it('kredit: s vypnutým modulem se storno poplatek nestrhává ze zůstatku a nejde ho uhradit kreditem', () => {
    const { s: base, clientId } = setup();
    let s = ok(base, topUpCredit, { clientId, amount: 3000, method: 'cash' }, staff()).s;
    // zítra 9:00, rušíme dnes v 10:00 → méně než 24 h předem
    const booked = ok<Parameters<typeof createBooking>[1], string>(
      s,
      createBooking,
      { clientId, serviceId: 's_fyzio45', therapistId: 't_mala', start: '2026-11-17T09:00', payment: { method: 'onsite' } },
      staff('2026-11-10T10:00'),
    );
    s = booked.s;
    const lateOn = ok(s, cancelBooking, { bookingId: booked.value, option: 'fee' }, staff());
    expect(lateOn.s.bookings.find((b) => b.id === booked.value)?.fee?.status).toBe('paid');

    const off = withModules(s, { credit: false });
    const lateOff = ok(off, cancelBooking, { bookingId: booked.value, option: 'fee' }, staff());
    const fee = lateOff.s.bookings.find((b) => b.id === booked.value)?.fee;
    expect(fee?.status).toBe('due');
    expect(clientCredit(lateOff.s, clientId)).toBe(clientCredit(off, clientId));
    expect(errorOf(exec(lateOff.s, payFee, { bookingId: booked.value, method: 'credit' }, staff()))).toBe(MODULE_OFF.credit);
    expect(exec(lateOff.s, payFee, { bookingId: booked.value, method: 'cash' }, staff()).r.ok).toBe(true);
  });

  it('marketing: vypnutý modul odmítne kampaně a neposílá obchodní sdělení', () => {
    const { s: base } = setup();
    const saved = ok<Campaign, string>(base, saveCampaign, campaign(), staff());
    const scheduled = ok(saved.s, scheduleCampaign, { campaignId: saved.value, at: '2026-11-16T12:00' }, staff()).s;
    const s = withModules(scheduled, { marketing: false });
    expect(errorOf(exec(s, saveCampaign, campaign(), staff()))).toBe(MODULE_OFF.marketing);
    expect(errorOf(exec(s, sendCampaign, { campaignId: saved.value }, staff()))).toBe(MODULE_OFF.marketing);
    expect(errorOf(exec(s, scheduleCampaign, { campaignId: saved.value, at: '2026-11-20T12:00' }, staff()))).toBe(MODULE_OFF.marketing);
    // naplánovaná kampaň se s vypnutým marketingem neodešle; zrušit naplánování jde
    const later: Ctx = { now: '2026-11-16T13:00', actor: { role: 'owner', name: 'Systém' } };
    expect(ok(s, runProcesses, {}, later).s.campaigns[0].status).toBe('scheduled');
    expect(ok(scheduled, runProcesses, {}, later).s.campaigns[0].status).toBe('sent');
    expect(ok(s, scheduleCampaign, { campaignId: saved.value, at: null }, staff()).s.campaigns[0].status).toBe('draft');
  });

  it('marketing: bez modulu se neposílá poděkování po návštěvě, reaktivace ani přání k narozeninám', () => {
    const { s: base, clientId } = setup();
    let s = base;
    for (const key of ['reactivation', 'birthday'] as const) s = ok(s, updateTemplate, { key, patch: { enabled: true } }, staff()).s;
    // druhý klient byl naposledy před 120 dny (reaktivace)
    const other = ok<Parameters<typeof createClient>[1], string>(
      s,
      createClient,
      { firstName: 'Petr', lastName: 'Dlouhý', email: 'petr@example.com', phone: '', consents: { gdpr: true, health: false, marketingEmail: true, sms: false } },
      staff('2026-07-01T09:00'),
    );
    s = ok(other.s, createBooking, { clientId: other.value, serviceId: 's_fyzio45', therapistId: 't_mala', start: '2026-07-15T09:00', payment: { method: 'onsite' } }, staff('2026-07-01T10:00')).s;
    s = ok(s, runProcesses, {}, { now: '2026-07-15T18:00', actor: { role: 'owner', name: 'Systém' } }).s;
    // Eva má dnes narozeniny a dopolední termín (poděkování 2 h po skončení)
    s = ok(s, createBooking, { clientId, serviceId: 's_fyzio30', therapistId: 't_mala', start: '2026-11-16T07:30', payment: { method: 'onsite' } }, staff('2026-11-10T10:00')).s;
    const at: Ctx = { now: '2026-11-16T11:00', actor: { role: 'owner', name: 'Systém' } };
    const kinds = (state: ClinicState): string[] => ok(state, runProcesses, {}, at).s.messages.filter((m) => m.at === at.now).map((m) => m.kind);

    expect(kinds(s)).toEqual(expect.arrayContaining(['after_visit', 'reactivation', 'birthday']));
    const off = kinds(withModules(s, { marketing: false }));
    expect(off).not.toContain('after_visit');
    expect(off).not.toContain('reactivation');
    expect(off).not.toContain('birthday');
    const after = ok(withModules(s, { marketing: false }), runProcesses, {}, at).s;
    expect(after.bookings.find((b) => b.start === '2026-11-16T07:30')?.followUpSentAt).toBeUndefined();
  });
});

describe('automatika: poděkování po návštěvě', () => {
  it('odejde jednou 2 h po konci, i když docházka proběhla hned po termínu', () => {
    const { s: base, clientId } = setup();
    const booked = ok<Parameters<typeof createBooking>[1], string>(
      base,
      createBooking,
      { clientId, serviceId: 's_fyzio30', therapistId: 't_mala', start: '2026-11-16T07:30', payment: { method: 'onsite' } },
      staff('2026-11-10T10:00'),
    );
    const sys = (now: string): Ctx => ({ now, actor: { role: 'owner', name: 'Systém' } });
    const followUps = (st: ClinicState): number => st.messages.filter((m) => m.kind === 'after_visit').length;
    // minutu po konci: docházka, poděkování ještě ne
    let s = ok(booked.s, runProcesses, {}, sys('2026-11-16T08:01')).s;
    expect(s.bookings.find((b) => b.id === booked.value)?.status).toBe('completed');
    expect(followUps(s)).toBe(0);
    s = ok(s, runProcesses, {}, sys('2026-11-16T09:59')).s;
    expect(followUps(s)).toBe(0);
    // 2 h po konci odejde právě jedno
    s = ok(s, runProcesses, {}, sys('2026-11-16T10:00')).s;
    expect(followUps(s)).toBe(1);
    s = ok(s, runProcesses, {}, sys('2026-11-16T10:01')).s;
    expect(followUps(s)).toBe(1);
    // starší termíny (víc než 24 h po konci) už ne
    const late = ok(booked.s, runProcesses, {}, sys('2026-11-17T08:30')).s;
    expect(followUps(late)).toBe(0);
  });
});

