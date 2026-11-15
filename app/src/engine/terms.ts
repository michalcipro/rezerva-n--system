import type { CaseForms, NounForms, TermsSettings } from '../domain/types';

/**
 * Názvosloví oboru v textech aplikace: jak se jmenuje provozovna (klinika × studio × salon…)
 * a kdo poskytuje služby (terapeut × trenér × kosmetička…). Všechny tvary se ukládají
 * v nastavení (Settings.terms); tady je katalog hotových slov a pomůcky pro skládání vět.
 *
 *   const words = useTerms();                        // mimo React: termsOf(state)
 *   `Vyberte ${words.staff.acc}`                     // Vyberte terapeuta / trenéra / kosmetičku
 *   `Obsazenost ${words.staffPl.gen}`                // Obsazenost terapeutů / kosmetiček
 *   `${words.Staff.nom} má jinou rezervaci.`         // Terapeut / Kosmetička (velké písmeno)
 *   `${words.staff.adj('Vybraný')} ${words.staff.nom}`   // Vybraný terapeut / Vybraná kosmetička
 *   `${words.Business.nom} platbu ${words.business.past('potvrdil')}`  // Klinika potvrdila / Salon potvrdil / Studio potvrdilo
 *   words.staff.agree('ho', 'ji', 'ho')              // zájmena a nepravidelné tvary
 *   prep('s', words.business.ins)                    // s klinikou / se studiem
 *   countLabel(n, words.counts.staff)                // 1 terapeut, 3 terapeuti, 5 terapeutů
 */

/* ------------------------------------------------------------------ */
/* Pády, čísla, rody                                                   */
/* ------------------------------------------------------------------ */

/** Pády v pořadí CaseForms: 1. kdo/co, 2. koho/čeho, 3. komu/čemu, 4. koho/co, 6. o kom/o čem, 7. kým/čím. */
export const CASES = ['nom', 'gen', 'dat', 'acc', 'loc', 'ins'] as const;
export type Case = (typeof CASES)[number];
export type NounNumber = 'sg' | 'pl';
/** m = mužský životný, i = mužský neživotný, f = ženský, n = střední. */
export type Gender = NounForms['gender'];

/** Tvar podstatného jména v daném pádě a čísle: nounForm(terms.staff, 'gen', 'pl') → „terapeutů“. */
export function nounForm(noun: NounForms, c: Case, n: NounNumber = 'sg'): string {
  return noun[n][CASES.indexOf(c)];
}

/** Velké první písmeno (začátek věty, popisek). */
export function cap(s: string): string {
  return s ? s.charAt(0).toLocaleUpperCase('cs-CZ') + s.slice(1) : s;
}

/** Tvary pro počet (1 / 2–4 / 5 a víc) – pro countLabel() a plural(). */
export function countForms(noun: NounForms): [string, string, string] {
  return [noun.sg[0], noun.pl[0], noun.pl[1]];
}

const SIBILANT = /^[szšž]/;
const CONSONANT = /^[bcčdďfghjklmnňpqrřsštťvwxzž]/;

/**
 * Předložka k, s, v, z před slovem – s vokalizací podle běžných pravidel:
 * se studiem, ze salonu, ve studiu / v salonu, ke klinice, ke specialistovi.
 * Jen pro podstatná jména z názvosloví (nepokrývá výjimky typu „se mnou“, „ve dne“).
 */
export function prep(p: 'k' | 's' | 'v' | 'z', word: string): string {
  const w = word.toLocaleLowerCase('cs-CZ');
  const first = w.charAt(0);
  // skupina souhlásek na začátku: st-, sk-, zd-, šk-, žl-…
  const cluster = SIBILANT.test(first) && CONSONANT.test(w.charAt(1));
  const vocal =
    p === 's' || p === 'z'
      ? SIBILANT.test(first)
      : p === 'v'
        ? first === 'v' || first === 'f' || cluster
        : first === 'k' || first === 'g' || cluster;
  return `${vocal ? `${p}e` : p} ${word}`;
}

/** Mužský tvar přídavného jména v množném čísle (životné): nový → noví, který → kteří, velký → velcí. */
function animatePlural(word: string): string {
  const rules: [string, string][] = [
    ['ský', 'ští'],
    ['cký', 'čtí'],
    ['chý', 'ší'],
    ['ký', 'cí'],
    ['hý', 'zí'],
    ['rý', 'ří'],
    ['ý', 'í'],
  ];
  for (const [from, to] of rules) if (word.endsWith(from)) return word.slice(0, -from.length) + to;
  return word;
}

