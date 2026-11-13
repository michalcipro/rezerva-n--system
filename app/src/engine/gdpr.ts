/**
 * GDPR: export osobních údajů klienta (čl. 15 a 20) a anonymizace (čl. 17).
 *
 *   clientDataExport(stav, clientId, { now })  → čitelný objekt s českými klíči (pro JSON)
 *   anonymizationCheck(stav, clientId, now)    → co brání anonymizaci a co zůstane v evidenci
 *   anonymizeClient({ clientId })              → příkaz (jen majitelka)
 *   logClientDataExport({ clientId })          → záznam o stažení exportu do historie změn
 *
 * Čistý kód enginu (bez API prohlížeče), deterministický vůči `ctx.now`.
 */
import type {
  Booking,
  Client,
  ClientConsents,
  ClinicState,
  Command,
  Id,
  LedgerEntry,
  LocalDateTime,
  MakeupRight,
  Message,
  MoneyMethod,
  PaymentMethod,
  PaymentPurpose,
  PaymentRequest,
  WaitlistEntry,
  WaitlistOffer,
} from '../domain/types';
import { pushAudit } from './auditLog';
import { fail, offerFreedSlot, ok } from './commands';
import { countLabel, formatDayShort, formatMoney, formatTime } from './format';
import {
  STATUS_LABEL,
  bookingsOfClient,
  clientCredit,
  getPackage,
  getRoom,
  getService,
  getTherapist,
  packageUsage,
  therapistName,
} from './selectors';
import { addMinutes, dateOf } from './time';

/* ------------------------------------------------------------------ */
/* Anonymizovaný klient                                                */
/* ------------------------------------------------------------------ */

export const ANONYMIZED_FIRST_NAME = 'Anonymizovaný';
export const ANONYMIZED_LAST_NAME = 'klient';
export const ANONYMIZED_NAME = `${ANONYMIZED_FIRST_NAME} ${ANONYMIZED_LAST_NAME}`;
/** Štítek, podle kterého anonymizovaného klienta poznáte i v seznamech. */
export const ANONYMIZED_TAG = 'Anonymizováno';
/** Text, který po anonymizaci nahradí obsah zpráv klientovi. */
export const ANONYMIZED_MESSAGE = 'Obsah zprávy byl odstraněn při anonymizaci klienta.';
const REMOVED = '[odstraněno]';

/**
 * Klient s příznakem anonymizace. Pole `anonymizedAt` v `Client` (domain/types.ts) zatím chybí –
 * engine ho zapisuje do záznamu klienta, typ je proto rozšířený tady.
 */
export type ClientWithGdpr = Client & { anonymizedAt?: LocalDateTime };

/** Kdy byl klient anonymizován (null = není). */
export function anonymizedAt(c: Client | undefined): LocalDateTime | null {
  return (c as ClientWithGdpr | undefined)?.anonymizedAt ?? null;
}

export function isAnonymized(c: Client | undefined): boolean {
  if (!c) return false;
  if ((c as ClientWithGdpr).anonymizedAt) return true;
  return c.tags.includes(ANONYMIZED_TAG) && c.firstName === ANONYMIZED_FIRST_NAME && c.lastName === ANONYMIZED_LAST_NAME;
}

/* ------------------------------------------------------------------ */
/* Popisky                                                             */
/* ------------------------------------------------------------------ */

const CONSENT_LABEL: Record<keyof ClientConsents, string> = {
  gdpr: 'Zpracování osobních údajů',
  health: 'Zdravotní dokumentace',
  marketingEmail: 'Obchodní sdělení e-mailem',
  sms: 'SMS zprávy',
};

const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  package: 'permanentka',
  credit: 'z kreditu',
  online: 'kartou online',
  onsite: 'na místě',
  qr: 'QR platba',
  makeup: 'náhrada za omluvený termín',
  free: 'zdarma',
};

const MONEY_LABEL: Record<MoneyMethod | 'credit' | 'package_entry', string> = {
  cash: 'hotově',
  card: 'kartou',
  online: 'kartou online',
  transfer: 'převodem',
  qr: 'QR platbou',
  credit: 'z kreditu',
  package_entry: 'vstupem z permanentky',
};

