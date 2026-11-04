/**
 * Česká QR Platba (formát SPAYD 1.0, standard České bankovní asociace) a převod čísla účtu na IBAN.
 * Čisté funkce bez Reactu (docs/VSTUPY-SKUPINY-QR.md, část 3).
 *
 *   SPD*1.0*ACC:<IBAN>*AM:<částka>*CC:CZK*X-VS:<VS>*MSG:<zpráva>*RN:<příjemce>
 */

/** Váhy kontrolního součtu (mod 11) pro šestimístné předčíslí. */
const PREFIX_WEIGHTS = [10, 5, 8, 4, 2, 1] as const;
/** Váhy kontrolního součtu (mod 11) pro desetimístné číslo účtu. */
const NUMBER_WEIGHTS = [6, 3, 7, 9, 10, 5, 8, 4, 2, 1] as const;

/** Maximální délka zprávy pro příjemce (MSG) v QR Platbě. */
export const SPAYD_MSG_MAX = 60;
/** Maximální délka jména příjemce (RN) v QR Platbě. */
export const SPAYD_RN_MAX = 35;
/** Maximální délka variabilního symbolu (X-VS). */
export const SPAYD_VS_MAX = 10;

/** Délky IBAN podle země (ostatní země jen obecná kontrola 15–34 znaků). */
const IBAN_LENGTH: Record<string, number> = { CZ: 24, SK: 24, AT: 20, DE: 22, PL: 28 };

function weightedSum(digits: string, weights: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) sum += Number(digits[i]) * weights[i];
  return sum;
}

/** Zbytek po dělení 97 pro dlouhé číslo zapsané jako řetězec číslic. */
function mod97(digits: string): number {
  let rest = 0;
  for (let i = 0; i < digits.length; i += 7) rest = Number(String(rest) + digits.slice(i, i + 7)) % 97;
  return rest;
}

/** Písmena IBAN → čísla (A = 10 … Z = 35). */
function ibanDigits(rearranged: string): string {
  let out = '';
  for (const ch of rearranged) out += ch >= 'A' && ch <= 'Z' ? String(ch.charCodeAt(0) - 55) : ch;
  return out;
}

/**
 * Převede české číslo účtu „[předčíslí-]číslo/kód banky“ na IBAN.
 * Kontroluje tvar, váhy (mod 11) předčíslí i čísla a dopočítá kontrolní číslice IBAN (mod 97).
 */
export function czechAccountToIban(account: string): { ok: true; iban: string } | { ok: false; error: string } {
  const raw = (account ?? '').replace(/\s+/g, '');
  if (!raw) return { ok: false, error: 'Zadejte číslo účtu.' };
  const m = /^(?:(\d{1,6})-)?(\d{1,10})\/(\d+)$/.exec(raw);
  if (!m) return { ok: false, error: 'Číslo účtu zadejte ve tvaru 2000145399/0800 nebo 19-2000145399/0800.' };
  const [, prefixRaw = '', numberRaw, bank] = m;
  if (bank.length !== 4) return { ok: false, error: 'Kód banky musí mít 4 číslice.' };
  const prefix = prefixRaw.padStart(6, '0');
  const number = numberRaw.padStart(10, '0');
  if (Number(number) === 0 || numberRaw.replace(/^0+/, '').length < 2) return { ok: false, error: 'Číslo účtu musí mít aspoň 2 platné číslice.' };
  if (weightedSum(prefix, PREFIX_WEIGHTS) % 11 !== 0) return { ok: false, error: 'Předčíslí účtu není platné – zkontrolujte ho prosím.' };
  if (weightedSum(number, NUMBER_WEIGHTS) % 11 !== 0) return { ok: false, error: 'Číslo účtu není platné (nesedí kontrolní součet) – zkontrolujte ho prosím.' };
  const bban = bank + prefix + number;
  const check = 98 - mod97(ibanDigits(bban + 'CZ00'));
  return { ok: true, iban: 'CZ' + String(check).padStart(2, '0') + bban };
}

/** Je řetězec platný IBAN (délka podle země, kontrolní číslice mod 97)? Mezery se ignorují. */
export function isValidIban(iban: string): boolean {
  const v = (iban ?? '').replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(v)) return false;
  const expected = IBAN_LENGTH[v.slice(0, 2)];
  if (expected && v.length !== expected) return false;
  return mod97(ibanDigits(v.slice(4) + v.slice(0, 4))) === 1;
}

/** IBAN po čtveřicích: 'CZ65 0800 0000 1920 0014 5399'. */
export function formatIban(iban: string): string {
  const v = (iban ?? '').replace(/\s+/g, '').toUpperCase();
  return v.replace(/(.{4})(?=.)/g, '$1 ');
}

/** Typografické znaky, které po odstranění diakritiky převedeme na ASCII. */
const ASCII_MAP: Record<string, string> = {
  ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ',
  '–': '-', '—': '-', '−': '-',
  '„': '"', '“': '"', '”': '"', '‚': "'", '‘': "'", '’': "'",
  '…': '...', '×': 'X', ß: 'SS', Æ: 'AE', æ: 'AE', Ø: 'O', ø: 'O', Ł: 'L', ł: 'L', Đ: 'D', đ: 'D',
};

/**
 * Hodnota pole SPAYD: bez diakritiky, velkými písmeny, bez hvězdičky (oddělovač polí – spec. dovoluje
 * nahradit/odstranit), jen tisknutelné ASCII, jednoduché mezery, zkrácená na `max` znaků.
 */
function spaydText(value: string | undefined, max: number): string {
  let v = (value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  v = v.replace(/[^\x20-\x7e]/g, (ch) => ASCII_MAP[ch] ?? (/\s/.test(ch) ? ' ' : ''));
  v = v.replace(/\*/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
  return v.slice(0, max).trim();
}

/**
 * Sestaví řetězec QR Platby (SPAYD 1.0).
 *  - `iban` bez mezer, velkými písmeny;
 *  - `amount` s desetinnou tečkou a 2 desetinnými místy (pole se vynechá, když částka není kladná);
 *  - `vs` jen číslice, nejvýše 10 (prázdný se vynechá);
 *  - `message` max. 60 znaků, `recipient` max. 35 znaků (bez diakritiky, velkými písmeny, bez '*').
 */
export function buildSpayd(p: { iban: string; amount: number; vs?: string; message?: string; recipient?: string }): string {
  const parts = ['SPD', '1.0', 'ACC:' + (p.iban ?? '').replace(/\s+/g, '').toUpperCase()];
  const amount = Math.round((Number(p.amount) || 0) * 100) / 100;
  if (amount > 0) parts.push('AM:' + amount.toFixed(2));
  parts.push('CC:CZK');
  const vs = (p.vs ?? '').replace(/\D/g, '').slice(0, SPAYD_VS_MAX);
  if (vs) parts.push('X-VS:' + vs);
  const msg = spaydText(p.message, SPAYD_MSG_MAX);
  if (msg) parts.push('MSG:' + msg);
  const rn = spaydText(p.recipient, SPAYD_RN_MAX);
  if (rn) parts.push('RN:' + rn);
  return parts.join('*');
}