/* ------------------------------------------------------------------ */
/* Pohled na jedno podstatné jméno                                     */
/* ------------------------------------------------------------------ */

/** Tvary jednoho čísla podstatného jména (words.staff, words.staffPl…) a shoda slov, která se k němu vážou. */
export class NounView {
  readonly nom: string;
  readonly gen: string;
  readonly dat: string;
  readonly acc: string;
  readonly loc: string;
  readonly ins: string;

  constructor(
    forms: CaseForms,
    readonly gender: Gender,
    readonly number: NounNumber,
    capital = false,
  ) {
    const f = capital ? forms.map(cap) : forms;
    [this.nom, this.gen, this.dat, this.acc, this.loc, this.ins] = f;
  }

  /** Tvar v pádě: words.staff.form('dat') = words.staff.dat. */
  form(c: Case): string {
    return this[c];
  }

  /**
   * Shoda podle rodu – zájmena a nepravidelná slova: words.staff.agree('ho', 'ji', 'ho'), words.business.agree('ten', 'ta', 'to').
   * Mužský neživotný (salon) bere bez `i` v jednotném čísle mužský tvar, v množném ženský (salony byly, nové salony).
   */
  agree(m: string, f: string, n: string, i?: string): string {
    switch (this.gender) {
      case 'f':
        return f;
      case 'n':
        return n;
      case 'i':
        return i ?? (this.number === 'pl' ? f : m);
      default:
        return m;
    }
  }

  /**
   * Tvrdé přídavné jméno nebo zájmeno „který“ v 1. pádě, zadané v mužském rodě jednotného čísla:
   * adj('Vybraný') → Vybraný terapeut / Vybraná kosmetička / Vybrané studio; v množném čísle vybraní / vybrané / vybraná.
   * Měkká přídavná jména (aktivní) se nemění. Pro jiné pády použijte agree().
   */
  adj(word: string): string {
    if (!word.endsWith('ý')) return word;
    const stem = word.slice(0, -1);
    return this.number === 'sg' ? this.agree(word, `${stem}á`, `${stem}é`) : this.agree(animatePlural(word), `${stem}é`, `${stem}á`);
  }

  /**
   * Příčestí zadané v mužském rodě jednotného čísla – minulý čas (byl, zrušil) i trpné (zavřen):
   * past('zrušil') → zrušil / zrušila / zrušilo; v množném čísle zrušili / zrušily / zrušila.
   * Nepravidelná (šel – šla) přes agree().
   */
  past(word: string): string {
    return this.number === 'sg' ? this.agree(word, `${word}a`, `${word}o`) : this.agree(`${word}i`, `${word}y`, `${word}a`);
  }
}

/* ------------------------------------------------------------------ */
/* Názvosloví provozovny                                               */
/* ------------------------------------------------------------------ */

export interface Terms {
  /** Kdo poskytuje služby, jednotné číslo: words.staff.acc → „terapeuta“. */
  staff: NounView;
  /** Totéž s velkým písmenem (začátek věty, popisky): words.Staff.nom → „Terapeut“. */
  Staff: NounView;
  /** Množné číslo: words.staffPl.gen → „terapeutů“. */
  staffPl: NounView;
  StaffPl: NounView;
  /** Provozovna, jednotné číslo: words.business.gen → „kliniky“. */
  business: NounView;
  Business: NounView;
  businessPl: NounView;
  BusinessPl: NounView;
  /** Tvary pro počet: countLabel(n, words.counts.staff) → 1 terapeut, 3 terapeuti, 5 terapeutů. */
  counts: { staff: [string, string, string]; business: [string, string, string] };
}

function buildTerms(src: TermsSettings): Terms {
  const { staff, business } = src;
  return {
    staff: new NounView(staff.sg, staff.gender, 'sg'),
    Staff: new NounView(staff.sg, staff.gender, 'sg', true),
    staffPl: new NounView(staff.pl, staff.gender, 'pl'),
    StaffPl: new NounView(staff.pl, staff.gender, 'pl', true),
    business: new NounView(business.sg, business.gender, 'sg'),
    Business: new NounView(business.sg, business.gender, 'sg', true),
    businessPl: new NounView(business.pl, business.gender, 'pl'),
    BusinessPl: new NounView(business.pl, business.gender, 'pl', true),
    counts: { staff: countForms(staff), business: countForms(business) },
  };
}

const cache = new WeakMap<TermsSettings, Terms>();
// výchozí klinika / terapeut z katalogu níže (bez importu defaults.ts – ten přes messages.ts importuje engine zpět)
let fallback: Terms | null = null;