const LEDGER_LABEL: Record<LedgerEntry['kind'], string> = {
  topup: 'Dobití kreditu',
  bonus: 'Bonus za dobití',
  booking_payment: 'Platba termínu',
  refund: 'Vráceno na kredit',
  storno_fee: 'Storno poplatek',
  package_purchase: 'Nákup permanentky',
  adjustment: 'Úprava kreditu',
};

const PURPOSE_LABEL: Record<PaymentPurpose, string> = {
  booking: 'Termín',
  package: 'Permanentka',
  credit_topup: 'Dobití kreditu',
  storno_fee: 'Storno poplatek',
};

const REQUEST_STATUS: Record<PaymentRequest['status'], string> = { pending: 'čeká na platbu', paid: 'zaplaceno', cancelled: 'zrušeno' };
const MAKEUP_STATUS: Record<MakeupRight['status'], string> = { open: 'k využití', used: 'využitá', expired: 'propadlá', cancelled: 'zrušená' };
const WAITLIST_STATUS: Record<WaitlistEntry['status'], string> = {
  waiting: 'čeká na uvolnění',
  offered: 'termín nabídnut',
  booked: 'rezervováno',
  expired: 'vypršelo',
  cancelled: 'zrušeno',
};
const MESSAGE_STATUS: Record<Message['status'], string> = {
  queued: 'čeká na odeslání',
  sent: 'odesláno',
  failed: 'neodesláno – chyba při odeslání',
  skipped: 'neodesláno',
};
const FEE_STATUS = { due: 'k úhradě', paid: 'uhrazeno', waived: 'odpuštěno' } as const;
const FEE_REASON = { late_cancel: 'pozdní zrušení', no_show: 'nedostavení' } as const;

/* ------------------------------------------------------------------ */
/* Export osobních údajů                                               */
/* ------------------------------------------------------------------ */

export type ExportValue = string | number | boolean | null | string[];
export type ExportRecord = Record<string, ExportValue>;

/** Všechny osobní údaje klienta v čitelné struktuře (klíče česky, data ve tvaru RRRR-MM-DDTHH:MM). */
export interface ClientDataExport {
  'O exportu': ExportRecord;
  Klient: ExportRecord;
  Souhlasy: ExportRecord[];
  Rezervace: ExportRecord[];
  Permanentky: ExportRecord[];
  Kredit: { 'Zůstatek (Kč)': number; Pohyby: ExportRecord[] };
  Platby: ExportRecord[];
  'Platební výzvy': ExportRecord[];
  'Náhradní termíny': ExportRecord[];
  'Čekací listina': ExportRecord[];
  Zprávy: ExportRecord[];
  /** Klinické poznámky, nebo vysvětlení, proč v exportu nejsou. */
  'Klinické poznámky': ExportRecord[] | string;
  'Historie změn': ExportRecord[];
}

export interface ClientDataExportOptions {
  /** Čas vytvoření exportu (čas kliniky). */
  now?: LocalDateTime;
  /** Zdravotní dokumentace – jen pro role, které ji smí vidět (výchozí ano). */
  includeClinicalNotes?: boolean;
}

const byAt = <T extends { at: string }>(a: T, b: T): number => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0);
const orNull = (v: string | undefined | null): string | null => (v === undefined || v === null || v === '' ? null : v);

function messageKind(s: ClinicState, m: Message): string {
  if (m.kind === 'manual') return 'Ruční zpráva';
  if (m.kind === 'campaign') {
    const c = m.campaignId ? s.campaigns.find((x) => x.id === m.campaignId) : undefined;
    return c ? `Kampaň „${c.name}“` : 'Kampaň';
  }
  return s.templates.find((t) => t.key === m.kind)?.name ?? m.kind;
}

