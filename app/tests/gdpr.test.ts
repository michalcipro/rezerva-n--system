import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { ClinicState, Ctx } from '../src/domain/types';
import {
  addClinicalNote,
  adjustCredit,
  cancelBooking,
  confirmPaymentRequest,
  createBooking,
  createClient,
  createPaymentRequest,
  joinWaitlist,
  markCompleted,
  sellPackage,
  sendManualMessage,
  topUpCredit,
  updateSettings,
} from '../src/engine/commands';
import { createBaseState } from '../src/engine/defaults';
import {
  ANONYMIZED_MESSAGE,
  ANONYMIZED_NAME,
  ANONYMIZED_TAG,
  anonymizationCheck,
  anonymizeClient,
  clientDataExport,
  clientDataExportFilename,
  isAnonymized,
  logClientDataExport,
} from '../src/engine/gdpr';
import { checkClientRows } from '../src/engine/importer';
import { bookingsOfClient, clientCredit } from '../src/engine/selectors';

const T0 = '2026-11-02T08:00';
const T1 = '2026-11-10T12:00';
const reception = (now: string): Ctx => ({ now, actor: { role: 'reception', name: 'Recepce' } });
const owner = (now: string): Ctx => ({ now, actor: { role: 'owner', name: 'Tereza Malá', therapistId: 't_mala' } });
const asClient = (now: string, clientId: string, name = 'Zdeňka Unikátová'): Ctx => ({ now, actor: { role: 'client', name, clientId } });

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

/** Osobní údaje klientky, které po anonymizaci nesmí ve stavu zůstat. */
const PERSONAL = ['Zdeňk', 'Unikátov', 'zdenka.unikatova', '731 555 019', '731555019', '1984-06-17', 'VIP-unikat', 'Volat po 16', 'Bolí mě koleno', 'chřipka', 'bederní'];

/** Klientka s celou historií: portál, permanentka, kredit, QR platba, omluvenka s náhradou, čekací listina, zprávy, poznámka. */
function history(): { s: ClinicState; id: string } {
  let s = createBaseState('2026-01-01');
  const c = run(
    s,
    createClient,
    {
      firstName: 'Zdeňka',
      lastName: 'Unikátová',
      email: 'zdenka.unikatova@example.cz',
      phone: '+420 731 555 019',
      birthDate: '1984-06-17',
      tags: ['VIP-unikat'],
      internalNote: 'Volat po 16. hodině',
      consents: { gdpr: true, health: true, marketingEmail: true, sms: true },
    },
    reception(T0),
  );
  s = c.state;
  const id = c.value as unknown as string;
  s = run(s, updateSettings, { payments: { accountNumber: '19-2000145399/0800' } }, reception(T0)).state;
  s = run(s, addClinicalNote, { clientId: id, text: 'Pacientka Unikátová: bolest bederní páteře, doporučené cviky.' }, owner(T0)).state;
  s = run(s, sellPackage, { clientId: id, templateId: 'pt_fyzio10', paidBy: 'card' }, reception(T0)).state;
  s = run(s, topUpCredit, { clientId: id, amount: 2000, method: 'cash' }, reception(T0)).state;
  s = run(s, adjustCredit, { clientId: id, amount: 100, note: 'Kompenzace pro paní Unikátovou' }, reception(T0)).state;
  // omluvený termín z permanentky → náhrada
  const excused = run(s, createBooking, { clientId: id, serviceId: 's_fyzio45', therapistId: 't_mala', start: '2026-11-03T15:00', payment: { method: 'package' } }, reception(T0));
  s = excused.state;
  const a = run(s, createBooking, { clientId: id, serviceId: 's_fyzio45', therapistId: 't_mala', start: '2026-11-04T09:00', payment: { method: 'package' }, note: 'Bolí mě koleno – Zdeňka' }, asClient(T0, id));
  s = a.state;
  const b = run(s, createBooking, { clientId: id, serviceId: 's_fyzio45', therapistId: 't_mala', start: '2026-11-05T10:00', payment: { method: 'qr' } }, asClient(T0, id));
  s = b.state;
  s = run(s, confirmPaymentRequest, { requestId: s.paymentRequests[0].id }, reception('2026-11-02T09:00')).state;
  const cancelled = run(s, createBooking, { clientId: id, serviceId: 's_fyzio45', therapistId: 't_mala', start: '2026-11-06T11:00', payment: { method: 'onsite' } }, reception(T0));
  s = cancelled.state;
  s = run(s, cancelBooking, { bookingId: cancelled.value, option: 'free', reason: 'Nemoc – chřipka' }, asClient(T0, id)).state;
  s = run(s, cancelBooking, { bookingId: excused.value, option: 'excuse', reason: 'Nemoc – chřipka' }, asClient('2026-11-03T08:00', id)).state;
  s = run(s, joinWaitlist, { clientId: id, serviceId: 's_fyzio45', therapistId: 't_mala', dateFrom: '2026-11-20', note: 'Zdeňka může jen ráno' }, asClient(T0, id)).state;
  s = run(s, sendManualMessage, { clientId: id, channel: 'email', subject: 'Pro paní Unikátovou', body: 'Dobrý den, paní Unikátová, posíláme cviky.' }, reception(T0)).state;
  s = run(s, markCompleted, { bookingId: a.value }, reception(T1)).state;
  s = run(s, markCompleted, { bookingId: b.value }, reception(T1)).state;
  // ostrý provoz: zpráva čeká ve frontě na odeslání
  s = run(s, updateSettings, { messaging: { deliver: true } }, owner(T1)).state;
  s = run(s, sendManualMessage, { clientId: id, channel: 'sms', subject: '', body: 'Zdeňko, nezapomeňte na cviky.' }, reception(T1)).state;
  return { s, id };
}