/** Pohled na uložené tvary (bez nich výchozí klinika / terapeut). Zmrazený stav z Immeru se cachuje. */
export function makeTerms(terms: TermsSettings | null | undefined): Terms {
  if (!terms || !terms.staff || !terms.business) return (fallback ??= buildTerms({ business: BUSINESS_NOUNS.klinika, staff: STAFF_NOUNS.terapeut }));
  const hit = cache.get(terms);
  if (hit) return hit;
  const view = buildTerms(terms);
  // koncept v Immeru (proxy) nebo rozpracovaný objekt se ještě může změnit – cachujeme jen hotový stav
  if (Object.isFrozen(terms)) cache.set(terms, view);
  return view;
}

/** Názvosloví provozovny ze stavu: termsOf(s).staff.gen. Funguje i s konceptem v příkazu (Immer draft). */
export function termsOf(s: { settings?: { terms?: TermsSettings } } | null | undefined): Terms {
  return makeTerms(s?.settings?.terms);
}

/* ------------------------------------------------------------------ */
/* Katalog hotových slov                                               */
/* ------------------------------------------------------------------ */

export type BusinessNounId = 'klinika' | 'studio' | 'salon' | 'centrum' | 'provozovna' | 'ordinace' | 'praxe';
export type StaffNounId =
  | 'terapeut'
  | 'fyzioterapeut'
  | 'maser'
  | 'trener'
  | 'lektor'
  | 'instruktor'
  | 'specialista'
  | 'kosmeticka'
  | 'kadernik'
  | 'kadernice';

function deepFreeze(n: NounForms): NounForms {
  Object.freeze(n.sg);
  Object.freeze(n.pl);
  return Object.freeze(n);
}

/** Provozovna – tvary [1., 2., 3., 4., 6., 7. pád]. */
export const BUSINESS_NOUNS: Readonly<Record<BusinessNounId, NounForms>> = Object.freeze({
  klinika: deepFreeze({
    sg: ['klinika', 'kliniky', 'klinice', 'kliniku', 'klinice', 'klinikou'],
    pl: ['kliniky', 'klinik', 'klinikám', 'kliniky', 'klinikách', 'klinikami'],
    gender: 'f',
  }),
  studio: deepFreeze({
    sg: ['studio', 'studia', 'studiu', 'studio', 'studiu', 'studiem'],
    pl: ['studia', 'studií', 'studiím', 'studia', 'studiích', 'studii'],
    gender: 'n',
  }),
  salon: deepFreeze({
    sg: ['salon', 'salonu', 'salonu', 'salon', 'salonu', 'salonem'],
    pl: ['salony', 'salonů', 'salonům', 'salony', 'salonech', 'salony'],
    gender: 'i',
  }),
  centrum: deepFreeze({
    sg: ['centrum', 'centra', 'centru', 'centrum', 'centru', 'centrem'],
    pl: ['centra', 'center', 'centrům', 'centra', 'centrech', 'centry'],
    gender: 'n',
  }),
  provozovna: deepFreeze({
    sg: ['provozovna', 'provozovny', 'provozovně', 'provozovnu', 'provozovně', 'provozovnou'],
    pl: ['provozovny', 'provozoven', 'provozovnám', 'provozovny', 'provozovnách', 'provozovnami'],
    gender: 'f',
  }),
  ordinace: deepFreeze({
    sg: ['ordinace', 'ordinace', 'ordinaci', 'ordinaci', 'ordinaci', 'ordinací'],
    pl: ['ordinace', 'ordinací', 'ordinacím', 'ordinace', 'ordinacích', 'ordinacemi'],
    gender: 'f',
  }),
  praxe: deepFreeze({
    sg: ['praxe', 'praxe', 'praxi', 'praxi', 'praxi', 'praxí'],
    pl: ['praxe', 'praxí', 'praxím', 'praxe', 'praxích', 'praxemi'],
    gender: 'f',
  }),
});

