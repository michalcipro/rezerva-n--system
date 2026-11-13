import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { ClinicState, Ctx } from '../src/domain/types';
import { createBooking, createClient } from '../src/engine/commands';
import { createBaseState } from '../src/engine/defaults';
import { sequentialIds, withIdGenerator } from '../src/engine/ids';
import {
  CREDIT_TRANSFER_NOTE,
  IMPORT_SOURCE,
  checkClientRows,
  cleanName,
  headerKey,
  importClients,
  importCredits,
  importPackages,
  importTemplateCsv,
  isImportedPackage,
  mapHeaders,
  normalizePhone,
  parseCsv,
  parseDate,
  parseNumber,
  parseYesNo,
  readImportFile,
  summarizeChecks,
  toCsv,
  type ClientImportRow,
} from '../src/engine/importer';
import { clientCredit, packageUsage, packagesOfClient } from '../src/engine/selectors';
import { addDays } from '../src/engine/time';
import { decodeCsvBytes } from '../src/screens/settings/importFile';

const NOW = '2026-11-13T10:00';
const TODAY = '2026-11-13';
const owner = (now = NOW): Ctx => ({ now, actor: { role: 'owner', name: 'Tereza Malá', therapistId: 't_mala' } });
const reception = (now = NOW): Ctx => ({ now, actor: { role: 'reception', name: 'Recepce' } });
const therapist = (now = NOW): Ctx => ({ now, actor: { role: 'therapist', name: 'Mgr. Jakub Říha', therapistId: 't_riha' } });

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

/** Klinika s Evou (e-mail, telefon) a Petrem (jen telefon). */
function setup(): { s: ClinicState; eva: string; petr: string } {
  let s = createBaseState('2026-01-01');
  const a = run(s, createClient, { firstName: 'Eva', lastName: 'Testová', email: 'eva@example.com', phone: '+420 600 000 001', consents: { gdpr: true, health: false, marketingEmail: false, sms: false } }, reception('2026-10-01T09:00'));
  s = a.state;
  const b = run(s, createClient, { firstName: 'Petr', lastName: 'Svoboda', email: '', phone: '603 987 654', consents: { gdpr: true, health: false, marketingEmail: false, sms: true } }, reception('2026-10-01T09:05'));
  return { s: b.state, eva: a.value as unknown as string, petr: b.value as unknown as string };
}

describe('CSV', () => {
  it('pozná středník, uvozovky (se středníkem i zdvojené), zalomení v buňce, CRLF a BOM; čísla řádků odpovídají Excelu', () => {
    const text = '﻿Jméno;Poznámka;Číslo\r\n"Nováková; Jana";"Řekla ""ahoj""";1\r\nPetr;"dva\r\nřádky";2\r\n\r\n;;\r\nEva;;3';
    const t = parseCsv(text);
    expect(t.delimiter).toBe(';');
    expect(t.header).toEqual(['Jméno', 'Poznámka', 'Číslo']);
    expect(t.records).toEqual([
      { row: 2, cells: ['Nováková; Jana', 'Řekla "ahoj"', '1'] },
      { row: 3, cells: ['Petr', 'dva\r\nřádky', '2'] },
      { row: 6, cells: ['Eva', '', '3'] },
    ]);
    expect(t.warnings).toEqual([]);
  });

  it('pozná čárku, tabulátor (zkopírované buňky) a řádek „sep=“ z Excelu', () => {
    const comma = parseCsv('First name,Last name,Email\n"Doe, John",Smith,a@b.cz\n');
    expect(comma.delimiter).toBe(',');
    expect(comma.records[0].cells).toEqual(['Doe, John', 'Smith', 'a@b.cz']);
    expect(parseCsv('Jméno\tPříjmení\nJana\tNováková').delimiter).toBe('\t');
    const hinted = parseCsv('sep=,\r\nA;B,C\r\n1;2,3\r\n');
    expect(hinted.delimiter).toBe(',');
    expect(hinted.header).toEqual(['A;B', 'C']);
    expect(hinted.records[0].row).toBe(2);
  });

  it('soubor z Excelu: UTF-8 (i s BOM), windows-1250, UTF-16; sešit .xlsx odmítne', () => {
    const text = 'Jméno;Příjmení\r\nŠárka;Nováková';
    // „CSV (s oddělovači)“ ze staršího Excelu = windows-1250
    const cp1250 = new Uint8Array([74, 109, 233, 110, 111, 59, 80, 248, 237, 106, 109, 101, 110, 237, 13, 10, 138, 225, 114, 107, 97, 59, 78, 111, 118, 225, 107, 111, 118, 225]);
    expect(decodeCsvBytes(cp1250)).toEqual({ text, encoding: 'windows-1250' });
    const utf8 = new TextEncoder().encode('﻿' + text);
    const decoded = decodeCsvBytes(utf8);
    expect(decoded.encoding).toBe('UTF-8');
    expect(parseCsv(decoded.text).header).toEqual(['Jméno', 'Příjmení']);
    const utf16 = new Uint8Array([0xff, 0xfe, ...[...'A\tB'].flatMap((ch) => [ch.charCodeAt(0), 0])]);
    expect(decodeCsvBytes(utf16)).toEqual({ text: 'A\tB', encoding: 'UTF-16' });
    expect(() => decodeCsvBytes(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0]))).toThrow(/sešit Excelu/);
  });

  it('neuzavřené uvozovky ohlásí; toCsv a parseCsv si rozumí', () => {
    expect(parseCsv('A;B\n"x;y').warnings).toHaveLength(1);
    const rows = [
      ['Jméno', 'Poznámka'],
      ['Jana', 'a; b'],
      ['Petr', 'řekl "ne"\nnovy radek'],
      ['Eva', ' mezera '],
    ];
    const t = parseCsv(toCsv(rows));
    expect([t.header, ...t.records.map((r) => r.cells)]).toEqual(rows);
  });
});

