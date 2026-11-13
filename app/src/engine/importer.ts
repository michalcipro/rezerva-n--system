/**
 * Import dat ze stávajícího systému (export z Excelu uložený jako CSV).
 *
 *   parseCsv(text)                    → tabulka: oddělovač ; , nebo tabulátor, uvozovky, CRLF, BOM
 *   readImportFile('clients', text)   → rozpoznané sloupce (česky i anglicky), řádky a chyby souboru
 *   checkClientRows / checkPackageRows / checkCreditRows → náhled: co se s každým řádkem stane
 *   importClients / importPackages / importCredits       → příkazy (jen majitelka a recepce)
 *
 * Příkazy řádky kontrolují znovu stejnými funkcemi jako náhled – na serveru i v prohlížeči
 * dopadne import stejně. Čistý kód enginu: žádné API prohlížeče, výsledek závisí jen na stavu,
 * vstupu a `ctx.now`.
 */
import type {
  Client,
  ClientConsents,
  ClientPackage,
  ClinicState,
  Command,
  Ctx,
  Id,
  LocalDate,
  LocalDateTime,
  PackageTemplate,
} from '../domain/types';
import { pushAudit } from './auditLog';
import { fail, ok } from './commands';
import { countLabel, formatDate, formatMoney } from './format';
import { isAnonymized } from './gdpr';
import { newId } from './ids';
import { addDays, dateOf, pad2 } from './time';

/* ------------------------------------------------------------------ */
/* Konstanty                                                           */
/* ------------------------------------------------------------------ */

export type ImportKind = 'clients' | 'packages' | 'credits';

/** Zdroj souhlasů zapsaných importem. */
export const IMPORT_SOURCE = 'import ze stávajícího systému';
/** Poznámka pohybu kreditu převedeného ze starého systému. */
export const CREDIT_TRANSFER_NOTE = 'Převod zůstatku ze stávajícího systému';
/** Přípona názvu převedené permanentky (vidí ji personál i klient). */
export const IMPORTED_PACKAGE_SUFFIX = ' (převod)';
/** Nejvíc řádků v jednom souboru. */
export const MAX_IMPORT_ROWS = 5000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Permanentka převedená ze stávajícího systému. Pole `importedAt` v `ClientPackage`
 * (domain/types.ts) zatím chybí – import ho zapisuje, typ je proto rozšířený tady.
 */
export type ImportedPackage = ClientPackage & { importedAt?: LocalDateTime };

export function isImportedPackage(p: ClientPackage): boolean {
  return !!(p as ImportedPackage).importedAt;
}

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

export type CsvDelimiter = ';' | ',' | '\t';

export interface CsvRecord {
  /** Číslo řádku tak, jak ho ukáže Excel (hlavička = 1). */
  row: number;
  cells: string[];
}

export interface CsvTable {
  delimiter: CsvDelimiter;
  header: string[];
  /** Číslo řádku s hlavičkou (prázdné řádky na začátku se přeskočí). */
  headerRow: number;
  /** Datové řádky bez prázdných. */
  records: CsvRecord[];
  warnings: string[];
}

/** Pořadí při shodě: středník (český Excel), tabulátor (zkopírované buňky), čárka. */
const DELIMITERS: readonly CsvDelimiter[] = [';', '\t', ','];

/** Oddělovač podle prvního neprázdného řádku (mimo uvozovky). */
export function detectDelimiter(text: string): CsvDelimiter {
  const counts: Record<CsvDelimiter, number> = { ';': 0, ',': 0, '\t': 0 };
  let quoted = false;
  let seen = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      quoted = !quoted;
      seen = true;
      continue;
    }
    if (quoted) continue;
    if (ch === '\n' || ch === '\r') {
      if (seen) break;
      continue;
    }
    if (ch === ';' || ch === ',' || ch === '\t') {
      counts[ch]++;
      seen = true;
    } else if (ch.trim()) seen = true;
  }
  let best: CsvDelimiter = ';';
  for (const d of DELIMITERS) if (counts[d] > counts[best]) best = d;
  return best;
}

/** Rozdělí text na řádky a buňky (RFC 4180 s tolerancí k drobným chybám z Excelu). */
function splitCsv(text: string, sep: CsvDelimiter): { rows: string[][]; unterminated: boolean } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let wasQuoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && !wasQuoted && field.trim() === '') {
      quoted = true;
      wasQuoted = true;
      field = '';
      continue;
    }
    if (ch === sep) {
      row.push(field);
      field = '';
      wasQuoted = false;
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      wasQuoted = false;
      if (ch === '\r' && text[i + 1] === '\n') i++;
      continue;
    }
    field += ch;
  }
  if (quoted || wasQuoted || field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return { rows, unterminated: quoted };
}

/**
 * Načte CSV: odstraní BOM, pozná oddělovač (; , tabulátor; respektuje Excelový řádek „sep=;“),
 * zvládne buňky v uvozovkách (i s oddělovačem, zdvojenými uvozovkami a zalomením řádku) a CRLF.
 */
export function parseCsv(input: string, delimiter?: CsvDelimiter): CsvTable {
  let text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  let sep = delimiter;
  const hint = /^sep=([;,\t])[ ]*(\r\n|\n|\r|$)/i.exec(text);
  if (hint) {
    sep = sep ?? (hint[1] as CsvDelimiter);
    text = text.slice(hint[0].length);
  }
  sep = sep ?? detectDelimiter(text);
  const { rows, unterminated } = splitCsv(text, sep);
  const warnings = unterminated ? ['V souboru jsou neuzavřené uvozovky – zkontrolujte poslední řádky.'] : [];
  const headerIndex = rows.findIndex((cells) => cells.some((c) => c.trim() !== ''));
  if (headerIndex < 0) return { delimiter: sep, header: [], headerRow: 0, records: [], warnings };
  const header = rows[headerIndex].map((c) => c.replace(/^﻿/, '').trim());
  const records: CsvRecord[] = [];
  for (let i = headerIndex + 1; i < rows.length; i++) {
    if (rows[i].some((c) => c.trim() !== '')) records.push({ row: i + 1, cells: rows[i] });
  }
  return { delimiter: sep, header, headerRow: headerIndex + 1, records, warnings };
}

