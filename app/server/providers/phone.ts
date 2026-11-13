/**
 * Telefonní čísla a text SMS.
 *
 * SMS API (Brevo) chce číslo s předvolbou země jen číslicemi, např. `420777123456`.
 * Text SMS bez diakritiky se vejde do znakové sady GSM 03.38 (160 znaků na část); stačí jediný znak mimo ni
 * (č, ř, typografické uvozovky, nezlomitelná mezera z formátování částek…) a zpráva se posílá jako Unicode
 * se 70 znaky na část – tedy až dvojnásobná cena.
 */

/** Oddělovače, které lidé v číslech píší: mezery (i nezlomitelné), pomlčky, tečky, lomítka, závorky. */
const PHONE_SEPARATORS = /[\s\-\u{2010}-\u{2015}.\/()]/gu;

/** České číslo bez předvolby: 9 číslic, nezačíná 0 ani 1. */
const CZECH_NUMBER = /^[2-9]\d{8}$/;

/**
 * Převede telefon na mezinárodní tvar z číslic (`420777123456`).
 * Přijímá `+420 777 123 456`, `00420777123456`, `777123456`, `777 123 456`, `420777123456`
 * i zahraniční čísla začínající `+` nebo `00`. Neplatné číslo → null.
 */
export function normalizeCzechPhone(input: string): string | null {
  if (typeof input !== 'string') return null;
  let s = input.trim().replace(PHONE_SEPARATORS, '');
  let international = false;
  if (s.startsWith('+')) {
    s = s.slice(1);
    international = true;
  } else if (s.startsWith('00')) {
    s = s.slice(2);
    international = true;
  }
  if (!/^\d+$/.test(s)) return null;
  if (international) {
    if (s.startsWith('420')) return CZECH_NUMBER.test(s.slice(3)) ? s : null;
    // E.164: kód země nezačíná nulou, celkem 7 až 15 číslic.
    return /^[1-9]\d{6,14}$/.test(s) ? s : null;
  }
  if (CZECH_NUMBER.test(s)) return '420' + s;
  if (s.length === 12 && s.startsWith('420') && CZECH_NUMBER.test(s.slice(3))) return s;
  return null;
}

/** Písmena, která se normalizací Unicode nerozloží na základ + diakritiku. */
const EXTRA_LETTERS: Record<string, string> = { ł: 'l', Ł: 'L', đ: 'd', Đ: 'D', ø: 'o', Ø: 'O', ħ: 'h', Ħ: 'H', ı: 'i' };

/** „Příliš žluťoučký kůň“ → „Prilis zlutoucky kun“. */
export function stripDiacritics(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u{0300}-\u{036f}]/gu, '') // kombinující diakritická znaménka
    .replace(/[łŁđĐøØħĦı]/g, (ch) => EXTRA_LETTERS[ch] ?? ch)
    .normalize('NFC');
}

/** Znaková sada GSM 03.38: základní tabulka a rozšíření (^ { } \ [ ~ ] | € se počítají za 2 znaky). */
const GSM7 = new Set(
  Array.from(
    '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿' +
      'abcdefghijklmnopqrstuvwxyzäöñüà' +
      '^{}\\[~]|€',
  ),
);

/** Typografické znaky → nejbližší znak GSM (pořadí je důležité: ©, ® a ™ patří mezi emoji). */
const GSM_REPLACEMENTS: [RegExp, string][] = [
  [/\r\n?/g, '\n'],
  // tabulátor, nezlomitelná a další šířkové mezery
  [/[\t\xa0\u{2000}-\u{200a}\u{202f}\u{205f}\u{3000}]/gu, ' '],
  // měkký spojovník, znaky nulové šířky, BOM
  [/[\xad\u{200b}-\u{200d}\u{2060}\u{feff}]/gu, ''],
  // ‘ ’ ‚ ‛ ′ ´ `
  [/[\u{2018}-\u{201b}\u{2032}\xb4`]/gu, "'"],
  // “ ” „ ‟ « » ″
  [/[\u{201c}-\u{201f}\xab\xbb\u{2033}]/gu, '"'],
  // pomlčky a znak minus
  [/[\u{2010}-\u{2015}\u{2212}]/gu, '-'],
  [/\u{2026}/gu, '...'],
  // · • ∙ ⋅
  [/[\xb7\u{2022}\u{2219}\u{22c5}]/gu, '-'],
  [/\xd7/g, 'x'],
  [/\u{2192}/gu, '->'],
  [/\u{2190}/gu, '<-'],
  [/\xa9/g, '(c)'],
  [/\xae/g, '(R)'],
  [/\u{2122}/gu, 'TM'],
];

/** Emoji včetně modifikátorů, vlajek a variačních selektorů. */
const EMOJI = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\u{20e3}\u{fe00}-\u{fe0f}]/gu;

/**
 * Text SMS ve znakové sadě GSM 03.38: bez diakritiky, typografické uvozovky, pomlčky a mezery nahradí
 * obyčejnými, emoji vynechá, ostatní neznámé znaky nahradí „?“.
 */
export function toGsm7(text: string): string {
  let s = text;
  for (const [pattern, replacement] of GSM_REPLACEMENTS) s = s.replace(pattern, replacement);
  s = stripDiacritics(s).replace(EMOJI, '');
  let out = '';
  for (const ch of s) out += GSM7.has(ch) ? ch : '?';
  return out;
}
