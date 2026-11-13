import { describe, expect, it } from 'vitest';
import type { PaymentRequest } from '../src/domain/types';
import {
  BREVO_EMAIL_ENDPOINT,
  BREVO_SMS_ENDPOINT,
  FIO_API_BASE,
  FioError,
  createBrevoMessenger,
  createConsoleMessenger,
  fetchFioTransactions,
  matchBankPayments,
  normalizeCzechPhone,
  normalizeVs,
  parseFioStatement,
  renderEmailHtml,
  stripDiacritics,
  toGsm7,
  type BankTransaction,
  type BrevoConfig,
} from '../server/providers';

/* ------------------------------------------------------------------ */
/* Podvržený fetch – testy nikdy nejdou do sítě                         */
/* ------------------------------------------------------------------ */

interface Call {
  url: string;
  init: RequestInit;
  headers: Headers;
  json?: unknown;
}

function fakeFetch(respond: (call: Call) => Response | Promise<Response>): { fetchImpl: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const call: Call = { url, init: init ?? {}, headers: new Headers(init?.headers) };
    if (typeof init?.body === 'string') call.json = JSON.parse(init.body);
    calls.push(call);
    return respond(call);
  };
  return { fetchImpl, calls };
}

const failingFetch = (error: unknown): { fetchImpl: typeof fetch; calls: Call[] } =>
  fakeFetch(() => {
    throw error;
  });

const jsonResponse = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

/* ------------------------------------------------------------------ */
/* Brevo                                                               */
/* ------------------------------------------------------------------ */

const API_KEY = 'xkeysib-0123456789abcdef-TESTKEY';

function brevo(fetchImpl: typeof fetch, extra: Partial<BrevoConfig> = {}) {
  return createBrevoMessenger({
    apiKey: API_KEY,
    senderEmail: 'recepce@klinika-pohyb.cz',
    senderName: 'Klinika Pohyb',
    smsSender: 'KlinPohyb',
    fetchImpl,
    ...extra,
  });
}

