import type {
  Category,
  ClinicState,
  GroupTemplate,
  PackageTemplate,
  Room,
  Service,
  Settings,
  Stage,
  Therapist,
  TimeRange,
  WeekSchedule,
} from '../domain/types';
import { DEFAULT_TEMPLATES } from './messages';

/** 2 = CRM vrstva (fáze spolupráce, poznámky, soubory, follow-upy). */
export const SCHEMA_VERSION = 2;

/** Výchozí fáze spolupráce (docs/CRM.md). */
export const DEFAULT_STAGES: Stage[] = [
  { id: 'st_potencialni', name: 'Potenciální klient', tone: 'slate', order: 0 },
  { id: 'st_freetalk', name: 'Freetalk', tone: 'blue', order: 1 },
  { id: 'st_diagnostika', name: 'Diagnostika', tone: 'violet', order: 2 },
  { id: 'st_vyhodnoceni', name: 'Vyhodnocení', tone: 'sand', order: 3 },
  { id: 'st_aktivni', name: 'Aktivní spolupráce', tone: 'teal', order: 4 },
  { id: 'st_pozastaveno', name: 'Pozastaveno', tone: 'olive', order: 5 },
  { id: 'st_konec', name: 'Konec spolupráce', tone: 'rose', order: 6, closed: true },
];

export function defaultStages(): Stage[] {
  return DEFAULT_STAGES.map((st) => ({ ...st }));
}

const r = (start: string, end: string): TimeRange => ({ start, end });

function week(days: Partial<Record<number, TimeRange[]>>): WeekSchedule {
  return {
    0: days[0] ?? [],
    1: days[1] ?? [],
    2: days[2] ?? [],
    3: days[3] ?? [],
    4: days[4] ?? [],
    5: days[5] ?? [],
    6: days[6] ?? [],
  };
}

const weekdays = (range: TimeRange[]): Partial<Record<number, TimeRange[]>> => ({ 0: range, 1: range, 2: range, 3: range, 4: range });

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat_koucink', name: 'Koučink', tone: 'teal', order: 0 },
  { id: 'cat_terapie', name: 'Terapie', tone: 'rose', order: 1 },
  { id: 'cat_neuro', name: 'Neurovizuální trénink', tone: 'blue', order: 2 },
  { id: 'cat_mentoring', name: 'Mentoring', tone: 'sand', order: 3 },
  { id: 'cat_workshopy', name: 'Workshopy', tone: 'violet', order: 4 },
];

export const DEFAULT_ROOMS: Room[] = [
  { id: 'r_k1', name: 'Koučovna 1' },
  { id: 'r_k2', name: 'Koučovna 2' },
  { id: 'r_terapie', name: 'Terapeutická pracovna' },
  { id: 'r_trening', name: 'Tréninková místnost' },
  { id: 'r_sal', name: 'Sál pro workshopy' },
];

export const DEFAULT_THERAPISTS: Therapist[] = [
  {
    id: 't_mala',
    title: 'Mgr.',
    firstName: 'Tereza',
    lastName: 'Malá',
    focus: 'Mentální koučink – sportovci a výkon pod tlakem',
    roomId: 'r_k1',
    tone: 'teal',
    email: 'tereza@example.com',
    workingHours: week({ ...weekdays([r('07:30', '17:00')]), 5: [r('08:00', '12:00')] }),
    breaks: week(weekdays([r('12:00', '13:00')])),
    active: true,
    order: 0,
  },
  {
    id: 't_riha',
    title: 'Ing.',
    firstName: 'Jakub',
    lastName: 'Říha',
    focus: 'Strategický koučink a mentoring pro lídry',
    roomId: 'r_k2',
    tone: 'sand',
    email: 'jakub@example.com',
    workingHours: week(weekdays([r('08:00', '18:00')])),
    breaks: week(weekdays([r('12:00', '12:30')])),
    active: true,
    order: 1,
  },
  {
    id: 't_benesova',
    title: 'Mgr.',
    firstName: 'Klára',
    lastName: 'Benešová',
    focus: 'Terapie – stres, úzkost a sebedůvěra',
    roomId: 'r_terapie',
    tone: 'rose',
    email: 'klara@example.com',
    workingHours: week({ 0: [r('09:00', '16:00')], 1: [r('09:00', '16:00')], 2: [r('09:00', '16:00')], 3: [r('09:00', '16:00')], 4: [r('08:00', '13:00')] }),
    breaks: week({ 0: [r('12:00', '13:00')], 1: [r('12:00', '13:00')], 2: [r('12:00', '13:00')], 3: [r('12:00', '13:00')] }),
    active: true,
    order: 2,
  },
  {
    id: 't_vavrova',
    title: 'Bc.',
    firstName: 'Lucie',
    lastName: 'Vávrová',
    focus: 'Neurovizuální trénink – reakce, periferní vidění, soustředění',
    roomId: 'r_trening',
    tone: 'blue',
    email: 'lucie@example.com',
    workingHours: week(weekdays([r('08:00', '17:00')])),
    breaks: week(weekdays([r('12:30', '13:00')])),
    active: true,
    order: 3,
  },
  {
    id: 't_kos',
    title: '',
    firstName: 'Marek',
    lastName: 'Kos',
    focus: 'Mentoring a workshopy mentální odolnosti',
    roomId: 'r_sal',
    tone: 'violet',
    email: 'marek@example.com',
    workingHours: week({ ...weekdays([r('07:00', '13:00'), r('16:00', '20:00')]), 5: [r('08:00', '12:00')] }),
    breaks: week({}),
    active: true,
    order: 4,
  },
];

