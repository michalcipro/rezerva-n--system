import type { BusinessProfile, PostalAddress, Settings } from '../domain/types';

/**
 * Fakturační údaje provozovny (Settings.business): kontrola IČO, DIČ, PSČ a e-mailů, zápis adres
 * a identifikace podnikatele pro patičku e-mailů a kontakt v klientském portálu.
 * Stejná pravidla používá engine při uložení i formulář v Nastavení. Soubor importuje jen typy.
 */

export const emptyAddress = (): PostalAddress => ({ street: '', city: '', zip: '' });

/** Výchozí (prázdné) fakturační údaje – nová provozovna i starší data bez nich. */
export function emptyBusinessProfile(): BusinessProfile {
  return {
    legalName: '',
    legalForm: 'person',
    ico: '',
    dic: '',
    vatPayer: false,
    registeredAddress: emptyAddress(),
    registryNote: '',
    placeAddress: emptyAddress(),
    phone: '',
    email: '',
    web: '',
    invoiceEmail: '',
  };
}

/* ------------------------------------------------------------------ */
/* IČO, DIČ, PSČ                                                       */
/* ------------------------------------------------------------------ */

/** IČO bez mezer. */
export const normalizeIco = (v: string): string => v.replace(/\s+/g, '');

/** Kontrola IČO modulo 11: váhy 8…2, zbytek 0 → kontrolní číslice 1, zbytek 1 → 0, jinak 11 − zbytek. */
export function isValidIco(v: string): boolean {
  const ico = normalizeIco(v);
  if (!/^\d{8}$/.test(ico)) return false;
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += Number(ico[i]) * (8 - i);
  const rest = sum % 11;
  const check = rest === 0 ? 1 : rest === 1 ? 0 : 11 - rest;
  return Number(ico[7]) === check;
}

/** Proč IČO neplatí (null = v pořádku). */
export function icoProblem(v: string): string | null {
  const ico = normalizeIco(v);
  if (!ico) return 'Zadejte IČO.';
  if (!/^\d+$/.test(ico)) return 'IČO obsahuje jen číslice.';
  if (ico.length !== 8) return 'IČO má 8 číslic – kratší doplňte nulami zleva.';
  if (!isValidIco(ico)) return 'IČO není platné – zkontrolujte číslice.';
  return null;
}

/** DIČ velkými písmeny bez mezer („cz 123 45 678“ → „CZ12345678“). */
export const normalizeDic = (v: string): string => v.replace(/\s+/g, '').toUpperCase();

/** České DIČ: CZ a 8–10 číslic (právnická osoba = IČO, fyzická osoba = rodné číslo). */
export const isValidDic = (v: string): boolean => /^CZ\d{8,10}$/.test(normalizeDic(v));

/** PSČ bez mezery („602 00“ → „60200“). */
export const normalizeZip = (v: string): string => v.replace(/\s+/g, '');
export const isValidZip = (v: string): boolean => /^\d{5}$/.test(normalizeZip(v));

/** „60200“ → „602 00“. */
export function formatZip(v: string): string {
  const zip = normalizeZip(v);
  return /^\d{5}$/.test(zip) ? `${zip.slice(0, 3)} ${zip.slice(3)}` : v.trim();
}

/* ------------------------------------------------------------------ */
/* E-mail, web, adresy                                                 */
/* ------------------------------------------------------------------ */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmailAddress = (v: string): boolean => EMAIL_RE.test(v.trim());

const WEB_RE = /^(https?:\/\/)?[\p{L}\p{N}-]+(\.[\p{L}\p{N}-]+)+(:\d{1,5})?(\/\S*)?$/iu;
export const isWebAddress = (v: string): boolean => WEB_RE.test(v.trim());

/** Odkaz na web (doplní https://). */
export function webHref(v: string): string {
  const web = v.trim();
  return /^https?:\/\//i.test(web) ? web : `https://${web}`;
}

/** Web k zobrazení – bez https:// a koncového lomítka. */
export const webLabel = (v: string): string => v.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');

/** Odkaz pro vytočení čísla (bez mezer a závorek). */
export const phoneHref = (v: string): string => `tel:${v.replace(/[^\d+]/g, '')}`;

