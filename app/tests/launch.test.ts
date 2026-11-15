import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { ClinicState, Ctx } from '../src/domain/types';
import { productionState } from '../server/api';
import {
  businessContact,
  businessErrors,
  businessIdentity,
  emptyBusinessProfile,
  formatAddress,
  icoProblem,
  isValidDic,
  isValidIco,
  normalizeBusiness,
} from '../src/engine/business';
import { cancelBooking, createBooking, createClient, joinWaitlist, rescheduleBooking, updateSettings } from '../src/engine/commands';
import { createBaseState, DEMO_ACCOUNT } from '../src/engine/defaults';
import { launchChecklist, launchMissing, launchReady, onlineClosedMessage, onlineOpen } from '../src/engine/launch';
import { createPresetState } from '../src/engine/presets';
import { paymentSpayd } from '../src/engine/qr';
import { generateDemoState } from '../src/engine/seed';
import { normalizeState } from '../src/store/persistence';

const owner = (now = '2026-10-01T09:00'): Ctx => ({ now, actor: { role: 'owner', name: 'Majitelka' } });
const staff = (now = '2026-10-01T09:00'): Ctx => ({ now, actor: { role: 'reception', name: 'Recepce' } });
const asClient = (now: string, clientId: string): Ctx => ({ now, actor: { role: 'client', name: 'Klient', clientId } });

type Result = { ok: boolean; value?: unknown; error?: string };

/** Spustí příkaz nad kopií stavu (jako aplikace přes Immer); chyba příkazu shodí test s jejím textem. */
function run<I>(s: ClinicState, cmd: (d: ClinicState, i: I, c: Ctx) => Result, input: I, ctx: Ctx): { state: ClinicState; value: unknown } {
  let r: Result = { ok: false, error: 'neproběhlo' };
  const next = produce(s, (d) => {
    r = cmd(d as ClinicState, input, ctx);
  });
  if (!r.ok) throw new Error(r.error);
  return { state: next, value: r.value };
}

/** Chyba příkazu (null = prošel). */
function tryRun<I>(s: ClinicState, cmd: (d: ClinicState, i: I, c: Ctx) => Result, input: I, ctx: Ctx): string | null {
  let error: string | null = null;
  produce(s, (d) => {
    const r = cmd(d as ClinicState, input, ctx);
    if (!r.ok) error = r.error ?? 'chyba';
  });
  return error;
}

const COMPANY = {
  legalName: 'Pohybové studio Test s.r.o.',
  legalForm: 'company' as const,
  ico: '123 456 79',
  registeredAddress: { street: 'Ukázková 299/12', city: 'Brno', zip: '602 00' },
  registryNote: 'Společnost zapsaná v obchodním rejstříku vedeném Krajským soudem v Brně, oddíl C, vložka 12345',
};
const LEGAL = { terms: '# Obchodní podmínky\n\nText podmínek studia.', privacy: '# Informace o zpracování osobních údajů\n\nText informací.' };

function withClient(s: ClinicState): { s: ClinicState; clientId: string } {
  const r = run(s, createClient, { firstName: 'Eva', lastName: 'Testová', email: 'eva@example.com', phone: '+420 600 000 001', consents: { gdpr: true, health: false, marketingEmail: false, sms: false } }, staff());
  return { s: r.state, clientId: r.value as string };
}

/* ------------------------------------------------------------------ */
/* IČO, DIČ a fakturační údaje                                         */
/* ------------------------------------------------------------------ */