describe('hodnoty ze souboru', () => {
  it('data, čísla, souhlasy, telefony a jména', () => {
    expect(parseDate('15. 3. 1985')).toBe('1985-03-15');
    expect(parseDate('15.03.1985')).toBe('1985-03-15');
    expect(parseDate('1985-3-5')).toBe('1985-03-05');
    expect(parseDate('15. 3. 1985 0:00')).toBe('1985-03-15');
    expect(parseDate('1985-03-15T00:00:00')).toBe('1985-03-15');
    expect(parseDate('2024-02-29')).toBe('2024-02-29');
    expect(parseDate('2023-02-29')).toBeNull();
    expect(parseDate('31. 2. 1990')).toBeNull();
    expect(parseDate('1. 2. 80')).toBeNull();

    expect(parseNumber('1 500')).toBe(1500);
    expect(parseNumber('1 500 Kč')).toBe(1500);
    expect(parseNumber('1500,50')).toBe(1500.5);
    expect(parseNumber('1.500,50')).toBe(1500.5);
    expect(parseNumber('1,500.50')).toBe(1500.5);
    expect(parseNumber('12,5')).toBe(12.5);
    expect(parseNumber('−200')).toBe(-200);
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('')).toBeNull();

    expect(parseYesNo('Ano')).toEqual({ value: true });
    expect(parseYesNo('X')).toEqual({ value: true });
    expect(parseYesNo('1')).toEqual({ value: true });
    expect(parseYesNo('ne')).toEqual({ value: false });
    expect(parseYesNo('')).toEqual({ value: false });
    expect(parseYesNo('12. 3. 2024')).toEqual({ value: true, date: '2024-03-12' });
    expect(parseYesNo('ano (12. 3. 2024)')).toEqual({ value: true, date: '2024-03-12' });
    expect(parseYesNo('možná')).toBeNull();
    expect(parseYesNo(true)).toEqual({ value: true });

    expect(normalizePhone('777123456')).toBe('+420 777 123 456');
    expect(normalizePhone('+420777123456')).toBe('+420 777 123 456');
    expect(normalizePhone('00420 777-123-456')).toBe('+420 777 123 456');
    expect(normalizePhone('420777123456')).toBe('+420 777 123 456');
    expect(normalizePhone('+421 905 123 456')).toBe('+421905123456');
    expect(normalizePhone('123')).toBeNull();
    expect(normalizePhone('volat manželovi')).toBeNull();

    expect(cleanName('NOVÁKOVÁ-DVOŘÁKOVÁ')).toBe('Nováková-Dvořáková');
    expect(cleanName('  Jana   Marie ')).toBe('Jana Marie');
    expect(headerKey('Souhlas e-mail/marketing')).toBe('souhlasemailmarketing');
  });
});