/** Sestaví CSV pro Excel (středník, CRLF, uvozovky jen kde je třeba). */
export function toCsv(rows: readonly (readonly (string | number)[])[], delimiter: CsvDelimiter = ';'): string {
  const cell = (v: string | number): string => {
    const s = String(v);
    return s.includes(delimiter) || /["\r\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(delimiter)).join('\r\n') + '\r\n';
}

/* ------------------------------------------------------------------ */
/* Hodnoty                                                             */
/* ------------------------------------------------------------------ */

/** Malá písmena bez diakritiky, jednoduché mezery. */
export function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Klíč názvu sloupce: „E-mail“ → „email“, „Zbývá vstupů“ → „zbyvavstupu“. */
export function headerKey(value: string): string {
  return fold(value).replace(/[^a-z0-9]/g, '');
}

export function normalizeEmail(value: string): string {
  return value
    .trim()
    .replace(/^mailto:/i, '')
    .replace(/^<(.*)>$/, '$1')
    .trim()
    .toLowerCase();
}

export const isValidEmail = (email: string): boolean => EMAIL_RE.test(email);

/** Klíč telefonu pro porovnání: české číslo = posledních 9 číslic. */
export function phoneKey(value: string): string {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 12 && digits.startsWith('420')) return digits.slice(3);
  return digits;
}

/** Telefon v jednotném tvaru („+420 777 123 456“), nebo null, když nedává smysl. */
export function normalizePhone(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  let s = raw.replace(/[\s  ().\-/]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (!/^\+?\d+$/.test(s)) return null;
  const digits = s.replace('+', '');
  const cz = (nine: string): string => `+420 ${nine.slice(0, 3)} ${nine.slice(3, 6)} ${nine.slice(6)}`;
  if (!s.startsWith('+') && digits.length === 9) return cz(digits);
  if (digits.length === 12 && digits.startsWith('420')) return cz(digits.slice(3));
  if (digits.length < 9 || digits.length > 15) return null;
  return s.startsWith('+') ? s : '+' + s;
}

const daysInMonth = (y: number, m: number): number => [31, y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];

/** Datum „15. 3. 1985“, „15.03.1985“ nebo „1985-03-15“ (případně s časem) → '1985-03-15'. */
export function parseDate(value: string): LocalDate | null {
  const s = value.replace(/[  ]/g, ' ').trim();
  if (!s) return null;
  let y: number;
  let m: number;
  let d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?$/.exec(s);
  if (iso) {
    y = Number(iso[1]);
    m = Number(iso[2]);
    d = Number(iso[3]);
  } else {
    const cz = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/.exec(s);
    if (!cz) return null;
    d = Number(cz[1]);
    m = Number(cz[2]);
    y = Number(cz[3]);
  }
  if (y < 1000 || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** Číslo z Excelu: „1 500“, „1 500 Kč“, „1500,50“, „1.500,50“, „1,500.50“. */
export function parseNumber(value: string | number | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  let s = value.replace(/[\s  ]/g, '');
  if (!s) return null;
  s = s.replace(/^(kč|czk)/i, '').replace(/(kč|czk|,-|\.-)$/i, '');
  let sign = 1;
  if (/^[-−–]/.test(s)) {
    sign = -1;
    s = s.slice(1);
  }
  let n: number;
  if (/^\d+$/.test(s)) n = Number(s);
  else if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) n = Number(s.replace(/\./g, '').replace(',', '.'));
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) n = Number(s.replace(/,/g, ''));
  else if (/^\d*,\d+$/.test(s)) n = Number(s.replace(',', '.'));
  else if (/^\d*\.\d+$/.test(s)) n = Number(s);
  else return null;
  return Number.isFinite(n) ? sign * n : null;
}

const YES = new Set(['ano', 'a', 'yes', 'y', 'true', 'pravda', '1', 'x', '✓', '✔', '+', 'ok', 'souhlas', 'souhlasi', 'udelen', 'udeleno', 'udeleny']);
const NO = new Set(['', 'ne', 'n', 'no', 'false', 'nepravda', '0', '-', '–', '—', 'nesouhlas', 'nesouhlasi', 'neudelen', 'neudeleno', 'odvolan', 'odvolano']);
const DATE_IN_TEXT = /(\d{1,2}\.\s*\d{1,2}\.\s*\d{4}|\d{4}-\d{1,2}-\d{1,2})/;

export interface YesNo {
  value: boolean;
  /** Datum udělení, když ho soubor uvádí (místo „ano“ datum, nebo „ano 12. 3. 2024“). */
  date?: LocalDate;
}

/** „ano“ / „ne“ / „1“ / „x“ / datum udělení… → hodnota; null = nesrozumitelné. */
export function parseYesNo(value: string | boolean | undefined): YesNo | null {
  if (typeof value === 'boolean') return { value };
  // vstup příkazu může přijít odkudkoli (server) – čísla a jiné typy převedeme na text
  const raw = value === undefined || value === null ? '' : String(value).trim();
  const key = fold(raw);
  if (YES.has(key)) return { value: true };
  if (NO.has(key)) return { value: false };
  const date = parseDate(raw);
  if (date) return { value: true, date };
  if (/^(ano|yes|a|souhlas)\b/.test(key)) {
    const m = DATE_IN_TEXT.exec(raw);
    const at = m ? parseDate(m[1]) : null;
    return at ? { value: true, date: at } : { value: true };
  }
  if (/^(ne|no|nesouhlas)\b/.test(key)) return { value: false };
  return null;
}

/** Štítky oddělené čárkou, středníkem nebo svislou čarou; bez duplicit. */
export function splitTags(value: string | readonly string[] | undefined): string[] {
  const parts: unknown[] = typeof value === 'string' ? value.split(/[,;|]/) : Array.isArray(value) ? value : [];
  const out: string[] = [];
  for (const p of parts) {
    const t = String(p ?? '').replace(/\s+/g, ' ').trim();
    if (t && !out.some((x) => x.toLocaleLowerCase('cs') === t.toLocaleLowerCase('cs'))) out.push(t);
  }
  return out;
}

/** Jméno bez nadbytečných mezer; „NOVÁKOVÁ“ → „Nováková“. */
export function cleanName(value: string): string {
  const t = value.replace(/\s+/g, ' ').trim();
  if (t.length > 1 && t === t.toLocaleUpperCase('cs') && t !== t.toLocaleLowerCase('cs')) {
    return t.toLocaleLowerCase('cs').replace(/(^|[\s-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toLocaleUpperCase('cs'));
  }
  return t;
}

/** „Jana Marie Nováková“ → ['Jana Marie', 'Nováková'] (příjmení = poslední slovo). */
export function splitFullName(value: string): [string, string] {
  const t = cleanName(value);
  const i = t.lastIndexOf(' ');
  return i < 0 ? [t, ''] : [t.slice(0, i), t.slice(i + 1)];
}

/** Porovnání jmen bez ohledu na diakritiku, velikost písmen a pořadí slov. */
function nameKey(first: string, last: string): string {
  return fold(`${first} ${last}`).split(' ').filter(Boolean).sort().join(' ');
}

/* ------------------------------------------------------------------ */
/* Sloupce                                                             */
/* ------------------------------------------------------------------ */

export type ClientField =
  | 'firstName'
  | 'lastName'
  | 'fullName'
  | 'email'
  | 'phone'
  | 'birthDate'
  | 'marketingEmail'
  | 'sms'
  | 'health'
  | 'tags'
  | 'note'
  | 'since';
export type PackageField = 'email' | 'phone' | 'name' | 'template' | 'remaining' | 'validUntil' | 'purchasedAt' | 'excuses';
export type CreditField = 'email' | 'phone' | 'name' | 'amount' | 'note';
export type FieldOf<K extends ImportKind> = K extends 'clients' ? ClientField : K extends 'packages' ? PackageField : CreditField;

export interface ColumnSpec<F extends string = string> {
  field: F;
  /** Doporučený název sloupce (jak je v šabloně). */
  label: string;
  /** Rozpoznávané názvy – klíče podle `headerKey`. */
  aliases: readonly string[];
  /** „povinné“, „e-mail nebo telefon“… (pro nápovědu) */
  requirement?: string;
  hint: string;
}

const EMAIL_ALIASES = ['email', 'mail', 'emailovaadresa', 'emailadresa', 'emailaddress', 'eadresa', 'emailklienta', 'kontaktniemail'];
const PHONE_ALIASES = ['telefon', 'tel', 'telefonnicislo', 'cislotelefonu', 'mobil', 'mobilnitelefon', 'mobilnicislo', 'phone', 'phonenumber', 'mobile', 'telefonklienta'];
const NAME_ALIASES = ['jmenoaprijmeni', 'celejmeno', 'klient', 'zakaznik', 'jmenoklienta', 'fullname', 'name', 'clientname', 'customer'];

export const IMPORT_COLUMNS: { [K in ImportKind]: readonly ColumnSpec<FieldOf<K>>[] } = {
  clients: [
    { field: 'firstName', label: 'Jméno', aliases: ['jmeno', 'krestnijmeno', 'firstname', 'givenname', 'first'], requirement: 'povinné', hint: 'Křestní jméno.' },
    { field: 'lastName', label: 'Příjmení', aliases: ['prijmeni', 'lastname', 'surname', 'familyname', 'last'], requirement: 'povinné', hint: 'Příjmení.' },
    { field: 'fullName', label: 'Jméno a příjmení', aliases: NAME_ALIASES, hint: 'Jen když soubor nemá jméno a příjmení zvlášť – příjmení je poslední slovo.' },
    { field: 'email', label: 'E-mail', aliases: EMAIL_ALIASES, requirement: 'e-mail nebo telefon', hint: 'Podle e-mailu poznáme klienta, který už v systému je.' },
    { field: 'phone', label: 'Telefon', aliases: PHONE_ALIASES, requirement: 'e-mail nebo telefon', hint: 'Např. 777 123 456 nebo +420 777 123 456.' },
    { field: 'birthDate', label: 'Datum narození', aliases: ['datumnarozeni', 'narozeni', 'narozen', 'narozena', 'datumnar', 'birthdate', 'dateofbirth', 'birthday', 'dob'], hint: '15. 3. 1985 nebo 1985-03-15.' },
    {
      field: 'marketingEmail',
      label: 'Souhlas e-mail/marketing',
      aliases: ['souhlasemailmarketing', 'souhlasemail', 'souhlasmarketing', 'souhlasmarketingemail', 'souhlasnewsletter', 'souhlasobchodnisdeleni', 'souhlasseobchodnimisdelenimi', 'obchodnisdeleni', 'marketing', 'newsletter', 'marketingconsent', 'emailconsent', 'emailmarketing'],
      hint: 'ano / ne, případně datum udělení. Prázdné = bez souhlasu.',
    },
    { field: 'sms', label: 'Souhlas SMS', aliases: ['souhlassms', 'smssouhlas', 'souhlasssms', 'souhlassesms', 'sms', 'smsconsent'], hint: 'ano / ne. Prázdné = bez souhlasu.' },
    {
      field: 'health',
      label: 'Souhlas zdravotní dokumentace',
      aliases: ['souhlaszdravotnidokumentace', 'souhlaszdravotni', 'zdravotnidokumentace', 'souhlassezdravotnidokumentaci', 'healthconsent'],
      hint: 'ano / ne. Prázdné = bez souhlasu.',
    },
    { field: 'tags', label: 'Štítky', aliases: ['stitky', 'stitek', 'tags', 'tag', 'labels'], hint: 'Oddělené čárkou, např. „záda, sport“.' },
    { field: 'note', label: 'Poznámka', aliases: ['poznamka', 'poznamky', 'internipoznamka', 'komentar', 'note', 'notes', 'comment'], hint: 'Interní poznámka pro recepci (ne zdravotní údaje).' },
    { field: 'since', label: 'Klientem od', aliases: ['klientemod', 'klientod', 'datumregistrace', 'registrace', 'registrovan', 'zalozeno', 'vytvoreno', 'clientsince', 'created', 'createdat'], hint: 'Datum registrace ve stávajícím systému – jinak se klient počítá jako nový ode dne importu.' },
  ],
  packages: [
    { field: 'email', label: 'E-mail', aliases: EMAIL_ALIASES, requirement: 'e-mail nebo telefon', hint: 'E-mail klienta, který už je v systému.' },
    { field: 'phone', label: 'Telefon', aliases: PHONE_ALIASES, requirement: 'e-mail nebo telefon', hint: 'Telefon klienta, když e-mail chybí.' },
    { field: 'name', label: 'Klient', aliases: NAME_ALIASES, hint: 'Jméno klienta – jen pro kontrolu a rozlišení sdíleného telefonu.' },
    { field: 'template', label: 'Permanentka', aliases: ['permanentka', 'nazevpermanentky', 'typpermanentky', 'druhpermanentky', 'permanentkanazev', 'balicek', 'package', 'packagename', 'pass'], requirement: 'povinné', hint: 'Název permanentky přesně jako v Permanentky a kredity.' },
    { field: 'remaining', label: 'Zbývá vstupů', aliases: ['zbyvavstupu', 'zbyva', 'zbyvajicivstupy', 'zbyvajicivstupu', 'zbyvajici', 'volnevstupy', 'volnychvstupu', 'remaining', 'remainingentries', 'entriesleft', 'left'], requirement: 'povinné', hint: 'Celé číslo – kolik vstupů má klient ještě k dispozici.' },
    { field: 'validUntil', label: 'Platí do', aliases: ['platido', 'platnostdo', 'platnost', 'konecplatnosti', 'expirace', 'validuntil', 'validto', 'expires', 'expiry', 'expiration'], requirement: 'povinné', hint: 'Poslední den platnosti, např. 31. 3. 2027.' },
    { field: 'purchasedAt', label: 'Zakoupeno', aliases: ['zakoupeno', 'datumnakupu', 'koupeno', 'prodano', 'datumprodeje', 'purchased', 'purchasedat'], hint: 'Kdy klient permanentku koupil – jinak ho odhadneme z platnosti.' },
    { field: 'excuses', label: 'Zbývá omluvenek', aliases: ['zbyvaomluvenek', 'omluvenky', 'omluvenek', 'zbyvajiciomluvenky', 'excuses', 'excusesleft'], hint: 'Jinak podle šablony permanentky (nejvýš počet zbývajících vstupů).' },
  ],
  credits: [
    { field: 'email', label: 'E-mail', aliases: EMAIL_ALIASES, requirement: 'e-mail nebo telefon', hint: 'E-mail klienta, který už je v systému.' },
    { field: 'phone', label: 'Telefon', aliases: PHONE_ALIASES, requirement: 'e-mail nebo telefon', hint: 'Telefon klienta, když e-mail chybí.' },
    { field: 'name', label: 'Klient', aliases: NAME_ALIASES, hint: 'Jméno klienta – jen pro kontrolu a rozlišení sdíleného telefonu.' },
    { field: 'amount', label: 'Kredit Kč', aliases: ['kreditkc', 'kredit', 'zustatek', 'zustatekkreditu', 'zustatekkc', 'kreditczk', 'castka', 'castkakc', 'credit', 'balance', 'amount'], requirement: 'povinné', hint: 'Zůstatek v korunách, např. 1500 nebo 1 500,00.' },
    { field: 'note', label: 'Poznámka', aliases: ['poznamka', 'note', 'komentar'], hint: 'Připíše se k pohybu kreditu.' },
  ],
};

export interface HeaderMap<F extends string> {
  /** Index sloupce pro každé rozpoznané pole. */
  columns: Partial<Record<F, number>>;
  recognized: { field: F; label: string; header: string }[];
  /** Názvy sloupců, které import nepoužije. */
  ignored: string[];
  /** Kvůli těmto chybám nejde importovat nic (chybí povinný sloupec…). */
  errors: string[];
  warnings: string[];
}

/** Přiřadí sloupce souboru k polím importu (bez ohledu na velikost písmen a diakritiku). */
export function mapHeaders<K extends ImportKind>(kind: K, header: readonly string[]): HeaderMap<FieldOf<K>> {
  type F = FieldOf<K>;
  const specs = IMPORT_COLUMNS[kind] as readonly ColumnSpec<F>[];
  const columns: Partial<Record<F, number>> = {};
  const recognized: HeaderMap<F>['recognized'] = [];
  const ignored: string[] = [];
  const warnings: string[] = [];
  header.forEach((name, index) => {
    const key = headerKey(name);
    if (!key) return;
    const spec = specs.find((s) => s.aliases.includes(key));
    if (!spec) {
      ignored.push(name);
      return;
    }
    if (columns[spec.field] !== undefined) {
      warnings.push(`Sloupec „${name}“ je v souboru víckrát – použijeme první.`);
      return;
    }
    columns[spec.field] = index;
    recognized.push({ field: spec.field, label: spec.label, header: name });
  });
  const has = (f: string): boolean => (columns as Record<string, number | undefined>)[f] !== undefined;
  const errors: string[] = [];
  if (!has('email') && !has('phone')) errors.push('Chybí sloupec E-mail nebo Telefon – podle něj poznáme klienta.');
  if (kind === 'clients') {
    if (!has('firstName') && !has('fullName')) errors.push('Chybí sloupec Jméno (a Příjmení).');
    else if (has('firstName') && !has('lastName') && !has('fullName')) warnings.push('Soubor nemá sloupec Příjmení – jméno a příjmení rozdělíme podle poslední mezery.');
  }
  if (kind === 'packages') {
    if (!has('template')) errors.push('Chybí sloupec Permanentka (název permanentky).');
    if (!has('remaining')) errors.push('Chybí sloupec Zbývá vstupů.');
    if (!has('validUntil')) errors.push('Chybí sloupec Platí do.');
  }
  if (kind === 'credits' && !has('amount')) errors.push('Chybí sloupec Kredit Kč.');
  return { columns, recognized, ignored, errors, warnings };
}

/* ------------------------------------------------------------------ */
/* Řádky ze souboru                                                    */
/* ------------------------------------------------------------------ */

/** Řádek importu klientů – texty ze souboru (engine je sám převede a zkontroluje). */
export interface ClientImportRow {
  /** Číslo řádku v souboru (hlavička = 1); jen pro hlášení. */
  row?: number;
  firstName?: string;
  /** undefined = sloupec v souboru není (jméno se pak rozdělí podle mezery). */
  lastName?: string;
  /** Celé jméno, když soubor nemá jméno a příjmení zvlášť. */
  fullName?: string;
  email?: string;
  phone?: string;
  /** „15. 3. 1985“ nebo „1985-03-15“. */
  birthDate?: string;
  /** ano / ne / datum udělení (nebo boolean). */
  marketingEmail?: string | boolean;
  sms?: string | boolean;
  health?: string | boolean;
  /** Oddělené čárkou (nebo pole). */
  tags?: string | string[];
  note?: string;
  /** Klientem od (datum registrace ve stávajícím systému). */
  since?: string;
}

export interface PackageImportRow {
  row?: number;
  email?: string;
  phone?: string;
  /** Jméno klienta (kontrola, rozlišení sdíleného telefonu). */
  name?: string;
  /** Název šablony permanentky. */
  template?: string;
  remaining?: string | number;
  validUntil?: string;
  purchasedAt?: string;
  excuses?: string | number;
}

export interface CreditImportRow {
  row?: number;
  email?: string;
  phone?: string;
  name?: string;
  amount?: string | number;
  note?: string;
}

export type RowOf<K extends ImportKind> = K extends 'clients' ? ClientImportRow : K extends 'packages' ? PackageImportRow : CreditImportRow;

export interface ImportFile<K extends ImportKind> {
  kind: K;
  delimiter: CsvDelimiter;
  header: string[];
  map: HeaderMap<FieldOf<K>>;
  rows: RowOf<K>[];
  /** Kvůli těmto chybám nejde importovat nic. */
  errors: string[];
  warnings: string[];
}

const KIND_FILE_LABEL: Record<ImportKind, string> = {
  clients: 'klienty',
  packages: 'permanentkami',
  credits: 'kredity',
};

/** Načte soubor pro daný krok importu: tabulka → rozpoznané sloupce → řádky. */
export function readImportFile<K extends ImportKind>(kind: K, text: string): ImportFile<K> {
  const table = parseCsv(text);
  const map = mapHeaders(kind, table.header);
  const errors = [...map.errors];
  const warnings = [...table.warnings, ...map.warnings];
  if (!table.header.length) {
    return { kind, delimiter: table.delimiter, header: [], map, rows: [], errors: ['Soubor je prázdný.'], warnings: [] };
  }
  if (errors.length) {
    const other = (['clients', 'packages', 'credits'] as const).find((k) => k !== kind && mapHeaders(k, table.header).errors.length === 0 && (k !== 'clients' || mapHeaders(k, table.header).columns.firstName !== undefined));
    if (other) errors.push(`Vypadá to na soubor s ${KIND_FILE_LABEL[other]} – nahrajte ho v kroku ${other === 'clients' ? 'Klienti' : other === 'packages' ? 'Permanentky' : 'Kredity'}.`);
  }
  if (!table.records.length) errors.push('Soubor obsahuje jen hlavičku, žádné řádky s daty.');
  if (table.records.length > MAX_IMPORT_ROWS)
    errors.push(`Soubor má ${countLabel(table.records.length, ['řádek', 'řádky', 'řádků'])} – najednou lze importovat nejvýše ${countLabel(MAX_IMPORT_ROWS, ['řádek', 'řádky', 'řádků'])}. Rozdělte ho na menší části.`);
  const cols = map.columns as Record<string, number | undefined>;
  const rows = table.records.map((rec) => {
    const out: Record<string, string | number> = { row: rec.row };
    for (const [field, index] of Object.entries(cols)) {
      if (index !== undefined) out[field] = (rec.cells[index] ?? '').trim();
    }
    return out as unknown as RowOf<K>;
  });
  return { kind, delimiter: table.delimiter, header: table.header, map, rows, errors, warnings };
}

/* ------------------------------------------------------------------ */
/* Kontrola řádků (náhled i příkazy)                                   */
/* ------------------------------------------------------------------ */

export type RowAction = 'create' | 'update' | 'skip' | 'error';

export interface RowIssue {
  level: 'error' | 'warning';
  text: string;
}

export interface ImportCounts {
  created: number;
  updated: number;
  skipped: number;
  errors: number;
}

export interface CheckSummary extends ImportCounts {
  total: number;
  /** Řádky s upozorněním (bez chyby). */
  warnings: number;
}

/** Souhrn náhledu: kolik řádků se vytvoří, aktualizuje, přeskočí a kolik má chybu. */
export function summarizeChecks(checks: readonly { action: RowAction; issues: readonly RowIssue[] }[]): CheckSummary {
  const s: CheckSummary = { total: checks.length, created: 0, updated: 0, skipped: 0, errors: 0, warnings: 0 };
  for (const c of checks) {
    if (c.action === 'create') s.created++;
    else if (c.action === 'update') s.updated++;
    else if (c.action === 'skip') s.skipped++;
    else s.errors++;
    if (c.action !== 'error' && c.issues.some((i) => i.level === 'warning')) s.warnings++;
  }
  return s;
}

const rowNo = (r: { row?: number }, i: number): number => (typeof r.row === 'number' && r.row > 0 ? r.row : i + 2);
const str = (v: string | number | undefined): string => (v === undefined || v === null ? '' : String(v)).trim();

interface ClientLookup {
  byEmail: Map<string, Client>;
  byPhone: Map<string, Client[]>;
}

/** Rejstřík klientů podle e-mailu a telefonu (anonymizované se nepočítají). */
function lookupOf(s: ClinicState): ClientLookup {
  const byEmail = new Map<string, Client>();
  const byPhone = new Map<string, Client[]>();
  for (const c of s.clients) {
    if (isAnonymized(c)) continue;
    const email = normalizeEmail(c.email);
    if (email && !byEmail.has(email)) byEmail.set(email, c);
    const key = c.phone ? phoneKey(c.phone) : '';
    if (key) {
      const list = byPhone.get(key);
      if (list) list.push(c);
      else byPhone.set(key, [c]);
    }
  }
  return { byEmail, byPhone };
}

const fullName = (c: Pick<Client, 'firstName' | 'lastName'>): string => `${c.firstName} ${c.lastName}`;

/** Klient podle e-mailu nebo telefonu (pro permanentky a kredity). */
function findClient(lk: ClientLookup, emailRaw: string, phoneRaw: string, name: string): { client?: Client; error?: string; label: string } {
  const email = normalizeEmail(emailRaw);
  const label = name || emailRaw || phoneRaw || '—';
  if (!email && !phoneRaw) return { error: 'Chybí e-mail nebo telefon klienta.', label };
  if (email) {
    const c = lk.byEmail.get(email);
    if (c) return { client: c, label: fullName(c) };
  }
  const key = phoneRaw ? phoneKey(phoneRaw) : '';
  if (key) {
    let list = lk.byPhone.get(key) ?? [];
    if (list.length > 1 && name) {
      const [first, last] = splitFullName(name);
      const wanted = nameKey(first, last);
      list = list.filter((c) => nameKey(c.firstName, c.lastName) === wanted);
    }
    if (list.length === 1) return { client: list[0], label: fullName(list[0]) };
    if (list.length > 1) return { error: `Telefon ${phoneRaw} má v systému víc klientů – doplňte e-mail nebo jméno klienta.`, label };
  }
  return {
    error: `Klient ${email ? `s e-mailem ${emailRaw}` : `s telefonem ${phoneRaw}`} v systému není – nejdřív ho naimportujte v kroku Klienti.`,
    label,
  };
}

/* ---------------- klienti ---------------- */

export type ImportedConsent = Exclude<keyof ClientConsents, 'gdpr'>;

/** Klient tak, jak ho import založí (nebo jak doplní existujícího). */
export interface ClientDraft {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  birthDate: LocalDate | null;
  tags: string[];
  note: string;
  /** Kdy klient souhlas udělil (null = bez souhlasu). */
  consents: Record<ImportedConsent, LocalDateTime | null>;
  /** Klientem od (null = ode dne importu). */
  since: LocalDate | null;
}

export interface ClientRowCheck {
  row: number;
  action: RowAction;
  issues: RowIssue[];
  data: ClientDraft;
  existingId?: Id;
  matchedBy?: 'email' | 'phone';
  /** Co se u existujícího klienta změní (u aktualizace). */
  changes: string[];
}

const CONSENT_FIELD_LABEL: Record<ImportedConsent, string> = {
  marketingEmail: 'Souhlas e-mail/marketing',
  sms: 'Souhlas SMS',
  health: 'Souhlas zdravotní dokumentace',
};

const CONSENT_CHANGE_LABEL: Record<ImportedConsent, string> = {
  marketingEmail: 'souhlas e-mail/marketing',
  sms: 'souhlas SMS',
  health: 'souhlas zdravotní dokumentace',
};

interface ClientUpdatePlan {
  email?: string;
  phone?: string;
  birthDate?: LocalDate;
  addTags: string[];
  internalNote?: string;
  grant: ImportedConsent[];
  labels: string[];
}

/** Co import u existujícího klienta doplní: neprázdné údaje ze souboru, nové štítky, udělené souhlasy. Jméno ani odvolané souhlasy nemění. */
function planUpdate(existing: Client, data: ClientDraft): ClientUpdatePlan {
  const plan: ClientUpdatePlan = { addTags: [], grant: [], labels: [] };
  if (data.email && !existing.email) {
    plan.email = data.email;
    plan.labels.push('e-mail');
  }
  if (data.phone && phoneKey(data.phone) !== phoneKey(existing.phone)) {
    plan.phone = data.phone;
    plan.labels.push('telefon');
  }
  if (data.birthDate && data.birthDate !== existing.birthDate) {
    plan.birthDate = data.birthDate;
    plan.labels.push('datum narození');
  }
  plan.addTags = data.tags.filter((t) => !existing.tags.some((x) => x.toLocaleLowerCase('cs') === t.toLocaleLowerCase('cs')));
  if (plan.addTags.length) plan.labels.push('štítky');
  if (data.note && !existing.internalNote.includes(data.note)) {
    plan.internalNote = existing.internalNote.trim() ? `${existing.internalNote.trim()}\n${data.note}` : data.note;
    plan.labels.push('poznámka');
  }
  for (const key of ['marketingEmail', 'sms', 'health'] as const) {
    if (key === 'marketingEmail' && !data.email && !existing.email) continue;
    if (data.consents[key] && !existing.consents[key]) {
      plan.grant.push(key);
      plan.labels.push(CONSENT_CHANGE_LABEL[key]);
    }
  }
  return plan;
}

/**
 * Kontrola řádků klientů. Pravidla:
 * - povinné: jméno a příjmení, e-mail nebo telefon; neplatný e-mail = chyba;
 * - klient už v systému: stejný e-mail, nebo stejný telefon a jméno → `onDuplicate` (přeskočit / doplnit údaje);
 * - stejný klient v souboru víckrát: platí první řádek, další se přeskočí;
 * - souhlas s obchodními sděleními a SMS jen tam, kde soubor uvádí „ano“ (nebo datum udělení).
 */
export function checkClientRows(s: ClinicState, rows: readonly ClientImportRow[], onDuplicate: 'skip' | 'update', now: LocalDateTime): ClientRowCheck[] {
  const today = dateOf(now);
  const lk = lookupOf(s);
  const seenEmail = new Map<string, number>();
  const seenPhone = new Map<string, { row: number; name: string }[]>();
  return rows.map((r, i) => {
    const row = rowNo(r, i);
    const issues: RowIssue[] = [];
    const error = (text: string): void => {
      issues.push({ level: 'error', text });
    };
    const warn = (text: string): void => {
      issues.push({ level: 'warning', text });
    };

    // jméno
    let first = cleanName(str(r.firstName));
    let last = cleanName(str(r.lastName));
    if (!first && !last && str(r.fullName)) [first, last] = splitFullName(str(r.fullName));
    else if (first && !last && r.lastName === undefined && first.includes(' ')) [first, last] = splitFullName(first);
    if (!first) error('Chybí jméno.');
    if (!last) error('Chybí příjmení.');

    // kontakt
    const emailRaw = str(r.email);
    const email = normalizeEmail(emailRaw);
    const emailOk = !!email && isValidEmail(email);
    if (emailRaw && !emailOk) error(`Neplatný e-mail „${emailRaw}“.`);
    const phoneRaw = str(r.phone);
    let phone = '';
    if (phoneRaw) {
      const p = normalizePhone(phoneRaw);
      if (p) phone = p;
      else if (emailOk) warn(`Telefon „${phoneRaw}“ nemá platný tvar – nevyplníme ho.`);
      else error(`Neplatný telefon „${phoneRaw}“ (např. 777 123 456).`);
    }
    if (!emailRaw && !phoneRaw) error('Chybí e-mail i telefon – vyplňte aspoň jedno.');

    // nepovinné údaje
    let birthDate: LocalDate | null = null;
    const birthRaw = str(r.birthDate);
    if (birthRaw) {
      const d = parseDate(birthRaw);
      if (!d) warn(`Datum narození „${birthRaw}“ nemá známý tvar (15. 3. 1985 nebo 1985-03-15) – nevyplníme ho.`);
      else if (d > today || d < '1900-01-01') warn(`Datum narození ${formatDate(d)} není možné – nevyplníme ho.`);
      else birthDate = d;
    }
    const consents: ClientDraft['consents'] = { marketingEmail: null, sms: null, health: null };
    for (const key of ['marketingEmail', 'sms', 'health'] as const) {
      const value = r[key];
      if (value === undefined || value === '') continue;
      const yes = parseYesNo(value);
      if (!yes) warn(`${CONSENT_FIELD_LABEL[key]}: neznámá hodnota „${String(value)}“ – bereme jako bez souhlasu.`);
      else if (yes.value) consents[key] = yes.date && yes.date <= today ? `${yes.date}T00:00` : now;
    }
    let since: LocalDate | null = null;
    const sinceRaw = str(r.since);
    if (sinceRaw) {
      const d = parseDate(sinceRaw);
      if (!d || d > today) warn(`Klientem od „${sinceRaw}“ – neplatné datum, použijeme den importu.`);
      else since = d;
    }
    const data: ClientDraft = {
      firstName: first,
      lastName: last,
      email: emailOk ? email : '',
      phone,
      birthDate,
      tags: splitTags(r.tags),
      note: str(r.note).slice(0, 2000),
      consents,
      since,
    };
    const result: ClientRowCheck = { row, action: 'error', issues, data, changes: [] };
    if (issues.some((x) => x.level === 'error')) return result;

    // stejný klient v souboru víckrát
    const pKey = phone ? phoneKey(phone) : '';
    const myName = nameKey(first, last);
    if (data.email && seenEmail.has(data.email)) {
      warn(`Stejný e-mail jako na řádku ${seenEmail.get(data.email)} – řádek přeskočíme.`);
      result.action = 'skip';
      return result;
    }
    const samePhone = !data.email && pKey ? (seenPhone.get(pKey) ?? []) : [];
    const twin = samePhone.find((x) => x.name === myName);
    if (twin) {
      warn(`Stejný klient jako na řádku ${twin.row} – řádek přeskočíme.`);
      result.action = 'skip';
      return result;
    }
    if (data.email) seenEmail.set(data.email, row);
    if (pKey) seenPhone.set(pKey, [...(seenPhone.get(pKey) ?? []), { row, name: myName }]);

    // klient už v systému
    let existing: Client | undefined = data.email ? lk.byEmail.get(data.email) : undefined;
    let matchedBy: 'email' | 'phone' | undefined = existing ? 'email' : undefined;
    if (!existing && pKey) {
      const candidates = (lk.byPhone.get(pKey) ?? []).filter((c) => !data.email || !normalizeEmail(c.email));
      const sameName = candidates.filter((c) => nameKey(c.firstName, c.lastName) === myName);
      if (sameName.length) {
        existing = sameName[0];
        matchedBy = 'phone';
      } else if ((lk.byPhone.get(pKey) ?? []).length) {
        warn(`Stejný telefon má v systému ${fullName((lk.byPhone.get(pKey) ?? [])[0])} – založíme dalšího klienta.`);
      }
    }
    if (!existing) {
      if (data.consents.marketingEmail && !data.email) {
        warn('Souhlas s obchodními sděleními e-mailem nepoužijeme – klient nemá e-mail.');
        data.consents.marketingEmail = null;
      }
      result.action = 'create';
      return result;
    }
    result.existingId = existing.id;
    result.matchedBy = matchedBy;
    if (nameKey(existing.firstName, existing.lastName) !== myName) warn(`V systému je pod tímto ${matchedBy === 'email' ? 'e-mailem' : 'telefonem'} ${fullName(existing)} – jméno ponecháme.`);
    if (onDuplicate === 'skip') {
      warn(`Klient už je v systému (${fullName(existing)}) – přeskočíme.`);
      result.action = 'skip';
      return result;
    }
    const plan = planUpdate(existing, data);
    result.changes = plan.labels;
    if (!plan.labels.length) {
      warn('Klient už je v systému a údaje se shodují – přeskočíme.');
      result.action = 'skip';
    } else {
      warn(`Klient už je v systému – doplníme: ${plan.labels.join(', ')}.`);
      result.action = 'update';
    }
    return result;
  });
}

/* ---------------- permanentky ---------------- */

export interface PackageRowCheck {
  row: number;
  action: Exclude<RowAction, 'update'>;
  issues: RowIssue[];
  clientId?: Id;
  /** Jméno nalezeného klienta, jinak kontakt ze souboru. */
  clientLabel: string;
  templateId?: Id;
  /** Název, pod kterým permanentka vznikne (s příponou „(převod)“). */
  packageName?: string;
  remaining: number | null;
  validUntil: LocalDate | null;
  purchasedAt: LocalDate | null;
  excuses: number | null;
  /** Hodnota jednoho vstupu (cena šablony / počet vstupů). */
  unitValue: number | null;
}

/** Hodnota vstupu stejně jako `packageUsage().unitValue` u prodané permanentky. */
export const templateUnitValue = (t: Pick<PackageTemplate, 'priceCzk' | 'entries'>): number => (t.entries > 0 ? Math.round(t.priceCzk / t.entries) : 0);

function findTemplate(s: ClinicState, name: string): PackageTemplate | undefined {
  const key = fold(name.endsWith(IMPORTED_PACKAGE_SUFFIX) ? name.slice(0, -IMPORTED_PACKAGE_SUFFIX.length) : name);
  const hits = s.packageTemplates.filter((t) => fold(t.name) === key);
  return hits.find((t) => t.active) ?? hits[0];
}

/**
 * Kontrola řádků permanentek: klient (e-mail / telefon) musí v systému být, šablona podle názvu,
 * zbývající vstupy celé číslo, platnost v budoucnu. Prošlé a vyčerpané se přeskočí.
 */
export function checkPackageRows(s: ClinicState, rows: readonly PackageImportRow[], now: LocalDateTime): PackageRowCheck[] {
  const today = dateOf(now);
  const lk = lookupOf(s);
  const seen = new Map<string, number>();
  const imported = new Map<string, LocalDateTime>();
  for (const p of s.packages as ImportedPackage[]) {
    if (p.importedAt && !p.cancelled) imported.set(`${p.clientId}|${p.templateId}|${p.validUntil}`, p.importedAt);
  }
  const activeNames = s.packageTemplates
    .filter((t) => t.active)
    .sort((a, b) => a.order - b.order)
    .map((t) => t.name);
  return rows.map((r, i) => {
    const row = rowNo(r, i);
    const issues: RowIssue[] = [];
    const error = (text: string): void => {
      issues.push({ level: 'error', text });
    };
    const warn = (text: string): void => {
      issues.push({ level: 'warning', text });
    };
    const found = findClient(lk, str(r.email), str(r.phone), str(r.name));
    if (found.error) error(found.error);
    const result: PackageRowCheck = {
      row,
      action: 'error',
      issues,
      clientId: found.client?.id,
      clientLabel: found.label,
      remaining: null,
      validUntil: null,
      purchasedAt: null,
      excuses: null,
      unitValue: null,
    };

    const templateName = str(r.template);
    const tpl = templateName ? findTemplate(s, templateName) : undefined;
    if (!templateName) error('Chybí název permanentky.');
    else if (!tpl)
      error(`Neznámá permanentka „${templateName}“${activeNames.length ? ` – v nabídce je ${activeNames.slice(0, 6).join(', ')}` : ''}. Opravte název, nebo šablonu nejdřív založte.`);
    if (tpl) {
      result.templateId = tpl.id;
      result.packageName = tpl.name + IMPORTED_PACKAGE_SUFFIX;
      result.unitValue = templateUnitValue(tpl);
      if (!tpl.active) warn(`Permanentka ${tpl.name} se už neprodává – převedeme ji i tak.`);
    }

    const remainingRaw = str(r.remaining);
    const remaining = parseNumber(r.remaining);
    if (!remainingRaw) error('Chybí počet zbývajících vstupů.');
    else if (remaining === null || !Number.isInteger(remaining) || remaining < 0) error(`Zbývá vstupů „${remainingRaw}“ – zadejte celé číslo.`);
    else if (remaining > 100) error('Zbývá vstupů: nejvýše 100.');
    else {
      result.remaining = remaining;
      if (tpl && remaining > tpl.entries) warn(`Zbývá víc vstupů (${remaining}), než má permanentka ${tpl.name} (${tpl.entries}) – zkontrolujte.`);
    }

    const validRaw = str(r.validUntil);
    const validUntil = validRaw ? parseDate(validRaw) : null;
    if (!validRaw) error('Chybí datum platnosti (Platí do).');
    else if (!validUntil) error(`Platí do „${validRaw}“ – zadejte datum, např. 31. 3. 2027.`);
    else {
      result.validUntil = validUntil;
      if (validUntil > addDays(today, 3 * 365)) warn('Platnost je delší než 3 roky – zkontrolujte datum.');
    }

    const purchasedRaw = str(r.purchasedAt);
    if (purchasedRaw) {
      const d = parseDate(purchasedRaw);
      if (!d || d > today) warn(`Zakoupeno „${purchasedRaw}“ – neplatné datum, odhadneme ho z platnosti.`);
      else result.purchasedAt = d;
    }
    if (!result.purchasedAt && tpl && validUntil) {
      const estimate = addDays(validUntil, -tpl.validityDays);
      result.purchasedAt = estimate < today ? estimate : today;
    }

    if (tpl && result.remaining !== null) {
      const fallback = Math.min(tpl.excusesAllowed, result.remaining);
      const excusesRaw = str(r.excuses);
      const excuses = excusesRaw ? parseNumber(r.excuses) : fallback;
      if (excuses === null || !Number.isInteger(excuses) || excuses < 0) {
        warn(`Zbývá omluvenek „${excusesRaw}“ – použijeme ${fallback} podle šablony.`);
        result.excuses = fallback;
      } else if (excuses > result.remaining) {
        warn(`Omluvenek nemůže být víc než vstupů – použijeme ${result.remaining}.`);
        result.excuses = result.remaining;
      } else result.excuses = excuses;
    }

    if (issues.some((x) => x.level === 'error')) return result;
    const key = `${result.clientId}|${result.templateId}|${result.validUntil}`;
    if (result.remaining === 0) {
      warn('Žádné zbývající vstupy – permanentku nepřevádíme.');
      result.action = 'skip';
    } else if (result.validUntil && result.validUntil < today) {
      warn(`Platnost skončila ${formatDate(result.validUntil)} – permanentku nepřevádíme.`);
      result.action = 'skip';
    } else if (seen.has(key)) {
      warn(`Stejná permanentka jako na řádku ${seen.get(key)} – řádek přeskočíme.`);
      result.action = 'skip';
    } else if (imported.has(key)) {
      warn(`Tato permanentka už byla převedena ${formatDate(imported.get(key) as string)} – přeskočíme.`);
      result.action = 'skip';
    } else {
      seen.set(key, row);
      result.action = 'create';
    }
    return result;
  });
}

/* ---------------- kredity ---------------- */

export interface CreditRowCheck {
  row: number;
  action: Exclude<RowAction, 'update'>;
  issues: RowIssue[];
  clientId?: Id;
  clientLabel: string;
  /** Celé koruny. */
  amount: number | null;
  note: string;
}

/** Kontrola řádků kreditů: klient musí v systému být, kladná částka; zůstatek se převádí jen jednou. */
export function checkCreditRows(s: ClinicState, rows: readonly CreditImportRow[]): CreditRowCheck[] {
  const lk = lookupOf(s);
  const seen = new Map<Id, number>();
  const transferred = new Map<Id, { at: LocalDateTime; amount: number }>();
  for (const e of s.ledger) {
    if (e.kind === 'adjustment' && e.note.startsWith(CREDIT_TRANSFER_NOTE) && !transferred.has(e.clientId)) transferred.set(e.clientId, { at: e.at, amount: e.amount });
  }
  return rows.map((r, i) => {
    const row = rowNo(r, i);
    const issues: RowIssue[] = [];
    const error = (text: string): void => {
      issues.push({ level: 'error', text });
    };
    const warn = (text: string): void => {
      issues.push({ level: 'warning', text });
    };
    const found = findClient(lk, str(r.email), str(r.phone), str(r.name));
    if (found.error) error(found.error);
    const result: CreditRowCheck = { row, action: 'error', issues, clientId: found.client?.id, clientLabel: found.label, amount: null, note: str(r.note).slice(0, 200) };

    const amountRaw = str(r.amount);
    const amount = parseNumber(r.amount);
    if (!amountRaw) error('Chybí výše kreditu.');
    else if (amount === null) error(`Kredit „${amountRaw}“ není částka – zadejte např. 1500 nebo 1 500,00.`);
    else if (amount < 0) error('Záporný zůstatek nelze převést – dluh vyřešte s klientem zvlášť.');
    else if (amount > 1_000_000) error('Kredit nad 1 000 000 Kč – zkontrolujte částku.');
    else {
      result.amount = Math.round(amount);
      if (!Number.isInteger(amount)) warn(`Zaokrouhleno na celé koruny (${formatMoney(result.amount)}).`);
      if (result.amount > 50_000) warn('Neobvykle vysoký zůstatek – zkontrolujte částku.');
    }

    if (issues.some((x) => x.level === 'error')) return result;
    const clientId = result.clientId as Id;
    const prior = transferred.get(clientId);
    if (result.amount === 0) {
      warn('Nulový zůstatek – nepřevádíme.');
      result.action = 'skip';
    } else if (seen.has(clientId)) {
      warn(`Klient má kredit už na řádku ${seen.get(clientId)} – řádek přeskočíme (částky sečtěte v souboru).`);
      result.action = 'skip';
    } else if (prior) {
      warn(`Zůstatek už byl převeden ${formatDate(prior.at)} (${formatMoney(prior.amount)}) – přeskočíme.`);
      result.action = 'skip';
    } else {
      seen.set(clientId, row);
      result.action = 'create';
    }
    return result;
  });
}

/* ------------------------------------------------------------------ */
/* Příkazy                                                             */
/* ------------------------------------------------------------------ */

export interface ImportResult extends ImportCounts {
  /** Řádky, které se kvůli chybě neimportovaly. */
  failed: { row: number; errors: string[] }[];
}

const canImport = (ctx: Ctx): boolean => ctx.actor.role === 'owner' || ctx.actor.role === 'reception';
const DENIED = 'Import dat může spustit jen majitelka nebo recepce.';

function validRows<T>(rows: unknown): rows is T[] {
  return Array.isArray(rows) && rows.every((r) => !!r && typeof r === 'object');
}

function rowsGuard(rows: unknown): string | null {
  if (!validRows(rows) || !rows.length) return 'Soubor neobsahuje žádné řádky k importu.';
  if (rows.length > MAX_IMPORT_ROWS) return `Najednou lze importovat nejvýše ${countLabel(MAX_IMPORT_ROWS, ['řádek', 'řádky', 'řádků'])}.`;
  return null;
}

function resultOf(checks: readonly { row: number; action: RowAction; issues: readonly RowIssue[] }[], counts: ImportCounts): ImportResult {
  return {
    ...counts,
    failed: checks.filter((c) => c.action === 'error').map((c) => ({ row: c.row, errors: c.issues.filter((i) => i.level === 'error').map((i) => i.text) })),
  };
}

const countsLabel = (c: ImportCounts, created = 'vytvořeno'): string =>
  [`${created} ${c.created}`, ...(c.updated ? [`aktualizováno ${c.updated}`] : []), `přeskočeno ${c.skipped}`, `s chybou ${c.errors}`].join(' · ');

export interface ImportClientsInput {
  rows: ClientImportRow[];
  /** Klient už v systému (stejný e-mail, nebo telefon a jméno): přeskočit, nebo doplnit údaje ze souboru. */
  onDuplicate: 'skip' | 'update';
}

/**
 * Import klientů (jen majitelka a recepce). Každý nový klient dostane souhlas se zpracováním
 * údajů se zdrojem „import ze stávajícího systému“; obchodní sdělení a SMS jen podle souboru.
 * Nic se neodesílá. Řádky s chybou se přeskočí a vrátí v `failed`.
 */
export const importClients: Command<ImportClientsInput, ImportResult> = (d, input, ctx) => {
  if (!canImport(ctx)) return fail(DENIED);
  const guard = rowsGuard(input?.rows);
  if (guard) return fail(guard);
  const onDuplicate = input.onDuplicate === 'update' ? 'update' : 'skip';
  const checks = checkClientRows(d, input.rows, onDuplicate, ctx.now);
  const counts: ImportCounts = { created: 0, updated: 0, skipped: 0, errors: 0 };
  const record = (at: LocalDateTime | null) => (at ? { at, source: IMPORT_SOURCE } : null);
  for (const ch of checks) {
    const x = ch.data;
    if (ch.action === 'create') {
      const client: Client = {
        id: newId('c'),
        firstName: x.firstName,
        lastName: x.lastName,
        email: x.email,
        phone: x.phone,
        birthDate: x.birthDate,
        tags: x.tags,
        createdAt: x.since ? `${x.since}T00:00` : ctx.now,
        source: 'recepce',
        consents: {
          gdpr: { at: ctx.now, source: IMPORT_SOURCE },
          health: record(x.consents.health),
          marketingEmail: record(x.consents.marketingEmail),
          sms: record(x.consents.sms),
        },
        notes: [],
        internalNote: x.note,
        blocked: false,
      };
      d.clients.push(client);
      pushAudit(d, ctx, 'Import klienta', `${fullName(client)} · ze stávajícího systému`, { clientId: client.id });
      counts.created++;
    } else if (ch.action === 'update' && ch.existingId) {
      const c = d.clients.find((y) => y.id === ch.existingId);
      if (!c) {
        counts.skipped++;
        continue;
      }
      const plan = planUpdate(c, x);
      if (plan.email !== undefined) c.email = plan.email;
      if (plan.phone !== undefined) c.phone = plan.phone;
      if (plan.birthDate !== undefined) c.birthDate = plan.birthDate;
      if (plan.addTags.length) c.tags = [...c.tags, ...plan.addTags];
      if (plan.internalNote !== undefined) c.internalNote = plan.internalNote;
      for (const key of plan.grant) c.consents[key] = record(x.consents[key]);
      if (!c.consents.gdpr) c.consents.gdpr = { at: ctx.now, source: IMPORT_SOURCE };
      pushAudit(d, ctx, 'Import – doplnění údajů', `${fullName(c)} · ${plan.labels.join(', ')}`, { clientId: c.id });
      counts.updated++;
    } else if (ch.action === 'skip') counts.skipped++;
    else counts.errors++;
  }
  if (counts.created || counts.updated) pushAudit(d, ctx, 'Import klientů', countsLabel(counts));
  return ok(resultOf(checks, counts));
};

/**
 * Import permanentek (jen majitelka a recepce): klient dostane aktivní permanentku se zbývajícími
 * vstupy – `packageUsage().free` = zbývající vstupy, hodnota vstupu = cena šablony / počet vstupů.
 * Název má příponu „(převod)“ a záznam `importedAt`; nevzniká žádná platba (peníze přijal starý systém).
 */
export const importPackages: Command<{ rows: PackageImportRow[] }, ImportResult> = (d, input, ctx) => {
  if (!canImport(ctx)) return fail(DENIED);
  const guard = rowsGuard(input?.rows);
  if (guard) return fail(guard);
  const checks = checkPackageRows(d, input.rows, ctx.now);
  const counts: ImportCounts = { created: 0, updated: 0, skipped: 0, errors: 0 };
  for (const ch of checks) {
    if (ch.action === 'skip') {
      counts.skipped++;
      continue;
    }
    const tpl = ch.templateId ? d.packageTemplates.find((t) => t.id === ch.templateId) : undefined;
    if (ch.action !== 'create' || !tpl || !ch.clientId || !ch.remaining || !ch.validUntil) {
      counts.errors++;
      continue;
    }
    const unit = templateUnitValue(tpl);
    const pkg: ImportedPackage = {
      id: newId('pk'),
      clientId: ch.clientId,
      templateId: tpl.id,
      name: tpl.name + IMPORTED_PACKAGE_SUFFIX,
      serviceIds: [...tpl.serviceIds],
      entriesTotal: ch.remaining,
      priceCzk: unit * ch.remaining,
      excusesAllowed: ch.excuses ?? Math.min(tpl.excusesAllowed, ch.remaining),
      purchasedAt: `${ch.purchasedAt ?? dateOf(ctx.now)}T00:00`,
      validUntil: ch.validUntil,
      paidBy: 'transfer',
      cancelled: false,
      extendedDays: 0,
      importedAt: ctx.now,
    };
    d.packages.push(pkg);
    pushAudit(
      d,
      ctx,
      'Převod permanentky',
      `${pkg.name} · zbývá ${countLabel(ch.remaining, ['vstup', 'vstupy', 'vstupů'])} · platí do ${formatDate(ch.validUntil)} · ze stávajícího systému`,
      { clientId: ch.clientId },
    );
    counts.created++;
  }
  if (counts.created) pushAudit(d, ctx, 'Import permanentek', countsLabel(counts, 'převedeno'));
  return ok(resultOf(checks, counts));
};

/**
 * Import kreditů (jen majitelka a recepce): kladný zůstatek jako pohyb kreditu (úprava)
 * „Převod zůstatku ze stávajícího systému“. Nevzniká platba ani bonus; každý klient jen jednou.
 */
export const importCredits: Command<{ rows: CreditImportRow[] }, ImportResult> = (d, input, ctx) => {
  if (!canImport(ctx)) return fail(DENIED);
  const guard = rowsGuard(input?.rows);
  if (guard) return fail(guard);
  const checks = checkCreditRows(d, input.rows);
  const counts: ImportCounts = { created: 0, updated: 0, skipped: 0, errors: 0 };
  for (const ch of checks) {
    if (ch.action === 'skip') {
      counts.skipped++;
      continue;
    }
    if (ch.action !== 'create' || !ch.clientId || !ch.amount) {
      counts.errors++;
      continue;
    }
    d.ledger.push({
      id: newId('l'),
      clientId: ch.clientId,
      at: ctx.now,
      amount: ch.amount,
      kind: 'adjustment',
      note: ch.note ? `${CREDIT_TRANSFER_NOTE} · ${ch.note}` : CREDIT_TRANSFER_NOTE,
    });
    pushAudit(d, ctx, 'Převod kreditu', `${formatMoney(ch.amount)} · ze stávajícího systému`, { clientId: ch.clientId });
    counts.created++;
  }
  if (counts.created) pushAudit(d, ctx, 'Import kreditů', countsLabel(counts, 'převedeno'));
  return ok(resultOf(checks, counts));
};

/* ------------------------------------------------------------------ */
/* Šablony CSV ke stažení                                              */
/* ------------------------------------------------------------------ */

export const IMPORT_TEMPLATE_FILENAME: Record<ImportKind, string> = {
  clients: 'sablona-import-klientu.csv',
  packages: 'sablona-import-permanentek.csv',
  credits: 'sablona-import-kreditu.csv',
};

/**
 * Šablona pro Excel (středník, UTF-8 s BOM – Excel ji otevře se správnou diakritikou).
 * U permanentek použije názvy šablon kliniky.
 */
export function importTemplateCsv(kind: ImportKind, s?: ClinicState): string {
  let rows: string[][];
  if (kind === 'clients') {
    rows = [
      ['Jméno', 'Příjmení', 'E-mail', 'Telefon', 'Datum narození', 'Souhlas e-mail/marketing', 'Souhlas SMS', 'Štítky', 'Poznámka', 'Klientem od'],
      ['Jana', 'Nováková', 'jana.novakova@example.cz', '+420 777 123 456', '15. 3. 1985', 'ano', 'ano', 'záda, běh', 'Preferuje ranní termíny', '2. 5. 2023'],
      ['Petr', 'Svoboda', 'petr.svoboda@example.cz', '603 987 654', '1980-11-02', 'ne', 'ano', '', '', ''],
    ];
  } else if (kind === 'packages') {
    const names = (s?.packageTemplates ?? [])
      .filter((t) => t.active)
      .sort((a, b) => a.order - b.order)
      .map((t) => t.name);
    rows = [
      ['E-mail', 'Telefon', 'Permanentka', 'Zbývá vstupů', 'Platí do'],
      ['jana.novakova@example.cz', '', names[0] ?? 'Fyzio 10', '4', '31. 3. 2027'],
      ['', '603 987 654', names[1] ?? names[0] ?? 'Masáž 5', '2', '15. 1. 2027'],
    ];
  } else {
    rows = [
      ['E-mail', 'Telefon', 'Kredit Kč'],
      ['jana.novakova@example.cz', '', '1500'],
      ['', '603 987 654', '750'],
    ];
  }
  return '﻿' + toCsv(rows);
}