describe('export osobních údajů (GDPR)', () => {
  it('obsahuje všechny údaje klienta ze všech částí stavu', () => {
    const { s, id } = history();
    const x = clientDataExport(s, id, { now: T1 })!;
    expect(x['O exportu']).toMatchObject({ Vytvořeno: T1, 'Správce osobních údajů': 'pohyb' });
    expect(x.Klient).toMatchObject({ ID: id, Jméno: 'Zdeňka', Příjmení: 'Unikátová', 'E-mail': 'zdenka.unikatova@example.cz', Telefon: '+420 731 555 019', 'Datum narození': '1984-06-17', Štítky: ['VIP-unikat'], 'Interní poznámka': 'Volat po 16. hodině', Anonymizováno: null });
    expect(x.Souhlasy.map((c) => [c.Souhlas, c.Stav])).toEqual([
      ['Zpracování osobních údajů', 'udělen'],
      ['Zdravotní dokumentace', 'udělen'],
      ['Obchodní sdělení e-mailem', 'udělen'],
      ['SMS zprávy', 'udělen'],
    ]);
    expect(x.Rezervace).toHaveLength(bookingsOfClient(s, id).length);
    expect(x.Rezervace).toHaveLength(4);
    expect(x.Rezervace.find((b) => b.Začátek === '2026-11-04T09:00')).toMatchObject({ Stav: 'Proběhlo', Poznámka: 'Bolí mě koleno – Zdeňka', 'Způsob platby': 'permanentka Fyzio 10' });
    expect(x.Rezervace.find((b) => b.Začátek === '2026-11-06T11:00')).toMatchObject({ Stav: 'Zrušeno', 'Důvod zrušení': 'Nemoc – chřipka', 'Zrušil(a)': 'klient' });
    expect(x.Permanentky).toEqual([expect.objectContaining({ Název: 'Fyzio 10', 'Vstupů celkem': 10, Využito: 1, Volné: 9, 'Omluvenky využité': 1 })]);
    expect(x.Kredit['Zůstatek (Kč)']).toBe(clientCredit(s, id));
    expect(x.Kredit.Pohyby).toHaveLength(s.ledger.filter((e) => e.clientId === id).length);
    expect(x.Platby).toHaveLength(s.payments.filter((p) => p.clientId === id).length);
    expect(x.Platby.map((p) => p['Částka (Kč)'])).toEqual([10900, 2000, 1190]);
    expect(x['Platební výzvy']).toEqual([expect.objectContaining({ Stav: 'zaplaceno', 'Částka (Kč)': 1190 })]);
    expect(x['Náhradní termíny']).toEqual([expect.objectContaining({ Stav: 'k využití' })]);
    expect(x['Čekací listina']).toEqual([expect.objectContaining({ Od: '2026-11-20', Poznámka: 'Zdeňka může jen ráno' })]);
    expect(x.Zprávy).toHaveLength(s.messages.filter((m) => m.clientId === id).length);
    expect(x.Zprávy.some((m) => m.Text === 'Dobrý den, paní Unikátová, posíláme cviky.' && m.Stav === 'odesláno')).toBe(true);
    expect(x.Zprávy.some((m) => m.Stav === 'čeká na odeslání')).toBe(true);
    expect(x['Klinické poznámky']).toEqual([{ Datum: T0, Terapeut: 'Mgr. Tereza Malá', Text: 'Pacientka Unikátová: bolest bederní páteře, doporučené cviky.' }]);
    const bookingIds = new Set(bookingsOfClient(s, id).map((b) => b.id));
    expect(x['Historie změn']).toHaveLength(s.audit.filter((a) => a.clientId === id || (!!a.bookingId && bookingIds.has(a.bookingId))).length);
    // celý export se dá uložit jako JSON
    expect(JSON.parse(JSON.stringify(x))).toEqual(x);
    expect(clientDataExportFilename({ firstName: 'Zdeňka', lastName: 'Unikátová' }, T1)).toBe('osobni-udaje-unikatova-zdenka-2026-11-10.json');
  });

  it('bez klinických poznámek pro recepci; neznámý klient = null; stažení se zapíše do historie', () => {
    const { s, id } = history();
    expect(clientDataExport(s, id, { now: T1, includeClinicalNotes: false })!['Klinické poznámky']).toMatch(/není součástí tohoto exportu \(1\száznam\)/);
    expect(clientDataExport(s, 'c_neni')).toBeNull();
    const logged = run(s, logClientDataExport, { clientId: id }, reception(T1)).state;
    expect(logged.audit[logged.audit.length - 1]).toMatchObject({ action: 'Export osobních údajů', clientId: id, actor: 'Recepce' });
    expect(tryRun(s, logClientDataExport, { clientId: id }, asClient(T1, id))).toMatch(/majitelka nebo recepce/);
  });
});