describe('Brevo – e-mail', () => {
  it('pošle správný požadavek a vrátí ID zprávy', async () => {
    const { fetchImpl, calls } = fakeFetch(() => jsonResponse(201, { messageId: '<202611131015.1234567890@smtp-relay.mailin.fr>' }));
    const result = await brevo(fetchImpl).sendEmail({
      to: ' eva@example.com ',
      toName: 'Eva Testová',
      subject: 'Potvrzení rezervace: Fyzioterapie St 18. 11. v 9:00',
      text: 'Dobrý den, Evo,\n\npotvrzujeme vaši rezervaci.\nKlinika Pohyb',
      html: '<p>Dobrý den, Evo,</p>',
      replyTo: 'terapeut@klinika-pohyb.cz',
    });

    expect(result).toEqual({ ok: true, providerId: '<202611131015.1234567890@smtp-relay.mailin.fr>', httpStatus: 201 });
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call.url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(call.url).toBe(BREVO_EMAIL_ENDPOINT);
    expect(call.init.method).toBe('POST');
    expect(call.headers.get('api-key')).toBe(API_KEY);
    expect(call.headers.get('content-type')).toBe('application/json');
    expect(call.headers.get('accept')).toBe('application/json');
    expect(call.json).toEqual({
      sender: { name: 'Klinika Pohyb', email: 'recepce@klinika-pohyb.cz' },
      to: [{ email: 'eva@example.com', name: 'Eva Testová' }],
      subject: 'Potvrzení rezervace: Fyzioterapie St 18. 11. v 9:00',
      htmlContent: '<p>Dobrý den, Evo,</p>',
      textContent: 'Dobrý den, Evo,\n\npotvrzujeme vaši rezervaci.\nKlinika Pohyb',
      replyTo: { email: 'terapeut@klinika-pohyb.cz' },
    });
    // čeština jde v JSON přímo (UTF-8), ne jako otazníky
    expect(call.init.body).toContain('Testová');
  });

  it('bez HTML ho sestaví z textu, prázdný předmět nahradí názvem odesílatele', async () => {
    const { fetchImpl, calls } = fakeFetch(() => jsonResponse(201, { messageId: '<a@b>' }));
    const result = await brevo(fetchImpl).sendEmail({ to: 'eva@example.com', subject: ' \n ', text: 'Řádek <1>\n\nOdstavec 2' });
    expect(result.ok).toBe(true);
    const payload = calls[0].json as { subject: string; htmlContent: string; textContent: string; to: unknown[] };
    expect(payload.subject).toBe('Klinika Pohyb');
    expect(payload.to).toEqual([{ email: 'eva@example.com' }]);
    expect(payload.textContent).toBe('Řádek <1>\n\nOdstavec 2');
    expect(payload.htmlContent).toContain('Řádek &lt;1&gt;');
    expect(payload.htmlContent).toContain('Klinika Pohyb');
  });

  it('neplatnou adresu ani prázdný e-mail vůbec neposílá (trvalá chyba)', async () => {
    const { fetchImpl, calls } = fakeFetch(() => jsonResponse(201, {}));
    const m = brevo(fetchImpl);
    expect(await m.sendEmail({ to: 'eva.example.com', subject: 'x', text: 'y' })).toEqual({
      ok: false,
      permanent: true,
      error: 'Neplatná e-mailová adresa příjemce.',
    });
    expect((await m.sendEmail({ to: 'eva@example.com', subject: 'x', text: '  ' })).permanent).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it.each([
    [400, { code: 'invalid_parameter', message: 'email is not valid in to' }, true, 'Neplatná adresa nebo obsah e-mailu'],
    [401, { code: 'unauthorized', message: 'Key not found' }, true, 'API klíč'],
    [403, { code: 'permission_denied', message: 'Permission denied' }, true, 'oprávnění'],
    [404, { code: 'document_not_found', message: 'Not found' }, true, 'odmítlo'],
    [402, { code: 'not_enough_credits', message: 'Not enough credits' }, false, 'kreditu'],
    [429, { code: 'too_many_requests', message: 'Too many requests' }, false, 'příliš mnoho požadavků'],
    [500, { code: 'internal_error', message: 'Internal error' }, false, 'dočasně nedostupné'],
    [503, 'Service Unavailable', false, 'dočasně nedostupné'],
  ])('HTTP %i → permanent: %s', async (status, body, permanent, text) => {
    const { fetchImpl } = fakeFetch(() => jsonResponse(status, body));
    const result = await brevo(fetchImpl).sendEmail({ to: 'eva@example.com', subject: 'Předmět', text: 'Text' });
    expect(result.ok).toBe(false);
    expect(result.permanent).toBe(permanent);
    expect(result.httpStatus).toBe(status);
    expect(result.error).toContain(text);
    expect(result.error).toContain(`HTTP ${status}`);
    expect(result.error).not.toContain(API_KEY);
  });

  it('u limitu požadavků řekne, za jak dlouho to zkusit znovu', async () => {
    const { fetchImpl } = fakeFetch(() => jsonResponse(429, { code: 'too_many_requests', message: 'Rate limit' }, { 'x-sib-ratelimit-reset': '45' }));
    const result = await brevo(fetchImpl).sendEmail({ to: 'eva@example.com', subject: 'Předmět', text: 'Text' });
    expect(result).toMatchObject({ ok: false, permanent: false, httpStatus: 429 });
    expect(result.error).toContain('za 45 s');
  });

  it('síťová chyba a vypršení limitu jsou dočasné, klíč se v chybě neobjeví', async () => {
    const network = await brevo(failingFetch(new TypeError(`fetch failed for key ${API_KEY}`)).fetchImpl).sendEmail({
      to: 'eva@example.com',
      subject: 'Předmět',
      text: 'Text',
    });
    expect(network).toMatchObject({ ok: false, permanent: false });
    expect(network.httpStatus).toBeUndefined();
    expect(network.error).toContain('Nepodařilo se spojit s Brevo');
    expect(network.error).not.toContain(API_KEY);

    const timeout = await brevo(failingFetch(new DOMException('The operation timed out.', 'TimeoutError')).fetchImpl).sendSms({
      to: '777123456',
      text: 'Ahoj',
    });
    expect(timeout).toMatchObject({ ok: false, permanent: false, error: 'Brevo neodpovědělo včas, zkusí se znovu.' });
  });

  it('bez API klíče nebo s neplatným odesílatelem se vůbec nevytvoří', () => {
    const { fetchImpl } = fakeFetch(() => jsonResponse(201, {}));
    expect(() => brevo(fetchImpl, { apiKey: '  ' })).toThrow('chybí API klíč');
    expect(() => brevo(fetchImpl, { senderEmail: 'recepce' })).toThrow('neplatná adresa odesílatele');
  });
});

describe('Brevo – SMS', () => {
  it('normalizuje číslo, odstraní diakritiku a typografické znaky, pošle jako transakční SMS', async () => {
    // messageId větší než Number.MAX_SAFE_INTEGER – nesmí se zaokrouhlit
    const { fetchImpl, calls } = fakeFetch(() => new Response('{"messageId":9007199254740993}', { status: 201 }));
    const result = await brevo(fetchImpl).sendSms({
      to: '+420 777 123 456',
      text: 'Klinika Pohyb: rezervace Fyzioterapie St 18.\xa011. v 9:00 je potvrzená. Zrušení zdarma do Út 17.\xa011. – cena 1\xa0190\xa0Kč „na místě“.',
    });

    expect(result).toEqual({ ok: true, providerId: '9007199254740993', httpStatus: 201 });
    expect(calls[0].url).toBe('https://api.brevo.com/v3/transactionalSMS/send');
    expect(calls[0].url).toBe(BREVO_SMS_ENDPOINT);
    expect(calls[0].headers.get('api-key')).toBe(API_KEY);
    expect(calls[0].json).toEqual({
      sender: 'KlinPohyb',
      recipient: '420777123456',
      content: 'Klinika Pohyb: rezervace Fyzioterapie St 18. 11. v 9:00 je potvrzena. Zruseni zdarma do Ut 17. 11. - cena 1 190 Kc "na miste".',
      type: 'transactional',
      unicodeEnabled: false,
    });
  });

  it('se smsUnicode pošle text s diakritikou (NFC) a unicodeEnabled: true', async () => {
    const { fetchImpl, calls } = fakeFetch(() => jsonResponse(201, { messageId: 1511882900176220 }));
    // „Zrušení“ zapsané rozloženě (NFD) – odejde složené
    const result = await brevo(fetchImpl, { smsUnicode: true }).sendSms({ to: '00420 603 123 456', text: 'Zrus\u{30c}ení zdarma do Út 17. 11.' });
    expect(result).toMatchObject({ ok: true, providerId: '1511882900176220' });
    expect(calls[0].json).toMatchObject({ recipient: '420603123456', content: 'Zrušení zdarma do Út 17. 11.', unicodeEnabled: true });
  });

  it('neplatné číslo ani špatně nastavený odesílatel se vůbec neposílá', async () => {
    const { fetchImpl, calls } = fakeFetch(() => jsonResponse(201, {}));
    expect(await brevo(fetchImpl).sendSms({ to: '12345', text: 'Ahoj' })).toEqual({
      ok: false,
      permanent: true,
      error: 'Neplatné telefonní číslo.',
    });
    const badSender = await brevo(fetchImpl, { smsSender: 'Klinika Pohyb' }).sendSms({ to: '777123456', text: 'Ahoj' });
    expect(badSender).toMatchObject({ ok: false, permanent: false });
    expect(badSender.error).toContain('odesílatel SMS');
    expect(calls).toHaveLength(0);
  });

  it('číselného odesílatele pošle bez +', async () => {
    const { fetchImpl, calls } = fakeFetch(() => jsonResponse(201, { messageId: 1 }));
    await brevo(fetchImpl, { smsSender: '+420777000111' }).sendSms({ to: '777 123 456', text: 'Ahoj' });
    expect(calls[0].json).toMatchObject({ sender: '420777000111' });
  });

  it('odmítnuté číslo je trvalá chyba, chybějící kredit dočasná', async () => {
    const rejected = await brevo(fakeFetch(() => jsonResponse(400, { code: 'invalid_parameter', message: 'Invalid phone number' })).fetchImpl).sendSms({
      to: '777123456',
      text: 'Ahoj',
    });
    expect(rejected).toMatchObject({ ok: false, permanent: true, httpStatus: 400 });
    expect(rejected.error).toContain('Neplatné číslo nebo obsah SMS');
    expect(rejected.error).toContain('Invalid phone number');

    const credits = await brevo(fakeFetch(() => jsonResponse(402, { code: 'not_enough_credits', message: 'Not enough credits' })).fetchImpl).sendSms({
      to: '777123456',
      text: 'Ahoj',
    });
    expect(credits).toMatchObject({ ok: false, permanent: false, httpStatus: 402 });
  });
});

describe('Vývojový poskytovatel', () => {
  it('zprávy jen vypíše a vrátí úspěch', async () => {
    const lines: string[] = [];
    const m = createConsoleMessenger((line) => lines.push(line));
    expect(await m.sendEmail({ to: 'eva@example.com', toName: 'Eva', subject: 'Předmět', text: 'Řádek 1\nŘádek 2' })).toEqual({
      ok: true,
      providerId: 'console-1',
    });
    expect(await m.sendSms({ to: '777 123 456', text: 'Ahoj' })).toEqual({ ok: true, providerId: 'console-2' });
    expect(lines).toEqual([
      '[e-mail console-1] Eva <eva@example.com> · Předmět',
      '  Řádek 1',
      '  Řádek 2',
      '[sms console-2] 777 123 456 (420777123456) · 4 zn.',
      '  Ahoj',
    ]);
  });
});

/* ------------------------------------------------------------------ */
/* Telefon a text SMS                                                  */
/* ------------------------------------------------------------------ */

describe('Telefonní čísla', () => {
  it.each([
    ['+420 777 123 456', '420777123456'],
    ['00420777123456', '420777123456'],
    ['777123456', '420777123456'],
    ['777 123 456', '420777123456'],
    ['420 777 123 456', '420777123456'],
    ['+420\xa0777-123-456', '420777123456'],
    ['(+420) 603 12 34 56', '420603123456'],
    ['  603.123.456 ', '420603123456'],
    ['+421 905 123 456', '421905123456'],
    ['0049 151 23456789', '4915123456789'],
    ['+1 (555) 123-4567', '15551234567'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeCzechPhone(input)).toBe(expected);
  });

  it.each([
    '',
    '   ',
    '12345',
    '0777123456',
    '+420 123 456 789',
    '+420 777 123 45',
    '+420 777 123 4567',
    '777 123 456 linka 12',
    'abc',
    '+0 777 123 456',
    '++420777123456',
    '777+123456',
    '421905123456',
    '+12345',
    '+1234567890123456',
  ])('„%s“ je neplatné', (input) => {
    expect(normalizeCzechPhone(input)).toBeNull();
  });

  it('odstraní diakritiku', () => {
    expect(stripDiacritics('Příliš žluťoučký kůň úpěl ďábelské ódy')).toBe('Prilis zlutoucky kun upel dabelske ody');
    expect(stripDiacritics('PŘÍLIŠ ŽLUŤOUČKÝ KŮŇ ÚPĚL ĎÁBELSKÉ ÓDY')).toBe('PRILIS ZLUTOUCKY KUN UPEL DABELSKE ODY');
    expect(stripDiacritics('Łódź, Søren, Müller')).toBe('Lodz, Soren, Muller');
  });

  it('převede text SMS do znakové sady GSM 03.38', () => {
    expect(toGsm7('Cena 1\xa0190\xa0Kč – „rychle“ … 😊 · konec\r\nDalší ‘řádek’')).toBe(
      'Cena 1 190 Kc - "rychle" ...  - konec\nDalsi \'radek\'',
    );
    expect(toGsm7('€ [x] {y} @ £ ß 中')).toBe('€ [x] {y} @ £ ß ?');
    expect(toGsm7('Vlajka 🇨🇿 a palec 👍🏽!')).toBe('Vlajka  a palec !');
  });
});

/* ------------------------------------------------------------------ */
/* HTML e-mail                                                         */
/* ------------------------------------------------------------------ */

describe('HTML e-mail', () => {
  const html = renderEmailHtml({
    clinicName: 'Klinika <Pohyb> & spol.',
    subject: 'Potvrzení <rezervace>',
    body:
      'Dobrý den, Evo,\n\n<script>alert("x")</script>\nDruhý řádek\r\n  \r\nRezervace: https://klinika.cz/r?id=1&x=2. ' +
      'Nebo (https://klinika.cz/a) a javascript:alert(1) či http://nezabezpeceny.cz\n\n\n',
    footer: 'Hlavní 1, Praha\nhttps://klinika.cz',
  });

  it('escapuje HTML a zachová odstavce i konce řádků', () => {
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;<br>\nDruhý řádek</p>');
    expect(html.match(/<p /g)).toHaveLength(3);
    expect(html).toContain('<title>Potvrzení &lt;rezervace&gt;</title>');
    expect(html).toContain('Klinika &lt;Pohyb&gt; &amp; spol.');
  });

  it('udělá z adres https:// odkazy bez koncové interpunkce', () => {
    expect(html).toContain('<a href="https://klinika.cz/r?id=1&amp;x=2" class="link"');
    expect(html).toContain('https://klinika.cz/r?id=1&amp;x=2</a>. Nebo (<a href="https://klinika.cz/a"');
    expect(html).toContain('https://klinika.cz/a</a>) a javascript:alert(1)');
    expect(html).not.toContain('href="javascript');
    expect(html).not.toContain('href="http://');
  });

  it('má patičku s názvem kliniky, šířku pro telefony a tmavý režim', () => {
    expect(html).toContain('<strong>Klinika &lt;Pohyb&gt; &amp; spol.</strong><br>\nHlavní 1, Praha<br>\n<a href="https://klinika.cz"');
    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
    expect(html).toContain('max-width:600px');
    expect(html).toContain('@media (prefers-color-scheme: dark)');
    expect(renderEmailHtml({ clinicName: 'Klinika', subject: 'S', body: 'Text' })).toContain('<strong>Klinika</strong></td>');
  });
});

/* ------------------------------------------------------------------ */
/* Fio banka                                                           */
/* ------------------------------------------------------------------ */

const FIO_TOKEN = 'FioTestToken0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP';

/** Výpis ve tvaru z dokumentace „FIO API Bankovnictví“ (smyšlená data). */
const FIO_STATEMENT = {
  accountStatement: {
    info: {
      accountId: '2101234567',
      bankId: '2010',
      currency: 'CZK',
      iban: 'CZ0000000000002101234567',
      bic: 'FIOBCZPPXXX',
      openingBalance: 25000.5,
      closingBalance: 27839.5,
      dateStart: '2026-11-01+0100',
      dateEnd: '2026-11-13+0100',
      yearList: null,
      idList: null,
      idFrom: 26000000001,
      idTo: 26000000007,
      idLastDownload: null,
    },
    transactionList: {
      transaction: [
        {
          // příchozí QR platba s VS a zprávou
          column22: { value: 26000000001, name: 'ID pohybu', id: 22 },
          column0: { value: '2026-11-03+0100', name: 'Datum', id: 0 },
          column1: { value: 1190.0, name: 'Objem', id: 1 },
          column14: { value: 'CZK', name: 'Měna', id: 14 },
          column2: { value: '2900233345', name: 'Protiúčet', id: 2 },
          column10: { value: 'Testová Eva', name: 'Název protiúčtu', id: 10 },
          column3: { value: '2010', name: 'Kód banky', id: 3 },
          column12: { value: 'Fio banka, a.s.', name: 'Název banky', id: 12 },
          column4: { value: '0308', name: 'KS', id: 4 },
          column5: { value: '26110007', name: 'VS', id: 5 },
          column6: null,
          column7: { value: 'Testová Eva', name: 'Uživatelská identifikace', id: 7 },
          column16: { value: 'TESTOVA FYZIOTERAPIE 45 MIN', name: 'Zpráva pro příjemce', id: 16 },
          column8: { value: 'Bezhotovostní příjem', name: 'Typ', id: 8 },
          column9: null,
          column18: null,
          column25: null,
          column26: null,
          column17: { value: 31000000001, name: 'ID pokynu', id: 17 },
          column27: null,
        },
        {
          // odchozí platba kartou (záporná), bez VS
          column22: { value: 26000000002, name: 'ID pohybu', id: 22 },
          column0: { value: '2026-11-04+0100', name: 'Datum', id: 0 },
          column1: { value: -349.0, name: 'Objem', id: 1 },
          column14: { value: 'CZK', name: 'Měna', id: 14 },
          column2: null,
          column10: null,
          column3: null,
          column12: null,
          column4: null,
          column5: null,
          column6: null,
          column7: { value: 'Nákup: DROGERIE, Praha', name: 'Uživatelská identifikace', id: 7 },
          column16: null,
          column8: { value: 'Platba kartou', name: 'Typ', id: 8 },
          column9: { value: 'Pohybová, Jana', name: 'Provedl', id: 9 },
          column18: { value: '349.00 CZK', name: 'Upřesnění', id: 18 },
          column25: { value: 'Nákup: DROGERIE, Praha', name: 'Komentář', id: 25 },
          column26: null,
          column17: { value: 31000000002, name: 'ID pokynu', id: 17 },
        },
        {
          // příchozí bez VS (klient zapomněl symbol)
          column22: { value: 26000000003, name: 'ID pohybu', id: 22 },
          column0: { value: '2026-11-05+0100', name: 'Datum', id: 0 },
          column1: { value: 500, name: 'Objem', id: 1 },
          column14: { value: 'CZK', name: 'Měna', id: 14 },
          column2: { value: '123456789', name: 'Protiúčet', id: 2 },
          column10: { value: 'Novák Jan', name: 'Název protiúčtu', id: 10 },
          column3: { value: '0800', name: 'Kód banky', id: 3 },
          column5: null,
          column16: { value: 'Dobití kreditu Novák', name: 'Zpráva pro příjemce', id: 16 },
          column8: { value: 'Bezhotovostní příjem', name: 'Typ', id: 8 },
        },
        {
          // příchozí z jiné banky, VS s úvodními nulami, bez sloupce měny (platí měna účtu)
          column22: { value: 26000000004, name: 'ID pohybu', id: 22 },
          column0: { value: '2026-11-06+0100', name: 'Datum', id: 0 },
          column1: { value: 2490, name: 'Objem', id: 1 },
          column2: { value: '19-123457', name: 'Protiúčet', id: 2 },
          column10: { value: 'Dvořák Petr', name: 'Název protiúčtu', id: 10 },
          column3: { value: '0100', name: 'Kód banky', id: 3 },
          column5: { value: '0026110008', name: 'VS', id: 5 },
          column6: { value: '1234', name: 'SS', id: 6 },
          column8: { value: 'Bezhotovostní příjem', name: 'Typ', id: 8 },
        },
        {
          // příchozí v eurech – nepáruje se
          column22: { value: 26000000005, name: 'ID pohybu', id: 22 },
          column0: { value: '2026-11-07+0100', name: 'Datum', id: 0 },
          column1: { value: 50, name: 'Objem', id: 1 },
          column14: { value: 'EUR', name: 'Měna', id: 14 },
          column2: { value: 'DE00000000000000000000', name: 'Protiúčet', id: 2 },
          column10: { value: 'Müller GmbH', name: 'Název protiúčtu', id: 10 },
          column3: null,
          column5: { value: '26110009', name: 'VS', id: 5 },
          column26: { value: 'TESTDEFFXXX', name: 'BIC', id: 26 },
        },
        {
          // vrácení peněz klientce (odchozí se stejným VS) – nepáruje se
          column22: { value: 26000000006, name: 'ID pohybu', id: 22 },
          column0: { value: '2026-11-08+0100', name: 'Datum', id: 0 },
          column1: { value: -1190, name: 'Objem', id: 1 },
          column14: { value: 'CZK', name: 'Měna', id: 14 },
          column2: { value: '2900233345', name: 'Protiúčet', id: 2 },
          column3: { value: '2010', name: 'Kód banky', id: 3 },
          column10: { value: 'Testová Eva', name: 'Název protiúčtu', id: 10 },
          column5: { value: '26110007', name: 'VS', id: 5 },
          column16: { value: 'VRACENI PLATBY', name: 'Zpráva pro příjemce', id: 16 },
          column8: { value: 'Bezhotovostní platba', name: 'Typ', id: 8 },
        },
        {
          // nedoplatek (klientka poslala méně) – nepáruje se
          column22: { value: 26000000007, name: 'ID pohybu', id: 22 },
          column0: { value: '2026-11-09+0100', name: 'Datum', id: 0 },
          column1: { value: 900, name: 'Objem', id: 1 },
          column14: { value: 'CZK', name: 'Měna', id: 14 },
          column5: { value: '26110010', name: 'VS', id: 5 },
          column10: { value: 'Malá Anna', name: 'Název protiúčtu', id: 10 },
        },
      ],
    },
  },
};

const EXPECTED_TRANSACTIONS: BankTransaction[] = [
  {
    id: '26000000001',
    date: '2026-11-03',
    amount: 1190,
    currency: 'CZK',
    vs: '26110007',
    ks: '0308',
    message: 'TESTOVA FYZIOTERAPIE 45 MIN',
    counterAccount: '2900233345/2010',
    counterName: 'Testová Eva',
  },
  { id: '26000000002', date: '2026-11-04', amount: -349, currency: 'CZK' },
  {
    id: '26000000003',
    date: '2026-11-05',
    amount: 500,
    currency: 'CZK',
    message: 'Dobití kreditu Novák',
    counterAccount: '123456789/0800',
    counterName: 'Novák Jan',
  },
  {
    id: '26000000004',
    date: '2026-11-06',
    amount: 2490,
    currency: 'CZK',
    vs: '0026110008',
    ss: '1234',
    counterAccount: '19-123457/0100',
    counterName: 'Dvořák Petr',
  },
  { id: '26000000005', date: '2026-11-07', amount: 50, currency: 'EUR', vs: '26110009', counterAccount: 'DE00000000000000000000', counterName: 'Müller GmbH' },
  {
    id: '26000000006',
    date: '2026-11-08',
    amount: -1190,
    currency: 'CZK',
    vs: '26110007',
    message: 'VRACENI PLATBY',
    counterAccount: '2900233345/2010',
    counterName: 'Testová Eva',
  },
  { id: '26000000007', date: '2026-11-09', amount: 900, currency: 'CZK', vs: '26110010', counterName: 'Malá Anna' },
];

function request(id: string, vs: string, amount: number, extra: Partial<PaymentRequest> = {}): PaymentRequest {
  return {
    id,
    clientId: 'c1',
    at: '2026-11-01T10:00',
    createdBy: 'client',
    amount,
    vs,
    label: 'Fyzioterapie 45 min',
    purpose: 'booking',
    status: 'pending',
    dueAt: '2026-11-03T10:00',
    ...extra,
  };
}

function tx(id: string, vs: string | undefined, amount: number, date = '2026-11-03', currency = 'CZK'): BankTransaction {
  return vs === undefined ? { id, date, amount, currency } : { id, date, amount, currency, vs };
}

describe('Fio banka – výpis', () => {
  it('stáhne pohyby za období (bezstavový dotaz periods) a převede sloupce', async () => {
    const { fetchImpl, calls } = fakeFetch(() => jsonResponse(200, FIO_STATEMENT));
    const txs = await fetchFioTransactions({ token: FIO_TOKEN, from: '2026-11-01', to: '2026-11-13', fetchImpl });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`https://fioapi.fio.cz/v1/rest/periods/${FIO_TOKEN}/2026-11-01/2026-11-13/transactions.json`);
    expect(calls[0].url.startsWith(FIO_API_BASE)).toBe(true);
    expect(calls[0].init.method).toBe('GET');
    expect(txs).toEqual(EXPECTED_TRANSACTIONS);
  });

  it('prázdné období vrátí prázdný seznam', () => {
    const info = FIO_STATEMENT.accountStatement.info;
    expect(parseFioStatement({ accountStatement: { info, transactionList: { transaction: [] } } })).toEqual([]);
    expect(parseFioStatement({ accountStatement: { info, transactionList: null } })).toEqual([]);
  });

  it('HTTP 409 (častěji než jednou za 30 s) vyhodí českou chybu bez tokenu', async () => {
    const { fetchImpl } = fakeFetch(() => new Response('', { status: 409 }));
    const error = await fetchFioTransactions({ token: FIO_TOKEN, from: '2026-11-01', to: '2026-11-13', fetchImpl }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FioError);
    expect(error).toMatchObject({ code: 'too_frequent', status: 409, retryable: true });
    expect((error as FioError).message).toContain('30 sekund');
    expect((error as FioError).message).not.toContain(FIO_TOKEN);
  });

  it.each([
    [500, 'server_error', true, 'token'],
    [503, 'unavailable', true, 'dočasně nedostupné'],
    [413, 'too_many_items', false, 'zkraťte období'],
    [404, 'rejected', false, 'HTTP 404'],
    [422, 'rejected', false, '90 dní'],
  ])('HTTP %i → %s', async (status, code, retryable, text) => {
    const { fetchImpl } = fakeFetch(() => new Response('chyba', { status }));
    const error = await fetchFioTransactions({ token: FIO_TOKEN, from: '2026-11-01', to: '2026-11-13', fetchImpl }).catch((e: unknown) => e);
    expect(error).toMatchObject({ name: 'FioError', code, status, retryable });
    expect((error as FioError).message).toContain(text);
    expect((error as FioError).message).not.toContain(FIO_TOKEN);
  });

  it('síťová chyba ani neplatná odpověď neprozradí token', async () => {
    // Deno uvádí v síťové chybě celou URL – i s tokenem
    const failing = failingFetch(
      new TypeError(`error sending request for url (${FIO_API_BASE}/periods/${FIO_TOKEN}/2026-11-01/2026-11-13/transactions.json)`),
    );
    const network = await fetchFioTransactions({ token: FIO_TOKEN, from: '2026-11-01', to: '2026-11-13', fetchImpl: failing.fetchImpl }).catch(
      (e: unknown) => e,
    );
    expect(network).toMatchObject({ code: 'network', retryable: true });
    expect((network as FioError).message).toContain('Nepodařilo se spojit s Fio API');
    expect((network as FioError).message).not.toContain(FIO_TOKEN);

    const html = fakeFetch(() => new Response('<html>Údržba</html>', { status: 200 }));
    await expect(fetchFioTransactions({ token: FIO_TOKEN, from: '2026-11-01', to: '2026-11-13', fetchImpl: html.fetchImpl })).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });

  it('neplatné období nebo chybějící token se vůbec neposílá', async () => {
    const { fetchImpl, calls } = fakeFetch(() => jsonResponse(200, FIO_STATEMENT));
    for (const cfg of [
      { token: '', from: '2026-11-01', to: '2026-11-13' },
      { token: FIO_TOKEN, from: '2026-11-31', to: '2026-12-01' },
      { token: FIO_TOKEN, from: '1. 11. 2026', to: '2026-11-13' },
      { token: FIO_TOKEN, from: '2026-11-13', to: '2026-11-01' },
    ]) {
      await expect(fetchFioTransactions({ ...cfg, fetchImpl })).rejects.toMatchObject({ code: 'config', retryable: false });
    }
    expect(calls).toHaveLength(0);
  });
});

describe('Fio banka – párování plateb', () => {
  it('spáruje výpis s čekajícími výzvami podle VS a částky', () => {
    const requests = [
      request('r1', '26110007', 1190),
      request('r2', '26110008', 2490),
      request('r3', '26110009', 50), // zaplaceno v EUR
      request('r4', '26110010', 1190), // nedoplatek 900 Kč
      request('r5', '26110011', 500, { status: 'paid' }),
    ];
    expect(matchBankPayments(requests, EXPECTED_TRANSACTIONS)).toEqual([
      { requestId: 'r1', transactionId: '26000000001', amount: 1190 },
      { requestId: 'r2', transactionId: '26000000004', amount: 2490 },
    ]);
  });

  it('VS musí sedět přesně (bez úvodních nul), nedoplatek se nepáruje, zaokrouhlení ±0,50 Kč ano', () => {
    const requests = [request('a', '26110007', 1190), request('b', '026110008', 990), request('c', '26110009', 1190), request('d', '2611001', 300)];
    const matches = matchBankPayments(requests, [
      tx('t1', '26110007', 1189.5), // zaokrouhleno dolů o 50 haléřů
      tx('t2', '0026110008', 990), // úvodní nuly na výpisu i ve výzvě
      tx('t3', '26110009', 1189.49), // nedoplatek
      tx('t4', '26110010', 300), // jiný VS (podobný, ale ne stejný)
    ]);
    expect(matches).toEqual([
      { requestId: 'a', transactionId: 't1', amount: 1189.5 },
      { requestId: 'b', transactionId: 't2', amount: 990 },
    ]);
  });

  it('přeplatek se páruje, jen čekající výzvy, jen příchozí CZK, bez VS nic', () => {
    const requests = [
      request('over', '1001', 1000),
      request('paid', '1002', 1000, { status: 'paid' }),
      request('cancelled', '1003', 1000, { status: 'cancelled' }),
      request('eur', '1004', 1000),
      request('out', '1005', 1000),
    ];
    expect(
      matchBankPayments(requests, [
        tx('t1', '1001', 1500),
        tx('t2', '1002', 1000),
        tx('t3', '1003', 1000),
        tx('t4', '1004', 1000, '2026-11-03', 'EUR'),
        tx('t5', '1005', -1000),
        tx('t6', undefined, 1000),
      ]),
    ).toEqual([{ requestId: 'over', transactionId: 't1', amount: 1500 }]);
  });

  it('každá platba i výzva se použije nejvýše jednou', () => {
    // dvě platby se stejným VS → jen první (podle data)
    expect(matchBankPayments([request('r1', '5005', 700)], [tx('later', '5005', 700, '2026-11-05'), tx('first', '5005', 700, '2026-11-04')])).toEqual([
      { requestId: 'r1', transactionId: 'first', amount: 700 },
    ]);
    // dvě čekající výzvy se stejným VS (nemělo by nastat) a jedna platba → starší výzva
    expect(
      matchBankPayments([request('newer', '6006', 700, { at: '2026-11-02T08:00' }), request('older', '6006', 700, { at: '2026-11-01T08:00' })], [tx('t', '6006', 700)]),
    ).toEqual([{ requestId: 'older', transactionId: 't', amount: 700 }]);
    // stejný pohyb dvakrát (překrývající se stažení) se započítá jednou
    expect(matchBankPayments([request('x', '7007', 100), request('y', '7007', 100)], [tx('dup', '7007', 100), tx('dup', '7007', 100)])).toEqual([
      { requestId: 'x', transactionId: 'dup', amount: 100 },
    ]);
  });

  it('napřed páruje přesné částky, výsledek nezávisí na pořadí vstupu a vstupy nemění', () => {
    const requests = [request('small', '8008', 500, { at: '2026-11-01T08:00' }), request('big', '8008', 1000, { at: '2026-11-01T09:00' })];
    const txs = [tx('t1000', '8008', 1000, '2026-11-02'), tx('t500', '8008', 500, '2026-11-03')];
    const expected = [
      { requestId: 'big', transactionId: 't1000', amount: 1000 },
      { requestId: 'small', transactionId: 't500', amount: 500 },
    ];
    const frozenRequests = Object.freeze([...requests]);
    const frozenTxs = Object.freeze([...txs]);
    expect(matchBankPayments(frozenRequests, frozenTxs)).toEqual(expected);
    expect(matchBankPayments([...requests].reverse(), [...txs].reverse())).toEqual(expected);
  });

  it('normalizuje variabilní symbol', () => {
    expect(normalizeVs('0026110007')).toBe('26110007');
    expect(normalizeVs('000000000026110007')).toBe('26110007');
    expect(normalizeVs(' 26 110 007 ')).toBe('26110007');
    expect(normalizeVs(26110007)).toBe('26110007');
    expect(normalizeVs('0000')).toBeNull();
    expect(normalizeVs('')).toBeNull();
    expect(normalizeVs('VS26110007')).toBeNull();
    expect(normalizeVs('12345678901')).toBeNull();
    expect(normalizeVs(undefined)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Přenositelnost: Node (testy) i Deno (Edge Function)                  */
/* ------------------------------------------------------------------ */

describe('Přenositelnost modulů', () => {
  it('používají jen standardní webová API – žádné moduly Node, DOM ani balíčky z npm', async () => {
    const fs = (await import(/* @vite-ignore */ 'node:' + 'fs')) as {
      readdirSync(path: URL): string[];
      readFileSync(path: URL, encoding: 'utf8'): string;
    };
    const dir = new URL('../server/providers/', import.meta.url);
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ts'));
    expect(files.length).toBeGreaterThanOrEqual(7);
    for (const file of files) {
      const source = fs.readFileSync(new URL(file, dir), 'utf8');
      for (const [, specifier] of source.matchAll(/\bfrom\s+'([^']+)'/g)) {
        expect(specifier.startsWith('./') || specifier.startsWith('../../src/'), `${file}: ${specifier}`).toBe(true);
      }
      expect(source, file).not.toMatch(/\b(process|Buffer|require|__dirname|document|window|localStorage|XMLHttpRequest)\b/);
      expect(source, file).not.toMatch(/\bimport\s*\(/);
    }
  });
});