/** Úvodní rozhovor, diagnostiku a vyhodnocení vedou kouči a terapeutka. */
const INTAKE = ['t_mala', 't_riha', 't_benesova'];
const COACHES = ['t_mala', 't_riha'];

/** Ceny jsou výchozí návrh – majitel je upraví v Nastavení → Služby. */
export const DEFAULT_SERVICES: Service[] = [
  {
    id: 's_freetalk', name: 'Freetalk', categoryId: 'cat_koucink', durationMin: 30, priceCzk: 0, bufferMin: 0,
    kind: 'individual', capacity: 1, therapistIds: INTAKE, onlineBookable: true, newClientsOnly: true, remote: false,
    description: 'Nezávazný úvodní rozhovor zdarma. Poznáme se, probereme, s čím přicházíte, a domluvíme další postup. Osobně i online.',
    active: true, order: 0,
  },
  {
    id: 's_diagnostika', name: 'Diagnostika', categoryId: 'cat_koucink', durationMin: 90, priceCzk: 2900, bufferMin: 0,
    kind: 'individual', capacity: 1, therapistIds: INTAKE, onlineBookable: true, newClientsOnly: false, remote: false,
    description: 'Vstupní rozhovor, dotazníky a testy pozornosti, reakce a zrakových dovedností. Podklad pro plán spolupráce.',
    active: true, order: 1,
  },
  {
    id: 's_vyhodnoceni', name: 'Vyhodnocení diagnostiky', categoryId: 'cat_koucink', durationMin: 60, priceCzk: 1900, bufferMin: 0,
    kind: 'individual', capacity: 1, therapistIds: INTAKE, onlineBookable: true, newClientsOnly: false, remote: false,
    description: 'Společně projdeme výsledky diagnostiky a domluvíme cíle a plán spolupráce.',
    active: true, order: 2,
  },
  {
    id: 's_koucink', name: 'Mentální koučink', categoryId: 'cat_koucink', durationMin: 60, priceCzk: 1900, bufferMin: 0,
    kind: 'individual', capacity: 1, therapistIds: COACHES, onlineBookable: true, newClientsOnly: false, remote: false,
    description: 'Individuální sezení – nervozita, koncentrace, sebedůvěra a výkon pod tlakem.',
    active: true, order: 3,
  },
  {
    id: 's_koucink_online', name: 'Mentální koučink online', categoryId: 'cat_koucink', durationMin: 60, priceCzk: 1900, bufferMin: 0,
    kind: 'individual', capacity: 1, therapistIds: COACHES, onlineBookable: true, newClientsOnly: false, remote: true,
    description: 'Stejné sezení jako osobně, jen přes videohovor – vhodné na cestách a na soustředění.',
    active: true, order: 4,
  },
  {
    id: 's_strategicky', name: 'Strategický koučink', categoryId: 'cat_koucink', durationMin: 90, priceCzk: 3500, bufferMin: 0,
    kind: 'individual', capacity: 1, therapistIds: ['t_riha'], onlineBookable: true, newClientsOnly: false, remote: false,
    description: 'Pro lídry, manažery a podnikatele – priority, rozhodování, vedení týmu a dlouhodobé cíle.',
    active: true, order: 5,
  },
  {
    id: 's_terapie', name: 'Terapie', categoryId: 'cat_terapie', durationMin: 60, priceCzk: 1500, bufferMin: 0,
    kind: 'individual', capacity: 1, therapistIds: ['t_benesova'], onlineBookable: true, newClientsOnly: false, remote: false,
    description: 'Bezpečný prostor pro práci se stresem, úzkostí, vyhořením a náročnými životními situacemi.',
    active: true, order: 6,
  },
  {
    id: 's_neuro', name: 'Neurovizuální trénink', categoryId: 'cat_neuro', durationMin: 45, priceCzk: 1200, bufferMin: 0,
    kind: 'individual', capacity: 1, therapistIds: ['t_vavrova'], onlineBookable: true, newClientsOnly: false, remote: false,
    description: 'Trénink periferního vidění, rychlosti reakce, koordinace oko–ruka a soustředění.',
    active: true, order: 7,
  },
  {
    id: 's_mentoring', name: 'Mentoring', categoryId: 'cat_mentoring', durationMin: 60, priceCzk: 2500, bufferMin: 0,
    kind: 'individual', capacity: 1, therapistIds: ['t_kos', 't_riha'], onlineBookable: true, newClientsOnly: false, remote: false,
    description: 'Individuální vedení zkušeným mentorem – kariérní kroky, přechody ve sportu i v byznysu a důležitá rozhodnutí.',
    active: true, order: 8,
  },
  {
    id: 's_g_odolnost', name: 'Workshop mentální odolnosti', categoryId: 'cat_workshopy', durationMin: 120, priceCzk: 900, bufferMin: 0,
    kind: 'group', capacity: 12, therapistIds: ['t_kos'], onlineBookable: true, newClientsOnly: false, remote: false,
    description: 'Dvouhodinový skupinový workshop – praktické techniky pro zvládání tlaku a stresu (max. 12 osob).',
    active: true, order: 9,
  },
];

