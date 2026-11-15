import type {
  BookingRules,
  CancellationPolicy,
  CaseForms,
  Category,
  ClinicState,
  GroupTemplate,
  LocalDate,
  ModuleSettings,
  NounForms,
  PackageTemplate,
  Room,
  Service,
  TemplateKey,
  TermsSettings,
  Therapist,
  TimeRange,
  Weekday,
  WeekSchedule,
} from '../domain/types';
import { DEFAULT_CATEGORIES, DEFAULT_PACKAGE_TEMPLATES, DEFAULT_ROOMS, DEFAULT_SERVICES, DEFAULT_TERMS, createBaseState } from './defaults';

/**
 * Šablony oborů pro novou provozovnu na platformě. Šablona určí výchozí katalog služeb, permanentky,
 * skupinové lekce, názvosloví (klinika × studio × salon, terapeut × trenér…), zapnuté moduly
 * a storno podmínky. Všechno se pak dá v aplikaci upravit – šablona je jen rychlý start.
 *
 * Tým tvoří jen majitel (`OWNER_STAFF_ID`): poskytuje všechny služby a vede skupinové lekce,
 * jeho pracovní doba odpovídá oboru a lekce leží uvnitř ní.
 */

export type PresetId = 'fyzio' | 'masaze' | 'fitness' | 'beauty' | 'prazdna';

export interface PresetInfo {
  id: PresetId;
  name: string;
  description: string;
}

export const PRESETS: readonly PresetInfo[] = [
  { id: 'fyzio', name: 'Fyzioterapie a rehabilitace', description: 'Vstupní vyšetření, terapie, přístroje, permanentky a skupinová cvičení.' },
  { id: 'masaze', name: 'Masáže a wellness', description: 'Masáže různých délek a technik, zvýhodněné permanentky a kredit – bez skupinových lekcí.' },
  { id: 'fitness', name: 'Fitness a osobní trenéři', description: 'Osobní tréninky, skupinové lekce s kapacitou, permanentky a kredit.' },
  { id: 'beauty', name: 'Kosmetika a beauty', description: 'Kosmetická ošetření, manikúra, řasy a obočí – bez skupinových lekcí.' },
  { id: 'prazdna', name: 'Prázdná provozovna', description: 'Bez služeb a ceníku – vše nastavíte sami.' },
];

export const isPresetId = (v: unknown): v is PresetId => typeof v === 'string' && PRESETS.some((p) => p.id === v);

export interface PresetOptions {
  /** Název provozovny (zobrazuje se klientům). */
  businessName: string;
  /** Jméno majitele – stane se prvním členem týmu, kterému patří všechny služby. */
  ownerName: string;
  ownerEmail?: string;
  /** Od kdy platí pravidelné skupinové lekce. */
  today: LocalDate;
}

export const OWNER_STAFF_ID = 't_owner';

/* ------------------------------------------------------------------ */
/* Názvosloví a moduly oborů                                           */
/* ------------------------------------------------------------------ */

const noun = (sg: CaseForms, pl: CaseForms, gender: NounForms['gender']): NounForms => ({ sg, pl, gender });

/** Tvary [1. pád, 2. pád, 3. pád, 4. pád, 6. pád, 7. pád] v jednotném a množném čísle. */
const STUDIO = noun(['studio', 'studia', 'studiu', 'studio', 'studiu', 'studiem'], ['studia', 'studií', 'studiím', 'studia', 'studiích', 'studii'], 'n');
const SALON = noun(['salon', 'salonu', 'salonu', 'salon', 'salonu', 'salonem'], ['salony', 'salonů', 'salonům', 'salony', 'salonech', 'salony'], 'i');
const PROVOZOVNA = noun(
  ['provozovna', 'provozovny', 'provozovně', 'provozovnu', 'provozovně', 'provozovnou'],
  ['provozovny', 'provozoven', 'provozovnám', 'provozovny', 'provozovnách', 'provozovnami'],
  'f',
);
const MASER = noun(['masér', 'maséra', 'masérovi', 'maséra', 'masérovi', 'masérem'], ['maséři', 'masérů', 'masérům', 'maséry', 'masérech', 'maséry'], 'm');
const TRENER = noun(['trenér', 'trenéra', 'trenérovi', 'trenéra', 'trenérovi', 'trenérem'], ['trenéři', 'trenérů', 'trenérům', 'trenéry', 'trenérech', 'trenéry'], 'm');
const KOSMETICKA = noun(
  ['kosmetička', 'kosmetičky', 'kosmetičce', 'kosmetičku', 'kosmetičce', 'kosmetičkou'],
  ['kosmetičky', 'kosmetiček', 'kosmetičkám', 'kosmetičky', 'kosmetičkách', 'kosmetičkami'],
  'f',
);
const SPECIALISTA = noun(
  ['specialista', 'specialisty', 'specialistovi', 'specialistu', 'specialistovi', 'specialistou'],
  ['specialisté', 'specialistů', 'specialistům', 'specialisty', 'specialistech', 'specialisty'],
  'm',
);

