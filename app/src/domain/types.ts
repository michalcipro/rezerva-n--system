/**
 * Datový model rezervačního systému.
 *
 * Časy jsou lokální čas kliniky bez časové zóny:
 *   LocalDateTime = 'YYYY-MM-DDTHH:mm', LocalDate = 'YYYY-MM-DD', TimeOfDay = 'HH:mm'.
 * Klinika pracuje v jedné zóně (Europe/Prague), takže porovnání řetězců odpovídá času.
 */

export type Id = string;
export type LocalDateTime = string;
export type LocalDate = string;
export type TimeOfDay = string;

/** 0 = pondělí … 6 = neděle */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type WeekSchedule = Record<Weekday, TimeRange[]>;

export interface TimeRange {
  start: TimeOfDay;
  end: TimeOfDay;
}

/** Barevné téma kategorie / terapeuta (mapuje se na tokeny v CSS). */
export type Tone = 'teal' | 'sand' | 'blue' | 'violet' | 'slate' | 'rose' | 'olive';

export interface Category {
  id: Id;
  name: string;
  tone: Tone;
  order: number;
}

export type ServiceKind = 'individual' | 'group';

export interface Service {
  id: Id;
  name: string;
  categoryId: Id;
  /** Délka v minutách, vždy násobek 15. */
  durationMin: number;
  priceCzk: number;
  /** Rezerva po službě (úklid, zápis) v minutách. */
  bufferMin: number;
  kind: ServiceKind;
  /** Kapacita skupinové lekce; u individuální služby 1. */
  capacity: number;
  therapistIds: Id[];
  onlineBookable: boolean;
  /** Jen pro nové klienty (např. vstupní vyšetření). */
  newClientsOnly: boolean;
  /** Online konzultace (video). */
  remote: boolean;
  description: string;
  active: boolean;
  order: number;
}

export interface Room {
  id: Id;
  name: string;
}

export interface Therapist {
  id: Id;
  /** Titul před jménem, např. 'Mgr.' */
  title: string;
  firstName: string;
  lastName: string;
  focus: string;
  roomId: Id;
  tone: Tone;
  email: string;
  workingHours: WeekSchedule;
  breaks: WeekSchedule;
  active: boolean;
  order: number;
}

/** Nepřítomnost terapeuta nebo zavření celé kliniky (therapistId = null). */
export interface TimeOff {
  id: Id;
  therapistId: Id | null;
  start: LocalDateTime;
  end: LocalDateTime;
  reason: string;
}

/** Pravidelná skupinová lekce – z ní se odvozují konkrétní termíny. */
export interface GroupTemplate {
  id: Id;
  serviceId: Id;
  therapistId: Id;
  roomId: Id;
  weekday: Weekday;
  start: TimeOfDay;
  title: string;
  capacity: number;
  validFrom: LocalDate;
  validTo: LocalDate | null;
  active: boolean;
}

/** Konkrétní termín skupinové lekce (odvozený, id = `${templateId}@${date}`). */
export interface GroupSession {
  id: Id;
  templateId: Id;
  serviceId: Id;
  therapistId: Id;
  roomId: Id;
  title: string;
  start: LocalDateTime;
  end: LocalDateTime;
  capacity: number;
  cancelled: boolean;
}

export interface ConsentRecord {
  at: LocalDateTime;
  source: string;
}

export interface ClientConsents {
  gdpr: ConsentRecord | null;
  health: ConsentRecord | null;
  marketingEmail: ConsentRecord | null;
  sms: ConsentRecord | null;
}

export interface ClinicalNote {
  id: Id;
  at: LocalDateTime;
  therapistId: Id;
  text: string;
}

export interface Client {
  id: Id;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  birthDate: LocalDate | null;
  tags: string[];
  createdAt: LocalDateTime;
  source: 'online' | 'recepce' | 'telefon' | 'doporučení';
  consents: ClientConsents;
  notes: ClinicalNote[];
  internalNote: string;
  /** Online rezervace zablokované (např. po opakovaném nedostavení). */
  blocked: boolean;
  /** Ukázkový klient vytvořený generátorem dat. */
  demo?: boolean;
  /** Kdy klient naposledy dostal reaktivační e-mail. */
  reactivationSentAt?: LocalDateTime;
  /** Kdy klient naposledy dostal přání k narozeninám. */
  birthdaySentAt?: LocalDateTime;
}

