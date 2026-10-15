import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { Booking, Client, ClinicState, Ctx, FollowUp, Note } from '../src/domain/types';
import {
  addClinicalNote,
  addFileRecord,
  addFollowUp,
  addNote,
  createClient,
  deleteFollowUp,
  deleteNote,
  removeFileRecord,
  saveStages,
  sendManualMessage,
  sendSessionNotes,
  SESSION_NOTES_TOO_LONG,
  setClientStage,
  SUBJECT_TOO_LONG,
  setFollowUpDone,
  updateFileRecord,
  updateFollowUp,
  updateNote,
} from '../src/engine/commands';
import {
  clientCrmStats,
  clientsByStage,
  clientStage,
  daysInStage,
  filesOfClient,
  filesOfNote,
  followUpBuckets,
  followUpDueLabel,
  notesOfClient,
  NOTE_TEXT_MAX,
  pipelineStats,
  sessionNoteOfBooking,
  sessionNotesEmail,
  stagesSorted,
} from '../src/engine/crm';
import { createBaseState, DEFAULT_STAGES } from '../src/engine/defaults';
import { MESSAGE_BODY_MAX, MESSAGE_SUBJECT_MAX, renderTemplate, TEMPLATE_VARIABLES } from '../src/engine/messages';
import { defaultRule, describeRule, evaluateSegment, RULE_TYPES } from '../src/engine/segments';
import { generateDemoState } from '../src/engine/seed';
import { clearSelectorCaches } from '../src/engine/selectors';
import { buildClientRows } from '../src/screens/clients/model';
import { assetUploadType, base64ToBytes, bytesToBase64, canStoreFiles, decodeText, fileKindOf, mimeOf } from '../src/store/files';
import {
  chunkCollection,
  COLLECTIONS,
  createArtifactAdapter,
  MAX_CHUNK_BYTES,
  metaOf,
  normalizeState,
  sortCollection,
  takeMigrationFlag,
  utf8Bytes,
} from '../src/store/persistence';

const NOW = '2026-10-14T10:40';
/** České formátování používá nezlomitelné mezery – pro porovnání je nahradíme obyčejnými. */
const sp = (x: string | null | undefined): string => (x ?? '').replace(/\u00a0/g, ' ');
const staff = (now = NOW): Ctx => ({ now, actor: { role: 'owner', name: 'Tereza Malá', therapistId: 't_mala' } });
const reception = (now = NOW): Ctx => ({ now, actor: { role: 'reception', name: 'Recepce' } });
const asClient = (clientId: string, now = NOW): Ctx => ({ now, actor: { role: 'client', name: 'Klient', clientId } });

type Cmd<I, R> = (d: ClinicState, i: I, c: Ctx) => { ok: true; value: R; notices: string[] } | { ok: false; error: string };

