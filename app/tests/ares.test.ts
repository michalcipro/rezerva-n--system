import { describe, expect, it } from 'vitest';
import { aresAddress, aresLegalForm, createAresClient, mapAresSubject, registryNoteFromVr } from '../server/providers/ares';
import notFound from './fixtures/ares-not-found.json';
import osvc from './fixtures/ares-osvc.json';
import sro from './fixtures/ares-sro.json';
import sroVr from './fixtures/ares-sro-vr.json';

/**
 * ARES: mapování odpovědí na fakturační údaje. Síť se nepoužívá – odpovědi jsou vzorové (tests/fixtures,
 * tvar podle dokumentace ARES, smyšlené subjekty) a fetch je podstrčený.
 */

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const BASE = 'https://ares.gov.cz/ekonomicke-subjekty-v-be/rest';

/** Podstrčený ARES: odpovědi podle konce adresy (jinak 404), seznam dotazů. */
function fakeAres(routes: Record<string, () => Response | Promise<Response>>): { calls: string[]; fetchImpl: typeof fetch } {
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    const key = Object.keys(routes).find((k) => url.endsWith(k));
    return key ? routes[key]() : json(404, notFound);
  };
  return { calls, fetchImpl };
}

const SRO_ROUTES = {
  '/ekonomicke-subjekty/12345679': () => json(200, sro),
  '/ekonomicke-subjekty-vr/12345679': () => json(200, sroVr),
};

describe('ARES – mapování odpovědi', () => {
  it('s.r.o.: obchodní jméno, sídlo, DIČ, plátce DPH a zápis v obchodním rejstříku (platná spisová značka)', async () => {
    const { calls, fetchImpl } = fakeAres(SRO_ROUTES);
    const r = await createAresClient({ fetchImpl }).lookup('123 456 79');
    expect(r).toEqual({
      ok: true,
      company: {
        ico: '12345679',
        legalName: 'Pohybové studio Test s.r.o.',
        legalForm: 'company',
        dic: 'CZ12345679',
        vatPayer: true,
        registeredAddress: { street: 'Ukázková 299/12', city: 'Brno', zip: '60200' },
        registryNote: 'Společnost zapsaná v obchodním rejstříku vedeném Krajským soudem v Brně, oddíl C, vložka 12345',
      },
    });
    expect(calls).toEqual([`${BASE}/ekonomicke-subjekty/12345679`, `${BASE}/ekonomicke-subjekty-vr/12345679`]);
  });

  it('fyzická osoba: Praha s obvodem, orientační číslo s písmenem, živnostenský rejstřík, bez DIČ', async () => {
    const { calls, fetchImpl } = fakeAres({ '/ekonomicke-subjekty/87654326': () => json(200, osvc) });
    const r = await createAresClient({ fetchImpl }).lookup('87654326');
    expect(r.ok && r.company).toEqual({
      ico: '87654326',
      legalName: 'Jana Testová',
      legalForm: 'person',
      dic: '',
      vatPayer: false,
      registeredAddress: { street: 'Testovací 778/3a', city: 'Praha 4', zip: '14000' },
      registryNote: 'Fyzická osoba zapsaná v živnostenském rejstříku',
    });
    // bez zápisu ve veřejném rejstříku se druhý dotaz neposílá
    expect(calls).toHaveLength(1);
  });

  it('poskytovatel zdravotních služeb (fyzioterapeut OSVČ)', () => {
    const health = { ...osvc, seznamRegistraci: { stavZdrojeRzp: 'NEEXISTUJICI', stavZdrojeNrpzs: 'AKTIVNI' }, pravniForma: '105' };
    expect(mapAresSubject(health, '87654326')?.registryNote).toBe('Fyzická osoba zapsaná v Národním registru poskytovatelů zdravotních služeb');
  });

  it('adresa: obec bez ulic, číslo evidenční, PSČ s nulou na začátku, nestandardizovaná textová adresa', () => {
    expect(aresAddress({ nazevObce: 'Lhota', nazevCastiObce: 'Lhota', cisloDomovni: 25, psc: 2345 })).toEqual({ street: 'Lhota 25', city: 'Lhota', zip: '02345' });
    expect(aresAddress({ nazevObce: 'Vrbno', nazevCastiObce: 'Dolní Vrbno', cisloDomovni: 7, typCisloDomu: 2, psc: 79326 })).toEqual({
      street: 'Dolní Vrbno č. ev. 7',
      city: 'Vrbno',
      zip: '79326',
    });
    expect(aresAddress({ textovaAdresa: 'Náměstí 1, Zábrdovice, 602 00 Brno' })).toEqual({ street: 'Náměstí 1', city: 'Brno', zip: '60200' });
    expect(aresAddress(undefined)).toEqual({ street: '', city: '', zip: '' });
  });

  it('právní forma podle kódu ČSÚ, bez kódu podle názvu', () => {
    expect(['101', '102', '105', '107', '108', '112', '121', '205', '706', '424'].map((c) => aresLegalForm(c, ''))).toEqual([
      'person',
      'person',
      'person',
      'person',
      'person',
      'company',
      'company',
      'company',
      'company',
      'person',
    ]);
    expect(aresLegalForm(undefined, 'Studio Lotos s.r.o.')).toBe('company');
    expect(aresLegalForm(undefined, 'Sportovní klub Test, z. s.')).toBe('company');
    expect(aresLegalForm(undefined, 'Jana Nováková')).toBe('person');
  });

  it('údaj o zápisu: obchodní a spolkový rejstřík, fyzická osoba v obchodním rejstříku, neznámý soud', () => {
    const vr = (soud: string, oddil: string, vlozka: number) => ({ zaznamy: [{ primarniZaznam: true, spisovaZnacka: [{ soud, oddil, vlozka, platnostOd: '2020-01-01' }] }] });
    expect(registryNoteFromVr(vr('MSPH', 'L', 1234), 'company')).toBe('Spolek zapsaný ve spolkovém rejstříku vedeném Městským soudem v Praze, oddíl L, vložka 1234');
    expect(registryNoteFromVr(vr('KSOS', 'A', 77), 'person')).toBe('Fyzická osoba zapsaná v obchodním rejstříku vedeném Krajským soudem v Ostravě, oddíl A, vložka 77');
    expect(registryNoteFromVr(vr('KSHK', 'Dr', 5), 'company')).toBe('Družstvo zapsané v obchodním rejstříku vedeném Krajským soudem v Hradci Králové, oddíl Dr, vložka 5');
    expect(registryNoteFromVr(vr('XYZ', 'B', 42), 'company')).toBe('Společnost zapsaná v obchodním rejstříku, oddíl B, vložka 42');
    expect(registryNoteFromVr({ zaznamy: [] }, 'company')).toBe('');
    expect(registryNoteFromVr(null, 'company')).toBe('');
  });

  it('odpověď bez obchodního jména je neúplná', async () => {
    expect(mapAresSubject({ ico: '12345679' }, '12345679')).toBeNull();
    expect(mapAresSubject('nesmysl', '12345679')).toBeNull();
    const { fetchImpl } = fakeAres({ '/ekonomicke-subjekty/12345679': () => json(200, { ico: '12345679' }) });
    expect(await createAresClient({ fetchImpl }).lookup('12345679')).toEqual({ ok: false, status: 502, error: 'ARES vrátil neúplné údaje – vyplňte je prosím ručně.' });
  });
});