export interface PackageTemplate {
  id: Id;
  name: string;
  description: string;
  entries: number;
  serviceIds: Id[];
  priceCzk: number;
  validityDays: number;
  excusesAllowed: number;
  active: boolean;
  order: number;
}

export type MoneyMethod = 'cash' | 'card' | 'online' | 'transfer';

export interface ClientPackage {
  id: Id;
  clientId: Id;
  templateId: Id;
  name: string;
  serviceIds: Id[];
  entriesTotal: number;
  priceCzk: number;
  excusesAllowed: number;
  purchasedAt: LocalDateTime;
  validUntil: LocalDate;
  paidBy: MoneyMethod | 'credit';
  cancelled: boolean;
  extendedDays: number;
  /** Kdy klient dostal upozornění „zbývají poslední vstupy". */
  lowNoticeAt?: LocalDateTime;
  /** Kdy klient dostal upozornění „permanentka brzy končí". */
  expiringNoticeAt?: LocalDateTime;
}

export type BookingStatus =
  | 'confirmed'
  | 'completed'
  | 'no_show'
  | 'cancelled'
  | 'late_cancelled'
  | 'excused'
  | 'clinic_cancelled';

export type PaymentMethod = 'package' | 'credit' | 'online' | 'onsite' | 'makeup' | 'free';

export interface BookingPayment {
  method: PaymentMethod;
  packageId?: Id;
  makeupId?: Id;
  /** Je cena vyrovnaná (předplaceno, zaplaceno na místě, z permanentky)? */
  paid: boolean;
  paidAmount: number;
  paidAt?: LocalDateTime;
  /** Jak byla cena zaplacena na místě. */
  settledBy?: MoneyMethod;
}

export type FeeStatus = 'due' | 'paid' | 'waived';

export interface BookingFee {
  amount: number;
  pct: number;
  status: FeeStatus;
  reason: 'late_cancel' | 'no_show';
  settledBy?: MoneyMethod | 'credit' | 'package_entry';
  waivedReason?: string;
}

export interface BookingCancel {
  at: LocalDateTime;
  by: 'client' | 'staff';
  phase: 'free' | 'late' | 'no_show' | 'clinic';
  excuse: boolean;
  reason: string;
  grace: boolean;
}

export interface Booking {
  id: Id;
  clientId: Id;
  serviceId: Id;
  therapistId: Id;
  roomId: Id;
  start: LocalDateTime;
  end: LocalDateTime;
  sessionId?: Id;
  status: BookingStatus;
  createdAt: LocalDateTime;
  createdBy: 'client' | 'staff';
  channel: 'online' | 'recepce' | 'telefon';
  price: number;
  payment: BookingPayment;
  fee?: BookingFee;
  cancel?: BookingCancel;
  /** Rezervace je náhradou za omluvený termín. */
  makeupForBookingId?: Id;
  rescheduledFrom?: LocalDateTime;
  note: string;
  reminderSentAt?: LocalDateTime;
  followUpSentAt?: LocalDateTime;
  /** Rezervace vznikla přijetím nabídky z čekací listiny. */
  fromWaitlist?: boolean;
}

export interface MakeupRight {
  id: Id;
  clientId: Id;
  sourceBookingId: Id;
  createdAt: LocalDateTime;
  /** Náhradní termín musí proběhnout nejpozději do tohoto okamžiku. */
  validUntil: LocalDateTime;
  packageId?: Id;
  /** Peněžní hodnota (u termínů placených kreditem / online). */
  value: number;
  serviceIds: Id[];
  status: 'open' | 'used' | 'expired' | 'cancelled';
  usedBookingId?: Id;
  reminderSentAt?: LocalDateTime;
}

export type LedgerKind =
  | 'topup'
  | 'bonus'
  | 'booking_payment'
  | 'refund'
  | 'storno_fee'
  | 'package_purchase'
  | 'adjustment';