describe('IČO a DIČ', () => {
  it('IČO má 8 číslic a kontrolní číslici modulo 11', () => {
    // 00006947 Ministerstvo financí, 45244782 Česká spořitelna; zbytek 0 → číslice 1, zbytek 1 → číslice 0
    for (const ico of ['00006947', '45244782', '12345679', '87654326', '00000001', '00000060', '123 456 79']) expect(isValidIco(ico), ico).toBe(true);
    for (const ico of ['12345678', '00006948', '00000000', '1234567', '123456789', 'abcdefgh', '']) expect(isValidIco(ico), ico).toBe(false);
    expect(icoProblem('')).toBe('Zadejte IČO.');
    expect(icoProblem('1234567')).toMatch(/8 číslic/);
    expect(icoProblem('1234567a')).toMatch(/jen číslice/);
    expect(icoProblem('12345678')).toMatch(/není platné/);
    expect(icoProblem('12345679')).toBeNull();
  });

  it('DIČ je CZ a 8–10 číslic (zápis s mezerami a malými písmeny se sjednotí)', () => {
    for (const dic of ['CZ12345679', 'CZ800101123', 'cz 8001011234']) expect(isValidDic(dic), dic).toBe(true);
    for (const dic of ['CZ1234567', 'CZ12345678901', '12345679', 'SK1234567890', 'CZ12A45679']) expect(isValidDic(dic), dic).toBe(false);
    expect(normalizeBusiness({ ...emptyBusinessProfile(), dic: 'cz 123 456 79' }).dic).toBe('CZ12345679');
  });

  it('chyby po polích: nevyplněné je v pořádku, kontroluje se tvar a DIČ plátce DPH', () => {
    expect(businessErrors(emptyBusinessProfile())).toEqual({});
    const e = businessErrors({
      ...emptyBusinessProfile(),
      ico: '12345678',
      vatPayer: true,
      registeredAddress: { street: 'Hlavní 1', city: 'Brno', zip: '6020' },
      placeAddress: { street: '', city: 'Brno', zip: '' },
      email: 'recepce@',
      invoiceEmail: 'faktury@example',
      web: 'není web',
    });
    expect(Object.keys(e).sort()).toEqual(['dic', 'email', 'ico', 'invoiceEmail', 'placeAddress.street', 'placeAddress.zip', 'registeredAddress.zip', 'web'].sort());
    expect(e.dic).toBe('Plátce DPH musí mít vyplněné DIČ.');
    expect(businessErrors({ ...emptyBusinessProfile(), dic: 'CZ123' }).dic).toMatch(/CZ a 8–10 číslic/);
  });
});

describe('fakturační údaje v Nastavení', () => {
  it('uloží je jen majitel, sjednocené (IČO a PSČ bez mezer, e-maily malými písmeny)', () => {
    const s = createBaseState('2026-01-01');
    expect(s.settings.business).toEqual(emptyBusinessProfile());
    const patch = { business: { ...COMPANY, email: 'Recepce@Studio-Test.cz', web: 'www.studio-test.cz', phone: ' +420 777 123 456 ' } };
    expect(tryRun(s, updateSettings, patch, staff())).toBe('Fakturační údaje může měnit jen majitel.');
    const saved = run(s, updateSettings, patch, owner()).state.settings.business;
    expect(saved).toMatchObject({
      legalName: 'Pohybové studio Test s.r.o.',
      legalForm: 'company',
      ico: '12345679',
      registeredAddress: { street: 'Ukázková 299/12', city: 'Brno', zip: '60200' },
      email: 'recepce@studio-test.cz',
      phone: '+420 777 123 456',
      web: 'www.studio-test.cz',
      vatPayer: false,
      dic: '',
    });
    // část údajů (adresy po polích) se doplní ke stávajícím
    const s2 = run(s, updateSettings, patch, owner()).state;
    expect(run(s2, updateSettings, { business: { registeredAddress: { zip: '60300' } } }, owner()).state.settings.business.registeredAddress).toEqual({ street: 'Ukázková 299/12', city: 'Brno', zip: '60300' });
  });

  it('odmítne neplatné IČO, DIČ, PSČ a e-maily – a plátce DPH bez DIČ', () => {
    const s = createBaseState('2026-01-01');
    expect(tryRun(s, updateSettings, { business: { ico: '12345678' } }, owner())).toMatch(/IČO není platné/);
    expect(tryRun(s, updateSettings, { business: { dic: 'CZ12' } }, owner())).toMatch(/DIČ/);
    expect(tryRun(s, updateSettings, { business: { vatPayer: true } }, owner())).toBe('Plátce DPH musí mít vyplněné DIČ.');
    expect(tryRun(s, updateSettings, { business: { vatPayer: true, dic: 'CZ12345679' } }, owner())).toBeNull();
    expect(tryRun(s, updateSettings, { business: { registeredAddress: { zip: '6020' } } }, owner())).toMatch(/PSČ/);
    expect(tryRun(s, updateSettings, { business: { email: 'neni-email' } }, owner())).toMatch(/E-mail/);
    expect(tryRun(s, updateSettings, { business: { invoiceEmail: 'faktury@' } }, owner())).toMatch(/E-mail/);
    expect(tryRun(s, updateSettings, { business: { placeAddress: { street: 'Vedlejší 2' } } }, owner())).toMatch(/obec|PSČ/i);
    // ze sítě může přijít cokoli
    expect(tryRun(s, updateSettings, { business: { ico: 12345679 as unknown as string } }, owner())).toBe('Neplatné fakturační údaje.');
  });

  it('jméno příjemce QR platby se předvyplní obchodní firmou, jen když je prázdné', () => {
    let s = run(createBaseState('2026-01-01'), updateSettings, { payments: { accountNumber: '19-2000145399/0800', recipientName: '' } }, owner()).state;
    s = run(s, updateSettings, { business: COMPANY }, owner()).state;
    expect(s.settings.payments.recipientName).toBe('Pohybové studio Test s.r.o.');
    s = run(s, updateSettings, { payments: { recipientName: 'Studio Test' } }, owner()).state;
    s = run(s, updateSettings, { business: { ...COMPANY, legalName: 'Jiná firma s.r.o.' } }, owner()).state;
    expect(s.settings.payments.recipientName).toBe('Studio Test');
    // prázdné jméno příjemce v QR (např. ze starších dat): obchodní firma, jinak odesílatel e-mailů
    const empty = produce(s, (d) => {
      d.settings.payments.recipientName = '';
    });
    expect(paymentSpayd(empty, { clientId: 'x', amount: 100, vs: '26100001', label: 'Termín' })).toContain('*RN:JINA FIRMA S.R.O.');
  });

  it('patička e-mailů a kontakt v portálu', () => {
    const b = normalizeBusiness({ ...emptyBusinessProfile(), ...COMPANY, phone: '+420 777 123 456', placeAddress: { street: 'Vedlejší 2', city: 'Brno', zip: '60300' } });
    expect(businessIdentity(b)).toEqual([
      'Pohybové studio Test s.r.o., Ukázková 299/12, 602 00 Brno, IČO 12345679',
      'Společnost zapsaná v obchodním rejstříku vedeném Krajským soudem v Brně, oddíl C, vložka 12345',
    ]);
    // neúplné údaje se do patičky nedávají
    expect(businessIdentity({ ...b, ico: '' })).toEqual([]);
    expect(businessContact({ business: b, senderEmail: 'rezervace@example.com' })).toEqual({ address: 'Vedlejší 2, 603 00 Brno', phone: '+420 777 123 456', email: 'rezervace@example.com', web: '' });
    expect(formatAddress(b.registeredAddress)).toBe('Ukázková 299/12, 602 00 Brno');
  });
});

