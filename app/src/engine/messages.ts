import type {
  Booking,
  Channel,
  ClinicState,
  Id,
  LocalDateTime,
  Message,
  MessageTemplate,
  TemplateKey,
} from '../domain/types';
import { formatDayShort, formatMoney, formatTime } from './format';
import { newId } from './ids';
import { getClient, getPackage, getRoom, getService, getTherapist, therapistName } from './selectors';

/** Šablony automatických zpráv. Proměnné se zapisují do hranatých závorek, např. [jméno]. */
export const DEFAULT_TEMPLATES: MessageTemplate[] = [
  {
    key: 'booking_confirmation',
    name: 'Potvrzení rezervace',
    description: 'Ihned po vytvoření rezervace.',
    channels: ['email', 'sms'],
    enabled: true,
    subject: 'Potvrzení termínu: [služba] [datum] v [čas]',
    body:
      'Dobrý den, [jméno],\n\npotvrzujeme váš termín:\n[služba] · [datum] [čas]–[konec]\n[terapeut] · [místnost]\nPlatba: [platba]\n\nTermín můžete zdarma zrušit nebo přesunout do [storno_do]. Pozdější zrušení se řídí storno podmínkami.\n\nTěšíme se na setkání s vámi.\n[klinika]',
    smsBody: '[klinika]: termín [služba] [datum] v [čas] je potvrzený. Zrušení zdarma do [storno_do].',
  },
  {
    key: 'reminder',
    name: 'Připomínka termínu',
    description: 'Před termínem podle nastavení připomínek.',
    channels: ['sms', 'email'],
    enabled: true,
    subject: 'Připomínka: [služba] [datum] v [čas]',
    body:
      'Dobrý den, [jméno],\n\npřipomínáme váš termín:\n[služba] · [datum] v [čas]\n[terapeut] · [místnost]\n\nPokud nemůžete přijít, dejte nám prosím vědět co nejdříve – uvolněný čas rádi nabídneme dalším klientům.\n\nTěšíme se na vás.\n[klinika]',
    smsBody: '[klinika]: připomínáme [služba] [datum] v [čas] ([terapeut]). Nemůžete přijít? Zrušte prosím termín v aplikaci.',
  },
  {
    key: 'cancellation',
    name: 'Zrušení rezervace',
    description: 'Po zrušení v bezplatné lhůtě.',
    channels: ['email'],
    enabled: true,
    subject: 'Termín zrušen: [služba] [datum]',
    body:
      'Dobrý den, [jméno],\n\nváš termín [služba] ([datum] v [čas]) byl zrušen bez poplatku. [platba_vratka]\n\nAž budete chtít navázat, rádi s vámi domluvíme nový termín.\n\n[klinika]',
    smsBody: '[klinika]: termín [datum] v [čas] byl zrušen bez poplatku.',
  },
  {
    key: 'excuse',
    name: 'Omluvenka a náhradní termín',
    description: 'Po omluvení termínu s omluvenkou.',
    channels: ['email'],
    enabled: true,
    subject: 'Omluvenka přijata – vyberte si náhradní termín',
    body:
      'Dobrý den, [jméno],\n\nomluvenku na termín [služba] ([datum] v [čas]) jsme přijali, žádný poplatek se neúčtuje. [náhrada_text]\n\nTěšíme se na další setkání.\n[klinika]',
    smsBody: '[klinika]: omluvenka na [datum] přijata. [náhrada_text]',
  },
  {
    key: 'late_cancel',
    name: 'Pozdní zrušení',
    description: 'Po zrušení po bezplatné lhůtě.',
    channels: ['email'],
    enabled: true,
    subject: 'Termín zrušen po lhůtě: [služba] [datum]',
    body:
      'Dobrý den, [jméno],\n\nváš termín [služba] ([datum] v [čas]) jsme zrušili. Protože ke zrušení došlo po lhůtě pro bezplatné zrušení, platí storno podmínky: [poplatek]\n\nDěkujeme za pochopení.\n[klinika]',
    smsBody: '[klinika]: termín [datum] zrušen po lhůtě. [poplatek]',
  },
  {
    key: 'no_show',
    name: 'Nedostavení se',
    description: 'Když recepce označí nedostavení.',
    channels: ['email'],
    enabled: true,
    subject: 'Dnes jsme se nesešli',
    body:
      'Dobrý den, [jméno],\n\nv domluveném termínu [služba] ([datum] v [čas]) jsme se bohužel nesešli. Podle storno podmínek: [poplatek]\nPokud se něco stalo, ozvěte se nám prosím – domluvíme, jak ve spolupráci pokračovat.\n\n[klinika]',
    smsBody: '[klinika]: v termínu [datum] v [čas] jsme se nesešli. [poplatek]',
  },
  {
    key: 'clinic_cancel',
    name: 'Zrušení z naší strany',
    description: 'Když termín ruší kouč nebo firma.',
    channels: ['email', 'sms'],
    enabled: true,
    subject: 'Omlouváme se – termín [datum] musíme zrušit',
    body:
      'Dobrý den, [jméno],\n\nomlouváme se, ale termín [služba] ([datum] v [čas]) musíme zrušit. [platba_vratka] Ozveme se vám s náhradním termínem, případně si nový vyberte v aplikaci.\n\nDěkujeme za pochopení.\n[klinika]',
    smsBody: '[klinika]: omlouváme se, termín [datum] v [čas] musíme zrušit. Vyberte si prosím nový.',
  },
  {
    key: 'reschedule',
    name: 'Přesun termínu',
    description: 'Po přesunu rezervace.',
    channels: ['email', 'sms'],
    enabled: true,
    subject: 'Termín přesunut: [služba] [datum] v [čas]',
    body: 'Dobrý den, [jméno],\n\nváš termín jsme přesunuli. Nový termín:\n[služba] · [datum] v [čas]\n[terapeut] · [místnost]\n\nTěšíme se na vás.\n[klinika]',
    smsBody: '[klinika]: termín přesunut na [datum] v [čas].',
  },
  {
    key: 'waitlist_offer',
    name: 'Nabídka z čekací listiny',
    description: 'Když se uvolní termín, o který klient stál.',
    channels: ['sms', 'email'],
    enabled: true,
    subject: 'Uvolnil se termín [datum] v [čas]',
    body:
      'Dobrý den, [jméno],\n\nuvolnil se termín [služba] – [datum] v [čas] ([terapeut]). Pokud o něj máte zájem, potvrďte ho prosím v aplikaci do [nabídka_do]. Termín získá ten, kdo potvrdí jako první.\n\n[klinika]',
    smsBody: '[klinika]: uvolnil se termín [služba] [datum] v [čas]. Potvrďte ho v aplikaci do [nabídka_do].',
  },
  {
    key: 'makeup_reminder',
    name: 'Nevyčerpaná náhrada',
    description: 'Několik dní před koncem lhůty pro náhradní termín.',
    channels: ['email'],
    enabled: true,
    subject: 'Nezapomeňte na náhradní termín (do [náhrada_do])',
    body: 'Dobrý den, [jméno],\n\nza omluvené sezení máte nevyčerpaný náhradní termín. Vyberte si ho prosím do [náhrada_do], potom propadne.\n\n[klinika]',
    smsBody: '[klinika]: náhradní termín si vyberte do [náhrada_do].',
  },
  {
    key: 'package_low',
    name: 'Permanentka: poslední vstupy',
    description: 'Když na permanentce zbývají 2 volné vstupy.',
    channels: ['email'],
    enabled: true,
    subject: 'Na permanentce [permanentka] máte už jen [zbývá]',
    body:
      'Dobrý den, [jméno],\n\nna permanentce [permanentka] máte už jen [zbývá] (platnost do [platnost_do]). Pokud chcete ve spolupráci pokračovat, novou permanentku vám rádi připravíme – stačí odpovědět na tento e-mail nebo se zeptat na příštím sezení.\n\n[klinika]',
    smsBody: '[klinika]: na permanentce [permanentka] máte už jen [zbývá].',
  },
  {
    key: 'package_expiring',
    name: 'Permanentka brzy končí',
    description: '14 dní před koncem platnosti, pokud zbývají vstupy.',
    channels: ['email'],
    enabled: true,
    subject: 'Permanentka [permanentka] končí [platnost_do]',
    body:
      'Dobrý den, [jméno],\n\nplatnost permanentky [permanentka] končí [platnost_do] a ještě na ní máte [zbývá]. Domluvte si prosím termíny včas, ať o ně nepřijdete.\n\n[klinika]',
    smsBody: '[klinika]: permanentka končí [platnost_do], ještě na ní máte [zbývá].',
  },
  {
    key: 'after_visit',
    name: 'Po sezení: poděkování',
    description: '2 hodiny po proběhlém termínu.',
    channels: ['email'],
    enabled: true,
    subject: 'Děkujeme za dnešní sezení',
    body:
      'Dobrý den, [jméno],\n\nděkujeme za dnešní sezení. Nezapomeňte na kroky, na kterých jsme se společně domluvili – právě práce mezi sezeními přináší největší posun.\n\nBudeme rádi za vaši zpětnou vazbu, stačí odpovědět na tento e-mail.\n\n[klinika]',
    smsBody: '',
  },
  {
    key: 'reactivation',
    name: 'Reaktivace po 90 dnech',
    description: 'Klientům, kteří 90 dní nepřišli (jen se souhlasem s marketingem).',
    channels: ['email'],
    enabled: false,
    subject: 'Dlouho jsme se neviděli',
    body:
      'Dobrý den, [jméno],\n\nod našeho posledního setkání uplynul už nějaký čas. Pokud chcete navázat na to, na čem jsme spolu pracovali, nebo vás čeká nová výzva, rádi se s vámi znovu potkáme. Stačí odpovědět na tento e-mail nebo si vybrat termín v aplikaci.\n\n[klinika]',
    smsBody: '',
  },
  {
    key: 'birthday',
    name: 'Narozeniny',
    description: 'V den narozenin (jen se souhlasem s marketingem).',
    channels: ['email'],
    enabled: false,
    subject: 'Všechno nejlepší, [jméno]',
    body: 'Dobrý den, [jméno],\n\nk narozeninám vám přejeme hodně zdraví, energie a radosti z každého dalšího kroku.\n\n[klinika]',
    smsBody: '',
  },
  {
    key: 'session_notes',
    name: 'Zápis ze sezení',
    description: 'Posílá se ručně z karty klienta nebo z detailu schůzky – shrnutí sezení pro klienta.',
    channels: ['email'],
    enabled: true,
    subject: 'Zápis ze sezení [datum]',
    body: 'Dobrý den, [jméno],\n\nposíláme vám zápis ze sezení dne [datum].\n\n[poznámky]\n\nS pozdravem\n[klinika]',
    smsBody: '',
  },
];