/** Pohyb na kreditu (peněžence) klienta. Zůstatek = součet `amount`. */
export interface LedgerEntry {
  id: Id;
  clientId: Id;
  at: LocalDateTime;
  amount: number;
  kind: LedgerKind;
  bookingId?: Id;
  packageId?: Id;
  method?: MoneyMethod;
  note: string;
}

export type PaymentPurpose = 'booking' | 'package' | 'credit_topup' | 'storno_fee';

/** Peníze, které klinika skutečně přijala (pro tržby). */
export interface PaymentRecord {
  id: Id;
  clientId: Id;
  at: LocalDateTime;
  amount: number;
  method: MoneyMethod;
  purpose: PaymentPurpose;
  bookingId?: Id;
  packageId?: Id;
  note: string;
}

export interface WaitlistOffer {
  start: LocalDateTime;
  therapistId: Id;
  sessionId?: Id;
  offeredAt: LocalDateTime;
  expiresAt: LocalDateTime;
}

export interface WaitlistEntry {
  id: Id;
  clientId: Id;
  serviceId: Id;
  therapistId: Id | null;
  dateFrom: LocalDate;
  dateTo: LocalDate;
  sessionId?: Id;
  createdAt: LocalDateTime;
  status: 'waiting' | 'offered' | 'booked' | 'expired' | 'cancelled';
  offer?: WaitlistOffer;
  /** Začátky termínů, které už klientovi byly nabídnuty (aby se nenabízely znovu). */
  offeredStarts: LocalDateTime[];
  bookingId?: Id;
  note: string;
}

export type TemplateKey =
  | 'booking_confirmation'
  | 'reminder'
  | 'cancellation'
  | 'excuse'
  | 'late_cancel'
  | 'no_show'
  | 'clinic_cancel'
  | 'reschedule'
  | 'waitlist_offer'
  | 'makeup_reminder'
  | 'package_low'
  | 'package_expiring'
  | 'after_visit'
  | 'reactivation'
  | 'birthday';

export type Channel = 'email' | 'sms';

export interface MessageTemplate {
  key: TemplateKey;
  name: string;
  description: string;
  channels: Channel[];
  enabled: boolean;
  subject: string;
  body: string;
  smsBody: string;
}

export interface Message {
  id: Id;
  clientId: Id | null;
  channel: Channel;
  kind: TemplateKey | 'campaign' | 'manual';
  subject: string;
  body: string;
  at: LocalDateTime;
  status: 'sent' | 'skipped';
  campaignId?: Id;
  bookingId?: Id;
  /** Proč nebyla zpráva odeslána (chybí souhlas, vypnutá šablona…). */
  skipReason?: string;
}

export type CampaignBlock =
  | { type: 'heading'; text: string }
  | { type: 'text'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'button'; label: string; url: string }
  | { type: 'divider' };

export type SegmentRule =
  | { type: 'visited_category'; categoryId: Id; withinDays: number }
  | { type: 'no_visit_for'; days: number }
  | { type: 'has_active_package'; templateId: Id | null }
  | { type: 'package_expiring'; withinDays: number }
  | { type: 'has_upcoming_booking'; withinDays: number }
  | { type: 'tag'; tag: string }
  | { type: 'new_client'; withinDays: number }
  | { type: 'credit_balance_gt'; amount: number };

export interface SegmentDefinition {
  match: 'all' | 'any';
  rules: SegmentRule[];
  exclude: SegmentRule[];
}

export interface Campaign {
  id: Id;
  name: string;
  subject: string;
  preheader: string;
  blocks: CampaignBlock[];
  segment: SegmentDefinition;
  status: 'draft' | 'scheduled' | 'sent';
  scheduledAt: LocalDateTime | null;
  sentAt: LocalDateTime | null;
  recipients: number;
  createdAt: LocalDateTime;
  updatedAt: LocalDateTime;
}

export interface LateTier {
  /** Platí, když do začátku zbývá MÉNĚ než `hoursBefore` hodin. */
  hoursBefore: number;
  feePct: number;
}