function bookingRecord(s: ClinicState, b: Booking): ExportRecord {
  const svc = getService(s, b.serviceId);
  const pkg = b.payment.packageId ? getPackage(s, b.payment.packageId) : undefined;
  return {
    ID: b.id,
    Začátek: b.start,
    Konec: b.end,
    Služba: svc?.name ?? null,
    Terapeut: therapistName(getTherapist(s, b.therapistId)),
    Místnost: getRoom(s, b.roomId)?.name ?? null,
    Stav: STATUS_LABEL[b.status],
    Vytvořeno: b.createdAt,
    'Vytvořil(a)': b.createdBy === 'client' ? 'klient' : 'klinika',
    Kanál: b.channel,
    'Cena (Kč)': b.price,
    'Způsob platby': PAYMENT_LABEL[b.payment.method] + (pkg ? ` ${pkg.name}` : ''),
    Zaplaceno: b.payment.paid,
    'Zaplacená částka (Kč)': b.payment.paidAmount,
    'Zaplaceno dne': orNull(b.payment.paidAt),
    'Zaplaceno na místě': b.payment.settledBy ? MONEY_LABEL[b.payment.settledBy] : null,
    'Poplatek (Kč)': b.fee ? b.fee.amount : null,
    'Důvod poplatku': b.fee ? FEE_REASON[b.fee.reason] : null,
    'Stav poplatku': b.fee ? FEE_STATUS[b.fee.status] : null,
    'Zrušeno dne': orNull(b.cancel?.at),
    'Zrušil(a)': b.cancel ? (b.cancel.by === 'client' ? 'klient' : 'klinika') : null,
    'Omluvenka': b.cancel ? b.cancel.excuse : null,
    'Důvod zrušení': orNull(b.cancel?.reason),
    'Přesunuto z': orNull(b.rescheduledFrom),
    'Náhrada za termín': orNull(b.makeupForBookingId),
    'Připomínka odeslána': orNull(b.reminderSentAt),
    Poznámka: orNull(b.note),
  };
}

/**
 * Export všech osobních údajů, které o klientovi systém vede. Vrací null, když klient neexistuje.
 * Objekt je připravený pro `JSON.stringify(…, null, 2)`.
 */