export const addressEmpty = (a: PostalAddress | undefined): boolean => !a || (!a.street.trim() && !a.city.trim() && !a.zip.trim());
export const addressComplete = (a: PostalAddress | undefined): boolean => !!a && !!a.street.trim() && !!a.city.trim() && isValidZip(a.zip);

/** „Křenová 12, 602 00 Brno“ */
export function formatAddress(a: PostalAddress | undefined): string {
  if (!a) return '';
  const city = [formatZip(a.zip), a.city.trim()].filter(Boolean).join(' ');
  return [a.street.trim(), city].filter(Boolean).join(', ');
}

/* ------------------------------------------------------------------ */
/* Kontrola a sjednocení                                               */
/* ------------------------------------------------------------------ */

const isStr = (v: unknown): v is string => typeof v === 'string';
const isAddress = (v: unknown): v is PostalAddress => {
  const a = v as PostalAddress | null;
  return !!a && typeof a === 'object' && isStr(a.street) && isStr(a.city) && isStr(a.zip);
};

/** Mají údaje správný tvar (texty, přepínače, adresy)? Vstup ze sítě může být cokoli. */
export function isBusinessShape(v: unknown): v is BusinessProfile {
  const b = v as BusinessProfile | null;
  if (!b || typeof b !== 'object') return false;
  const texts = [b.legalName, b.ico, b.dic, b.registryNote, b.phone, b.email, b.web, b.invoiceEmail];
  return texts.every(isStr) && (b.legalForm === 'person' || b.legalForm === 'company') && typeof b.vatPayer === 'boolean' && isAddress(b.registeredAddress) && isAddress(b.placeAddress);
}

/** Ořezané texty, IČO, DIČ a PSČ bez mezer, e-maily malými písmeny. */
export function normalizeBusiness(b: BusinessProfile): BusinessProfile {
  const addr = (a: PostalAddress): PostalAddress => ({ street: a.street.trim(), city: a.city.trim(), zip: normalizeZip(a.zip) });
  return {
    legalName: b.legalName.trim(),
    legalForm: b.legalForm === 'company' ? 'company' : 'person',
    ico: normalizeIco(b.ico),
    dic: normalizeDic(b.dic),
    vatPayer: b.vatPayer === true,
    registeredAddress: addr(b.registeredAddress),
    registryNote: b.registryNote.trim(),
    placeAddress: addr(b.placeAddress),
    phone: b.phone.trim(),
    email: b.email.trim().toLowerCase(),
    web: b.web.trim(),
    invoiceEmail: b.invoiceEmail.trim().toLowerCase(),
  };
}

export type BusinessField =
  | 'legalName'
  | 'ico'
  | 'dic'
  | 'registryNote'
  | 'registeredAddress.street'
  | 'registeredAddress.city'
  | 'registeredAddress.zip'
  | 'placeAddress.street'
  | 'placeAddress.city'
  | 'placeAddress.zip'
  | 'phone'
  | 'email'
  | 'web'
  | 'invoiceEmail';

export type BusinessErrors = Partial<Record<BusinessField, string>>;

/** Nejdelší povolené texty. */
const MAX: Partial<Record<BusinessField, number>> = {
  legalName: 160,
  registryNote: 400,
  'registeredAddress.street': 120,
  'registeredAddress.city': 80,
  'placeAddress.street': 120,
  'placeAddress.city': 80,
  phone: 40,
  email: 254,
  web: 200,
  invoiceEmail: 254,
};

const ZIP_ERROR = 'PSČ má 5 číslic, např. 602 00.';
const EMAIL_ERROR = 'E-mail nemá platný tvar.';

/**
 * Chyby fakturačních údajů po polích. Nevyplněné údaje chybou nejsou (co chybí ke spuštění, ukazuje kontrolní
 * seznam), kontroluje se tvar vyplněných: IČO (modulo 11), DIČ, PSČ, e-maily a web. Plátce DPH musí mít DIČ.
 */