describe('ARES – chyby, časový limit a cache', () => {
  it('neplatné IČO se do ARES vůbec nepošle', async () => {
    const { calls, fetchImpl } = fakeAres({});
    expect(await createAresClient({ fetchImpl }).lookup('12345678')).toEqual({ ok: false, status: 400, error: 'IČO není platné – zkontrolujte číslice.' });
    expect(calls).toEqual([]);
  });

  it('neexistující IČO = 404 s českou hláškou', async () => {
    const { fetchImpl } = fakeAres({});
    const r = await createAresClient({ fetchImpl }).lookup('45244782');
    expect(r).toEqual({ ok: false, status: 404, error: 'Subjekt s IČO 45244782 v ARES neexistuje. Zkontrolujte číslo, nebo údaje vyplňte ručně.' });
  });

  it('výpadek ARES (chyba serveru, síť) = 503 a nepamatuje se – další pokus se zeptá znovu', async () => {
    let down = true;
    const { calls, fetchImpl } = fakeAres({
      '/ekonomicke-subjekty/12345679': () => (down ? json(503, { kod: 'OBECNA_CHYBA' }) : json(200, sro)),
      '/ekonomicke-subjekty-vr/12345679': () => json(200, sroVr),
    });
    const ares = createAresClient({ fetchImpl });
    expect(await ares.lookup('12345679')).toMatchObject({ ok: false, status: 503, error: expect.stringContaining('ARES je teď nedostupný') });
    down = false;
    expect((await ares.lookup('12345679')).ok).toBe(true);
    expect(calls.filter((u) => u.endsWith('/ekonomicke-subjekty/12345679'))).toHaveLength(2);
    const offline: typeof fetch = async () => {
      throw new TypeError('fetch failed');
    };
    expect(await createAresClient({ fetchImpl: offline }).lookup('12345679')).toMatchObject({ ok: false, status: 503 });
  });

  it('časový limit = 504', async () => {
    const hanging: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason ?? new DOMException('Časový limit', 'TimeoutError')));
      });
    const r = await createAresClient({ fetchImpl: hanging, timeoutMs: 20 }).lookup('12345679');
    expect(r).toEqual({ ok: false, status: 504, error: 'ARES neodpověděl včas. Zkuste to prosím za chvíli, nebo údaje vyplňte ručně.' });
  });

  it('krátká cache: stejné IČO se znovu neptá, po vypršení ano', async () => {
    let clock = 1_000;
    const { calls, fetchImpl } = fakeAres(SRO_ROUTES);
    const ares = createAresClient({ fetchImpl, cacheMs: 60_000, now: () => clock });
    await ares.lookup('12345679');
    await ares.lookup('123 456 79');
    expect(calls).toHaveLength(2); // subjekt + rejstřík, podruhé z cache
    clock += 61_000;
    await ares.lookup('12345679');
    expect(calls).toHaveLength(4);
  });

  it('když selže dotaz do rejstříku, údaje se vrátí bez zápisu', async () => {
    const { fetchImpl } = fakeAres({
      '/ekonomicke-subjekty/12345679': () => json(200, sro),
      '/ekonomicke-subjekty-vr/12345679': () => json(500, { kod: 'OBECNA_CHYBA' }),
    });
    const r = await createAresClient({ fetchImpl }).lookup('12345679');
    expect(r.ok && r.company.registryNote).toBe('');
    expect(r.ok && r.company.legalName).toBe('Pohybové studio Test s.r.o.');
  });
});