export function clientDataExport(s: ClinicState, clientId: Id, opts: ClientDataExportOptions = {}): ClientDataExport | null {
  const c = s.clients.find((x) => x.id === clientId);
  if (!c) return null;
  const includeNotes = opts.includeClinicalNotes !== false;
  const today = dateOf(opts.now ?? c.createdAt);
  const bookings = bookingsOfClient(s, clientId);
  const bookingIds = new Set(bookings.map((b) => b.id));
  const ledger = s.ledger.filter((e) => e.clientId === clientId).sort(byAt);
  const anon = anonymizedAt(c);

  return {
    'O exportu': {
      Vytvořeno: opts.now ?? null,
      'Správce osobních údajů': s.settings.clinicName,
      'Kontakt na správce': s.settings.senderEmail,
      Obsah: 'Všechny osobní údaje, které o klientovi vede rezervační systém kliniky (právo na přístup a přenositelnost, čl. 15 a 20 GDPR).',
      'Formát dat': 'Data a časy jsou místním časem kliniky ve tvaru RRRR-MM-DDTHH:MM, částky jsou v Kč.',
      'Verze formátu': 1,
    },
    Klient: {
      ID: c.id,
      Jméno: c.firstName,
      Příjmení: c.lastName,
      'E-mail': orNull(c.email),
      Telefon: orNull(c.phone),
      'Datum narození': c.birthDate,
      Štítky: [...c.tags],
      'Interní poznámka': orNull(c.internalNote),
      'Klientem od': c.createdAt,
      'Zdroj registrace': c.source,
      'Online rezervace zablokované': c.blocked,
      'Naposledy reaktivační e-mail': orNull(c.reactivationSentAt),
      'Naposledy přání k narozeninám': orNull(c.birthdaySentAt),
      Anonymizováno: anon,
    },
    Souhlasy: (Object.keys(CONSENT_LABEL) as (keyof ClientConsents)[]).map((key) => {
      const rec = c.consents[key];
      return { Souhlas: CONSENT_LABEL[key], Stav: rec ? 'udělen' : 'neudělen', 'Udělen dne': rec?.at ?? null, Zdroj: rec?.source ?? null };
    }),
    Rezervace: bookings.map((b) => bookingRecord(s, b)),
    Permanentky: s.packages
      .filter((p) => p.clientId === clientId)
      .sort((a, b) => (a.purchasedAt < b.purchasedAt ? -1 : 1))
      .map((p) => {
        const u = packageUsage(s, p, today);
        return {
          ID: p.id,
          Název: p.name,
          Zakoupeno: p.purchasedAt,
          'Platí do': u.validUntil,
          'Prodlouženo o dní': p.extendedDays,
          'Vstupů celkem': p.entriesTotal,
          Využito: u.used,
          Propadlo: u.forfeited,
          Rezervováno: u.reserved,
          Volné: u.free,
          'Omluvenky celkem': p.excusesAllowed,
          'Omluvenky využité': u.excusesUsed,
          'Cena (Kč)': p.priceCzk,
          Zaplaceno: MONEY_LABEL[p.paidBy],
          Zrušená: p.cancelled,
        };
      }),
    Kredit: {
      'Zůstatek (Kč)': clientCredit(s, clientId),
      Pohyby: ledger.map((e) => ({ Datum: e.at, Druh: LEDGER_LABEL[e.kind], 'Částka (Kč)': e.amount, Poznámka: orNull(e.note), Rezervace: orNull(e.bookingId) })),
    },
    Platby: s.payments
      .filter((p) => p.clientId === clientId)
      .sort(byAt)
      .map((p) => ({
        Datum: p.at,
        'Za co': PURPOSE_LABEL[p.purpose],
        Způsob: MONEY_LABEL[p.method],
        'Částka (Kč)': p.amount,
        'Variabilní symbol': orNull(p.vs),
        Poznámka: orNull(p.note),
        Rezervace: orNull(p.bookingId),
      })),
    'Platební výzvy': s.paymentRequests
      .filter((r) => r.clientId === clientId)
      .sort(byAt)
      .map((r) => ({
        Vytvořeno: r.at,
        'Za co': r.label,
        'Částka (Kč)': r.amount,
        'Variabilní symbol': r.vs,
        Splatnost: r.dueAt,
        Stav: REQUEST_STATUS[r.status],
        'Vyřízeno dne': orNull(r.resolvedAt),
      })),
    'Náhradní termíny': s.makeups
      .filter((m) => m.clientId === clientId)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      .map((m) => ({
        'Za omluvený termín': m.sourceBookingId,
        Vznik: m.createdAt,
        'Využít do': m.validUntil,
        'Hodnota (Kč)': m.value,
        Stav: MAKEUP_STATUS[m.status],
        'Využito na termín': orNull(m.usedBookingId),
      })),
    'Čekací listina': s.waitlist
      .filter((w) => w.clientId === clientId)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      .map((w) => ({
        Přihlášeno: w.createdAt,
        Služba: getService(s, w.serviceId)?.name ?? null,
        Terapeut: w.therapistId ? therapistName(getTherapist(s, w.therapistId)) : 'kdokoli',
        Od: w.dateFrom,
        Do: w.dateTo,
        Stav: WAITLIST_STATUS[w.status],
        Poznámka: orNull(w.note),
      })),
    Zprávy: s.messages
      .filter((m) => m.clientId === clientId)
      .sort(byAt)
      .map((m) => ({
        Čas: m.at,
        Kanál: m.channel === 'sms' ? 'SMS' : 'e-mail',
        Typ: messageKind(s, m),
        Předmět: orNull(m.subject),
        Text: m.body,
        Stav: MESSAGE_STATUS[m.status],
        'Převzato k doručení': orNull(m.sentAt),
        'Důvod neodeslání': orNull(m.skipReason ?? m.error),
      })),
    'Klinické poznámky': includeNotes
      ? c.notes
          .slice()
          .sort(byAt)
          .map((n) => ({ Datum: n.at, Terapeut: therapistName(getTherapist(s, n.therapistId)), Text: n.text }))
      : c.notes.length
        ? `Zdravotní dokumentace není součástí tohoto exportu (${countLabel(c.notes.length, ['záznam', 'záznamy', 'záznamů'])}) – vydá ji terapeut nebo majitelka kliniky.`
        : [],
    'Historie změn': s.audit
      .filter((a) => a.clientId === clientId || (!!a.bookingId && bookingIds.has(a.bookingId)))
      .sort(byAt)
      .map((a) => ({ Kdy: a.at, Kdo: a.actor, Změna: a.action, Podrobnosti: a.detail })),
  };
}