describe('mapování sloupců', () => {
  it('rozpozná české i anglické názvy bez ohledu na velikost písmen a diakritiku', () => {
    const cz = mapHeaders('clients', ['JMÉNO', 'prijmeni', 'E-mail', 'Telefonní číslo', 'Datum narození', 'Souhlas e-mail/marketing', 'souhlas SMS', 'Štítky', 'Poznámka', 'Barva očí']);
    expect(cz.columns).toEqual({ firstName: 0, lastName: 1, email: 2, phone: 3, birthDate: 4, marketingEmail: 5, sms: 6, tags: 7, note: 8 });
    expect(cz.ignored).toEqual(['Barva očí']);
    expect(cz.errors).toEqual([]);
    const en = mapHeaders('clients', ['First name', 'Last name', 'Email', 'Phone', 'Date of birth', 'Marketing consent', 'SMS consent', 'Tags', 'Note']);
    expect(Object.keys(en.columns)).toHaveLength(9);
    expect(mapHeaders('packages', ['e-mail', 'PERMANENTKA', 'Zbývá vstupů', 'Platí do']).errors).toEqual([]);
    expect(mapHeaders('credits', ['Telefon', 'Kredit (Kč)']).columns).toEqual({ phone: 0, amount: 1 });
  });

  it('ohlásí chybějící povinné sloupce, duplicitní sloupec a soubor pro jiný krok', () => {
    expect(mapHeaders('packages', ['E-mail', 'Permanentka', 'Zbývá vstupů']).errors).toEqual(['Chybí sloupec Platí do.']);
    expect(mapHeaders('clients', ['Jméno', 'Příjmení']).errors[0]).toMatch(/E-mail nebo Telefon/);
    expect(mapHeaders('clients', ['Jméno', 'Příjmení', 'E-mail', 'Email']).warnings[0]).toMatch(/víckrát/);
    expect(mapHeaders('clients', ['Jméno', 'E-mail']).warnings[0]).toMatch(/Příjmení/);
    const wrong = readImportFile('clients', 'E-mail;Permanentka;Zbývá vstupů;Platí do\neva@example.com;Fyzio 10;3;31. 3. 2027\n');
    expect(wrong.errors.join(' ')).toMatch(/soubor s permanentkami/);
    expect(readImportFile('credits', '').errors).toEqual(['Soubor je prázdný.']);
    expect(readImportFile('credits', 'E-mail;Kredit Kč\r\n').errors).toContain('Soubor obsahuje jen hlavičku, žádné řádky s daty.');
  });

  it('šablony ke stažení jdou rovnou naimportovat', () => {
    const s = createBaseState('2026-01-01');
    const clients = readImportFile('clients', importTemplateCsv('clients', s));
    expect(clients.errors).toEqual([]);
    expect(summarizeChecks(checkClientRows(s, clients.rows, 'skip', NOW))).toMatchObject({ total: 2, created: 2, errors: 0, warnings: 0 });
    // Petr ze šablony (telefon 603 987 654) už v ukázkové klinice je
    expect(checkClientRows(setup().s, clients.rows, 'skip', NOW)[1]).toMatchObject({ action: 'skip', matchedBy: 'phone' });
    expect(readImportFile('packages', importTemplateCsv('packages', s)).errors).toEqual([]);
    expect(readImportFile('credits', importTemplateCsv('credits', s)).errors).toEqual([]);
  });
});

const CLIENTS_CSV = [
  '﻿Jméno;Příjmení;E-mail;Telefon;Datum narození;Souhlas e-mail/marketing;Souhlas SMS;Štítky;Poznámka',
  'Jana;Nováková;Jana.Novakova@Example.cz;777 123 456;15. 3. 1985;ano;ne;"záda; běh";"Říká ""Jani"""',
  'Petr;Novák;petr@example;603111222;1980-11-02;;ano;;',
  'Eva;Testová;eva@example.com;;;ano;;;',
  'Jana;Nováková;jana.novakova@example.cz;;;;;;',
  ';Bezejmenná;bez@example.cz;;;;;;',
  'KAREL;DVOŘÁK;;+420 602 111 222;31. 2. 1990;možná;x;;',
].join('\r\n');