/* ------------------------------------------------------------------ */
/* Kontrolní seznam a spuštění                                         */
/* ------------------------------------------------------------------ */

const newTenant = (): ClinicState =>
  createPresetState('fyzio', { businessName: 'Studio Test', ownerName: 'Jana Testová', ownerEmail: 'Jana@Example.cz', today: '2026-10-01' });

describe('kontrolní seznam spuštění', () => {
  it('nová provozovna: co je hotové a co chybí', () => {
    const steps = launchChecklist(newTenant());
    expect(steps.map((x) => [x.id, x.done, x.optional])).toEqual([
      ['business', false, false],
      ['sender', true, false],
      ['account', false, false],
      ['services', true, false],
      ['hours', true, false],
      ['legal', false, false],
      ['branding', false, true],
    ]);
    expect(steps.find((x) => x.id === 'business')?.hint).toMatch(/Chybí: jméno a příjmení, IČO, sídlo/);
    expect(steps.find((x) => x.id === 'business')?.target).toEqual({ screen: 'nastaveni', section: 'business' });
    expect(steps.find((x) => x.id === 'services')?.target).toEqual({ screen: 'sluzby' });
    expect(launchMissing(newTenant()).map((x) => x.id)).toEqual(['business', 'account', 'legal']);
  });

  it('účet jen se zapnutou QR platbou a ne ukázkový; právní texty bez poznámek konceptu', () => {
    const base = run(newTenant(), updateSettings, { business: COMPANY, legal: LEGAL }, owner()).state;
    expect(launchMissing(base).map((x) => x.id)).toEqual(['account']);
    expect(launchReady(run(base, updateSettings, { payments: { qrEnabled: false } }, owner()).state)).toBe(true);
    expect(launchChecklist(run(base, updateSettings, { payments: { qrEnabled: false } }, owner()).state).some((x) => x.id === 'account')).toBe(false);
    const demo = produce(base, (d) => {
      d.settings.payments = { ...d.settings.payments, accountNumber: DEMO_ACCOUNT.accountNumber, iban: DEMO_ACCOUNT.iban, demoAccount: true };
    });
    expect(launchChecklist(demo).find((x) => x.id === 'account')).toMatchObject({ done: false, hint: expect.stringMatching(/ukázkový účet/) });
    const real = run(base, updateSettings, { payments: { accountNumber: '19-2000145399/0800' } }, owner()).state;
    expect(launchReady(real)).toBe(true);
    const draft = produce(real, (d) => {
      d.settings.legal.privacy = 'Správce [NÁZEV PROVOZOVNY], IČO [IČO]';
    });
    expect(launchMissing(draft).map((x) => x.id)).toEqual(['legal']);
  });

  it('bez aktivní služby s online rezervací, bez pracovní doby a bez e-mailu odesílatele', () => {
    // ostrý provoz: e-mail odesílatele je prázdný, dokud ho majitel nevyplní
    const empty = productionState('prazdna', { businessName: 'Prázdná', ownerName: 'Bořek Test', today: '2026-10-01' });
    const s = produce(empty, (d) => {
      d.therapists[0].workingHours = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    });
    expect(launchMissing(s).map((x) => x.id)).toEqual(['business', 'sender', 'account', 'services', 'hours', 'legal']);
  });
});