export function businessErrors(raw: BusinessProfile): BusinessErrors {
  const b = normalizeBusiness(raw);
  const e: BusinessErrors = {};
  if (b.ico) {
    const problem = icoProblem(b.ico);
    if (problem) e.ico = problem;
  }
  if (b.dic && !isValidDic(b.dic)) e.dic = 'DIČ zadejte ve tvaru CZ a 8–10 číslic, např. CZ12345678.';
  else if (b.vatPayer && !b.dic) e.dic = 'Plátce DPH musí mít vyplněné DIČ.';
  if (b.registeredAddress.zip && !isValidZip(b.registeredAddress.zip)) e['registeredAddress.zip'] = ZIP_ERROR;
  if (!addressEmpty(b.placeAddress)) {
    if (!b.placeAddress.street) e['placeAddress.street'] = 'Doplňte ulici a číslo, nebo adresu provozovny smažte.';
    if (!b.placeAddress.city) e['placeAddress.city'] = 'Doplňte obec.';
    if (!isValidZip(b.placeAddress.zip)) e['placeAddress.zip'] = ZIP_ERROR;
  }
  if (b.email && !isEmailAddress(b.email)) e.email = EMAIL_ERROR;
  if (b.invoiceEmail && !isEmailAddress(b.invoiceEmail)) e.invoiceEmail = EMAIL_ERROR;
  if (b.web && !isWebAddress(b.web)) e.web = 'Zadejte adresu webu, např. www.klinika.cz.';
  const values: Record<string, string> = {
    legalName: b.legalName,
    registryNote: b.registryNote,
    'registeredAddress.street': b.registeredAddress.street,
    'registeredAddress.city': b.registeredAddress.city,
    'placeAddress.street': b.placeAddress.street,
    'placeAddress.city': b.placeAddress.city,
    phone: b.phone,
    email: b.email,
    web: b.web,
    invoiceEmail: b.invoiceEmail,
  };
  for (const [field, max] of Object.entries(MAX) as [BusinessField, number][]) {
    if (!e[field] && values[field].length > max) e[field] = `Nejvýše ${max} znaků.`;
  }
  return e;
}

/* ------------------------------------------------------------------ */
/* Úplnost a použití údajů                                             */
/* ------------------------------------------------------------------ */

/** Co z povinných údajů chybí: obchodní firma (jméno), IČO, sídlo. */
export function businessMissing(b: BusinessProfile | undefined): string[] {
  const missing: string[] = [];
  if (!b?.legalName.trim()) missing.push(b?.legalForm === 'company' ? 'obchodní firma' : 'jméno a příjmení');
  if (!b || !isValidIco(b.ico)) missing.push('IČO');
  if (!addressComplete(b?.registeredAddress)) missing.push('sídlo');
  return missing;
}

/** Jsou vyplněné údaje nutné k identifikaci podnikatele (název, IČO, sídlo)? */
export const businessComplete = (b: BusinessProfile | undefined): boolean => businessMissing(b).length === 0;

/**
 * Identifikace podnikatele do patičky automatických e-mailů: firma, sídlo, IČO a údaj o zápisu
 * do rejstříku (§ 435 občanského zákoníku). Prázdné, dokud povinné údaje nejsou úplné.
 */
export function businessIdentity(b: BusinessProfile | undefined): string[] {
  if (!b || !businessComplete(b)) return [];
  const lines = [`${b.legalName.trim()}, ${formatAddress(b.registeredAddress)}, IČO ${normalizeIco(b.ico)}`];
  if (b.registryNote.trim()) lines.push(b.registryNote.trim());
  return lines;
}

export interface BusinessContact {
  /** Adresa provozovny, jinak sídlo (jen úplná adresa). */
  address: string;
  phone: string;
  email: string;
  web: string;
}

/** Kontakt provozovny pro klienty: adresa (provozovna, jinak sídlo), telefon, e-mail (jinak odesílatel e-mailů), web. */
export function businessContact(s: Pick<Settings, 'business' | 'senderEmail'>): BusinessContact {
  const b = s.business ?? emptyBusinessProfile();
  const place = addressComplete(b.placeAddress) ? b.placeAddress : addressComplete(b.registeredAddress) ? b.registeredAddress : undefined;
  return {
    address: formatAddress(place),
    phone: b.phone.trim(),
    email: b.email.trim() || s.senderEmail.trim(),
    web: b.web.trim(),
  };
}