/** Spustí příkaz nad kopií stavu (jako aplikace přes Immer) a vrátí nový stav nebo vyhodí chybu příkazu. */
function run<I, R>(s: ClinicState, cmd: Cmd<I, R>, input: I, ctx: Ctx = staff()): { state: ClinicState; value: R; notices: string[] } {
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

/** Očekávaná chyba příkazu (stav se nemění). */
function failOf<I, R>(s: ClinicState, cmd: Cmd<I, R>, input: I, ctx: Ctx = staff()): string {
  let error = '';
  produce(s, (d) => {
    const r = cmd(d as ClinicState, input, ctx);
    if (!r.ok) error = r.error;
  });
  if (!error) throw new Error('Příkaz měl skončit chybou.');
  return error;
}

function newClient(s: ClinicState, first: string, last: string, extra: { stageId?: string; email?: string; marketing?: boolean; now?: string } = {}) {
  return run(
    s,
    createClient,
    {
      firstName: first,
      lastName: last,
      email: extra.email ?? `${first.toLowerCase()}@example.com`,
      phone: '+420 600 000 000',
      consents: { gdpr: true, health: true, marketingEmail: extra.marketing ?? true, sms: false },
      stageId: extra.stageId,
    },
    reception(extra.now ?? '2026-09-01T09:00'),
  );
}

function booking(id: string, clientId: string, start: string, status: Booking['status'] = 'completed'): Booking {
  const end = start.slice(0, 11) + String(Number(start.slice(11, 13)) + 1).padStart(2, '0') + start.slice(13);
  return {
    id,
    clientId,
    serviceId: 's_koucink',
    therapistId: 't_mala',
    roomId: 'r_k1',
    start,
    end,
    status,
    createdAt: '2026-01-01T08:00',
    createdBy: 'staff',
    channel: 'recepce',
    price: 1900,
    payment: { method: 'onsite', paid: true, paidAmount: 1900 },
    note: '',
  };
}

/** Klinika se dvěma klienty a jednou proběhlou schůzkou Evy. */
function setup(): { s: ClinicState; eva: string; jan: string } {
  let s = createBaseState('2026-01-01');
  const a = newClient(s, 'Eva', 'Testová');
  s = a.state;
  const b = newClient(s, 'Jan', 'Novák', { stageId: 'st_freetalk' });
  s = b.state;
  s = produce(s, (d) => {
    d.bookings.push(booking('b_eva1', a.value, '2026-10-12T09:00'));
    d.bookings.push(booking('b_jan1', b.value, '2026-10-13T10:00'));
  });
  clearSelectorCaches();
  return { s, eva: a.value, jan: b.value };
}

/* ------------------------------------------------------------------ */

describe('výchozí nastavení CRM', () => {
  it('má výchozí fáze, prázdné kolekce a šablonu zápisu ze sezení', () => {
    const s = createBaseState();
    expect(s.settings.stages.map((x) => [x.id, x.name, x.tone, x.order, !!x.closed])).toEqual([
      ['st_potencialni', 'Potenciální klient', 'slate', 0, false],
      ['st_freetalk', 'Freetalk', 'blue', 1, false],
      ['st_diagnostika', 'Diagnostika', 'violet', 2, false],
      ['st_vyhodnoceni', 'Vyhodnocení', 'sand', 3, false],
      ['st_aktivni', 'Aktivní spolupráce', 'teal', 4, false],
      ['st_pozastaveno', 'Pozastaveno', 'olive', 5, false],
      ['st_konec', 'Konec spolupráce', 'rose', 6, true],
    ]);
    expect(s.notes).toEqual([]);
    expect(s.files).toEqual([]);
    expect(s.followUps).toEqual([]);
    expect(NOTE_TEXT_MAX).toBe(20000);
    const tpl = s.templates.find((t) => t.key === 'session_notes')!;
    expect(tpl.name).toBe('Zápis ze sezení');
    expect(tpl.subject).toBe('Zápis ze sezení [datum]');
    expect(tpl.body).toContain('[jméno]');
    expect(tpl.body).toContain('[poznámky]');
    expect(tpl.body).toContain('[klinika]');
    expect(TEMPLATE_VARIABLES.some((v) => v.key === 'poznámky')).toBe(true);
    expect(TEMPLATE_VARIABLES.some((v) => v.key === 'datum')).toBe(true);
    expect(renderTemplate(tpl.subject + '|' + tpl.body, { datum: '14. 10. 2026', poznámky: 'Text [jméno]', jméno: 'Eva', klinika: 'WM' })).toBe(
      'Zápis ze sezení 14. 10. 2026|Dobrý den, Eva,\n\nposíláme vám zápis ze sezení dne 14. 10. 2026.\n\nText [jméno]\n\nS pozdravem\nWM',
    );
  });
});

describe('fáze spolupráce', () => {
  it('createClient založí fázi a historii (výchozí první fáze)', () => {
    const { s, eva, jan } = setup();
    const e = s.clients.find((c) => c.id === eva)!;
    const j = s.clients.find((c) => c.id === jan)!;
    expect(e.stageId).toBe('st_potencialni');
    expect(e.stageHistory).toEqual([{ stageId: 'st_potencialni', at: '2026-09-01T09:00', actor: 'Recepce' }]);
    expect(j.stageId).toBe('st_freetalk');
    expect(e.notes).toEqual([]);
    expect(failOf(s, createClient, { firstName: 'A', lastName: 'B', email: 'ab@example.com', phone: '', consents: { gdpr: true, health: false, marketingEmail: false, sms: false }, stageId: 'st_nic' }, reception())).toBe(
      'Zvolená fáze spolupráce neexistuje.',
    );
  });

  it('setClientStage přesune klienta, zapíše historii a hlídá chyby', () => {
    const { s, eva } = setup();
    const r = run(s, setClientStage, { clientId: eva, stageId: 'st_diagnostika', note: '  Po freetalku  ' }, staff('2026-10-02T10:00'));
    const c = r.state.clients.find((x) => x.id === eva)!;
    expect(c.stageId).toBe('st_diagnostika');
    expect(c.stageHistory[1]).toEqual({ stageId: 'st_diagnostika', at: '2026-10-02T10:00', actor: 'Tereza Malá', note: 'Po freetalku' });
    expect(r.state.audit.some((a) => a.action === 'Změna fáze spolupráce' && a.clientId === eva)).toBe(true);
    expect(clientStage(r.state, c).name).toBe('Diagnostika');
    expect(daysInStage(c, '2026-10-14T08:00')).toBe(12);
    expect(failOf(r.state, setClientStage, { clientId: eva, stageId: 'st_diagnostika' })).toBe('Klient už v této fázi je.');
    expect(failOf(r.state, setClientStage, { clientId: eva, stageId: 'st_xyz' })).toBe('Zvolená fáze spolupráce neexistuje.');
    expect(failOf(r.state, setClientStage, { clientId: 'c_nic', stageId: 'st_aktivni' })).toBe('Klient neexistuje.');
    expect(failOf(r.state, setClientStage, { clientId: eva, stageId: 'st_aktivni' }, asClient(eva))).toContain('jen personál');
  });

  it('setClientStage s undo vrátí přesun: záznam zmizí z historie i ze statistik', () => {
    let s = createBaseState('2026-01-01');
    const c = newClient(s, 'Eva', 'Testová', { stageId: 'st_freetalk', now: '2026-10-01T09:00' });
    s = c.state;
    const before = s.clients[0];
    // omylem přetažená karta Freetalk → Aktivní spolupráce
    const moved = run(s, setClientStage, { clientId: c.value, stageId: 'st_aktivni' }, staff('2026-10-02T09:00'));
    expect(moved.value).toEqual({ stageId: 'st_aktivni', at: '2026-10-02T09:00', actor: 'Tereza Malá' });
    const history = moved.state.clients[0].stageHistory;
    expect(history[history.length - 1]).toEqual(moved.value);
    const undone = run(moved.state, setClientStage, { clientId: c.value, stageId: 'st_freetalk', undo: moved.value! }, staff('2026-10-02T09:01'));
    const after = undone.state.clients[0];
    expect(undone.value).toBeNull();
    expect(after.stageId).toBe('st_freetalk');
    expect(after.stageHistory).toEqual(before.stageHistory);
    expect(daysInStage(after, '2026-10-14T10:00')).toBe(daysInStage(before, '2026-10-14T10:00'));
    expect(undone.state.audit.some((a) => a.action === 'Vrácení změny fáze' && a.clientId === c.value)).toBe(true);
    clearSelectorCaches();
    const p = pipelineStats(undone.state, '2026-10-14T10:00', '2026-10-01', '2026-11-01');
    expect(p.transitionsTotal).toBe(0);
    expect(p.conversion?.converted).toBe(0);
    expect(p.stages.find((x) => x.stage.id === 'st_aktivni')).toMatchObject({ entered: 0 });

    // vrátit lze jen poslední změnu fáze a jen do fáze, ze které klient přišel
    const later = run(moved.state, setClientStage, { clientId: c.value, stageId: 'st_pozastaveno' }, staff('2026-10-03T09:00')).state;
    expect(failOf(later, setClientStage, { clientId: c.value, stageId: 'st_freetalk', undo: moved.value! })).toContain('nejde vrátit zpět');
    expect(failOf(moved.state, setClientStage, { clientId: c.value, stageId: 'st_diagnostika', undo: moved.value! })).toContain('nejde vrátit zpět');
    expect(
      failOf(moved.state, setClientStage, { clientId: c.value, stageId: 'st_freetalk', undo: { ...moved.value!, at: '2026-10-02T09:05' } }),
    ).toContain('nejde vrátit zpět');
    expect(failOf(moved.state, setClientStage, { clientId: c.value, stageId: 'st_freetalk', undo: moved.value! }, asClient(c.value))).toContain('jen personál');
  });

  it('saveStages přejmenuje, přeřadí a přidá fáze; nedovolí smazat fázi s klienty', () => {
    const { s } = setup();
    const stages = stagesSorted(s).map((x) => ({ ...x }));
    const renamed = stages.map((x) => (x.id === 'st_freetalk' ? { ...x, name: 'Úvodní rozhovor' } : x));
    const reordered = [renamed[1], renamed[0], ...renamed.slice(2), { id: '', name: 'Alumni', tone: 'violet' as const, order: 99 }];
    const r = run(s, saveStages, { stages: reordered });
    const sorted = stagesSorted(r.state);
    expect(sorted[0]).toMatchObject({ id: 'st_freetalk', name: 'Úvodní rozhovor', order: 0 });
    expect(sorted[1].id).toBe('st_potencialni');
    expect(sorted[sorted.length - 1].name).toBe('Alumni');
    expect(sorted[sorted.length - 1].id).toMatch(/^st_/);
    expect(sorted.find((x) => x.id === 'st_konec')?.closed).toBe(true);
    // smazat prázdnou fázi lze
    const withoutEmpty = run(r.state, saveStages, { stages: sorted.filter((x) => x.id !== 'st_vyhodnoceni') });
    expect(withoutEmpty.state.settings.stages.some((x) => x.id === 'st_vyhodnoceni')).toBe(false);
    // fázi s klientem ne
    expect(sp(failOf(s, saveStages, { stages: stages.filter((x) => x.id !== 'st_potencialni') }))).toBe(
      'Fázi „Potenciální klient“ nelze smazat, protože v ní je 1 klient. Nejdřív je přesuňte do jiné fáze.',
    );
    expect(failOf(s, saveStages, { stages: [] })).toBe('Musí zůstat aspoň jedna fáze spolupráce.');
    expect(failOf(s, saveStages, { stages: [...stages, { id: '', name: ' freetalk ', tone: 'blue', order: 9 }] })).toContain('dvakrát');
    expect(failOf(s, saveStages, { stages: stages.map((x, i) => (i === 0 ? { ...x, name: '  ' } : x)) })).toBe('Zadejte název fáze.');
    expect(failOf(s, saveStages, { stages }, asClient('x'))).toBe('Nastavení může měnit jen personál.');
  });
});

describe('poznámky', () => {
  it('addNote: zápis ze sezení navázaný na schůzku dostane čas jejího začátku', () => {
    const { s, eva } = setup();
    const r = run(s, addNote, { clientId: eva, kind: 'session', title: '', text: '  Téma: nervozita.  ', bookingId: 'b_eva1' }, staff('2026-10-12T11:00'));
    const n = r.state.notes.find((x) => x.id === r.value)!;
    expect(n).toMatchObject({
      clientId: eva,
      kind: 'session',
      at: '2026-10-12T09:00',
      createdAt: '2026-10-12T11:00',
      updatedAt: null,
      authorId: 't_mala',
      text: 'Téma: nervozita.',
      bookingId: 'b_eva1',
      pinned: false,
      sentAt: null,
      plaud: null,
    });
    expect(sessionNoteOfBooking(r.state, 'b_eva1')?.id).toBe(n.id);
    expect(failOf(r.state, addNote, { clientId: eva, kind: 'session', title: '', text: 'Znovu', bookingId: 'b_eva1' })).toBe('K této schůzce už zápis ze sezení existuje.');
    expect(failOf(r.state, addNote, { clientId: eva, kind: 'session', title: '', text: 'Cizí', bookingId: 'b_jan1' })).toBe('Schůzka patří jinému klientovi.');
    // Plaud import ke stejné schůzce je v pořádku
    const p = run(r.state, addNote, { clientId: eva, kind: 'plaud', title: 'Shrnutí', text: 'Shrnutí sezení', bookingId: 'b_eva1', plaud: { recordedAt: '2026-10-12T09:00' } });
    expect(p.state.notes.find((x) => x.id === p.value)?.plaud).toEqual({ recordedAt: '2026-10-12T09:00', transcriptFileId: null });
  });

  it('addNote: validace a oprávnění', () => {
    const { s, eva } = setup();
    expect(failOf(s, addNote, { clientId: eva, kind: 'note', title: ' ', text: '  ' })).toBe('Poznámka je prázdná – doplňte nadpis nebo text.');
    const long = 'ř'.repeat(NOTE_TEXT_MAX + 1);
    const err = failOf(s, addNote, { clientId: eva, kind: 'note', title: '', text: long });
    expect(err).toContain('Text je příliš dlouhý');
    expect(err).toContain('Dlouhý přepis vložte jako soubor.');
    expect(run(s, addNote, { clientId: eva, kind: 'note', title: '', text: 'ř'.repeat(NOTE_TEXT_MAX) }).value).toBeTruthy();
    expect(failOf(s, addNote, { clientId: eva, kind: 'note', title: 'x'.repeat(121), text: 'a' })).toBe('Nadpis může mít nejvýše 120 znaků.');
    expect(failOf(s, addNote, { clientId: eva, kind: 'note', title: '', text: 'a' }, asClient(eva))).toContain('jen personál');
    expect(failOf(s, addNote, { clientId: 'nic', kind: 'note', title: '', text: 'a' })).toBe('Klient neexistuje.');
    expect(failOf(s, addNote, { clientId: eva, kind: 'call', title: '', text: 'a', at: '14. 10.' })).toBe('Neplatné datum a čas poznámky.');
  });

  it('addClinicalNote vytvoří Note druhu note v kolekci notes', () => {
    const { s, eva } = setup();
    const r = run(s, addClinicalNote, { clientId: eva, text: 'Klinická poznámka' });
    expect(r.state.clients.find((c) => c.id === eva)!.notes).toEqual([]);
    expect(r.state.notes).toHaveLength(1);
    expect(r.state.notes[0]).toMatchObject({ id: r.value, kind: 'note', text: 'Klinická poznámka', clientId: eva, title: '' });
  });

  it('updateNote, připnutí a řazení notesOfClient', () => {
    const { s, eva } = setup();
    let st = run(s, addNote, { clientId: eva, kind: 'note', title: 'Starší', text: 'A', at: '2026-10-01T09:00' }).state;
    const older = st.notes[0].id;
    st = run(st, addNote, { clientId: eva, kind: 'call', title: '', text: 'Novější telefonát', at: '2026-10-10T09:00' }).state;
    expect(notesOfClient(st, eva).map((n) => n.text)).toEqual(['Novější telefonát', 'A']);
    const pinned = run(st, updateNote, { noteId: older, patch: { pinned: true } }, staff('2026-10-14T12:00')).state;
    expect(notesOfClient(pinned, eva)[0].id).toBe(older);
    expect(pinned.notes.find((n) => n.id === older)!.updatedAt).toBeNull();
    const edited = run(pinned, updateNote, { noteId: older, patch: { text: 'Upraveno', kind: 'session', bookingId: 'b_eva1' } }, staff('2026-10-14T12:30')).state;
    expect(edited.notes.find((n) => n.id === older)).toMatchObject({ text: 'Upraveno', kind: 'session', bookingId: 'b_eva1', updatedAt: '2026-10-14T12:30', pinned: true });
    expect(failOf(edited, updateNote, { noteId: older, patch: { text: '', title: '' } })).toBe('Poznámka je prázdná – doplňte nadpis nebo text.');
    expect(failOf(edited, updateNote, { noteId: 'nic', patch: { pinned: true } })).toBe('Poznámka neexistuje.');
  });

  it('sendSessionNotes pošle e-mail přes šablonu a nastaví sentAt', () => {
    const { s, eva } = setup();
    const r = run(s, addNote, { clientId: eva, kind: 'session', title: '', text: 'Dnes jsme trénovali vizualizaci.', bookingId: 'b_eva1' });
    const note = r.state.notes[0];
    const mail = sessionNotesEmail(r.state, note);
    expect(sp(mail.subject)).toBe('Zápis ze sezení 12. 10. 2026');
    expect(mail.body).toContain('Dobrý den, Eva,');
    expect(mail.body).toContain('Dnes jsme trénovali vizualizaci.');
    expect(mail.body).toContain('Winning Minds');
    const sent = run(r.state, sendSessionNotes, { noteId: note.id, subject: mail.subject, body: mail.body }, staff('2026-10-14T13:00'));
    const msg = sent.state.messages.find((m) => m.id === sent.value)!;
    expect(msg).toMatchObject({ clientId: eva, channel: 'email', kind: 'session_notes', status: 'sent', subject: mail.subject, bookingId: 'b_eva1' });
    expect(sent.state.notes[0].sentAt).toBe('2026-10-14T13:00');
    expect(sent.notices[0]).toContain('odeslán');
    const again = run(sent.state, sendSessionNotes, { noteId: note.id, subject: 'Znovu', body: 'Text' });
    expect(again.notices[0]).toContain('znovu');
    // klient bez e-mailu
    const noMail = produce(r.state, (d) => {
      d.clients.find((c) => c.id === eva)!.email = '';
    });
    expect(failOf(noMail, sendSessionNotes, { noteId: note.id, subject: 'a', body: 'b' })).toBe('Klient nemá e-mail – zápis nelze odeslat.');
    expect(failOf(r.state, sendSessionNotes, { noteId: note.id, subject: ' ', body: 'b' })).toBe('Doplňte předmět e-mailu.');
  });

  it('sendSessionNotes a sendManualMessage omezí délku – zpráva se vždy vejde do jednoho dokumentu', async () => {
    const { s, eva } = setup();
    const r = run(s, addNote, { clientId: eva, kind: 'session', title: '', text: 'Zápis', bookingId: 'b_eva1' });
    const noteId = r.state.notes[0].id;
    expect(MESSAGE_BODY_MAX).toBe(25000);
    expect(MESSAGE_BODY_MAX).toBeGreaterThan(NOTE_TEXT_MAX + 1000);
    // vložený dlouhý přepis (např. z Plaud) – 144 000 znaků s diakritikou by rozbil ukládání
    expect(failOf(r.state, sendSessionNotes, { noteId, subject: 'Zápis', body: 'ěš'.repeat(72_000) })).toBe(SESSION_NOTES_TOO_LONG);
    expect(sp(SESSION_NOTES_TOO_LONG)).toContain('max. 25 000 znaků');
    expect(failOf(r.state, sendSessionNotes, { noteId, subject: 'x'.repeat(MESSAGE_SUBJECT_MAX + 1), body: 'Text' })).toBe(SUBJECT_TOO_LONG);
    expect(failOf(r.state, sendManualMessage, { clientId: eva, channel: 'email', subject: 'Ahoj', body: 'a'.repeat(MESSAGE_BODY_MAX + 1) })).toContain(
      'příliš dlouhá',
    );
    expect(failOf(r.state, sendManualMessage, { clientId: eva, channel: 'email', subject: 'x'.repeat(MESSAGE_SUBJECT_MAX + 1), body: 'a' })).toBe(SUBJECT_TOO_LONG);

    // nejhorší případ na hranici limitu (řídicí znaky = 6 bajtů v JSON) projde a uloží se
    const worst = 'a' + '\u0001'.repeat(MESSAGE_BODY_MAX - 2) + 'z';
    const sent = run(r.state, sendSessionNotes, { noteId, subject: 'ž'.repeat(MESSAGE_SUBJECT_MAX), body: worst });
    const msg = sent.state.messages.find((m) => m.id === sent.value)!;
    expect(utf8Bytes(JSON.stringify(msg))).toBeLessThan(MAX_CHUNK_BYTES);
    const db = fakeDb();
    await createArtifactAdapter(db as never).save(sent.state);
    const loaded = (await createArtifactAdapter(db as never).load())!;
    expect(loaded.messages.find((m) => m.id === sent.value)?.body).toBe(worst);
  });
});

describe('soubory a mazání poznámky', () => {
  it('záznamy souborů: přidání, úprava, smazání a smazání s poznámkou', () => {
    const { s, eva, jan } = setup();
    let st = run(s, addNote, { clientId: eva, kind: 'plaud', title: 'Plaud', text: 'Shrnutí', bookingId: 'b_eva1' }).state;
    const noteId = st.notes[0].id;
    const file = (name: string, extra: Partial<Parameters<typeof addFileRecord>[1]> = {}) => ({
      clientId: eva,
      name,
      mime: 'audio/mpeg',
      size: 1234,
      kind: 'audio' as const,
      storage: 'asset-b64' as const,
      ref: 'a'.repeat(32),
      ...extra,
    });
    const transcript = run(st, addFileRecord, file('prepis.txt', { mime: 'text/plain', kind: 'text', storage: 'asset', noteId: null }));
    st = transcript.state;
    st = run(st, updateNote, { noteId, patch: { plaud: { transcriptFileId: transcript.value } } }).state;
    expect(st.notes[0].plaud?.transcriptFileId).toBe(transcript.value);
    const audio = run(st, addFileRecord, file('nahravka.mp3', { noteId, durationSec: 61.4, caption: ' Celé sezení ' }));
    st = audio.state;
    const rec = st.files.find((f) => f.id === audio.value)!;
    expect(rec).toMatchObject({ noteId, durationSec: 61, caption: 'Celé sezení', uploadedBy: 'Tereza Malá', at: NOW, size: 1234 });
    const photo = run(st, addFileRecord, file('foto.jpg', { mime: 'image/jpeg', kind: 'image', storage: 'local', ref: 'file_1' }));
    st = photo.state;
    expect(filesOfClient(st, eva)).toHaveLength(3);
    expect(filesOfNote(st, noteId).map((f) => f.name)).toEqual(['nahravka.mp3']);
    st = run(st, updateFileRecord, { fileId: photo.value, patch: { caption: 'Tabule po sezení', noteId } }).state;
    expect(filesOfNote(st, noteId)).toHaveLength(2);
    expect(failOf(st, updateFileRecord, { fileId: photo.value, patch: { name: ' ' } })).toBe('Zadejte název souboru.');
    expect(failOf(st, addFileRecord, file('x.mp3', { clientId: jan, noteId }))).toBe('Poznámka patří jinému klientovi.');
    expect(failOf(st, addFileRecord, file('x.mp3', { ref: '' }))).toBe('Chybí odkaz na uložený soubor.');

    const removed = run(st, removeFileRecord, { fileId: transcript.value });
    expect(removed.value.record.name).toBe('prepis.txt');
    expect(removed.state.notes[0].plaud?.transcriptFileId).toBeNull();

    // smazání poznámky vrátí záznamy jejích souborů (přílohy i přepis)
    const withTranscript = run(st, deleteNote, { noteId });
    expect(withTranscript.value.fileRecords.map((f) => f.name).sort()).toEqual(['foto.jpg', 'nahravka.mp3', 'prepis.txt']);
    expect(withTranscript.state.notes).toHaveLength(0);
    expect(withTranscript.state.files).toHaveLength(0);
    expect(JSON.parse(JSON.stringify(withTranscript.value.fileRecords))).toEqual(withTranscript.value.fileRecords);
    expect(failOf(st, deleteNote, { noteId: 'nic' })).toBe('Poznámka neexistuje.');
  });
});

describe('follow-upy', () => {
  it('přidání, úprava, odškrtnutí, smazání a validace', () => {
    const { s, eva } = setup();
    const r = run(s, addFollowUp, { clientId: eva, title: '  Zavolat po freetalku ', due: '2026-10-15', dueTime: '09:30', assigneeId: 't_riha', note: '' }, staff('2026-10-14T09:00'));
    let st = r.state;
    expect(st.followUps[0]).toMatchObject({ title: 'Zavolat po freetalku', due: '2026-10-15', dueTime: '09:30', assigneeId: 't_riha', done: false, doneAt: null, createdBy: 'Tereza Malá' });
    st = run(st, updateFollowUp, { followUpId: r.value, patch: { dueTime: null, assigneeId: null, title: 'Zavolat' } }).state;
    expect(st.followUps[0]).toMatchObject({ title: 'Zavolat', dueTime: null, assigneeId: null });
    st = run(st, setFollowUpDone, { followUpId: r.value, done: true }, staff('2026-10-15T10:00')).state;
    expect(st.followUps[0]).toMatchObject({ done: true, doneAt: '2026-10-15T10:00' });
    st = run(st, setFollowUpDone, { followUpId: r.value, done: false }).state;
    expect(st.followUps[0]).toMatchObject({ done: false, doneAt: null });
    expect(run(st, deleteFollowUp, { followUpId: r.value }).state.followUps).toHaveLength(0);

    expect(failOf(s, addFollowUp, { clientId: eva, title: ' ', due: '2026-10-15' })).toBe('Napište, co je potřeba udělat.');
    expect(failOf(s, addFollowUp, { clientId: eva, title: 'x'.repeat(161), due: '2026-10-15' })).toContain('160');
    expect(failOf(s, addFollowUp, { clientId: eva, title: 'A', due: '15. 10. 2026' })).toBe('Zadejte platný termín.');
    expect(failOf(s, addFollowUp, { clientId: eva, title: 'A', due: '2026-10-15', dueTime: '25:00' })).toContain('platný čas');
    expect(failOf(s, addFollowUp, { clientId: eva, title: 'A', due: '2026-10-15', assigneeId: 't_nikdo' })).toBe('Zvolený kouč neexistuje.');
    expect(failOf(s, addFollowUp, { clientId: eva, title: 'A', due: '2026-10-15' }, asClient(eva))).toContain('jen personál');
    expect(failOf(s, setFollowUpDone, { followUpId: 'nic', done: true })).toBe('Follow-up neexistuje.');
  });

  it('followUpBuckets rozdělí úkoly podle termínu a kouče', () => {
    const { s, eva, jan } = setup();
    let st = s;
    const add = (clientId: string, title: string, due: string, dueTime: string | null = null, assigneeId: string | null = 't_mala') => {
      const r = run(st, addFollowUp, { clientId, title, due, dueTime, assigneeId }, staff('2026-10-01T08:00'));
      st = r.state;
      return r.value;
    };
    add(eva, 'Po termínu starší', '2026-10-10');
    add(jan, 'Po termínu novější', '2026-10-13', null, 't_riha');
    add(eva, 'Dnes bez času', '2026-10-14');
    add(eva, 'Dnes odpoledne', '2026-10-14', '15:00');
    add(jan, 'Dnes ráno', '2026-10-14', '08:00');
    add(eva, 'Za týden', '2026-10-21');
    add(jan, 'Zítra', '2026-10-15', null, null);
    const doneId = add(eva, 'Hotovo', '2026-10-12');
    st = run(st, setFollowUpDone, { followUpId: doneId, done: true }, staff('2026-10-12T12:00')).state;

    const b = followUpBuckets(st, '2026-10-14T10:40');
    const titles = (list: FollowUp[]) => list.map((f) => f.title);
    expect(titles(b.overdue)).toEqual(['Po termínu starší', 'Po termínu novější']);
    expect(titles(b.today)).toEqual(['Dnes ráno', 'Dnes odpoledne', 'Dnes bez času']);
    expect(titles(b.upcoming)).toEqual(['Zítra', 'Za týden']);
    expect(titles(b.done)).toEqual(['Hotovo']);

    const mine = followUpBuckets(st, '2026-10-14', 't_riha');
    expect(titles(mine.overdue)).toEqual(['Po termínu novější']);
    expect(mine.today).toHaveLength(0);

    const label = followUpDueLabel(b.overdue[0], '2026-10-14');
    expect(label.overdue).toBe(true);
    expect(sp(label.overdueText)).toBe('4 dny po termínu');
    expect(followUpDueLabel(b.today[0], '2026-10-14').label).toBe('Dnes v 8:00');
    expect(followUpDueLabel(b.upcoming[0], '2026-10-14').label).toBe('Zítra');

    const stats = clientCrmStats(st, eva, '2026-10-14T10:40');
    expect(stats).toMatchObject({ completedSessions: 1, openFollowUps: 4, overdueFollowUps: 1, notesCount: 0, filesCount: 0, firstSessionAt: '2026-10-12T09:00' });
  });
});

describe('pipeline', () => {
  it('pipelineStats: počty po fázích, přechody, konverze a doba ve fázi', () => {
    let s = createBaseState('2026-01-01');
    const ids: string[] = [];
    for (const [first, last] of [['Ada', 'A'], ['Bea', 'B'], ['Cyril', 'C'], ['Dana', 'D']]) {
      const r = newClient(s, first, last, { now: '2026-08-20T09:00' });
      s = r.state;
      ids.push(r.value);
    }
    const move = (i: number, stageId: string, at: string) => {
      s = run(s, setClientStage, { clientId: ids[i], stageId }, staff(at)).state;
    };
    // Ada: freetalk v září → aktivní
    move(0, 'st_freetalk', '2026-09-02T10:00');
    move(0, 'st_diagnostika', '2026-09-07T10:00');
    move(0, 'st_aktivni', '2026-09-12T10:00');
    // Bea: freetalk v září, zůstala
    move(1, 'st_freetalk', '2026-09-05T10:00');
    // Cyril: freetalk v srpnu (mimo období) → aktivní v září
    move(2, 'st_freetalk', '2026-08-25T10:00');
    move(2, 'st_aktivni', '2026-09-04T10:00');
    // Dana: konec
    move(3, 'st_konec', '2026-09-20T10:00');

    const p = pipelineStats(s, '2026-10-01T10:00', '2026-09-01', '2026-10-01');
    const byId = Object.fromEntries(p.stages.map((x) => [x.stage.id, x]));
    expect(p.total).toBe(4);
    expect(p.open).toBe(3);
    expect(p.newClients).toBe(0);
    expect(byId.st_aktivni.count).toBe(2);
    expect(byId.st_freetalk.count).toBe(1);
    expect(byId.st_konec.count).toBe(1);
    expect(byId.st_potencialni.count).toBe(0);
    expect(byId.st_aktivni.entered).toBe(2);
    expect(byId.st_freetalk.entered).toBe(2);
    expect(p.transitionsTotal).toBe(6);
    expect(p.transitions.find((t) => t.fromStageId === 'st_potencialni' && t.toStageId === 'st_freetalk')?.count).toBe(2);
    expect(p.conversion).toEqual({ fromStageId: 'st_freetalk', toStageId: 'st_aktivni', entered: 2, converted: 1, rate: 0.5 });
    // doba ve freetalku: Ada 5 dní, Cyril 10 dní (oba odešli v září)
    expect(byId.st_freetalk.avgDays).toBe(7.5);
    expect(byId.st_freetalk.avgDaysSamples).toBe(2);
    expect(byId.st_freetalk.currentAvgDays).toBe(26);

    const groups = clientsByStage(s);
    expect([...groups.keys()]).toEqual(DEFAULT_STAGES.map((x) => x.id));
    expect(groups.get('st_aktivni')!.map((c) => c.firstName)).toEqual(['Ada', 'Cyril']);
  });
});

describe('segment Fáze spolupráce', () => {
  it('vybere klienty ve zvolených fázích (jen se souhlasem)', () => {
    let s = createBaseState('2026-01-01');
    const a = newClient(s, 'Ada', 'A', { stageId: 'st_aktivni' });
    s = a.state;
    const b = newClient(s, 'Bea', 'B', { stageId: 'st_freetalk' });
    s = b.state;
    const c = newClient(s, 'Cyril', 'C', { stageId: 'st_aktivni', marketing: false });
    s = c.state;
    expect(RULE_TYPES.find((t) => t.type === 'stage')?.label).toBe('Fáze spolupráce');
    const rule = defaultRule(s, 'stage');
    expect(rule).toEqual({ type: 'stage', stageIds: ['st_aktivni'] });
    expect(evaluateSegment(s, { match: 'all', rules: [rule], exclude: [] }, NOW)).toEqual([a.value]);
    expect(evaluateSegment(s, { match: 'all', rules: [{ type: 'stage', stageIds: ['st_aktivni', 'st_freetalk'] }], exclude: [] }, NOW)).toEqual([a.value, b.value]);
    expect(evaluateSegment(s, { match: 'all', rules: [], exclude: [{ type: 'stage', stageIds: ['st_freetalk'] }] }, NOW)).toEqual([a.value]);
    expect(describeRule(s, rule)).toBe('Ve fázi Aktivní spolupráce');
    expect(describeRule(s, { type: 'stage', stageIds: ['st_freetalk', 'st_diagnostika', 'st_aktivni'] })).toBe('Ve fázích Freetalk, Diagnostika nebo Aktivní spolupráce');
    expect(describeRule(s, { type: 'stage', stageIds: [] })).toBe('Fáze spolupráce (vyberte)');
  });

  it('klient s neznámou fází patří do první fáze i v segmentu a v seznamu klientů', () => {
    let s = createBaseState('2026-01-01');
    const a = newClient(s, 'Ada', 'A', { stageId: 'st_aktivni' });
    s = produce(a.state, (d) => {
      // fázi mezitím smazalo jiné zařízení
      d.clients[0].stageId = 'st_smazana_jinde';
    });
    clearSelectorCaches();
    expect(clientStage(s, s.clients[0]).id).toBe('st_potencialni');
    expect(clientsByStage(s).get('st_potencialni')!.map((c) => c.id)).toEqual([a.value]);
    expect(evaluateSegment(s, { match: 'all', rules: [{ type: 'stage', stageIds: ['st_potencialni'] }], exclude: [] }, NOW)).toEqual([a.value]);
    expect(evaluateSegment(s, { match: 'all', rules: [{ type: 'stage', stageIds: ['st_aktivni'] }], exclude: [] }, NOW)).toEqual([]);
    expect(buildClientRows(s, NOW)[0].stageId).toBe('st_potencialni');
  });
});

/* ------------------------------------------------------------------ */
/* Ukládání a migrace                                                  */
/* ------------------------------------------------------------------ */

/** Stav ve tvaru staré verze (bez fází, poznámky u klienta, bez CRM kolekcí). */
function legacyState(): ClinicState {
  const s = JSON.parse(JSON.stringify(createBaseState('2026-01-01'))) as ClinicState;
  s.schema = 1;
  delete (s.settings as unknown as Record<string, unknown>).stages;
  s.templates = s.templates.filter((t) => t.key !== 'session_notes');
  const raw = s as unknown as Record<string, unknown>;
  delete raw.notes;
  delete raw.files;
  delete raw.followUps;
  s.settings.simulatedNow = NOW;
  const client = (id: string, createdAt: string, notes: Client['notes'] = []): Client => {
    const c = {
      id,
      firstName: id,
      lastName: 'Test',
      email: id + '@example.com',
      phone: '',
      birthDate: null,
      tags: [],
      createdAt,
      source: 'recepce',
      consents: { gdpr: { at: createdAt, source: 'recepce' }, health: null, marketingEmail: null, sms: null },
      notes,
      internalNote: '',
      blocked: false,
    } as unknown as Client & Record<string, unknown>;
    return c;
  };
  s.clients = [
    client('c_active', '2026-03-01T09:00', [
      { id: 'n_old1', at: '2026-09-20T10:00', therapistId: 't_mala', text: 'Stará klinická poznámka' },
      { id: 'n_old2', at: '2026-08-01T10:00', therapistId: 't_riha', text: 'Ještě starší' },
    ]),
    client('c_paused', '2026-02-01T09:00'),
    client('c_new', '2026-10-01T09:00'),
  ];
  s.bookings = [booking('b1', 'c_active', '2026-09-30T09:00'), booking('b2', 'c_paused', '2026-04-01T09:00')];
  return s;
}

describe('migrace starých dat', () => {
  it('doplní fáze, převede poznámky a je idempotentní', () => {
    clearSelectorCaches();
    const s = normalizeState(legacyState());
    expect(s.schema).toBe(2);
    expect(s.settings.stages.map((x) => x.id)).toEqual(DEFAULT_STAGES.map((x) => x.id));
    expect(s.templates.filter((t) => t.key === 'session_notes')).toHaveLength(1);
    expect(s.files).toEqual([]);
    expect(s.followUps).toEqual([]);
    const byId = Object.fromEntries(s.clients.map((c) => [c.id, c]));
    expect(byId.c_active.stageId).toBe('st_aktivni');
    expect(byId.c_paused.stageId).toBe('st_pozastaveno');
    expect(byId.c_new.stageId).toBe('st_potencialni');
    expect(byId.c_active.stageHistory).toEqual([{ stageId: 'st_aktivni', at: '2026-03-01T09:00', actor: 'Systém' }]);
    expect(byId.c_active.notes).toEqual([]);
    expect(s.notes.map((n) => n.id)).toEqual(['n_old2', 'n_old1']);
    const migrated = s.notes.find((n) => n.id === 'n_old1') as Note;
    expect(migrated).toEqual({
      id: 'n_old1',
      clientId: 'c_active',
      at: '2026-09-20T10:00',
      createdAt: '2026-09-20T10:00',
      updatedAt: null,
      authorId: 't_mala',
      kind: 'note',
      title: '',
      text: 'Stará klinická poznámka',
      bookingId: null,
      pinned: false,
      sentAt: null,
      plaud: null,
    });

    // podruhé se nic nezmění (ani když staré pole notes u klienta znovu obsahuje stejné poznámky)
    const once = JSON.stringify(s);
    const twice = normalizeState(JSON.parse(once) as ClinicState);
    expect(JSON.stringify(twice)).toBe(once);
    const again = JSON.parse(once) as ClinicState;
    again.clients[0].notes = [{ id: 'n_old1', at: '2026-09-20T10:00', therapistId: 't_mala', text: 'Stará klinická poznámka' }];
    const third = normalizeState(again);
    expect(third.notes.filter((n) => n.id === 'n_old1')).toHaveLength(1);
    expect(third.clients[0].notes).toEqual([]);
  });

  it('migrace v artefaktu neztratí staré poznámky, když ukládání selže uprostřed', async () => {
    for (const failing of ['notes/', 'clients/']) {
      const legacy = legacyState();
      const db = fakeDb();
      // dokumenty, jak je zapsala starší verze aplikace
      db.docs.set('clinic/meta', { data: JSON.parse(JSON.stringify(metaOf(legacy))) });
      for (const c of COLLECTIONS) {
        const items = (legacy as unknown as Record<string, unknown[] | undefined>)[c];
        if (Array.isArray(items)) for (const [path, chunk] of chunkCollection(c, items)) db.docs.set(path, { items: JSON.parse(JSON.stringify(chunk)) });
      }
      clearSelectorCaches();
      const loaded = (await createArtifactAdapter(db as never).load())!;
      expect(takeMigrationFlag()).toBe(true);
      expect(loaded.notes.map((n) => n.id).sort()).toEqual(['n_old1', 'n_old2']);

      // výpadek / limit požadavků při zápisu dokumentů dané kolekce
      db.failPrefix = failing;
      await expect(createArtifactAdapter(db as never).save(loaded)).rejects.toMatchObject({ code: 'resource_exhausted' });
      db.failPrefix = null;
      clearSelectorCaches();
      const reloaded = (await createArtifactAdapter(db as never).load())!;
      expect(reloaded.notes.map((n) => n.id).sort()).toEqual(['n_old1', 'n_old2']);
      expect(reloaded.notes.find((n) => n.id === 'n_old1')?.text).toBe('Stará klinická poznámka');
      takeMigrationFlag();
    }
  });

  it('zachová vlastní fáze a existující CRM data', () => {
    const base = createBaseState('2026-01-01');
    base.settings.stages = [{ id: 'st_x', name: 'Vlastní', tone: 'teal', order: 0 }];
    const s = normalizeState(JSON.parse(JSON.stringify(base)) as ClinicState);
    expect(s.settings.stages).toEqual([{ id: 'st_x', name: 'Vlastní', tone: 'teal', order: 0 }]);
  });
});

describe('ukládání CRM kolekcí', () => {
  it('kolekce notes, files a followUps jsou mimo meta a dělí se po měsících / celé', () => {
    expect(COLLECTIONS).toContain('notes');
    expect(COLLECTIONS).toContain('files');
    expect(COLLECTIONS).toContain('followUps');
    const s = createBaseState();
    const meta = metaOf(s);
    expect(Object.keys(meta)).not.toContain('notes');
    expect(Object.keys(meta)).not.toContain('files');
    expect(Object.keys(meta)).not.toContain('followUps');
    expect(Object.keys(meta)).toContain('settings');
    const notes = [
      { id: 'n1', at: '2026-09-30T10:00' },
      { id: 'n2', at: '2026-10-01T10:00' },
    ];
    expect([...chunkCollection('notes', notes).keys()]).toEqual(['notes/2026-09', 'notes/2026-10']);
    expect([...chunkCollection('followUps', [{ id: 'f1', due: '2026-10-01' }]).keys()]).toEqual(['followUps/all']);
    expect([...chunkCollection('files', [{ id: 'x1', at: NOW }]).keys()]).toEqual(['files/all']);
    expect(
      (sortCollection('followUps', [
        { id: 'b', due: '2026-10-02', dueTime: null },
        { id: 'a', due: '2026-10-02', dueTime: '09:00' },
        { id: 'c', due: '2026-10-01', dueTime: null },
      ]) as { id: string }[]).map((x) => x.id),
    ).toEqual(['c', 'a', 'b']);
  });

  it('velikost dokumentu se měří v bajtech UTF-8 (dlouhé české poznámky)', () => {
    const czech = 'Příliš žluťoučký kůň úpěl ďábelské ódy. ';
    const text = czech.repeat(Math.floor(15_000 / czech.length));
    expect(utf8Bytes(text)).toBeGreaterThan(text.length);
    // 10 poznámek ≈ 150 000 znaků (pod limitem délky řetězce), ale přes 180 000 bajtů
    const notes = Array.from({ length: 10 }, (_, i) => ({ id: 'n' + i, at: '2026-10-0' + (i % 9 + 1) + 'T10:00', text }));
    expect(JSON.stringify(notes).length).toBeLessThan(MAX_CHUNK_BYTES);
    expect(utf8Bytes(JSON.stringify(notes))).toBeGreaterThan(MAX_CHUNK_BYTES);
    const docs = chunkCollection('notes', notes);
    expect(docs.size).toBeGreaterThan(1);
    for (const [, items] of docs) expect(utf8Bytes(JSON.stringify({ items }))).toBeLessThanOrEqual(MAX_CHUNK_BYTES + 20);
    expect([...docs.values()].flat()).toEqual(notes);

    // 40 poznámek s maximální délkou textu (20 000 znaků s diakritikou)
    const big = 'ěščřžýáíéůú'.repeat(Math.floor(NOTE_TEXT_MAX / 11));
    const many = Array.from({ length: 40 }, (_, i) => ({ id: 'm' + String(i).padStart(2, '0'), at: '2026-10-14T10:00', text: big }));
    const docs2 = chunkCollection('notes', many);
    for (const [key, items] of docs2) {
      expect(key.startsWith('notes/2026-10~')).toBe(true);
      expect(utf8Bytes(JSON.stringify(items))).toBeLessThanOrEqual(MAX_CHUNK_BYTES);
    }
    expect([...docs2.values()].flat()).toHaveLength(40);
  });

  it('artefakt uloží a znovu načte poznámky, soubory a follow-upy', async () => {
    const { s, eva } = setup();
    let st = run(s, addNote, { clientId: eva, kind: 'session', title: 'Sezení', text: 'Česky: ěščřžýáíé '.repeat(500), bookingId: 'b_eva1' }).state;
    st = run(st, addNote, { clientId: eva, kind: 'call', title: '', text: 'Telefonát', at: '2026-09-15T10:00' }).state;
    st = run(st, addFileRecord, { clientId: eva, noteId: st.notes[0].id, name: 'foto.jpg', mime: 'image/jpeg', size: 10, kind: 'image', storage: 'asset', ref: 'b'.repeat(32) }).state;
    st = run(st, addFollowUp, { clientId: eva, title: 'Zavolat', due: '2026-10-20', dueTime: null, assigneeId: 't_mala' }).state;

    const db = fakeDb();
    await createArtifactAdapter(db as never).save(st);
    expect([...db.docs.keys()].filter((k) => k.startsWith('notes/')).sort()).toEqual(['notes/2026-09', 'notes/2026-10']);
    expect(db.docs.has('files/all')).toBe(true);
    expect(db.docs.has('followUps/all')).toBe(true);
    const loaded = (await createArtifactAdapter(db as never).load())!;
    expect(loaded.notes).toEqual([...st.notes].sort((a, b) => (a.at < b.at ? -1 : 1)));
    expect(loaded.files).toEqual(st.files);
    expect(loaded.followUps).toEqual(st.followUps);
    expect(loaded.settings.stages).toEqual(st.settings.stages);
    expect(loaded.clients.find((c) => c.id === eva)!.stageHistory).toEqual(st.clients.find((c) => c.id === eva)!.stageHistory);

    // lokální úložiště ukládá celý stav jako JSON a při načtení ho normalizuje
    const local = normalizeState(JSON.parse(JSON.stringify(st)) as ClinicState);
    expect(local.notes).toEqual(loaded.notes);
    expect(local.files).toEqual(st.files);
    expect(local.followUps).toEqual(st.followUps);
  });
});

describe('soubory – pomocné funkce', () => {
  it('SVG se v artefaktu ukládá jako base64 (původní bajty, limit 15 MiB), nahrávka z mikrofonu jako video', () => {
    expect(assetUploadType('image/svg+xml')).toBeNull();
    expect(assetUploadType('image/png')).toBe('image/png');
    expect(assetUploadType('audio/webm')).toBe('video/webm');
    expect(assetUploadType('audio/mpeg')).toBeNull();
    expect(assetUploadType('application/x-subrip')).toBe('text/plain');
  });

  it('rozpozná druh souboru a typ podle přípony', () => {
    expect(fileKindOf('image/jpeg', 'a.jpg')).toBe('image');
    expect(fileKindOf('audio/webm;codecs=opus', 'nahravka.webm')).toBe('audio');
    expect(fileKindOf('', 'zaznam.m4a')).toBe('audio');
    expect(fileKindOf('application/pdf', 'zprava.pdf')).toBe('pdf');
    expect(fileKindOf('', 'prepis.srt')).toBe('text');
    expect(fileKindOf('', 'poznamky.md')).toBe('text');
    expect(fileKindOf('video/mp4', 'video.mp4')).toBe('video');
    expect(fileKindOf('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'plan.docx')).toBe('other');
    expect(mimeOf('', 'zaznam.mp3')).toBe('audio/mpeg');
    expect(mimeOf('application/vnd.ms-excel', 'data.csv')).toBe('text/csv');
    expect(mimeOf('text/plain;charset=utf-8', 'a.txt')).toBe('text/plain');
  });

  it('base64 a dekódování textu (UTF-8 i Windows-1250)', () => {
    const bytes = new Uint8Array(100_003).map((_, i) => (i * 31) % 256);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
    expect(bytesToBase64(new TextEncoder().encode('Žluťoučký kůň'))).toBe('xb1sdcWlb3XEjWvDvSBrxa/FiA==');
    expect(decodeText(new TextEncoder().encode('Přepis sezení'))).toBe('Přepis sezení');
    // „Příliš“ ve Windows-1250
    expect(decodeText(new Uint8Array([0x50, 0xf8, 0xed, 0x6c, 0x69, 0x9a]))).toBe('Příliš');
  });

  it('bez načteného úložiště soubory ukládat nelze', async () => {
    const r = await canStoreFiles();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBeTruthy();
  });
});

describe('ukázková CRM data', () => {
  it('fáze, historie, poznámky a follow-upy jsou konzistentní', () => {
    const now = NOW;
    const s = generateDemoState(now);
    const counts: Record<string, number> = {};
    for (const c of s.clients) counts[c.stageId] = (counts[c.stageId] ?? 0) + 1;
    for (const st of DEFAULT_STAGES) expect(counts[st.id] ?? 0).toBeGreaterThan(0);
    expect(counts.st_aktivni).toBeGreaterThan(s.clients.length / 3);
    for (const c of s.clients) {
      expect(c.notes).toEqual([]);
      expect(c.stageHistory.length).toBeGreaterThan(0);
      expect(c.stageHistory[c.stageHistory.length - 1].stageId).toBe(c.stageId);
      expect(c.stageHistory[0].at).toBe(c.createdAt);
      for (let i = 1; i < c.stageHistory.length; i++) expect(c.stageHistory[i].at >= c.stageHistory[i - 1].at).toBe(true);
      expect(c.stageHistory.every((h) => h.at <= now)).toBe(true);
    }
    const kinds = new Set(s.notes.map((n) => n.kind));
    expect([...kinds].sort()).toEqual(['call', 'note', 'plaud', 'session']);
    const bookingIds = new Set(s.bookings.map((b) => b.id));
    for (const n of s.notes) {
      expect(n.createdAt <= now).toBe(true);
      if (n.bookingId) expect(bookingIds.has(n.bookingId)).toBe(true);
      if (n.kind === 'plaud') expect(n.plaud).toEqual({ recordedAt: n.at, transcriptFileId: null });
      if (n.sentAt) expect(n.sentAt <= now).toBe(true);
    }
    expect(s.notes.some((n) => n.sentAt)).toBe(true);
    expect(s.files).toEqual([]);
    const b = followUpBuckets(s, now);
    expect(b.overdue.length).toBeGreaterThan(0);
    expect(b.today.length).toBeGreaterThan(0);
    expect(b.upcoming.length).toBeGreaterThan(0);
    expect(b.done.length).toBeGreaterThan(0);
    expect(s.followUps.every((f) => f.createdAt <= now && (!f.doneAt || f.doneAt <= now))).toBe(true);
    // stejný seed → stejné rozložení
    const s2 = generateDemoState(now);
    expect(s2.clients.map((c) => c.stageId)).toEqual(s.clients.map((c) => c.stageId));
    expect(s2.notes.map((n) => n.text)).toEqual(s.notes.map((n) => n.text));
  });
});

/* ------------------------------------------------------------------ */

/** Sdílená databáze artefaktu v paměti (stejně jako v persistence.test.ts). */
function fakeDb() {
  const docs = new Map<string, Record<string, unknown>>();
  /** Zápisy do dokumentů s touto předponou selžou (výpadek, limit požadavků). */
  const state = { failPrefix: null as string | null };
  const freeze = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
  const snapOf = (collection: string) => ({
    docs: [...docs.entries()]
      .filter(([p]) => p.startsWith(collection + '/') && p.split('/').length === 2)
      .map(([p, body]) => ({ id: p.split('/')[1], exists: true, data: () => freeze(body) })),
    metadata: { hasPendingWrites: false, fromCache: false },
  });
  return {
    docs,
    get failPrefix() {
      return state.failPrefix;
    },
    set failPrefix(v: string | null) {
      state.failPrefix = v;
    },
    doc(path: string) {
      return {
        async get() {
          const body = docs.get(path);
          return { id: path.split('/')[1], exists: !!body, data: () => (body ? freeze(body) : undefined) };
        },
        async set(data: Record<string, unknown>) {
          if (state.failPrefix && path.startsWith(state.failPrefix)) throw Object.assign(new Error('rate'), { code: 'resource_exhausted' });
          const size = new TextEncoder().encode(JSON.stringify(data)).length;
          if (size > 256 * 1024) throw Object.assign(new Error('too big'), { code: 'invalid_argument' });
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