/** Název souboru exportu bez diakritiky, např. „osobni-udaje-novakova-jana-2026-11-13.json“. */
export function clientDataExportFilename(c: Pick<Client, 'firstName' | 'lastName'>, now: LocalDateTime): string {
  const slug = (v: string): string =>
    v
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  const who = [slug(c.lastName), slug(c.firstName)].filter(Boolean).join('-') || 'klient';
  return `osobni-udaje-${who}-${dateOf(now)}.json`;
}

/** Zapíše do historie změn, že personál stáhl export osobních údajů (odpovědnost správce, čl. 5 odst. 2). */
export const logClientDataExport: Command<{ clientId: Id }> = (d, input, ctx) => {
  if (ctx.actor.role !== 'owner' && ctx.actor.role !== 'reception') return fail('Export osobních údajů může stáhnout jen majitelka nebo recepce.');
  const c = d.clients.find((x) => x.id === input.clientId);
  if (!c) return fail('Klient neexistuje.');
  pushAudit(d, ctx, 'Export osobních údajů', 'Stažen export údajů klienta (GDPR)', { clientId: c.id });
  return ok(undefined);
};

/* ------------------------------------------------------------------ */
/* Anonymizace                                                         */
/* ------------------------------------------------------------------ */

export interface AnonymizationCheck {
  /** Co je potřeba vyřešit dřív (anonymizace se odmítne). */
  blockers: string[];
  /** Co zůstane v evidenci bez vazby na osobu nebo se smaže (jen upozornění). */
  notes: string[];
}

/** Co brání anonymizaci a na co upozornit (pro potvrzovací dialog i příkaz). */
export function anonymizationCheck(s: ClinicState, clientId: Id, now: LocalDateTime): AnonymizationCheck {
  const blockers: string[] = [];
  const notes: string[] = [];
  const c = s.clients.find((x) => x.id === clientId);
  if (!c) return { blockers: ['Klient neexistuje.'], notes };
  const bookings = bookingsOfClient(s, clientId);
  const upcoming = bookings.filter((b) => b.status === 'confirmed' && b.end > now).sort((a, b) => (a.start < b.start ? -1 : 1));
  if (upcoming.length) {
    const first = upcoming[0];
    blockers.push(
      `Klient má ${countLabel(upcoming.length, ['nadcházející rezervaci', 'nadcházející rezervace', 'nadcházejících rezervací'])} (nejbližší ${formatDayShort(first.start)} v ${formatTime(first.start)}). Nejdřív je zrušte nebo přesuňte, potom klienta anonymizujte.`,
    );
  }
  const pending = s.paymentRequests.filter((r) => r.clientId === clientId && r.status === 'pending');
  if (pending.length) {
    blockers.push(
      `Klient má ${countLabel(pending.length, ['čekající QR platbu', 'čekající QR platby', 'čekajících QR plateb'])} (VS ${pending.map((r) => r.vs).join(', ')}). Potvrďte je, až peníze dorazí, nebo je zrušte.`,
    );
  }
  const credit = clientCredit(s, clientId);
  if (credit > 0) notes.push(`Na kreditu zůstává ${formatMoney(credit)}. Pokud má klient dostat peníze zpět, vyplaťte je před anonymizací.`);
  const today = dateOf(now);
  let freeEntries = 0;
  for (const p of s.packages) {
    if (p.clientId !== clientId || p.cancelled) continue;
    const u = packageUsage(s, p, today);
    if (!u.expired) freeEntries += u.free;
  }
  if (freeEntries > 0) notes.push(`Na permanentkách zůstává ${countLabel(freeEntries, ['nevyčerpaný vstup', 'nevyčerpané vstupy', 'nevyčerpaných vstupů'])}.`);
  let debt = 0;
  for (const b of bookings) {
    if (b.fee?.status === 'due') debt += b.fee.amount;
    if (b.status === 'completed' && !b.payment.paid && (b.payment.method === 'onsite' || b.payment.method === 'qr')) debt += b.price - b.payment.paidAmount;
  }
  if (debt > 0) notes.push(`Klient dluží ${formatMoney(debt)} – po anonymizaci ho už nebude možné kontaktovat.`);
  if (c.notes.length) {
    notes.push(
      `Smaže se zdravotní dokumentace (${countLabel(c.notes.length, ['klinická poznámka', 'klinické poznámky', 'klinických poznámek'])}). Pokud ji musíte ze zákona uchovávat, stáhněte si nejdřív export údajů.`,
    );
  }
  return { blockers, notes };
}

