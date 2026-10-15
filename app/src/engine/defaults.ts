import type {
  Category,
  ClinicState,
  GroupTemplate,
  PackageTemplate,
  Room,
  Service,
  Settings,
  Therapist,
  TimeRange,
  WeekSchedule,
} from '../domain/types';
import { DEFAULT_TEMPLATES } from './messages';

export const SCHEMA_VERSION = 1;

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
  { id: 'cat_fyzio', name: 'Fyzioterapie', tone: 'teal', order: 0 },
  { id: 'cat_masaze', name: 'Masáže', tone: 'sand', order: 1 },
  { id: 'cat_trenink', name: 'Trénink 1:1', tone: 'blue', order: 2 },
  { id: 'cat_skupiny', name: 'Skupinové lekce', tone: 'violet', order: 3 },
  { id: 'cat_pristroje', name: 'Přístroje a taping', tone: 'slate', order: 4 },
];

export const DEFAULT_ROOMS: Room[] = [
  { id: 'r_o1', name: 'Ordinace 1' },
  { id: 'r_o2', name: 'Ordinace 2' },
  { id: 'r_o3', name: 'Ordinace 3' },
  { id: 'r_maserna', name: 'Masérna' },
  { id: 'r_sal', name: 'Tréninkový sál' },
];

export const DEFAULT_THERAPISTS: Therapist[] = [
  {
    id: 't_mala',
    title: 'Mgr.',
    firstName: 'Tereza',
    lastName: 'Malá',
    focus: 'Fyzioterapie – ortopedie, záda',
    roomId: 'r_o1',
    tone: 'teal',
    email: 'tereza@example.com',
    workingHours: week({ ...weekdays([r('07:30', '17:00')]), 5: [r('08:00', '12:00')] }),
    breaks: week(weekdays([r('12:00', '13:00')])),
    active: true,
    order: 0,
  },
  {
    id: 't_riha',
    title: 'Mgr.',
    firstName: 'Jakub',
    lastName: 'Říha',
    focus: 'Sportovní fyzioterapie',
    roomId: 'r_o2',
    tone: 'blue',
    email: 'jakub@example.com',
    workingHours: week(weekdays([r('08:00', '18:00')])),
    breaks: week(weekdays([r('12:00', '12:30')])),
    active: true,
    order: 1,
  },
  {
    id: 't_benesova',
    title: 'Bc.',
    firstName: 'Klára',
    lastName: 'Benešová',
    focus: 'Fyzioterapie – pánevní dno',
    roomId: 'r_o3',
    tone: 'rose',
    email: 'klara@example.com',
    workingHours: week({ 0: [r('09:00', '16:00')], 1: [r('09:00', '16:00')], 2: [r('09:00', '16:00')], 3: [r('09:00', '16:00')], 4: [r('08:00', '13:00')] }),
    breaks: week({ 0: [r('12:00', '13:00')], 1: [r('12:00', '13:00')], 2: [r('12:00', '13:00')], 3: [r('12:00', '13:00')] }),
    active: true,
    order: 2,
  },
  {
    id: 't_vavrova',
    title: '',
    firstName: 'Lucie',
    lastName: 'Vávrová',
    focus: 'Masáže',
    roomId: 'r_maserna',
    tone: 'sand',
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
    focus: 'Kondiční trénink',
    roomId: 'r_sal',
    tone: 'violet',
    email: 'marek@example.com',
    workingHours: week({ ...weekdays([r('07:00', '13:00'), r('16:00', '20:00')]), 5: [r('08:00', '12:00')] }),
    breaks: week({}),
    active: true,
    order: 4,
  },
];

const FYZIO = ['t_mala', 't_riha', 't_benesova'];