describe('import klientů', () => {
  it('náhled: neplatný e-mail, chybějící jméno, duplicita v souboru, klient už v systému, upozornění', () => {
    const { s } = setup();
    const file = readImportFile('clients', CLIENTS_CSV);
    expect(file.errors).toEqual([]);
    const checks = checkClientRows(s, file.rows, 'skip', NOW);
    expect(checks.map((c) => [c.row, c.action])).toEqual([
      [2, 'create'],
      [3, 'error'],
      [4, 'skip'],
      [5, 'skip'],
      [6, 'error'],
      [7, 'create'],
    ]);
    const text = (row: number): string => checks.find((c) => c.row === row)!.issues.map((i) => i.text).join(' ');
    expect(text(3)).toMatch(/Neplatný e-mail „petr@example“/);
    expect(text(4)).toMatch(/už je v systému \(Eva Testová\)/);
    expect(text(5)).toMatch(/Stejný e-mail jako na řádku 2/);
    expect(text(6)).toMatch(/Chybí jméno/);
    expect(text(7)).toMatch(/Datum narození „31\. 2\. 1990“/);
    expect(text(7)).toMatch(/neznámá hodnota „možná“/);
    expect(summarizeChecks(checks)).toEqual({ total: 6, created: 2, updated: 0, skipped: 2, errors: 2, warnings: 3 });
  });

  it('založí klienty: souhlas GDPR vždy se zdrojem importu, obchodní sdělení a SMS jen podle souboru; nic neodešle', () => {
    const { s } = setup();
    const file = readImportFile('clients', CLIENTS_CSV);
    const r = run(s, importClients, { rows: file.rows, onDuplicate: 'skip' }, reception());
    expect(r.value).toMatchObject({ created: 2, updated: 0, skipped: 2, errors: 2 });
    expect(r.value.failed.map((f) => f.row)).toEqual([3, 6]);
    const jana = r.state.clients.find((c) => c.lastName === 'Nováková')!;
    expect(jana).toMatchObject({
      firstName: 'Jana',
      email: 'jana.novakova@example.cz',
      phone: '+420 777 123 456',
      birthDate: '1985-03-15',
      tags: ['záda', 'běh'],
      internalNote: 'Říká "Jani"',
      createdAt: NOW,
    });
    expect(jana.consents.gdpr).toEqual({ at: NOW, source: IMPORT_SOURCE });
    expect(jana.consents.marketingEmail).toEqual({ at: NOW, source: IMPORT_SOURCE });
    expect(jana.consents.sms).toBeNull();
    expect(jana.consents.health).toBeNull();
    const karel = r.state.clients.find((c) => c.lastName === 'Dvořák')!;
    expect(karel).toMatchObject({ firstName: 'Karel', email: '', phone: '+420 602 111 222', birthDate: null });
    expect(karel.consents.marketingEmail).toBeNull();
    expect(karel.consents.sms).toEqual({ at: NOW, source: IMPORT_SOURCE });
    expect(r.state.clients).toHaveLength(4);
    expect(r.state.messages).toHaveLength(0);
    // historie změn: každý nový klient + souhrn importu
    expect(r.state.audit.filter((a) => a.action === 'Import klienta').map((a) => a.clientId)).toEqual([jana.id, karel.id]);
    expect(r.state.audit[r.state.audit.length - 1]).toMatchObject({ action: 'Import klientů', actor: 'Recepce', detail: 'vytvořeno 2 · přeskočeno 2 · s chybou 2' });
  });

  it('existujícího klienta přeskočí, nebo doplní údaje ze souboru (jméno ani odvolané souhlasy nemění)', () => {
    const { s, eva } = setup();
    const rows: ClientImportRow[] = [
      { firstName: 'Eva', lastName: 'Novotná', email: 'EVA@example.com', phone: '+420 600 000 001', birthDate: '5. 5. 1990', marketingEmail: '12. 3. 2024', sms: 'ne', tags: 'VIP, záda', note: 'Chodí s kočárkem' },
    ];
    const skipped = run(s, importClients, { rows, onDuplicate: 'skip' }, reception());
    expect(skipped.value).toMatchObject({ created: 0, updated: 0, skipped: 1, errors: 0 });
    expect(skipped.state.clients.find((c) => c.id === eva)).toEqual(s.clients.find((c) => c.id === eva));
    expect(skipped.state.audit).toEqual(s.audit);

    const preview = checkClientRows(s, rows, 'update', NOW)[0];
    expect(preview).toMatchObject({ action: 'update', existingId: eva, matchedBy: 'email', changes: ['datum narození', 'štítky', 'poznámka', 'souhlas e-mail/marketing'] });
    expect(preview.issues.map((i) => i.text).join(' ')).toMatch(/Eva Testová – jméno ponecháme/);
    const updated = run(s, importClients, { rows, onDuplicate: 'update' }, reception());
    expect(updated.value).toMatchObject({ created: 0, updated: 1, skipped: 0, errors: 0 });
    const c = updated.state.clients.find((x) => x.id === eva)!;
    expect(c).toMatchObject({ firstName: 'Eva', lastName: 'Testová', birthDate: '1990-05-05', tags: ['VIP', 'záda'], internalNote: 'Chodí s kočárkem' });
    expect(c.consents.marketingEmail).toEqual({ at: '2024-03-12T00:00', source: IMPORT_SOURCE });
    expect(c.consents.sms).toBeNull();
    expect(updated.state.audit.some((a) => a.action === 'Import – doplnění údajů' && a.clientId === eva)).toBe(true);
    // druhý import se stejnými údaji už nic nemění
    expect(checkClientRows(updated.state, rows, 'update', NOW)[0].action).toBe('skip');
  });

  it('klienta bez e-mailu pozná podle telefonu a jména; stejný telefon s jiným jménem je další klient', () => {
    const { s, petr } = setup();
    const checks = checkClientRows(
      s,
      [
        { firstName: 'petr', lastName: 'SVOBODA', phone: '+420 603 987 654' },
        { firstName: 'Tomáš', lastName: 'Svoboda', phone: '603 987 654' },
        { firstName: 'Tomáš', lastName: 'Svoboda', phone: '603987654' },
      ],
      'skip',
      NOW,
    );
    expect(checks[0]).toMatchObject({ action: 'skip', existingId: petr, matchedBy: 'phone' });
    expect(checks[1].action).toBe('create');
    expect(checks[1].issues[0].text).toMatch(/Stejný telefon má v systému Petr Svoboda/);
    expect(checks[2].action).toBe('skip');
    expect(checks[2].issues.map((i) => i.text).join(' ')).toMatch(/Stejný klient jako na řádku 3/);
  });

  it('vstup z jiného zdroje (server, API) s jinými typy hodnot nespadne', () => {
    const { s } = setup();
    const odd = [{ firstName: 'Ota', lastName: 'Číselný', phone: 777123456, marketingEmail: 1, sms: true, tags: 5, birthDate: null }] as unknown as ClientImportRow[];
    const r = run(s, importClients, { rows: odd, onDuplicate: 'skip' }, owner());
    expect(r.value).toMatchObject({ created: 1, errors: 0 });
    const ota = r.state.clients.find((c) => c.lastName === 'Číselný')!;
    expect(ota).toMatchObject({ phone: '+420 777 123 456', tags: [], birthDate: null });
    expect(ota.consents.sms).not.toBeNull();
    expect(ota.consents.marketingEmail).toBeNull();
    expect(tryRun(s, importClients, { rows: 'x' as unknown as ClientImportRow[], onDuplicate: 'skip' }, owner())).toMatch(/žádné řádky/);
  });

  it('jen majitelka a recepce; prázdný soubor odmítne; výsledek je deterministický', () => {
    const { s } = setup();
    const rows = readImportFile('clients', CLIENTS_CSV).rows;
    expect(tryRun(s, importClients, { rows, onDuplicate: 'skip' }, therapist())).toMatch(/majitelka nebo recepce/);
    expect(tryRun(s, importClients, { rows, onDuplicate: 'skip' }, { now: NOW, actor: { role: 'client', name: 'Klient', clientId: 'x' } })).toMatch(/majitelka nebo recepce/);
    expect(tryRun(s, importClients, { rows: [], onDuplicate: 'skip' }, owner())).toMatch(/žádné řádky/);
    const once = (): ClinicState => {
      const restore = withIdGenerator(sequentialIds('t'));
      try {
        return run(s, importClients, { rows, onDuplicate: 'update' }, owner()).state;
      } finally {
        restore();
      }
    };
    expect(once()).toEqual(once());
  });
});

