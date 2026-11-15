/**
 * ARES – Administrativní registr ekonomických subjektů (Ministerstvo financí): veřejné REST API bez klíče.
 * Načte obchodní jméno, sídlo, DIČ, právní formu a údaj o zápisu do rejstříku pro fakturační údaje provozovny.
 *
 * API (OpenAPI na https://ares.gov.cz/stranky/vyvojar-info):
 *  - GET {ARES_API_BASE}/ekonomicke-subjekty/{ico} → EkonomickySubjekt:
 *      ico, obchodniJmeno, dic (CZ…), pravniForma (kód číselníku právních forem ČSÚ: 101–108 fyzické osoby,
 *      112 s.r.o., 121 a.s., 706 spolek…), sidlo (Adresa: nazevUlice, cisloDomovni, cisloOrientacni,
 *      cisloOrientacniPismeno, nazevObce, nazevCastiObce, nazevMestskehoObvodu, nazevMestskeCastiObvodu, psc,
 *      textovaAdresa, kodStatu) a seznamRegistraci se stavem zdrojů (stavZdrojeVr veřejný rejstřík,
 *      stavZdrojeRzp živnostenský rejstřík, stavZdrojeNrpzs poskytovatelé zdravotních služeb, stavZdrojeDph
 *      plátci DPH; hodnota AKTIVNI = subjekt je ve zdroji veden).
 *      Neexistující IČO = HTTP 404 (Chyba: kod NENALEZENO), chybný dotaz = 400, výpadek = 5xx.
 *  - GET {ARES_API_BASE}/ekonomicke-subjekty-vr/{ico} → záznamy veřejného rejstříku; ze zaznamy[].spisovaZnacka[]
 *    ({ soud: MSPH | KSBR…, oddil: C, vlozka: 12345, platnostDo }) se skládá údaj o zápisu.
 *  - MF si vyhrazuje omezit uživatele s více než 500 dotazy za minutu – proto krátká cache a limit na uživatele
 *    v API platformy.
 *
 * Mapování odpovídá dokumentaci ARES; testy stojí na vzorových odpovědích (síť ze sandboxu vývoje nebyla
 * dostupná). Neznámá nebo chybějící pole se přeskočí – formulář pak doplní majitel ručně.
 */

import type { AresCompany } from '../../src/api/protocol';
import type { BusinessProfile, PostalAddress } from '../../src/domain/types';
import { icoProblem, isValidDic, normalizeDic, normalizeIco } from '../../src/engine/business';
import { defaultFetch, isTimeoutError, readText, timeoutSignal } from './http';

export const ARES_API_BASE = 'https://ares.gov.cz/ekonomicke-subjekty-v-be/rest';

/** Adresa sídla v odpovědi ARES (jen pole, která používáme). */
export interface AresAddress {
  kodStatu?: string;
  nazevObce?: string;
  nazevCastiObce?: string;
  nazevMestskehoObvodu?: string;
  nazevMestskeCastiObvodu?: string;
  nazevUlice?: string;
  cisloDomovni?: number | string;
  cisloOrientacni?: number | string;
  cisloOrientacniPismeno?: string;
  /** 1 = číslo popisné, 2 = číslo evidenční. */
  typCisloDomu?: number | string;
  psc?: number | string;
  pscTxt?: string;
  textovaAdresa?: string;
  cisloDoAdresy?: string;
}

export interface AresSubject {
  ico?: string;
  obchodniJmeno?: string;
  pravniForma?: string;
  dic?: string;
  sidlo?: AresAddress;
  seznamRegistraci?: Record<string, string | undefined>;
}

export type AresLookup = { ok: true; company: AresCompany } | { ok: false; status: 400 | 404 | 502 | 503 | 504; error: string };

export interface AresClient {
  /** Údaje podnikatele podle IČO (s krátkou cache). */
  lookup(ico: string): Promise<AresLookup>;
}