/** Názvosloví oboru: provozovna a kdo poskytuje služby. */
export const PRESET_TERMS: Readonly<Record<PresetId, TermsSettings>> = {
  fyzio: DEFAULT_TERMS,
  masaze: { business: STUDIO, staff: MASER },
  fitness: { business: STUDIO, staff: TRENER },
  beauty: { business: SALON, staff: KOSMETICKA },
  prazdna: { business: PROVOZOVNA, staff: SPECIALISTA },
};

/**
 * Zapnuté moduly. Masáže a kosmetika nemají skupinové lekce. Prázdná provozovna má vypnutý marketing:
 * obchodní sdělení vyžadují souhlasy klientů a vědomé nastavení, a bez klientů a služeb zatím
 * není co posílat. Ostatní moduly jsou zapnuté, aby je majitel rovnou viděl – bez katalogu se
 * klientům stejně nic nenabízí.
 */
export const PRESET_MODULES: Readonly<Record<PresetId, ModuleSettings>> = {
  fyzio: { groups: true, packages: true, credit: true, marketing: true },
  masaze: { groups: false, packages: true, credit: true, marketing: true },
  fitness: { groups: true, packages: true, credit: true, marketing: true },
  beauty: { groups: false, packages: true, credit: true, marketing: true },
  prazdna: { groups: true, packages: true, credit: true, marketing: false },
};

/* ------------------------------------------------------------------ */
/* Stavební kameny katalogu                                            */
/* ------------------------------------------------------------------ */

const r = (start: string, end: string): TimeRange => ({ start, end });

/** Týdenní rozvrh; každý den dostane vlastní kopii intervalů. */
function week(days: Partial<Record<Weekday, TimeRange[]>>): WeekSchedule {
  const day = (wd: Weekday): TimeRange[] => (days[wd] ?? []).map((x) => ({ ...x }));
  return { 0: day(0), 1: day(1), 2: day(2), 3: day(3), 4: day(4), 5: day(5), 6: day(6) };
}

/** Pondělí až pátek stejně. */
const workdays = (ranges: TimeRange[]): Partial<Record<Weekday, TimeRange[]>> => ({ 0: ranges, 1: ranges, 2: ranges, 3: ranges, 4: ranges });

type ServiceSpec = Pick<Service, 'id' | 'name' | 'categoryId' | 'durationMin' | 'priceCzk' | 'description'> &
  Partial<Pick<Service, 'bufferMin' | 'kind' | 'capacity' | 'onlineBookable' | 'newClientsOnly' | 'remote'>>;

/** Služby katalogu – všechny poskytuje majitel, pořadí podle seznamu. */
function services(list: ServiceSpec[]): Service[] {
  return list.map((x, order) => ({
    bufferMin: 0,
    onlineBookable: true,
    newClientsOnly: false,
    remote: false,
    active: true,
    ...x,
    kind: x.kind ?? 'individual',
    capacity: x.kind === 'group' ? x.capacity ?? 8 : 1,
    therapistIds: [OWNER_STAFF_ID],
    order,
  }));
}

type PackageSpec = Pick<PackageTemplate, 'id' | 'name' | 'description' | 'entries' | 'serviceIds' | 'priceCzk' | 'validityDays' | 'excusesAllowed'> &
  Partial<Pick<PackageTemplate, 'withdrawalAllowed'>>;

function packages(list: PackageSpec[]): PackageTemplate[] {
  return list.map((x, order) => ({ ...x, serviceIds: [...x.serviceIds], active: true, order }));
}

type LessonSpec = [id: string, serviceId: string, weekday: Weekday, start: string, title: string, capacity: number];