/** Šablony, které jsou obchodním sdělením – vyžadují souhlas s marketingem. */
export const MARKETING_TEMPLATES: readonly TemplateKey[] = ['reactivation', 'birthday'];

export type TemplateVars = Record<string, string>;

/**
 * Doplní proměnné v hranatých závorkách ([jméno], [datum], [poznámky]…). Neznámé proměnné nechá beze změny.
 * Hodnoty se vkládají doslova a znovu se neprocházejí – text poznámky obsahující „[jméno]“ zůstane, jak je.
 */
export function renderTemplate(text: string, vars: TemplateVars): string {
  return text.replace(/\[([a-zA-Zá-žÁ-Ž_]+)\]/g, (m, key: string) => (Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : m));
}

export function paymentLabel(s: ClinicState, b: Booking): string {
  switch (b.payment.method) {
    case 'package': {
      const p = b.payment.packageId ? getPackage(s, b.payment.packageId) : undefined;
      return p ? `permanentka ${p.name}` : 'permanentka';
    }
    case 'credit':
      return `z kreditu (${formatMoney(b.payment.paidAmount)})`;
    case 'online':
      return `kartou online (${formatMoney(b.payment.paidAmount)})`;
    case 'makeup':
      return 'náhradní termín za omluvenku';
    case 'free':
      return 'zdarma';
    default:
      return b.price > 0 ? `na místě (${formatMoney(b.price)})` : 'zdarma';
  }
}