export interface AresOptions {
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  /** Časový limit jednoho dotazu v ms (výchozí 8 000). */
  timeoutMs?: number;
  /** Jak dlouho si pamatovat nalezený subjekt v ms (výchozí 10 minut; neexistující IČO nejvýš minutu). */
  cacheMs?: number;
  /** Hodiny pro cache (testy). */
  now?: () => number;
  log?: (message: string, detail?: Record<string, unknown>) => void;
}

const UNAVAILABLE = 'ARES je teď nedostupný. Zkuste to prosím za chvíli, nebo údaje vyplňte ručně.';
const TIMEOUT = 'ARES neodpověděl včas. Zkuste to prosím za chvíli, nebo údaje vyplňte ručně.';
const INCOMPLETE = 'ARES vrátil neúplné údaje – vyplňte je prosím ručně.';

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
const active = (s: AresSubject, source: string): boolean => s.seznamRegistraci?.[source] === 'AKTIVNI';

/* ------------------------------------------------------------------ */
/* Mapování odpovědi                                                   */
/* ------------------------------------------------------------------ */

/** Číslo domu: popisné / orientační („778/3a“), evidenční s předponou „č. ev.“. */
function houseNumber(a: AresAddress): string {
  const domovni = text(a.cisloDomovni);
  const orientacni = text(a.cisloOrientacni) ? `${text(a.cisloOrientacni)}${text(a.cisloOrientacniPismeno)}` : '';
  let n = domovni && text(a.typCisloDomu) === '2' ? `č. ev. ${domovni}` : domovni;
  if (orientacni) n = n ? `${n}/${orientacni}` : orientacni;
  return n || text(a.cisloDoAdresy);
}

/** Sídlo z ARES: ulice s číslem (bez ulice část obce), obec (v Praze „Praha 4“), PSČ jako 5 číslic. */
export function aresAddress(a: AresAddress | undefined): PostalAddress {
  if (!a) return { street: '', city: '', zip: '' };
  const place = text(a.nazevUlice) || text(a.nazevCastiObce) || text(a.nazevObce);
  const no = houseNumber(a);
  let street = place && no ? `${place} ${no}` : '';
  const prague = [a.nazevMestskehoObvodu, a.nazevMestskeCastiObvodu].map(text).find((x) => /^Praha \d+$/.test(x));
  let city = prague ?? text(a.nazevObce);
  const czech = !a.kodStatu || a.kodStatu === 'CZ';
  let zip = typeof a.psc === 'number' && czech ? String(a.psc).padStart(5, '0') : text(a.psc ?? a.pscTxt).replace(/\s+/g, '');
  // nestandardizovaná adresa: dopočítat z textu „Ulice 12, Část obce, 602 00 Brno“
  const textual = text(a.textovaAdresa);
  if (textual && (!street || !city || !zip)) {
    const parts = textual.split(',').map((x) => x.trim()).filter(Boolean);
    const m = /^(\d{3}\s?\d{2})\s+(.+)$/.exec(parts[parts.length - 1] ?? '');
    if (m) {
      zip ||= m[1].replace(/\s+/g, '');
      city ||= m[2];
    }
    if (!street && parts.length > 1) street = parts[0];
  }
  return { street, city, zip };
}

/** Právní forma: kódy 101–108 (fyzické osoby podnikající) a 424/425 (zahraniční fyzická osoba) = person. */
export function aresLegalForm(code: string | undefined, name: string): BusinessProfile['legalForm'] {
  const c = text(code);
  if (c) return /^10\d$/.test(c) || c === '424' || c === '425' ? 'person' : 'company';
  return /\b(s\.\s?r\.\s?o\.|spol\.|a\.\s?s\.|z\.\s?s\.|o\.\s?p\.\s?s\.|v\.\s?o\.\s?s\.|k\.\s?s\.|z\.\s?ú\.)|družstvo/i.test(name) ? 'company' : 'person';
}