export const DEFAULT_SERVICES: Service[] = [
  {
    id: 's_vstupni', name: 'Vstupní vyšetření a terapie', categoryId: 'cat_fyzio', durationMin: 60, priceCzk: 1490, bufferMin: 0,
    kind: 'individual', capacity: 1, therapistIds: FYZIO, onlineBookable: true, newClientsOnly: true, remote: false,
    description: 'První návštěva: rozhovor, vyšetření, první terapie a plán dalšího postupu.', active: true, order: 0,
  },
  {
    id: 's_fyzio45', name: 'Fyzioterapie 45 min', categoryId: 'cat_fyzio', durationMin: 45, priceCzk: 1190, bufferMin: 0,
    kind: 'individual', capacity: 1, therapistIds: FYZIO, onlineBookable: true, newClientsOnly: false, remote: false,
    description: 'Navazující terapie podle plánu.', active: true, order: 1,
  },
  {
    id: 's_fyzio30', name: 'Fyzioterapie 30 min', categoryId: 'cat_fyzio', durationMin: 30, priceCzk: 850, bufferMin: 0,
    kind: 'individual', capacity: 1, therapistIds: FYZIO, onlineBookable: true, newClientsOnly: false, remote: false,
    description: 'Krátká kontrola nebo úprava cvičení.', active: true, order: 2,
  },
  {
    id: 's_panevni', name: 'Fyzioterapie pánevního dna', categoryId: 'cat_fyzio', durationMin: 60, priceCzk: 1390, bufferMin: 0,
    kind: 'individual', capacity: 1, therapistIds: ['t_benesova'], onlineBookable: true, newClientsOnly: false, remote: false,
    description: 'Těhotenství, po porodu, inkontinence.', active: true, order: 3,
  },
  {
    id: 's_online', name: 'Online konzultace', categoryId: 'cat_fyzio', durationMin: 30, priceCzk: 700, bufferMin: 0,
    kind: 'individual', capacity: 1, therapistIds: ['t_mala', 't_benesova'], onlineBookable: true, newClientsOnly: false, remote: true,
    description: 'Videohovor – kontrola cvičení, konzultace potíží.', active: true, order: 4,
  },
  {
    id: 's_razova', name: 'Rázová vlna', categoryId: 'cat_pristroje', durationMin: 15, priceCzk: 600, bufferMin: 0,
    kind: 'individual', capacity: 1, therapistIds: ['t_riha', 't_mala'], onlineBookable: true, newClientsOnly: false, remote: false,
    description: 'Terapie rázovou vlnou, 1 oblast.', active: true, order: 5,
  },
  {
    id: 's_taping', name: 'Kinesiotaping', categoryId: 'cat_pristroje', durationMin: 15, priceCzk: 350, bufferMin: 0,
    kind: 'individual', capacity: 1, therapistIds: FYZIO, onlineBookable: true, newClientsOnly: false, remote: false,
    description: 'Aplikace tejpu na jednu oblast.', active: true, order: 6,
  },
  {
    id: 's_sport60', name: 'Sportovní masáž 60 min', categoryId: 'cat_masaze', durationMin: 60, priceCzk: 1090, bufferMin: 0,
    kind: 'individual', capacity: 1, therapistIds: ['t_vavrova'], onlineBookable: true, newClientsOnly: false, remote: false,
    description: 'Celková sportovní masáž.', active: true, order: 7,
  },
  {
    id: 's_sport90', name: 'Sportovní masáž 90 min', categoryId: 'cat_masaze', durationMin: 90, priceCzk: 1490, bufferMin: 0,
    kind: 'individual', capacity: 1, therapistIds: ['t_vavrova'], onlineBookable: true, newClientsOnly: false, remote: false,
    description: 'Prodloužená celková masáž.', active: true, order: 8,
  },
  {
    id: 's_rekond30', name: 'Rekondiční masáž 30 min', categoryId: 'cat_masaze', durationMin: 30, priceCzk: 650, bufferMin: 0,
    kind: 'individual', capacity: 1, therapistIds: ['t_vavrova'], onlineBookable: true, newClientsOnly: false, remote: false,
    description: 'Zádová nebo šíjová masáž.', active: true, order: 9,
  },
  {
    id: 's_trening', name: 'Kondiční trénink 1:1', categoryId: 'cat_trenink', durationMin: 60, priceCzk: 950, bufferMin: 0,
    kind: 'individual', capacity: 1, therapistIds: ['t_kos'], onlineBookable: true, newClientsOnly: false, remote: false,
    description: 'Individuální trénink podle plánu.', active: true, order: 10,
  },
  {
    id: 's_g_zada', name: 'Zdravá záda', categoryId: 'cat_skupiny', durationMin: 60, priceCzk: 320, bufferMin: 0,
    kind: 'group', capacity: 8, therapistIds: ['t_kos'], onlineBookable: true, newClientsOnly: false, remote: false,
    description: 'Skupinová lekce pro stabilizaci trupu (max. 8 osob).', active: true, order: 11,
  },
  {
    id: 's_g_funkcni', name: 'Funkční trénink', categoryId: 'cat_skupiny', durationMin: 60, priceCzk: 320, bufferMin: 0,
    kind: 'group', capacity: 8, therapistIds: ['t_kos'], onlineBookable: true, newClientsOnly: false, remote: false,
    description: 'Skupinový kondiční trénink (max. 8 osob).', active: true, order: 12,
  },
  {
    id: 's_g_pilates', name: 'Pilates', categoryId: 'cat_skupiny', durationMin: 60, priceCzk: 320, bufferMin: 0,
    kind: 'group', capacity: 8, therapistIds: ['t_kos'], onlineBookable: true, newClientsOnly: false, remote: false,
    description: 'Pilates zaměřený na záda (max. 8 osob).', active: true, order: 13,
  },
];