export interface CancellationPolicy {
  /** Zrušení zdarma nejpozději X hodin před začátkem. */
  freeCancelHours: number;
  /** Stupně pozdního storna (seřazené sestupně podle hoursBefore). */
  lateTiers: LateTier[];
  noShowFeePct: number;
  /** Co se stane se vstupem z permanentky při pozdním zrušení. */
  packageLateHandling: 'forfeit_entry' | 'charge_fee';
  excuses: {
    enabled: boolean;
    /** Výchozí počet omluvenek na permanentku (šablona může přepsat). */
    perPackage: number;
    /** Omluvenky pro klienty bez permanentky: `count` za `months` měsíců. */
    perClientCount: number;
    perClientMonths: number;
    /** Omluvit lze nejpozději X hodin před začátkem (0 = do začátku). */
    deadlineHoursBefore: number;
    /** Náhradní termín musí proběhnout do X dní od omluveného termínu. */
    makeupDays: number;
  };
  /** První pozdní storno za 12 měsíců bez poplatku. */
  graceFirstLateCancel: boolean;
  /** Skupinové lekce: odhlášení zdarma nejpozději X hodin předem, potom vstup propadá. */
  groupCancelHours: number;
  /** Po X nedostaveních za 90 dní se zablokují online rezervace (0 = vypnuto). */
  blockAfterNoShows: number;
}

export interface BookingRules {
  slotStepMin: number;
  /** Online rezervace nejpozději X minut předem. */
  minNoticeMin: number;
  /** Online rezervace nejvýše X dní dopředu. */
  horizonDays: number;
  /** Nabízet jen termíny navazující na jiné rezervace (méně mezer). */
  compactSlots: boolean;
  maxUpcomingPerClient: number;
  allowAnyTherapist: boolean;
  /** Proběhlé potvrzené termíny automaticky označit jako proběhlé. */
  autoCompletePast: boolean;
}

export interface WaitlistSettings {
  enabled: boolean;
  /** Jak dlouho platí nabídka uvolněného termínu (minuty). */
  offerMinutes: number;
  /** Kolika čekajícím se termín nabídne současně (potvrdí první). */
  offerTo: number;
}

export interface ReminderSettings {
  enabled: boolean;
  hoursBefore: number;
}

export interface CreditBonusRule {
  minTopup: number;
  pct: number;
}

export interface Settings {
  clinicName: string;
  clinicTagline: string;
  senderName: string;
  senderEmail: string;
  bookingRules: BookingRules;
  policy: CancellationPolicy;
  waitlist: WaitlistSettings;
  reminders: ReminderSettings;
  creditBonus: CreditBonusRule[];
  /** Testovací hodiny – null znamená skutečný čas. */
  simulatedNow: LocalDateTime | null;
}

export interface AuditEntry {
  id: Id;
  at: LocalDateTime;
  actor: string;
  action: string;
  detail: string;
  bookingId?: Id;
  clientId?: Id;
}

export interface ClinicState {
  schema: number;
  settings: Settings;
  categories: Category[];
  services: Service[];
  rooms: Room[];
  therapists: Therapist[];
  timeOff: TimeOff[];
  groupTemplates: GroupTemplate[];
  /** Zrušené termíny skupinových lekcí (id termínu). */
  cancelledSessions: Id[];
  packageTemplates: PackageTemplate[];
  clients: Client[];
  packages: ClientPackage[];
  bookings: Booking[];
  makeups: MakeupRight[];
  ledger: LedgerEntry[];
  payments: PaymentRecord[];
  waitlist: WaitlistEntry[];
  messages: Message[];
  templates: MessageTemplate[];
  campaigns: Campaign[];
  audit: AuditEntry[];
  /** Kdy byla vygenerována ukázková data (null = vlastní data). */
  demoSeededAt: LocalDateTime | null;
}

export type ActorRole = 'owner' | 'reception' | 'therapist' | 'client';

export interface Actor {
  role: ActorRole;
  name: string;
  clientId?: Id;
  therapistId?: Id;
}

export interface Ctx {
  now: LocalDateTime;
  actor: Actor;
}

export type CommandResult<R = undefined> =
  | { ok: true; value: R; notices: string[] }
  | { ok: false; error: string };

export type Command<I, R = undefined> = (draft: ClinicState, input: I, ctx: Ctx) => CommandResult<R>;