/** Rejstříkové soudy (kódy ARES) v 7. pádě – „vedeném Krajským soudem v Brně“. */
const COURTS: Readonly<Record<string, string>> = {
  MSPH: 'Městským soudem v Praze',
  KSPH: 'Krajským soudem v Praze',
  KSCB: 'Krajským soudem v Českých Budějovicích',
  KSPL: 'Krajským soudem v Plzni',
  KSUL: 'Krajským soudem v Ústí nad Labem',
  KSHK: 'Krajským soudem v Hradci Králové',
  KSBR: 'Krajským soudem v Brně',
  KSOS: 'Krajským soudem v Ostravě',
};

const COMMERCIAL_SECTIONS = new Set(['A', 'B', 'C', 'Dr', 'Pr']);

interface FileNumber {
  soud: string;
  oddil: string;
  vlozka: string;
}

/** Platná spisová značka z odpovědi ekonomicke-subjekty-vr (primární záznam, značka bez konce platnosti). */
function fileNumber(vr: unknown): FileNumber | null {
  const zaznamy = (vr as { zaznamy?: unknown } | null)?.zaznamy;
  if (!Array.isArray(zaznamy) || !zaznamy.length) return null;
  const zaznam = (zaznamy.find((z) => (z as { primarniZaznam?: unknown })?.primarniZaznam === true) ?? zaznamy[0]) as { spisovaZnacka?: unknown } | null;
  const list = Array.isArray(zaznam?.spisovaZnacka) ? (zaznam.spisovaZnacka as Record<string, unknown>[]) : [];
  const current = list.find((x) => x && !x.platnostDo) ?? list[list.length - 1];
  if (!current) return null;
  const oddil = text(current.oddil);
  const vlozka = text(current.vlozka);
  return oddil && vlozka ? { soud: text(current.soud).toUpperCase(), oddil, vlozka } : null;
}

/** Údaj o zápisu z veřejného rejstříku, např. „Společnost zapsaná v obchodním rejstříku vedeném Krajským soudem v Brně, oddíl C, vložka 12345“. */
export function registryNoteFromVr(vr: unknown, legalForm: BusinessProfile['legalForm']): string {
  const f = fileNumber(vr);
  if (!f) return '';
  const court = COURTS[f.soud];
  let who: string;
  let register: string;
  if (COMMERCIAL_SECTIONS.has(f.oddil)) {
    register = 'v obchodním rejstříku';
    who = legalForm === 'person' ? 'Fyzická osoba zapsaná' : f.oddil === 'Dr' ? 'Družstvo zapsané' : 'Společnost zapsaná';
  } else if (f.oddil === 'L') {
    register = 've spolkovém rejstříku';
    who = 'Spolek zapsaný';
  } else {
    register = 've veřejném rejstříku';
    who = 'Zapsáno';
  }
  return `${who} ${register}${court ? ` vedeném ${court}` : ''}, oddíl ${f.oddil}, vložka ${f.vlozka}`;
}

/** Údaj o zápisu bez veřejného rejstříku (fyzická osoba v živnostenském rejstříku nebo v registru zdravotních služeb). */
function otherRegistryNote(s: AresSubject, legalForm: BusinessProfile['legalForm']): string {
  if (legalForm !== 'person') return '';
  if (active(s, 'stavZdrojeRzp')) return 'Fyzická osoba zapsaná v živnostenském rejstříku';
  if (active(s, 'stavZdrojeNrpzs')) return 'Fyzická osoba zapsaná v Národním registru poskytovatelů zdravotních služeb';
  return '';
}

/**
 * Odpověď ekonomicke-subjekty/{ico} → fakturační údaje. Údaj o zápisu z veřejného rejstříku doplní
 * `registryNoteFromVr` z druhého dotazu (tady jen živnostenský rejstřík a registr zdravotních služeb).
 * null = odpověď nemá obchodní jméno (neúplná data).
 */