export function defaultGroupTemplates(validFrom: string): GroupTemplate[] {
  const t = (id: string, serviceId: string, weekday: GroupTemplate['weekday'], start: string, title: string): GroupTemplate => ({
    id, serviceId, therapistId: 't_kos', roomId: 'r_sal', weekday, start, title, capacity: 8, validFrom, validTo: null, active: true,
  });
  return [
    t('g_zada_po', 's_g_zada', 0, '12:00', 'Zdravá záda'),
    t('g_funkcni_po', 's_g_funkcni', 0, '17:00', 'Funkční trénink'),
    t('g_pilates_ut', 's_g_pilates', 1, '18:00', 'Pilates'),
    t('g_zada_st', 's_g_zada', 2, '12:00', 'Zdravá záda'),
    t('g_funkcni_st', 's_g_funkcni', 2, '17:00', 'Funkční trénink'),
    t('g_pilates_ct', 's_g_pilates', 3, '18:00', 'Pilates'),
    t('g_funkcni_so', 's_g_funkcni', 5, '09:00', 'Funkční trénink'),
  ];
}

export const DEFAULT_PACKAGE_TEMPLATES: PackageTemplate[] = [
  {
    id: 'pt_fyzio10', name: 'Fyzio 10', description: '10× fyzioterapie 45 min', entries: 10, serviceIds: ['s_fyzio45'],
    priceCzk: 10900, validityDays: 183, excusesAllowed: 2, active: true, order: 0,
  },
  {
    id: 'pt_fyzio5', name: 'Fyzio 5', description: '5× fyzioterapie 45 min', entries: 5, serviceIds: ['s_fyzio45'],
    priceCzk: 5650, validityDays: 120, excusesAllowed: 1, active: true, order: 1,
  },
  {
    id: 'pt_masaz5', name: 'Masáž 5', description: '5× sportovní masáž 60 min', entries: 5, serviceIds: ['s_sport60'],
    priceCzk: 4990, validityDays: 122, excusesAllowed: 1, active: true, order: 2,
  },
  {
    id: 'pt_trening10', name: 'Trénink 10', description: '10× kondiční trénink 1:1', entries: 10, serviceIds: ['s_trening'],
    priceCzk: 8550, validityDays: 183, excusesAllowed: 2, active: true, order: 3,
  },
  {
    id: 'pt_skupiny8', name: 'Skupiny 8', description: '8 skupinových lekcí na měsíc', entries: 8, serviceIds: ['s_g_zada', 's_g_funkcni', 's_g_pilates'],
    priceCzk: 1990, validityDays: 31, excusesAllowed: 2, active: true, order: 4,
  },
];

export function defaultSettings(): Settings {
  return {
    clinicName: 'Winning Minds',
    clinicTagline: 'rezervace',
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
    demoSeededAt: null,
  };
}