export function defaultGroupTemplates(validFrom: string): GroupTemplate[] {
  const t = (id: string, serviceId: string, weekday: GroupTemplate['weekday'], start: string, title: string): GroupTemplate => ({
    id, serviceId, therapistId: 't_kos', roomId: 'r_sal', weekday, start, title, capacity: 12, validFrom, validTo: null, active: true,
  });
  return [
    t('g_odolnost_ut', 's_g_odolnost', 1, '17:30', 'Mentální odolnost pro sportovce'),
    t('g_odolnost_ct', 's_g_odolnost', 3, '17:30', 'Mentální odolnost v práci'),
    t('g_odolnost_so', 's_g_odolnost', 5, '09:00', 'Workshop mentální odolnosti'),
  ];
}

export const DEFAULT_PACKAGE_TEMPLATES: PackageTemplate[] = [
  {
    id: 'pt_koucink10', name: 'Koučink 10×', description: '10 sezení mentálního koučinku (osobně i online)', entries: 10,
    serviceIds: ['s_koucink', 's_koucink_online'], priceCzk: 16900, validityDays: 183, excusesAllowed: 2, active: true, order: 0,
  },
  {
    id: 'pt_koucink5', name: 'Koučink 5×', description: '5 sezení mentálního koučinku (osobně i online)', entries: 5,
    serviceIds: ['s_koucink', 's_koucink_online'], priceCzk: 8900, validityDays: 120, excusesAllowed: 1, active: true, order: 1,
  },
  {
    id: 'pt_neuro10', name: 'Neurovizuální trénink 10×', description: '10 neurovizuálních tréninků po 45 minutách', entries: 10,
    serviceIds: ['s_neuro'], priceCzk: 10900, validityDays: 120, excusesAllowed: 2, active: true, order: 2,
  },
  {
    id: 'pt_mentoring6', name: 'Mentoring 6×', description: '6 mentoringových sezení po 60 minutách', entries: 6,
    serviceIds: ['s_mentoring'], priceCzk: 13500, validityDays: 183, excusesAllowed: 1, active: true, order: 3,
  },
];

export function defaultSettings(): Settings {
  return {
    clinicName: 'Winning Minds',
    clinicTagline: 'koučink · terapie · mentoring',
    senderName: 'Winning Minds',
    senderEmail: 'rezervace@example.com',
    bookingRules: {
      slotStepMin: 15,
      minNoticeMin: 120,
      horizonDays: 60,
      compactSlots: false,
      maxUpcomingPerClient: 6,
      allowAnyTherapist: true,
      autoCompletePast: true,
    },
    policy: {
      freeCancelHours: 24,
      lateTiers: [
        { hoursBefore: 24, feePct: 50 },
        { hoursBefore: 12, feePct: 100 },
      ],
      noShowFeePct: 100,
      packageLateHandling: 'forfeit_entry',
      excuses: {
        enabled: true,
        perPackage: 2,
        perClientCount: 1,
        perClientMonths: 6,
        deadlineHoursBefore: 2,
        makeupDays: 14,
      },
      graceFirstLateCancel: false,
      groupCancelHours: 6,
      blockAfterNoShows: 3,
    },
    waitlist: { enabled: true, offerMinutes: 120, offerTo: 3 },
    reminders: { enabled: true, hoursBefore: 24 },
    creditBonus: [
      { minTopup: 3000, pct: 5 },
      { minTopup: 5000, pct: 10 },
    ],
    stages: defaultStages(),
    simulatedNow: null,
  };
}

/** Prázdná klinika s výchozím nastavením a katalogem služeb. */
export function createBaseState(validFrom = '2025-01-01'): ClinicState {
  const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
  return {
    schema: SCHEMA_VERSION,
    settings: defaultSettings(),
    categories: clone(DEFAULT_CATEGORIES),
    services: clone(DEFAULT_SERVICES),
    rooms: clone(DEFAULT_ROOMS),
    therapists: clone(DEFAULT_THERAPISTS),
    timeOff: [],
    groupTemplates: defaultGroupTemplates(validFrom),
    cancelledSessions: [],
    packageTemplates: clone(DEFAULT_PACKAGE_TEMPLATES),
    clients: [],
    packages: [],
    bookings: [],
    makeups: [],
    ledger: [],
    payments: [],
    waitlist: [],
    messages: [],
    templates: clone(DEFAULT_TEMPLATES),
    campaigns: [],
    audit: [],
    notes: [],
    files: [],
    followUps: [],
    demoSeededAt: null,
  };
}