export function bookingVars(s: ClinicState, b: Booking): TemplateVars {
  const client = getClient(s, b.clientId);
  const service = getService(s, b.serviceId);
  const therapist = getTherapist(s, b.therapistId);
  const room = getRoom(s, b.roomId);
  return {
    jméno: client?.firstName ?? '',
    příjmení: client?.lastName ?? '',
    služba: service?.name ?? '',
    datum: formatDayShort(b.start),
    čas: formatTime(b.start),
    konec: formatTime(b.end),
    terapeut: therapistName(therapist),
    místnost: room?.name ?? '',
    platba: paymentLabel(s, b),
    klinika: s.settings.clinicName,
  };
}

export interface QueueInput {
  key: TemplateKey;
  clientId: Id;
  vars: TemplateVars;
  now: LocalDateTime;
  bookingId?: Id;
}

/**
 * Vytvoří zprávy podle šablony (e-mail / SMS) a uloží je do odeslaných.
 * Respektuje zapnutí šablony a souhlasy klienta. Vrací vytvořené zprávy.
 */
export function queueTemplateMessage(draft: ClinicState, input: QueueInput): Message[] {
  const tpl = draft.templates.find((t) => t.key === input.key);
  if (!tpl || !tpl.enabled) return [];
  const client = getClient(draft, input.clientId);
  if (!client) return [];
  const vars: TemplateVars = { klinika: draft.settings.clinicName, jméno: client.firstName, příjmení: client.lastName, ...input.vars };
  const created: Message[] = [];
  const marketing = MARKETING_TEMPLATES.includes(input.key);
  for (const channel of tpl.channels) {
    const body = channel === 'sms' ? tpl.smsBody : tpl.body;
    if (!body) continue;
    let skipReason: string | undefined;
    if (marketing && !client.consents.marketingEmail) skipReason = 'Klient nemá souhlas se zasíláním obchodních sdělení.';
    if (channel === 'sms' && !client.consents.sms) skipReason = 'Klient nemá souhlas se SMS zprávami.';
    if (channel === 'sms' && !client.phone) skipReason = 'Klient nemá telefon.';
    if (channel === 'email' && !client.email) skipReason = 'Klient nemá e-mail.';
    const msg: Message = {
      id: newId('m'),
      clientId: client.id,
      channel,
      kind: input.key,
      subject: channel === 'email' ? renderTemplate(tpl.subject, vars) : '',
      body: renderTemplate(body, vars),
      at: input.now,
      status: skipReason ? 'skipped' : 'sent',
      bookingId: input.bookingId,
      skipReason,
    };
    draft.messages.push(msg);
    created.push(msg);
  }
  return created;
}