/** Pravidelné lekce – vede je majitel ve zvolené místnosti. */
function lessons(validFrom: LocalDate, roomId: string, list: LessonSpec[]): GroupTemplate[] {
  return list.map(([id, serviceId, weekday, start, title, capacity]) => ({
    id,
    serviceId,
    therapistId: OWNER_STAFF_ID,
    roomId,
    weekday,
    start,
    title,
    capacity,
    validFrom,
    validTo: null,
    active: true,
  }));
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

type PolicyPatch = Partial<Omit<CancellationPolicy, 'excuses'>> & { excuses?: Partial<CancellationPolicy['excuses']> };

interface PresetCatalog {
  tagline: string;
  rooms: Room[];
  categories: Category[];
  services: Service[];
  packageTemplates: PackageTemplate[];
  groupTemplates: GroupTemplate[];
  owner: Pick<Therapist, 'focus' | 'tone' | 'roomId' | 'workingHours' | 'breaks'>;
  policy?: PolicyPatch;
  bookingRules?: Partial<BookingRules>;
  /** Úprava textů automatických zpráv, které by jinak mluvily o fyzioterapii. */
  templates?: Partial<Record<TemplateKey, { body: string }>>;
}

/* ------------------------------------------------------------------ */
/* Fyzioterapie – výchozí katalog kliniky                              */
/* ------------------------------------------------------------------ */

function fyzio(today: LocalDate): PresetCatalog {
  const catalog = clone(DEFAULT_SERVICES);
  for (const svc of catalog) svc.therapistIds = [OWNER_STAFF_ID];
  return {
    tagline: 'fyzioterapie · trénink · masáže',
    rooms: clone(DEFAULT_ROOMS),
    categories: clone(DEFAULT_CATEGORIES),
    services: catalog,
    // fyzioterapeutické permanentky mají withdrawalAllowed: false (zdravotní služby, § 1840 OZ)
    packageTemplates: clone(DEFAULT_PACKAGE_TEMPLATES),
    // jeden člověk: cvičení na konci pracovního dne místo plného rozvrhu kliniky s pěti terapeuty
    groupTemplates: lessons(today, 'r_sal', [
      ['g_zada_po', 's_g_zada', 0, '17:00', 'Zdravá záda', 8],
      ['g_pilates_ut', 's_g_pilates', 1, '17:00', 'Pilates', 8],
      ['g_zada_st', 's_g_zada', 2, '17:00', 'Zdravá záda', 8],
      ['g_pilates_ct', 's_g_pilates', 3, '17:00', 'Pilates', 8],
    ]),
    owner: {
      focus: 'Fyzioterapie',
      tone: 'teal',
      roomId: 'r_o1',
      workingHours: week({ 0: [r('08:00', '18:00')], 1: [r('08:00', '18:00')], 2: [r('08:00', '18:00')], 3: [r('08:00', '18:00')], 4: [r('08:00', '15:00')] }),
      breaks: week(workdays([r('12:00', '13:00')])),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Masáže a wellness                                                   */
/* ------------------------------------------------------------------ */

function masaze(): PresetCatalog {
  const sixty = ['s_klasicka60', 's_sportovni60', 's_lymfa60', 's_tehotenska60'];
  return {
    tagline: 'masáže · relaxace · regenerace',
    rooms: [
      { id: 'r_maserna1', name: 'Masérna 1' },
      { id: 'r_maserna2', name: 'Masérna 2' },
    ],
    categories: [
      { id: 'cat_klasicke', name: 'Klasické a relaxační masáže', tone: 'sand', order: 0 },
      { id: 'cat_sportovni', name: 'Sportovní a regenerační masáže', tone: 'teal', order: 1 },
      { id: 'cat_specialni', name: 'Speciální masáže', tone: 'rose', order: 2 },
    ],
    // 15 minut po masáži na převlečení lehátka a větrání
    services: services([
      { id: 's_zada30', name: 'Masáž zad a šíje 30 min', categoryId: 'cat_klasicke', durationMin: 30, priceCzk: 590, bufferMin: 15, description: 'Uvolnění ztuhlých zad a šíje – ideální po dlouhém sezení.' },
      { id: 's_klasicka60', name: 'Klasická masáž celého těla 60 min', categoryId: 'cat_klasicke', durationMin: 60, priceCzk: 990, bufferMin: 15, description: 'Masáž zad, šíje, rukou i nohou pro celkové uvolnění.' },
      { id: 's_relax90', name: 'Relaxační aromamasáž 90 min', categoryId: 'cat_klasicke', durationMin: 90, priceCzk: 1390, bufferMin: 15, description: 'Pomalá masáž celého těla s aromatickým olejem podle výběru.' },
      { id: 's_sportovni60', name: 'Sportovní masáž 60 min', categoryId: 'cat_sportovni', durationMin: 60, priceCzk: 1090, bufferMin: 15, description: 'Hlubší masáž svalů před výkonem nebo po něm.' },
      { id: 's_lymfa60', name: 'Lymfatická masáž 60 min', categoryId: 'cat_sportovni', durationMin: 60, priceCzk: 1190, bufferMin: 15, description: 'Jemná masáž podporující odtok lymfy, při pocitu těžkých nohou.' },
      { id: 's_reflexni45', name: 'Reflexní masáž plosky nohy 45 min', categoryId: 'cat_specialni', durationMin: 45, priceCzk: 790, bufferMin: 15, description: 'Masáž reflexních zón na chodidlech.' },
      { id: 's_kameny75', name: 'Masáž lávovými kameny 75 min', categoryId: 'cat_specialni', durationMin: 75, priceCzk: 1490, bufferMin: 15, description: 'Prohřátí a uvolnění svalů nahřátými lávovými kameny.' },
      { id: 's_hlava30', name: 'Indická masáž hlavy 30 min', categoryId: 'cat_specialni', durationMin: 30, priceCzk: 590, bufferMin: 15, description: 'Masáž hlavy, šíje a ramen proti stresu a napětí.' },
      { id: 's_tehotenska60', name: 'Těhotenská masáž 60 min', categoryId: 'cat_specialni', durationMin: 60, priceCzk: 1090, bufferMin: 15, description: 'Šetrná masáž v poloze na boku, od 4. měsíce těhotenství.' },
    ]),
    packageTemplates: packages([
      { id: 'pt_masaz60_5', name: 'Masáž 60 – 5 vstupů', description: '5× masáž 60 min (klasická, sportovní, lymfatická nebo těhotenská)', entries: 5, serviceIds: sixty, priceCzk: 4690, validityDays: 183, excusesAllowed: 1 },
      { id: 'pt_masaz60_10', name: 'Masáž 60 – 10 vstupů', description: '10× masáž 60 min (klasická, sportovní, lymfatická nebo těhotenská)', entries: 10, serviceIds: sixty, priceCzk: 8990, validityDays: 365, excusesAllowed: 2 },
      { id: 'pt_zada30_10', name: 'Záda 30 – 10 vstupů', description: '10× masáž zad a šíje 30 min', entries: 10, serviceIds: ['s_zada30'], priceCzk: 4990, validityDays: 183, excusesAllowed: 2 },
    ]),
    groupTemplates: [],
    owner: {
      focus: 'Masáže',
      tone: 'sand',
      roomId: 'r_maserna1',
      workingHours: week({ ...workdays([r('09:00', '19:00')]), 5: [r('09:00', '13:00')] }),
      breaks: week(workdays([r('13:00', '13:30')])),
    },
    policy: {
      freeCancelHours: 24,
      lateTiers: [
        { hoursBefore: 24, feePct: 50 },
        { hoursBefore: 6, feePct: 100 },
      ],
      noShowFeePct: 100,
      excuses: { enabled: true, perPackage: 1, perClientCount: 1, perClientMonths: 6, deadlineHoursBefore: 2, makeupDays: 30 },
    },
    templates: {
      after_visit: {
        body: 'Dobrý den, [jméno],\n\nděkujeme, že jste dnes přišel/přišla. Po masáži pijte dost vody a dopřejte si klid. Budeme rádi, když nám napíšete, jak jste byl/a spokojen/a.\n\n[klinika]',
      },
      reactivation: {
        body: 'Dobrý den, [jméno],\n\nje to už nějaký čas od vaší poslední masáže. Dopřejte si zase chvíli pro sebe – rádi vás uvidíme.\n\n[klinika]',
      },
      birthday: { body: 'Dobrý den, [jméno],\n\npřejeme vám k narozeninám hodně zdraví a pohody.\n\n[klinika]' },
    },
  };
}

/* ------------------------------------------------------------------ */
/* Fitness a osobní trenéři                                            */
/* ------------------------------------------------------------------ */

function fitness(today: LocalDate): PresetCatalog {
  const groupIds = ['s_g_hiit', 's_g_kruhovy', 's_g_funkcni', 's_g_joga'];
  return {
    tagline: 'osobní trénink · skupinové lekce',
    rooms: [
      { id: 'r_posilovna', name: 'Posilovna' },
      { id: 'r_sal', name: 'Sál' },
    ],
    categories: [
      { id: 'cat_osobni', name: 'Osobní trénink', tone: 'blue', order: 0 },
      { id: 'cat_skupinove', name: 'Skupinové lekce', tone: 'violet', order: 1 },
      { id: 'cat_konzultace', name: 'Konzultace a výživa', tone: 'olive', order: 2 },
    ],
    services: services([
      { id: 's_vstupni', name: 'Vstupní konzultace a měření', categoryId: 'cat_konzultace', durationMin: 60, priceCzk: 690, bufferMin: 15, newClientsOnly: true, description: 'Rozhovor o cílech, měření složení těla a ukázkový trénink.' },
      { id: 's_pt60', name: 'Osobní trénink 60 min', categoryId: 'cat_osobni', durationMin: 60, priceCzk: 890, description: 'Trénink 1:1 podle vašeho plánu.' },
      { id: 's_pt90', name: 'Osobní trénink 90 min', categoryId: 'cat_osobni', durationMin: 90, priceCzk: 1290, description: 'Delší trénink 1:1 – síla, kondice a protažení.' },
      { id: 's_vyziva', name: 'Výživové poradenství', categoryId: 'cat_konzultace', durationMin: 45, priceCzk: 790, bufferMin: 15, description: 'Rozbor jídelníčku a doporučení na míru.' },
      { id: 's_online', name: 'Online konzultace tréninku', categoryId: 'cat_konzultace', durationMin: 30, priceCzk: 490, remote: true, description: 'Videohovor – kontrola techniky a úprava tréninkového plánu.' },
      { id: 's_g_hiit', name: 'HIIT', categoryId: 'cat_skupinove', durationMin: 45, priceCzk: 200, kind: 'group', capacity: 12, description: 'Intervalový trénink s vlastní vahou (max. 12 osob).' },
      { id: 's_g_kruhovy', name: 'Kruhový trénink', categoryId: 'cat_skupinove', durationMin: 60, priceCzk: 220, kind: 'group', capacity: 12, description: 'Trénink na stanovištích pro celé tělo (max. 12 osob).' },
      { id: 's_g_funkcni', name: 'Funkční trénink', categoryId: 'cat_skupinove', durationMin: 60, priceCzk: 220, kind: 'group', capacity: 10, description: 'Síla, stabilita a kondice s kettlebelly a TRX (max. 10 osob).' },
      { id: 's_g_joga', name: 'Jóga', categoryId: 'cat_skupinove', durationMin: 60, priceCzk: 220, kind: 'group', capacity: 12, description: 'Protažení a práce s dechem pro všechny úrovně (max. 12 osob).' },
    ]),
    packageTemplates: packages([
      { id: 'pt_pt10', name: 'Osobní trénink 10×', description: '10× osobní trénink 60 min', entries: 10, serviceIds: ['s_pt60'], priceCzk: 7990, validityDays: 183, excusesAllowed: 2 },
      { id: 'pt_pt5', name: 'Osobní trénink 5×', description: '5× osobní trénink 60 min', entries: 5, serviceIds: ['s_pt60'], priceCzk: 4190, validityDays: 92, excusesAllowed: 1 },
      { id: 'pt_skupiny10', name: 'Skupinové lekce 10×', description: '10 vstupů na libovolné skupinové lekce', entries: 10, serviceIds: groupIds, priceCzk: 1890, validityDays: 92, excusesAllowed: 2 },
      { id: 'pt_skupiny_mesic', name: 'Skupinové lekce – měsíc', description: '12 vstupů na skupinové lekce během jednoho měsíce', entries: 12, serviceIds: groupIds, priceCzk: 1790, validityDays: 31, excusesAllowed: 2 },
    ]),
    // ranní a večerní lekce v sále, mezi nimi osobní tréninky
    groupTemplates: lessons(today, 'r_sal', [
      ['g_hiit_po', 's_g_hiit', 0, '07:00', 'HIIT', 12],
      ['g_kruh_po', 's_g_kruhovy', 0, '18:00', 'Kruhový trénink', 12],
      ['g_funkcni_ut', 's_g_funkcni', 1, '18:00', 'Funkční trénink', 10],
      ['g_hiit_st', 's_g_hiit', 2, '07:00', 'HIIT', 12],
      ['g_kruh_st', 's_g_kruhovy', 2, '18:00', 'Kruhový trénink', 12],
      ['g_funkcni_ct', 's_g_funkcni', 3, '18:00', 'Funkční trénink', 10],
      ['g_joga_pa', 's_g_joga', 4, '17:00', 'Jóga', 12],
      ['g_funkcni_so', 's_g_funkcni', 5, '09:00', 'Funkční trénink', 10],
    ]),
    owner: {
      focus: 'Osobní trénink a skupinové lekce',
      tone: 'blue',
      roomId: 'r_posilovna',
      workingHours: week({ ...workdays([r('07:00', '12:00'), r('15:00', '20:00')]), 5: [r('08:00', '12:00')] }),
      breaks: week({}),
    },
    policy: {
      freeCancelHours: 24,
      lateTiers: [{ hoursBefore: 24, feePct: 100 }],
      noShowFeePct: 100,
      groupCancelHours: 3,
      excuses: { enabled: true, perPackage: 2, perClientCount: 1, perClientMonths: 6, deadlineHoursBefore: 2, makeupDays: 30 },
    },
    bookingRules: { minNoticeMin: 60, horizonDays: 30, maxUpcomingPerClient: 10 },
    templates: {
      after_visit: {
        body: 'Dobrý den, [jméno],\n\nděkujeme za dnešní trénink. Nezapomeňte na pitný režim a regeneraci. Budeme rádi, když nám napíšete, jak jste byl/a spokojen/a.\n\n[klinika]',
      },
      reactivation: {
        body: 'Dobrý den, [jméno],\n\nje to už nějaký čas od vašeho posledního tréninku. Vraťte se do formy – rádi vás uvidíme na tréninku i na lekcích.\n\n[klinika]',
      },
    },
  };
}

/* ------------------------------------------------------------------ */
/* Kosmetika a beauty                                                  */
/* ------------------------------------------------------------------ */

function beauty(): PresetCatalog {
  return {
    tagline: 'kosmetika · řasy · nehty',
    rooms: [
      { id: 'r_kabina', name: 'Kosmetická kabina' },
      { id: 'r_nehty', name: 'Manikúra a pedikúra' },
    ],
    categories: [
      { id: 'cat_plet', name: 'Péče o pleť', tone: 'rose', order: 0 },
      { id: 'cat_rasy', name: 'Řasy a obočí', tone: 'violet', order: 1 },
      { id: 'cat_nehty', name: 'Manikúra a pedikúra', tone: 'sand', order: 2 },
      { id: 'cat_depilace', name: 'Depilace', tone: 'olive', order: 3 },
    ],
    // 15 minut po službě na dezinfekci pracoviště a nástrojů
    services: services([
      { id: 's_osetreni60', name: 'Kosmetické ošetření', categoryId: 'cat_plet', durationMin: 60, priceCzk: 990, bufferMin: 15, description: 'Čištění, peeling, maska a krém podle typu pleti.' },
      { id: 's_osetreni90', name: 'Kosmetické ošetření s masáží obličeje', categoryId: 'cat_plet', durationMin: 90, priceCzk: 1390, bufferMin: 15, description: 'Kompletní ošetření s relaxační masáží obličeje a dekoltu.' },
      { id: 's_cisteni', name: 'Hloubkové čištění pleti', categoryId: 'cat_plet', durationMin: 75, priceCzk: 1190, bufferMin: 15, description: 'Ultrazvukové a manuální čištění pro mastnou a problematickou pleť.' },
      { id: 's_peeling', name: 'Chemický peeling', categoryId: 'cat_plet', durationMin: 45, priceCzk: 1290, bufferMin: 15, description: 'Ovocné kyseliny pro rozjasnění a vyhlazení pleti.' },
      { id: 's_rasy_nove', name: 'Prodlužování řas – nová sada', categoryId: 'cat_rasy', durationMin: 120, priceCzk: 1690, bufferMin: 15, description: 'Metoda 1:1, přirozený nebo objemový efekt.' },
      { id: 's_rasy_doplneni', name: 'Doplnění řas', categoryId: 'cat_rasy', durationMin: 75, priceCzk: 990, bufferMin: 15, description: 'Doplnění prodloužených řas nejpozději do 3 týdnů.' },
      { id: 's_lifting', name: 'Lash lifting a barvení řas', categoryId: 'cat_rasy', durationMin: 60, priceCzk: 1090, bufferMin: 15, description: 'Natočení a barvení vlastních řas, výdrž 6–8 týdnů.' },
      { id: 's_oboci', name: 'Úprava a barvení obočí', categoryId: 'cat_rasy', durationMin: 30, priceCzk: 390, bufferMin: 15, description: 'Tvarování obočí pinzetou nebo voskem a barvení.' },
      { id: 's_manikura', name: 'Klasická manikúra', categoryId: 'cat_nehty', durationMin: 45, priceCzk: 450, bufferMin: 15, description: 'Úprava nehtů a nehtové kůžičky, masáž rukou.' },
      { id: 's_gel_lak', name: 'Manikúra s gel lakem', categoryId: 'cat_nehty', durationMin: 60, priceCzk: 650, bufferMin: 15, description: 'Manikúra s trvanlivým gel lakem, výdrž 2–3 týdny.' },
      { id: 's_gel_nove', name: 'Gelové nehty – nová modeláž', categoryId: 'cat_nehty', durationMin: 120, priceCzk: 1190, bufferMin: 15, description: 'Modeláž gelových nehtů na šablonu nebo tipy.' },
      { id: 's_gel_doplneni', name: 'Gelové nehty – doplnění', categoryId: 'cat_nehty', durationMin: 90, priceCzk: 890, bufferMin: 15, description: 'Doplnění gelových nehtů nejpozději do 4 týdnů.' },
      { id: 's_pedikura', name: 'Mokrá pedikúra', categoryId: 'cat_nehty', durationMin: 60, priceCzk: 690, bufferMin: 15, description: 'Koupel nohou, úprava nehtů, odstranění ztvrdlé kůže a masáž.' },
      { id: 's_depilace_lytka', name: 'Depilace voskem – lýtka', categoryId: 'cat_depilace', durationMin: 30, priceCzk: 450, bufferMin: 15, description: 'Teplý vosk včetně ošetření pokožky po depilaci.' },
      { id: 's_depilace_podpazi', name: 'Depilace voskem – podpaží', categoryId: 'cat_depilace', durationMin: 15, priceCzk: 250, bufferMin: 15, description: 'Teplý vosk včetně ošetření pokožky po depilaci.' },
    ]),
    // bez omluvenek (v kosmetice se neužívají) – excusesAllowed 0
    packageTemplates: packages([
      { id: 'pt_osetreni5', name: 'Kosmetické ošetření 5×', description: '5× kosmetické ošetření 60 min', entries: 5, serviceIds: ['s_osetreni60'], priceCzk: 4450, validityDays: 365, excusesAllowed: 0 },
      { id: 'pt_rasy5', name: 'Doplnění řas 5×', description: '5× doplnění prodloužených řas', entries: 5, serviceIds: ['s_rasy_doplneni'], priceCzk: 4490, validityDays: 183, excusesAllowed: 0 },
      { id: 'pt_gel5', name: 'Doplnění gelových nehtů 5×', description: '5× doplnění gelových nehtů', entries: 5, serviceIds: ['s_gel_doplneni'], priceCzk: 3990, validityDays: 183, excusesAllowed: 0 },
    ]),
    groupTemplates: [],
    owner: {
      focus: 'Kosmetika, řasy a nehty',
      tone: 'rose',
      roomId: 'r_kabina',
      workingHours: week(workdays([r('09:00', '18:00')])),
      breaks: week(workdays([r('12:30', '13:00')])),
    },
    // zrušení zdarma 24 h předem, potom 50 %, nedostavení 100 %; první pozdní storno za rok se odpouští
    policy: {
      freeCancelHours: 24,
      lateTiers: [{ hoursBefore: 24, feePct: 50 }],
      noShowFeePct: 100,
      graceFirstLateCancel: true,
      excuses: { enabled: false, perPackage: 0 },
    },
    bookingRules: { horizonDays: 90 },
    templates: {
      after_visit: {
        body: 'Dobrý den, [jméno],\n\nděkujeme za dnešní návštěvu. Budeme rádi, když nám napíšete, jak jste byl/a spokojen/a, a těšíme se na vás zase příště.\n\n[klinika]',
      },
      reactivation: {
        body: 'Dobrý den, [jméno],\n\nje to už nějaký čas od vaší poslední návštěvy. Rádi se o vás zase postaráme – volný termín si vyberete v rezervacích.\n\n[klinika]',
      },
      birthday: { body: 'Dobrý den, [jméno],\n\npřejeme vám k narozeninám hodně zdraví, radosti a krásných dní.\n\n[klinika]' },
    },
  };
}

/* ------------------------------------------------------------------ */
/* Prázdná provozovna                                                  */
/* ------------------------------------------------------------------ */

function prazdna(): PresetCatalog {
  return {
    tagline: '',
    // místnosti zatím nejdou v aplikaci přidat – obecné názvy pro libovolný obor
    rooms: [
      { id: 'r_1', name: 'Místnost 1' },
      { id: 'r_2', name: 'Místnost 2' },
    ],
    categories: [],
    services: [],
    packageTemplates: [],
    groupTemplates: [],
    owner: {
      focus: '',
      tone: 'teal',
      roomId: 'r_1',
      workingHours: week(workdays([r('09:00', '17:00')])),
      breaks: week(workdays([r('12:00', '12:30')])),
    },
    templates: {
      after_visit: { body: 'Dobrý den, [jméno],\n\nděkujeme za dnešní návštěvu. Budeme rádi, když nám napíšete, jak jste byl/a spokojen/a.\n\n[klinika]' },
      reactivation: { body: 'Dobrý den, [jméno],\n\nje to už nějaký čas od vaší poslední návštěvy. Rádi vás zase uvidíme.\n\n[klinika]' },
      birthday: { body: 'Dobrý den, [jméno],\n\npřejeme vám k narozeninám hodně zdraví a radosti.\n\n[klinika]' },
    },
  };
}

function catalogOf(id: PresetId, today: LocalDate): PresetCatalog {
  switch (id) {
    case 'fyzio':
      return fyzio(today);
    case 'masaze':
      return masaze();
    case 'fitness':
      return fitness(today);
    case 'beauty':
      return beauty();
    case 'prazdna':
    default:
      return prazdna();
  }
}

/* ------------------------------------------------------------------ */
/* Nová provozovna                                                     */
/* ------------------------------------------------------------------ */

function ownerStaff(o: PresetOptions, spec: PresetCatalog['owner']): Therapist {
  const parts = o.ownerName.trim().split(/\s+/).filter(Boolean);
  const lastName = parts.length > 1 ? parts.pop() ?? '' : '';
  return {
    id: OWNER_STAFF_ID,
    title: '',
    firstName: parts.join(' ') || o.ownerName.trim() || 'Majitel',
    lastName,
    focus: spec.focus,
    roomId: spec.roomId,
    tone: spec.tone,
    email: o.ownerEmail?.trim().toLowerCase() ?? '',
    workingHours: clone(spec.workingHours),
    breaks: clone(spec.breaks),
    active: true,
    order: 0,
  };
}

/**
 * Výchozí stav nové provozovny podle oboru. Tým tvoří jen majitel (další lidi přidá v Tým a směny),
 * ukázkoví terapeuti ani klienti v něm nejsou. Server potom doplní nastavení ostrého provozu.
 */
export function createPresetState(id: PresetId, o: PresetOptions): ClinicState {
  const s = createBaseState(o.today);
  const c = catalogOf(id, o.today);
  const name = o.businessName.trim();
  const ownerEmail = o.ownerEmail?.trim().toLowerCase() ?? '';

  s.settings.clinicName = name;
  s.settings.clinicTagline = c.tagline;
  s.settings.senderName = name;
  if (ownerEmail) s.settings.senderEmail = ownerEmail;
  s.settings.payments.recipientName = name.slice(0, 35);
  s.settings.preset = id;
  s.settings.terms = clone(PRESET_TERMS[id]);
  s.settings.modules = { ...PRESET_MODULES[id] };
  if (c.policy) {
    const { excuses, ...rest } = c.policy;
    Object.assign(s.settings.policy, clone(rest));
    if (excuses) Object.assign(s.settings.policy.excuses, excuses);
  }
  if (c.bookingRules) Object.assign(s.settings.bookingRules, c.bookingRules);
  for (const t of s.templates) {
    const patch = c.templates?.[t.key];
    if (patch) t.body = patch.body;
  }

  s.rooms = c.rooms;
  s.categories = c.categories;
  s.services = c.services;
  s.packageTemplates = c.packageTemplates;
  s.groupTemplates = c.groupTemplates;
  s.therapists = [ownerStaff(o, c.owner)];
  return s;
}