/** Kdo poskytuje služby – tvary [1., 2., 3., 4., 6., 7. pád]. */
export const STAFF_NOUNS: Readonly<Record<StaffNounId, NounForms>> = Object.freeze({
  terapeut: deepFreeze({
    sg: ['terapeut', 'terapeuta', 'terapeutovi', 'terapeuta', 'terapeutovi', 'terapeutem'],
    pl: ['terapeuti', 'terapeutů', 'terapeutům', 'terapeuty', 'terapeutech', 'terapeuty'],
    gender: 'm',
  }),
  fyzioterapeut: deepFreeze({
    sg: ['fyzioterapeut', 'fyzioterapeuta', 'fyzioterapeutovi', 'fyzioterapeuta', 'fyzioterapeutovi', 'fyzioterapeutem'],
    pl: ['fyzioterapeuti', 'fyzioterapeutů', 'fyzioterapeutům', 'fyzioterapeuty', 'fyzioterapeutech', 'fyzioterapeuty'],
    gender: 'm',
  }),
  maser: deepFreeze({
    sg: ['masér', 'maséra', 'masérovi', 'maséra', 'masérovi', 'masérem'],
    pl: ['maséři', 'masérů', 'masérům', 'maséry', 'masérech', 'maséry'],
    gender: 'm',
  }),
  trener: deepFreeze({
    sg: ['trenér', 'trenéra', 'trenérovi', 'trenéra', 'trenérovi', 'trenérem'],
    pl: ['trenéři', 'trenérů', 'trenérům', 'trenéry', 'trenérech', 'trenéry'],
    gender: 'm',
  }),
  lektor: deepFreeze({
    sg: ['lektor', 'lektora', 'lektorovi', 'lektora', 'lektorovi', 'lektorem'],
    pl: ['lektoři', 'lektorů', 'lektorům', 'lektory', 'lektorech', 'lektory'],
    gender: 'm',
  }),
  instruktor: deepFreeze({
    sg: ['instruktor', 'instruktora', 'instruktorovi', 'instruktora', 'instruktorovi', 'instruktorem'],
    pl: ['instruktoři', 'instruktorů', 'instruktorům', 'instruktory', 'instruktorech', 'instruktory'],
    gender: 'm',
  }),
  specialista: deepFreeze({
    sg: ['specialista', 'specialisty', 'specialistovi', 'specialistu', 'specialistovi', 'specialistou'],
    pl: ['specialisté', 'specialistů', 'specialistům', 'specialisty', 'specialistech', 'specialisty'],
    gender: 'm',
  }),
  kosmeticka: deepFreeze({
    sg: ['kosmetička', 'kosmetičky', 'kosmetičce', 'kosmetičku', 'kosmetičce', 'kosmetičkou'],
    pl: ['kosmetičky', 'kosmetiček', 'kosmetičkám', 'kosmetičky', 'kosmetičkách', 'kosmetičkami'],
    gender: 'f',
  }),
  kadernik: deepFreeze({
    sg: ['kadeřník', 'kadeřníka', 'kadeřníkovi', 'kadeřníka', 'kadeřníkovi', 'kadeřníkem'],
    pl: ['kadeřníci', 'kadeřníků', 'kadeřníkům', 'kadeřníky', 'kadeřnících', 'kadeřníky'],
    gender: 'm',
  }),
  kadernice: deepFreeze({
    sg: ['kadeřnice', 'kadeřnice', 'kadeřnici', 'kadeřnici', 'kadeřnici', 'kadeřnicí'],
    pl: ['kadeřnice', 'kadeřnic', 'kadeřnicím', 'kadeřnice', 'kadeřnicích', 'kadeřnicemi'],
    gender: 'f',
  }),
});

export const BUSINESS_NOUN_IDS = Object.keys(BUSINESS_NOUNS) as BusinessNounId[];
export const STAFF_NOUN_IDS = Object.keys(STAFF_NOUNS) as StaffNounId[];

/** Nezávislá kopie tvarů (do stavu nikdy nedávat objekt z katalogu). */
export function copyNoun(n: NounForms): NounForms {
  return { sg: [...n.sg] as CaseForms, pl: [...n.pl] as CaseForms, gender: n.gender };
}

/** Názvosloví z katalogu, např. termsFor('studio', 'trener') pro šablonu oboru nebo nastavení. */
export function termsFor(business: BusinessNounId, staff: StaffNounId): TermsSettings {
  return { business: copyNoun(BUSINESS_NOUNS[business]), staff: copyNoun(STAFF_NOUNS[staff]) };
}

const sameNoun = (a: NounForms, b: NounForms): boolean =>
  a.gender === b.gender && a.sg.every((f, i) => f === b.sg[i]) && a.pl.every((f, i) => f === b.pl[i]);

/** Které slovo z katalogu odpovídá uloženým tvarům (null = vlastní tvary mimo katalog). */
export function businessNounId(n: NounForms): BusinessNounId | null {
  return BUSINESS_NOUN_IDS.find((id) => sameNoun(BUSINESS_NOUNS[id], n)) ?? null;
}

export function staffNounId(n: NounForms): StaffNounId | null {
  return STAFF_NOUN_IDS.find((id) => sameNoun(STAFF_NOUNS[id], n)) ?? null;
}