/** Nejdelší předmět ručně odesílané zprávy (znaky). */
export const MESSAGE_SUBJECT_MAX = 200;
/**
 * Nejdelší text ručně odesílané zprávy (znaky). Zpráva se ukládá celá do kolekce `messages`; i v nejhorším
 * případě (znaky escapované v JSON až na 6 bajtů) se tak vejde do jednoho dokumentu databáze (256 KiB).
 * Pokryje zápis s maximální délkou poznámky (NOTE_TEXT_MAX) i s textem šablony.
 */
export const MESSAGE_BODY_MAX = 25_000;

export function addManualMessage(
  draft: ClinicState,
  input: {
    clientId: Id;
    channel: Channel;
    subject: string;
    body: string;
    now: LocalDateTime;
    /** Druh zprávy v odeslaných (výchozí 'manual'; zápis ze sezení 'session_notes'). */
    kind?: Message['kind'];
    bookingId?: Id;
  },
): Message {
  const msg: Message = {
    id: newId('m'),
    clientId: input.clientId,
    channel: input.channel,
    kind: input.kind ?? 'manual',
    subject: input.subject,
    body: input.body,
    at: input.now,
    status: 'sent',
  };
  if (input.bookingId) msg.bookingId = input.bookingId;
  draft.messages.push(msg);
  return msg;
}

export const TEMPLATE_VARIABLES: { key: string; label: string }[] = [
  { key: 'jméno', label: 'Křestní jméno klienta' },
  { key: 'příjmení', label: 'Příjmení klienta' },
  { key: 'služba', label: 'Název služby' },
  { key: 'datum', label: 'Datum termínu' },
  { key: 'čas', label: 'Začátek termínu' },
  { key: 'konec', label: 'Konec termínu' },
  { key: 'terapeut', label: 'Jméno terapeuta' },
  { key: 'místnost', label: 'Místnost' },
  { key: 'platba', label: 'Způsob platby' },
  { key: 'storno_do', label: 'Do kdy lze zrušit zdarma' },
  { key: 'poplatek', label: 'Storno poplatek' },
  { key: 'platba_vratka', label: 'Co se stalo s platbou při zrušení' },
  { key: 'náhrada_do', label: 'Termín pro náhradu' },
  { key: 'náhrada_text', label: 'Věta o náhradním termínu' },
  { key: 'permanentka', label: 'Název permanentky' },
  { key: 'zbývá', label: 'Zbývající vstupy' },
  { key: 'platnost_do', label: 'Konec platnosti' },
  { key: 'nabídka_do', label: 'Platnost nabídky z čekací listiny' },
  { key: 'poznámky', label: 'Text zápisu ze sezení' },
  { key: 'klinika', label: 'Název kliniky' },
];