describe('spuštění online rezervací', () => {
  it('spustí jen majitel a až po povinných krocích; pozastavit jde kdykoli', () => {
    let s = newTenant();
    expect(onlineOpen(s)).toBe(false);
    expect(tryRun(s, updateSettings, { bookingRules: { onlineOpen: true } }, owner())).toBe(
      'Online rezervace zatím nelze spustit – chybí: fakturační údaje, číslo účtu pro QR platby, obchodní podmínky a informace o zpracování údajů.',
    );
    s = run(s, updateSettings, { business: COMPANY, legal: LEGAL, payments: { accountNumber: '19-2000145399/0800' } }, owner()).state;
    expect(tryRun(s, updateSettings, { bookingRules: { onlineOpen: true } }, staff())).toBe('Spustit nebo pozastavit online rezervace může jen majitel.');
    s = run(s, updateSettings, { bookingRules: { onlineOpen: true } }, owner()).state;
    expect(onlineOpen(s)).toBe(true);
    expect(s.audit.some((a) => a.action === 'Spuštění online rezervací')).toBe(true);
    // uložení ostatních pravidel rezervací spuštění nemění (a recepce je smí ukládat)
    s = run(s, updateSettings, { bookingRules: { horizonDays: 30 } }, staff()).state;
    expect(onlineOpen(s)).toBe(true);
    s = run(s, updateSettings, { bookingRules: { onlineOpen: false } }, owner()).state;
    expect(onlineOpen(s)).toBe(false);
    expect(s.audit.some((a) => a.action === 'Pozastavení online rezervací')).toBe(true);
    expect(tryRun(s, updateSettings, { bookingRules: { onlineOpen: 'ano' as unknown as boolean } }, owner())).toBe('Neplatné nastavení online rezervací.');
  });

  it('jedním uložením lze doplnit chybějící kroky a rovnou spustit', () => {
    const s = run(newTenant(), updateSettings, { business: COMPANY, legal: LEGAL, payments: { qrEnabled: false }, bookingRules: { onlineOpen: true } }, owner()).state;
    expect(onlineOpen(s)).toBe(true);
  });
});