interface Scrubber {
  /** Jen celé jméno, e-mail a telefon – pro záznamy, které s klientem přímo nesouvisí. */
  strict(text: string): string;
  /** Navíc samostatné jméno a příjmení i ve skloňovaných tvarech – pro záznamy klienta. */
  loose(text: string): string;
}

const escapeRe = (v: string): string => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Odstraní z volného textu jméno, e-mail a telefon klienta. */
function scrubberFor(c: Client): Scrubber {
  const strict: { re: RegExp; to: string }[] = [];
  const first = c.firstName.trim();
  const last = c.lastName.trim();
  for (const full of [`${first} ${last}`, `${last} ${first}`]) {
    if (first && last) strict.push({ re: new RegExp(escapeRe(full).replace(/ /g, '\\s+'), 'giu'), to: ANONYMIZED_NAME });
  }
  if (c.email.trim()) strict.push({ re: new RegExp(escapeRe(c.email.trim()), 'gi'), to: REMOVED });
  const digits = c.phone.replace(/\D/g, '');
  const core = digits.length >= 9 ? digits.slice(-9) : digits.length >= 6 ? digits : '';
  if (core) strict.push({ re: new RegExp('(?:\\+?\\d{1,3}[\\s.-]?)?' + core.split('').join('[\\s.-]?'), 'g'), to: REMOVED });

  const loose = [...strict];
  for (const name of [last, first]) {
    if (name.length < 2 || name === ANONYMIZED_FIRST_NAME || name === ANONYMIZED_LAST_NAME) continue;
    // „Nováková“ → „Novákov…“ zachytí i „Novákové“, „Novákovou“; jen s velkým písmenem (běžná slova nechá být)
    const stem = name.length >= 5 && /[aáeéěiíoóuúůyý]$/i.test(name) ? name.slice(0, -1) : name;
    loose.push({ re: new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(stem)}\\p{L}*`, 'gu'), to: `$1${REMOVED}` });
  }
  const apply = (rules: { re: RegExp; to: string }[], text: string): string => rules.reduce((t, r) => t.replace(r.re, r.to), text);
  return { strict: (t) => (t ? apply(strict, t) : t), loose: (t) => (t ? apply(loose, t) : t) };
}

/**
 * Anonymizace klienta (jen majitelka): smaže jméno, kontakty, datum narození, štítky, poznámky,
 * klinickou dokumentaci, souhlasy a texty zpráv. Rezervace, platby a pohyby kreditu zůstanou
 * kvůli účetnictví – bez osobních údajů. Odmítne se, dokud má klient nadcházející rezervace
 * nebo čekající QR platby.
 */
export const anonymizeClient: Command<{ clientId: Id }, { message: string }> = (d, input, ctx) => {
  if (ctx.actor.role !== 'owner') return fail('Anonymizovat klienta může jen majitelka kliniky.');
  const c = d.clients.find((x) => x.id === input.clientId) as ClientWithGdpr | undefined;
  if (!c) return fail('Klient neexistuje.');
  if (isAnonymized(c)) return fail('Klient už je anonymizovaný.');
  const check = anonymizationCheck(d, c.id, ctx.now);
  if (check.blockers.length) return fail(check.blockers.join(' '));

  const id = c.id;
  const scrub = scrubberFor(c);

  // 1) karta klienta
  c.firstName = ANONYMIZED_FIRST_NAME;
  c.lastName = ANONYMIZED_LAST_NAME;
  c.email = '';
  c.phone = '';
  c.birthDate = null;
  c.tags = [ANONYMIZED_TAG];
  c.notes = [];
  c.internalNote = '';
  c.consents = { gdpr: null, health: null, marketingEmail: null, sms: null };
  delete c.reactivationSentAt;
  delete c.birthdaySentAt;
  c.anonymizedAt = ctx.now;

  // 2) rezervace zůstávají (účetnictví), bez volného textu
  const bookingIds = new Set<Id>();
  for (const b of d.bookings) {
    if (b.clientId !== id) continue;
    bookingIds.add(b.id);
    b.note = '';
    if (b.cancel) b.cancel.reason = '';
    if (b.fee?.waivedReason) b.fee.waivedReason = 'Odpuštěno personálem';
  }

  // 3) zprávy: bez obsahu; čekající ve frontě se už neodešlou
  for (const m of d.messages) {
    if (m.clientId !== id) continue;
    m.subject = '';
    m.body = ANONYMIZED_MESSAGE;
    delete m.error;
    if (m.status === 'queued') {
      m.status = 'skipped';
      m.skipReason = 'Klient byl anonymizován – zpráva se neodešle.';
    }
  }

  // 4) čekací listina: ukončit; nabídnutý termín dostanou další čekající
  const released: { serviceId: Id; offer: WaitlistOffer }[] = [];
  for (const w of d.waitlist) {
    if (w.clientId !== id) continue;
    w.note = '';
    if (w.status === 'waiting' || w.status === 'offered') {
      if (w.status === 'offered' && w.offer) released.push({ serviceId: w.serviceId, offer: { ...w.offer } });
      w.status = 'cancelled';
      w.offer = undefined;
    }
  }

  // 5) otevřené náhrady propadají, permanentky už neposílají upozornění
  for (const m of d.makeups) if (m.clientId === id && m.status === 'open') m.status = 'cancelled';
  for (const p of d.packages) {
    if (p.clientId !== id) continue;
    p.lowNoticeAt = p.lowNoticeAt ?? ctx.now;
    p.expiringNoticeAt = p.expiringNoticeAt ?? ctx.now;
  }

  // 6) peníze: záznamy zůstávají, z poznámek zmizí osobní údaje
  for (const e of d.ledger) if (e.clientId === id) e.note = scrub.loose(e.note);
  for (const p of d.payments) if (p.clientId === id) p.note = scrub.loose(p.note);
  for (const r of d.paymentRequests) {
    if (r.clientId !== id) continue;
    r.label = scrub.loose(r.label);
    if (r.resolvedBy) r.resolvedBy = scrub.strict(r.resolvedBy);
  }

  // 7) historie změn: záznamy zůstávají, bez jména a kontaktů klienta
  for (const a of d.audit) {
    const related = a.clientId === id || (!!a.bookingId && bookingIds.has(a.bookingId));
    a.detail = related ? scrub.loose(a.detail) : scrub.strict(a.detail);
    a.actor = scrub.strict(a.actor);
  }

  for (const { serviceId, offer } of released) {
    const svc = d.services.find((x) => x.id === serviceId);
    if (!svc || offer.start <= ctx.now) continue;
    offerFreedSlot(d, ctx, {
      serviceId: svc.id,
      therapistId: offer.therapistId,
      start: offer.start,
      end: addMinutes(offer.start, svc.durationMin),
      sessionId: offer.sessionId,
      excludeClientId: id,
    });
  }

  pushAudit(d, ctx, 'Anonymizace klienta', 'Osobní údaje odstraněny (GDPR). Rezervace, platby a pohyby kreditu zůstaly bez osobních údajů.', { clientId: id });
  return ok({ message: 'Klient je anonymizovaný.' });
};
