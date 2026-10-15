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
    subject: 'Potvrzení rezervace: [služba] [datum] v [čas]',
    body:
      'Dobrý den, [jméno],\n\npotvrzujeme vaši rezervaci:\n[služba] · [datum] [čas]–[konec]\n[terapeut] · [místnost]\nPlatba: [platba]\n\nTermín můžete zdarma zrušit nebo přesunout do [storno_do]. Pozdější zrušení se řídí storno podmínkami.\n\nTěšíme se na vás\n[klinika]',
    smsBody: '[klinika]: rezervace [služba] [datum] v [čas] je potvrzená. Zrušení zdarma do [storno_do].',
  },
  {
    key: 'reminder',
    name: 'Připomínka termínu',
    description: 'Před termínem podle nastavení připomínek.',
    channels: ['sms', 'email'],
    enabled: true,
    subject: 'Připomínka: [služba] [datum] v [čas]',
    body:
      'Dobrý den, [jméno],\n\npřipomínáme váš termín [služba] [datum] v [čas] u [terapeut] ([místnost]).\nPokud nemůžete přijít, dejte nám prosím vědět co nejdříve – uvolněný termín nabídneme dalším klientům.\n\n[klinika]',
    smsBody: '[klinika]: připomínáme [služba] [datum] v [čas] ([terapeut]). Nemůžete přijít? Zrušte termín v aplikaci.',
  },
  {
    key: 'cancellation',
    name: 'Zrušení rezervace',
    description: 'Po zrušení v bezplatné lhůtě.',
    channels: ['email'],
    enabled: true,
    subject: 'Rezervace zrušena: [služba] [datum]',
    body: 'Dobrý den, [jméno],\n\nvaše rezervace [služba] [datum] v [čas] byla zrušena bez poplatku. [platba_vratka]\n\n[klinika]',
    smsBody: '[klinika]: rezervace [datum] v [čas] byla zrušena.',
  },
  {
    key: 'excuse',
    name: 'Omluvenka a náhradní termín',
    description: 'Po omluvení termínu s omluvenkou.',
    channels: ['email'],
    enabled: true,
    subject: 'Omluvenka přijata – vyberte si náhradní termín',
    body:
      'Dobrý den, [jméno],\n\nomluvenku na termín [služba] [datum] v [čas] jsme přijali, žádný poplatek se neúčtuje. [náhrada_text]\n\nBrzy se uzdravte\n[klinika]',
    smsBody: '[klinika]: omluvenka na [datum] přijata. [náhrada_text]',
  },
  {
    key: 'late_cancel',
    name: 'Pozdní zrušení',
    description: 'Po zrušení po bezplatné lhůtě.',
    channels: ['email'],
    enabled: true,
    subject: 'Rezervace zrušena po lhůtě: [služba] [datum]',
    body:
      'Dobrý den, [jméno],\n\nrezervaci [služba] [datum] v [čas] jsme zrušili. Protože k tomu došlo po lhůtě pro bezplatné zrušení, platí storno podmínky: [poplatek].\n\n[klinika]',
    smsBody: '[klinika]: rezervace [datum] zrušena po lhůtě. [poplatek]',
  },
  {
    key: 'no_show',
    name: 'Nedostavení se',
    description: 'Když recepce označí nedostavení.',
    channels: ['email'],
    enabled: true,
    subject: 'Dnes jsme se neviděli',
    body:
      'Dobrý den, [jméno],\n\nna termín [služba] [datum] v [čas] jste nedorazil/a. Podle storno podmínek: [poplatek].\nPokud se něco stalo, ozvěte se nám.\n\n[klinika]',
    smsBody: '[klinika]: na termín [datum] [čas] jste nedorazil/a. [poplatek]',
  },
  {
    key: 'clinic_cancel',
    name: 'Zrušení ze strany kliniky',
    description: 'Když termín ruší klinika.',
    channels: ['email', 'sms'],
    enabled: true,
    subject: 'Omlouváme se – termín [datum] musíme zrušit',
    body:
      'Dobrý den, [jméno],\n\nomlouváme se, ale termín [služba] [datum] v [čas] musíme zrušit. [platba_vratka] Ozveme se vám s náhradním termínem, případně si vyberte nový v aplikaci.\n\n[klinika]',
    smsBody: '[klinika]: omlouváme se, termín [datum] v [čas] musíme zrušit. Vyberte si prosím nový.',
  },
  {
    key: 'reschedule',
    name: 'Přesun termínu',
    description: 'Po přesunu rezervace.',
    channels: ['email', 'sms'],
    enabled: true,
    subject: 'Termín přesunut: [služba] [datum] v [čas]',
    body: 'Dobrý den, [jméno],\n\nváš termín jsme přesunuli na [datum] v [čas] ([terapeut]).\n\n[klinika]',
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
      'Dobrý den, [jméno],\n\nuvolnil se termín [služba] [datum] v [čas] ([terapeut]). Pokud o něj máte zájem, potvrďte ho v aplikaci do [nabídka_do]. Platí, kdo potvrdí dřív.\n\n[klinika]',
    smsBody: '[klinika]: uvolnil se termín [služba] [datum] v [čas]. Potvrďte v aplikaci do [nabídka_do].',
  },
  {
    key: 'makeup_reminder',
    name: 'Nevyčerpaná náhrada',
    description: 'Několik dní před koncem lhůty pro náhradní termín.',
    channels: ['email'],
    enabled: true,
    subject: 'Nezapomeňte na náhradní termín (do [náhrada_do])',
    body: 'Dobrý den, [jméno],\n\nmáte nevyčerpaný náhradní termín za omluvenou návštěvu. Vyberte si ho prosím do [náhrada_do], potom propadne.\n\n[klinika]',
    smsBody: '[klinika]: náhradní termín si vyberte do [náhrada_do].',
  },
  {
    key: 'package_low',
    name: 'Permanentka: poslední vstupy',
    description: 'Když na permanentce zbývají 2 volné vstupy.',
    channels: ['email'],
    enabled: true,
    subject: 'Na permanentce [permanentka] vám zbývají [zbývá]',
    body: 'Dobrý den, [jméno],\n\nna permanentce [permanentka] vám zbývají [zbývá] (platnost do [platnost_do]). Novou si můžete koupit na recepci nebo v aplikaci.\n\n[klinika]',
    smsBody: '[klinika]: na permanentce zbývají [zbývá].',
  },
  {
    key: 'package_expiring',
    name: 'Permanentka brzy končí',
    description: '14 dní před koncem platnosti, pokud zbývají vstupy.',
    channels: ['email'],
    enabled: true,
    subject: 'Permanentka [permanentka] končí [platnost_do]',
    body:
      'Dobrý den, [jméno],\n\nplatnost permanentky [permanentka] končí [platnost_do] a zbývají vám [zbývá]. Rezervujte si termíny, ať o ně nepřijdete.\n\n[klinika]',
    smsBody: '[klinika]: permanentka končí [platnost_do], zbývají [zbývá].',
  },
  {
    key: 'after_visit',
    name: 'Po návštěvě: poděkování',
    description: '2 hodiny po proběhlém termínu.',
    channels: ['email'],
    enabled: true,
    subject: 'Děkujeme za návštěvu',
    body:
      'Dobrý den, [jméno],\n\nděkujeme, že jste dnes přišel/přišla. Nezapomeňte na domácí cvičení od [terapeut]. Budeme rádi, když nám napíšete, jak jste byl/a spokojen/a.\n\n[klinika]',
    smsBody: '',
  },
  {
    key: 'reactivation',
    name: 'Reaktivace po 90 dnech',
    description: 'Klientům, kteří 90 dní nepřišli (jen se souhlasem s marketingem).',
    channels: ['email'],
    enabled: false,
    subject: 'Dlouho jsme se neviděli',
    body: 'Dobrý den, [jméno],\n\nje to už nějaký čas od vaší poslední návštěvy. Pokud se potíže vrací, rádi vás uvidíme.\n\n[klinika]',
    smsBody: '',
  },
  {
    key: 'birthday',
    name: 'Narozeniny',
    description: 'V den narozenin (jen se souhlasem s marketingem).',
    channels: ['email'],
    enabled: false,
    subject: 'Všechno nejlepší, [jméno]',
    body: 'Dobrý den, [jméno],\n\npřejeme vám k narozeninám hodně zdraví a úspěchů.\n\n[klinika]',
    smsBody: '',
  },
];

/** Šablony, které jsou obchodním sdělením – vyžadují souhlas s marketingem. */
export const MARKETING_TEMPLATES: readonly TemplateKey[] = ['reactivation', 'birthday'];

export type TemplateVars = Record<string, string>;

export function renderTemplate(text: string, vars: TemplateVars): string {
  return text.replace(/\[([a-zA-Zá-žÁ-Ž_]+)\]/g, (m, key: string) => (key in vars ? vars[key] : m));
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
      return `na místě (${formatMoney(b.price)})`;
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

export function addManualMessage(
  draft: ClinicState,
  input: { clientId: Id; channel: Channel; subject: string; body: string; now: LocalDateTime },
): Message {
  const msg: Message = {
    id: newId('m'),
    clientId: input.clientId,
    channel: input.channel,
    kind: 'manual',
    subject: input.subject,
    body: input.body,
    at: input.now,
    status: 'sent',
  };
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
  { key: 'klinika', label: 'Název kliniky' },
];