describe('dokud online rezervace nejsou spuštěné', () => {
  /** Klinika z ukázkového katalogu s klientkou a pozastavenými online rezervacemi. */
  function paused(): { s: ClinicState; clientId: string } {
    const c = withClient(createBaseState('2026-01-01'));
    return { s: run(c.s, updateSettings, { bookingRules: { onlineOpen: false } }, owner()).state, clientId: c.clientId };
  }
  const slot = { serviceId: 's_fyzio45', therapistId: 't_mala', payment: { method: 'onsite' as const } };

  it('klient si online nerezervuje, personál ano', () => {
    const { s, clientId } = paused();
    expect(tryRun(s, createBooking, { ...slot, clientId, start: '2026-10-15T09:00' }, asClient('2026-10-10T10:00', clientId))).toBe(
      'Online rezervace připravujeme. Termín si zatím domluvte přímo s klinikou.',
    );
    expect(onlineClosedMessage(createPresetState('fitness', { businessName: 'Studio', ownerName: 'Trenér', today: '2026-10-01' }))).toMatch(/přímo se studiem\.$/);
    const booked = run(s, createBooking, { ...slot, clientId, start: '2026-10-15T09:00' }, staff('2026-10-10T10:00')).state;
    expect(booked.bookings[0]).toMatchObject({ status: 'confirmed', createdBy: 'staff' });
  });

  it('klient termín nepřesune ani se nepřihlásí na čekací listinu; zrušit může', () => {
    const { s, clientId } = paused();
    const b = run(s, createBooking, { ...slot, clientId, start: '2026-10-15T09:00' }, staff('2026-10-10T10:00')).state;
    const id = b.bookings[0].id;
    expect(tryRun(b, rescheduleBooking, { bookingId: id, start: '2026-10-16T10:15' }, asClient('2026-10-10T11:00', clientId))).toMatch(/Online rezervace připravujeme/);
    expect(tryRun(b, joinWaitlist, { clientId, serviceId: 's_fyzio45', therapistId: null, dateFrom: '2026-10-16' }, asClient('2026-10-10T11:00', clientId))).toMatch(/Online rezervace připravujeme/);
    expect(tryRun(b, rescheduleBooking, { bookingId: id, start: '2026-10-16T10:15' }, staff('2026-10-10T11:00'))).toBeNull();
    const cancelled = run(b, cancelBooking, { bookingId: id, option: 'free' }, asClient('2026-10-10T11:00', clientId)).state;
    expect(cancelled.bookings[0].status).toBe('cancelled');
  });

  it('uvolněný termín se z čekací listiny klientům nenabízí (potvrdit by ho nemohli)', () => {
    const { s, clientId } = paused();
    const other = run(s, createClient, { firstName: 'Jan', lastName: 'Čekající', email: 'jan@example.com', phone: '', consents: { gdpr: true, health: false, marketingEmail: false, sms: false } }, staff());
    const waiterId = other.value as string;
    let next = run(other.state, createBooking, { ...slot, clientId, start: '2026-10-16T09:00' }, staff('2026-10-10T10:00')).state;
    next = run(next, joinWaitlist, { clientId: waiterId, serviceId: 's_fyzio45', therapistId: 't_mala', dateFrom: '2026-10-16' }, staff('2026-10-12T10:00')).state;
    next = run(next, cancelBooking, { bookingId: next.bookings[0].id, option: 'free' }, staff('2026-10-14T10:00')).state;
    expect(next.waitlist[0].status).toBe('waiting');
  });
});

describe('výchozí hodnoty', () => {
  it('starší data: prázdné fakturační údaje a spuštěné online rezervace', () => {
    const s = JSON.parse(JSON.stringify(createBaseState('2026-01-01'))) as ClinicState;
    const raw = s.settings as unknown as Record<string, unknown>;
    delete raw.business;
    delete (s.settings.bookingRules as unknown as Record<string, unknown>).onlineOpen;
    const n = normalizeState(s);
    expect(n.settings.business).toEqual(emptyBusinessProfile());
    expect(n.settings.bookingRules.onlineOpen).toBe(true);
    // pozastavené zůstane pozastavené
    const closed = JSON.parse(JSON.stringify(createBaseState('2026-01-01'))) as ClinicState;
    closed.settings.bookingRules.onlineOpen = false;
    expect(normalizeState(closed).settings.bookingRules.onlineOpen).toBe(false);
  });

  it('ukázková data a výchozí stav jsou spuštěné, nové provozovny ne', () => {
    expect(onlineOpen(createBaseState('2026-01-01'))).toBe(true);
    expect(onlineOpen(generateDemoState('2026-10-14T10:00', { clients: 12, weeksBack: 1, daysAhead: 3 }))).toBe(true);
    const preset = newTenant();
    expect(preset.settings.bookingRules.onlineOpen).toBe(false);
    expect(preset.settings.business).toEqual({ ...emptyBusinessProfile(), email: 'jana@example.cz', invoiceEmail: 'jana@example.cz' });
    expect(createPresetState('beauty', { businessName: 'Salon', ownerName: 'Lili', today: '2026-10-01' }).settings.business).toEqual(emptyBusinessProfile());
    const live = productionState('masaze', { businessName: 'Studio Test', ownerName: 'Jana Testová', ownerEmail: 'jana@example.cz', today: '2026-10-01' });
    expect(live.settings.bookingRules.onlineOpen).toBe(false);
    expect(live.settings.senderEmail).toBe('');
    expect(live.settings.business.invoiceEmail).toBe('jana@example.cz');
  });
});