export function mapAresSubject(json: unknown, ico: string): AresCompany | null {
  if (!json || typeof json !== 'object') return null;
  const s = json as AresSubject;
  const legalName = text(s.obchodniJmeno);
  if (!legalName) return null;
  const legalForm = aresLegalForm(s.pravniForma, legalName);
  const dic = normalizeDic(text(s.dic));
  return {
    ico: normalizeIco(text(s.ico)) || ico,
    legalName,
    legalForm,
    dic: isValidDic(dic) ? dic : '',
    vatPayer: active(s, 'stavZdrojeDph'),
    registeredAddress: aresAddress(s.sidlo),
    registryNote: otherRegistryNote(s, legalForm),
  };
}

/* ------------------------------------------------------------------ */
/* Dotazy                                                              */
/* ------------------------------------------------------------------ */

type Fetched = { status: number; json: unknown } | { failure: 'timeout' | 'network' };

export function createAresClient(opts: AresOptions = {}): AresClient {
  const fetchImpl = opts.fetchImpl ?? defaultFetch;
  const base = (opts.baseUrl ?? ARES_API_BASE).replace(/\/$/, '');
  const timeoutMs = opts.timeoutMs ?? 8_000;
  const cacheMs = opts.cacheMs ?? 10 * 60_000;
  const now = opts.now ?? (() => Date.now());
  const log = opts.log ?? (() => undefined);
  const cache = new Map<string, { result: AresLookup; until: number }>();

  async function get(path: string): Promise<Fetched> {
    try {
      const res = await fetchImpl(`${base}${path}`, { headers: { accept: 'application/json' }, signal: timeoutSignal(timeoutMs) });
      const body = await readText(res);
      let json: unknown = null;
      try {
        json = body ? JSON.parse(body) : null;
      } catch {
        json = null;
      }
      return { status: res.status, json };
    } catch (e) {
      return { failure: isTimeoutError(e) ? 'timeout' : 'network' };
    }
  }

  async function fetchCompany(ico: string): Promise<AresLookup> {
    const main = await get(`/ekonomicke-subjekty/${ico}`);
    if ('failure' in main) {
      log('ARES neodpověděl', { failure: main.failure });
      return { ok: false, status: main.failure === 'timeout' ? 504 : 503, error: main.failure === 'timeout' ? TIMEOUT : UNAVAILABLE };
    }
    if (main.status === 404) return { ok: false, status: 404, error: `Subjekt s IČO ${ico} v ARES neexistuje. Zkontrolujte číslo, nebo údaje vyplňte ručně.` };
    if (main.status === 400) return { ok: false, status: 400, error: 'ARES dotaz odmítl – zkontrolujte IČO.' };
    if (main.status !== 200) {
      log('ARES vrátil chybu', { status: main.status });
      return { ok: false, status: 503, error: UNAVAILABLE };
    }
    const company = mapAresSubject(main.json, ico);
    if (!company) return { ok: false, status: 502, error: INCOMPLETE };
    // zápis ve veřejném rejstříku (spisová značka) je jen v odpovědi rejstříku; když selže, zůstane bez něj
    if (active(main.json as AresSubject, 'stavZdrojeVr')) {
      const vr = await get(`/ekonomicke-subjekty-vr/${ico}`);
      if (!('failure' in vr) && vr.status === 200) {
        const note = registryNoteFromVr(vr.json, company.legalForm);
        if (note) company.registryNote = note;
      }
    }
    return { ok: true, company };
  }

  return {
    async lookup(raw) {
      const ico = normalizeIco(raw);
      const invalid = icoProblem(ico);
      if (invalid) return { ok: false, status: 400, error: invalid };
      const hit = cache.get(ico);
      if (hit && hit.until > now()) return hit.result;
      const result = await fetchCompany(ico);
      // nalezený subjekt a „neexistuje“ si pamatujeme; výpadek ARES ne – další pokus se zeptá znovu
      if (result.ok || result.status === 404) {
        if (cache.size > 500) cache.clear();
        cache.set(ico, { result, until: now() + (result.ok ? cacheMs : Math.min(cacheMs, 60_000)) });
      }
      return result;
    },
  };
}