describe('import permanentek', () => {
  const CSV = [
    'E-mail;Telefon;Permanentka;Zbývá vstupů;Platí do',
    'eva@example.com;;fyzio 10;4;31. 3. 2027',
    ';603987654;Masáž 5;2;2027-01-15',
    'nikdo@example.cz;;Fyzio 10;3;31. 3. 2027',
    'eva@example.com;;Fyzio 12;3;31. 3. 2027',
    'eva@example.com;;Fyzio 5;0;31. 3. 2027',
    'eva@example.com;;Fyzio 5;2;1. 10. 2026',
    'eva@example.com;;Fyzio 10;4;31. 3. 2027',
    'eva@example.com;;Fyzio 10;tři;31. 3. 2027',
  ].join('\n');

  it('vytvoří aktivní permanentku: volné vstupy = zbývající, hodnota vstupu podle šablony, označená jako převedená', () => {
    const { s, eva, petr } = setup();
    const file = readImportFile('packages', CSV);
    expect(file.errors).toEqual([]);
    const r = run(s, importPackages, { rows: file.rows }, reception());
    expect(r.value).toMatchObject({ created: 2, updated: 0, skipped: 3, errors: 3 });
    expect(r.value.failed.map((f) => f.row)).toEqual([4, 5, 9]);
    expect(r.value.failed[0].errors[0]).toMatch(/nikdo@example\.cz v systému není/);
    expect(r.value.failed[1].errors[0]).toMatch(/Neznámá permanentka „Fyzio 12“ – v nabídce je Fyzio 10, Fyzio 5/);

    const [pkg] = packagesOfClient(r.state, eva);
    expect(pkg).toMatchObject({ name: 'Fyzio 10 (převod)', templateId: 'pt_fyzio10', validUntil: '2027-03-31', excusesAllowed: 2, cancelled: false, serviceIds: ['s_fyzio45'] });
    expect(pkg.purchasedAt).toBe(`${addDays('2027-03-31', -183)}T00:00`);
    expect(isImportedPackage(pkg)).toBe(true);
    const u = packageUsage(r.state, pkg, TODAY);
    expect(u).toMatchObject({ total: 4, free: 4, used: 0, reserved: 0, expired: false, unitValue: 1090 });
    const masaz = packagesOfClient(r.state, petr)[0];
    expect(packageUsage(r.state, masaz, TODAY)).toMatchObject({ free: 2, unitValue: Math.round(4990 / 5) });
    expect(r.state.payments).toHaveLength(0);
    expect(r.state.audit.filter((a) => a.action === 'Převod permanentky')).toHaveLength(2);

    // převedenou permanentkou jde hned platit
    const b = run(r.state, createBooking, { clientId: eva, serviceId: 's_fyzio45', therapistId: 't_mala', start: '2026-11-18T09:00', payment: { method: 'package' } }, reception());
    expect(b.state.bookings[0].payment.packageId).toBe(pkg.id);
    expect(packageUsage(b.state, pkg, TODAY)).toMatchObject({ free: 3, reserved: 1 });

    // opakovaný import stejné permanentky se přeskočí
    const again = run(r.state, importPackages, { rows: file.rows.slice(0, 1) }, reception());
    expect(again.value).toMatchObject({ created: 0, skipped: 1 });
    expect(again.state.packages).toHaveLength(2);
  });

  it('jen majitelka a recepce', () => {
    const { s } = setup();
    expect(tryRun(s, importPackages, { rows: readImportFile('packages', CSV).rows }, therapist())).toMatch(/majitelka nebo recepce/);
  });
});