describe('anonymizace klienta (GDPR)', () => {
  it('jen majitelka; odmítne s nadcházející rezervací nebo čekající QR platbou a řekne, co udělat', () => {
    const { s, id } = history();
    expect(tryRun(s, anonymizeClient, { clientId: id }, reception(T1))).toMatch(/jen majitelka/);
    expect(tryRun(s, anonymizeClient, { clientId: 'c_neni' }, owner(T1))).toMatch(/neexistuje/);

    const upcoming = run(s, createBooking, { clientId: id, serviceId: 's_fyzio45', therapistId: 't_mala', start: '2026-11-20T09:00', payment: { method: 'onsite' } }, reception(T1)).state;
    expect(anonymizationCheck(upcoming, id, T1).blockers).toHaveLength(1);
    expect(tryRun(upcoming, anonymizeClient, { clientId: id }, owner(T1))).toMatch(/1\snadcházející rezervaci \(nejbližší Pá 20\.\s11\. v 9:00\)\. Nejdřív je zrušte nebo přesuňte/);

    const pending = run(s, createPaymentRequest, { clientId: id, purpose: 'credit_topup', amount: 500 }, asClient(T1, id)).state;
    expect(tryRun(pending, anonymizeClient, { clientId: id }, owner(T1))).toMatch(/1\sčekající QR platbu \(VS \d+\)\. Potvrďte je/);

    const notes = anonymizationCheck(s, id, T1).notes.join(' ');
    expect(notes).toMatch(/Na kreditu zůstává/);
    expect(notes).toMatch(/9\snevyčerpaných vstupů/);
    expect(notes).toMatch(/zdravotní dokumentace \(1\sklinická poznámka\)/);
  });

  it('ve stavu nezůstane žádný osobní údaj klienta; účetní záznamy zůstanou beze změny částek', () => {
    const { s, id } = history();
    const before = JSON.stringify(s);
    for (const p of PERSONAL.filter((x) => x !== '731555019')) expect(before).toContain(p);
    const sum = (st: ClinicState) => ({
      bookings: st.bookings.filter((b) => b.clientId === id).map((b) => [b.id, b.status, b.price, b.payment.paidAmount]),
      payments: st.payments.filter((p) => p.clientId === id).map((p) => [p.id, p.amount, p.method, p.vs ?? null]),
      ledger: st.ledger.filter((e) => e.clientId === id).map((e) => [e.id, e.amount, e.kind]),
      credit: clientCredit(st, id),
      packages: st.packages.filter((p) => p.clientId === id).map((p) => [p.id, p.priceCzk, p.entriesTotal]),
      requests: st.paymentRequests.filter((r) => r.clientId === id).map((r) => [r.id, r.amount, r.vs, r.status]),
    });

    const r = run(s, anonymizeClient, { clientId: id }, owner(T1));
    const after = r.state;
    const json = JSON.stringify(after);
    for (const p of PERSONAL) expect(json, `zůstalo „${p}“`).not.toContain(p);

    const c = after.clients.find((x) => x.id === id)!;
    expect(c).toMatchObject({
      firstName: 'Anonymizovaný',
      lastName: 'klient',
      email: '',
      phone: '',
      birthDate: null,
      tags: [ANONYMIZED_TAG],
      notes: [],
      internalNote: '',
      consents: { gdpr: null, health: null, marketingEmail: null, sms: null },
    });
    expect(isAnonymized(c)).toBe(true);
    expect(sum(after)).toEqual(sum(s));

    const msgs = after.messages.filter((m) => m.clientId === id);
    expect(msgs.length).toBeGreaterThan(0);
    expect(msgs.every((m) => m.subject === '' && m.body === ANONYMIZED_MESSAGE)).toBe(true);
    expect(msgs.some((m) => m.status === 'queued')).toBe(false);
    expect(msgs.filter((m) => m.status === 'skipped').map((m) => m.skipReason)).toContain('Klient byl anonymizován – zpráva se neodešle.');
    expect(after.waitlist.filter((w) => w.clientId === id).map((w) => w.status)).toEqual(['cancelled']);
    expect(after.makeups.filter((m) => m.clientId === id).map((m) => m.status)).toEqual(['cancelled']);
    expect(after.bookings.filter((b) => b.clientId === id).every((b) => b.note === '' && (!b.cancel || b.cancel.reason === ''))).toBe(true);
    // záznamy, kde jednala sama klientka (portál), zůstanou bez jména
    expect(after.audit.some((a) => a.actor === ANONYMIZED_NAME)).toBe(true);
    const last = after.audit[after.audit.length - 1];
    expect(last).toMatchObject({ action: 'Anonymizace klienta', clientId: id, actor: 'Tereza Malá' });

    // export po anonymizaci už osobní údaje neobsahuje
    const x = clientDataExport(after, id, { now: T1 })!;
    expect(x.Klient).toMatchObject({ Jméno: 'Anonymizovaný', 'E-mail': null, Anonymizováno: T1 });
    expect(JSON.stringify(x)).not.toMatch(/Unikátov|zdenka/);
  });

  it('podruhé se anonymizovat nedá a import starého e-mailu založí nového klienta', () => {
    const { s, id } = history();
    const after = run(s, anonymizeClient, { clientId: id }, owner(T1)).state;
    expect(tryRun(after, anonymizeClient, { clientId: id }, owner(T1))).toMatch(/už je anonymizovaný/);
    const [check] = checkClientRows(after, [{ firstName: 'Zdeňka', lastName: 'Unikátová', email: 'zdenka.unikatova@example.cz' }], 'update', T1);
    expect(check.action).toBe('create');
    expect(check.existingId).toBeUndefined();
  });
});