describe('import kreditů', () => {
  it('připíše zůstatek jako „Převod zůstatku ze stávajícího systému“ bez platby; duplicity a opakování přeskočí', () => {
    const { s, eva, petr } = setup();
    const csv = [
      'E-mail;Telefon;Kredit Kč;Poznámka',
      'eva@example.com;;1 500;',
      ';603 987 654;"750,40";dárkový poukaz',
      'eva@example.com;;200;',
      'nikdo@example.cz;;100;',
      ';603 987 654;-50;',
      'eva@example.com;;sto;',
    ].join('\r\n');
    const file = readImportFile('credits', csv);
    expect(file.errors).toEqual([]);
    const r = run(s, importCredits, { rows: file.rows }, owner());
    expect(r.value).toMatchObject({ created: 2, updated: 0, skipped: 1, errors: 3 });
    expect(r.value.failed.map((f) => f.row)).toEqual([5, 6, 7]);
    expect(clientCredit(r.state, eva)).toBe(1500);
    expect(clientCredit(r.state, petr)).toBe(750);
    expect(r.state.ledger.map((e) => [e.kind, e.amount, e.note])).toEqual([
      ['adjustment', 1500, CREDIT_TRANSFER_NOTE],
      ['adjustment', 750, `${CREDIT_TRANSFER_NOTE} · dárkový poukaz`],
    ]);
    expect(r.state.payments).toHaveLength(0);
    expect(r.state.audit.filter((a) => a.action === 'Převod kreditu').map((a) => a.clientId)).toEqual([eva, petr]);

    const again = run(r.state, importCredits, { rows: file.rows.slice(0, 2) }, owner());
    expect(again.value).toMatchObject({ created: 0, skipped: 2 });
    expect(clientCredit(again.state, eva)).toBe(1500);
    expect(tryRun(s, importCredits, { rows: file.rows }, therapist())).toMatch(/majitelka nebo recepce/);
  });
});
