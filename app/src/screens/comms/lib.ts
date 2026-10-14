import type {
  Campaign,
  CampaignBlock,
  ClinicState,
  Id,
  LocalDateTime,
  Message,
  MessageTemplate,
  SegmentDefinition,
  TemplateKey,
} from '../../domain/types';
import { countLabel, formatDate, formatDayShort, formatMoney, formatPercent, formatTime, plural } from '../../engine/format';
import { bookingVars, TEMPLATE_VARIABLES, type TemplateVars } from '../../engine/messages';
import { isGroupBooking } from '../../engine/policy';
import { evaluateSegment, segmentFunnel } from '../../engine/segments';
import { therapistName } from '../../engine/selectors';
import { addDays, addHours, addMinutes, combine, dateOf } from '../../engine/time';

/*
 * Čisté pomocné funkce obrazovky Komunikace (bez Reactu).
 * Doplňují engine o kontroly kampaně, proměnné šablon, ukázková data a počítání SMS.
 */

/* ------------------------------------------------------------------ */
/* Text                                                                */
/* ------------------------------------------------------------------ */

/** Malá písmena bez diakritiky – pro vyhledávání. */
export function fold(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Stejný tvar proměnné jako v engine/messages.ts renderTemplate: [jméno]. */
const TOKEN_RE = /\[([a-zA-Zá-žÁ-Ž_]+)\]/g;

export function tokensIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(TOKEN_RE)) out.push(m[1]);
  return out;
}

export interface TextPart {
  text: string;
  token?: string;
}

/** Rozdělí text na obyčejné části a proměnné v hranatých závorkách. */
export function splitTokens(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    const i = m.index ?? 0;
    if (i > last) parts.push({ text: text.slice(last, i) });
    parts.push({ text: m[0], token: m[1] });
    last = i + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

const CURLY_RE = /\{\{|\}\}/;

/** Vloží proměnnou na pozici kurzoru (s mezerou, pokud je potřeba). */
export function insertAt(value: string, start: number, end: number, token: string): { value: string; caret: number } {
  const before = value.slice(0, start);
  const needsSpace = before.length > 0 && !/[\s(„"'[]$/.test(before);
  const insert = (needsSpace ? ' ' : '') + token;
  return { value: before + insert + value.slice(end), caret: start + insert.length };
}

/* ------------------------------------------------------------------ */
/* Čas                                                                 */
/* ------------------------------------------------------------------ */

/** „dnes 9:12“, „včera 18:40“, „Čt 15. 10. 8:30“, u jiného roku s rokem. */
export function formatWhen(dt: LocalDateTime, now: LocalDateTime): string {
  const day = dateOf(dt);
  const today = dateOf(now);
  const time = formatTime(dt);
  if (day === today) return `dnes ${time}`;
  if (day === addDays(today, -1)) return `včera ${time}`;
  if (day === addDays(today, 1)) return `zítra ${time}`;
  if (day.slice(0, 4) !== today.slice(0, 4)) return `${formatDate(dt)} ${time}`;
  return `${formatDayShort(dt)} ${time}`;
}

/* ------------------------------------------------------------------ */
/* Kampaně                                                             */
/* ------------------------------------------------------------------ */

export type BlockType = CampaignBlock['type'];

export const BLOCK_LABEL: Record<BlockType, string> = {
  heading: 'Nadpis',
  text: 'Text',
  list: 'Seznam',
  button: 'Tlačítko',
  divider: 'Oddělovač',
};

export const BLOCK_ORDER: BlockType[] = ['heading', 'text', 'list', 'button', 'divider'];

export function newBlock(type: BlockType): CampaignBlock {
  switch (type) {
    case 'heading':
      return { type, text: '' };
    case 'text':
      return { type, text: '' };
    case 'list':
      return { type, items: [''] };
    case 'button':
      return { type, label: 'Rezervovat termín', url: '' };
    default:
      return { type: 'divider' };
  }
}

export function blockHasContent(b: CampaignBlock): boolean {
  switch (b.type) {
    case 'heading':
    case 'text':
      return b.text.trim() !== '';
    case 'list':
      return b.items.some((item) => item.trim() !== '');
    case 'button':
      return b.label.trim() !== '';
    default:
      return false;
  }
}

export function hasContent(blocks: CampaignBlock[]): boolean {
  return blocks.some(blockHasContent);
}

/** Bloky připravené k odeslání: bez prázdných bloků a prázdných položek seznamu. */
export function cleanBlocks(blocks: CampaignBlock[]): CampaignBlock[] {
  const out: CampaignBlock[] = [];
  for (const b of blocks) {
    if (b.type === 'divider') {
      out.push(b);
      continue;
    }
    if (!blockHasContent(b)) continue;
    out.push(b.type === 'list' ? { ...b, items: b.items.filter((item) => item.trim() !== '') } : b);
  }
  // oddělovač na začátku, na konci ani dva po sobě nedávají smysl
  return out.filter((b, i, arr) => b.type !== 'divider' || (i > 0 && i < arr.length - 1 && arr[i - 1].type !== 'divider'));
}

/** Proměnné, které engine v kampani skutečně vyplní (sendCampaign / campaignPlainText). */
export const CAMPAIGN_BODY_VARS: readonly string[] = ['jméno', 'klinika'];
export const CAMPAIGN_SUBJECT_VARS: readonly string[] = ['jméno'];

export function isValidUrl(url: string): boolean {
  return /^(https?:\/\/[^\s.]+\.[^\s]+|mailto:\S+@\S+|tel:\+?[\d\s]+)$/i.test(url.trim());
}

type CampaignContent = Pick<Campaign, 'subject' | 'preheader' | 'blocks'>;

/** Upozornění k personalizaci (neznámé proměnné, složené závorky…). */
export function campaignVariableIssues(c: CampaignContent): string[] {
  const issues: string[] = [];
  const unknown = new Set<string>();
  const check = (text: string, allowed: readonly string[]): void => {
    for (const t of tokensIn(text)) if (!allowed.includes(t)) unknown.add(t);
  };
  check(c.subject, CAMPAIGN_SUBJECT_VARS);
  check(c.preheader, CAMPAIGN_SUBJECT_VARS);
  let curly = CURLY_RE.test(c.subject) || CURLY_RE.test(c.preheader);
  let tokenInButton = false;
  for (const b of c.blocks) {
    if (b.type === 'heading' || b.type === 'text') {
      check(b.text, CAMPAIGN_BODY_VARS);
      curly = curly || CURLY_RE.test(b.text);
    } else if (b.type === 'list') {
      for (const item of b.items) {
        check(item, CAMPAIGN_BODY_VARS);
        curly = curly || CURLY_RE.test(item);
      }
    } else if (b.type === 'button') {
      if (tokensIn(b.label).length) tokenInButton = true;
      curly = curly || CURLY_RE.test(b.label);
    }
  }
  if (unknown.size) {
    const list = [...unknown].map((t) => `[${t}]`).join(', ');
    issues.push(`${list} se v kampani nevyplní – použijte [jméno].`);
  }
  if (curly) issues.push('Proměnné pište do hranatých závorek, např. [jméno].');
  if (tokenInButton) issues.push('Text tlačítka se nepersonalizuje.');
  return issues;
}

export type CheckState = 'ok' | 'warn' | 'error';

export interface CheckItem {
  id: string;
  label: string;
  state: CheckState;
  hint?: string;
}

const RECIPIENT_FORMS: [string, string, string] = ['příjemce', 'příjemci', 'příjemců'];

export function recipientsLabel(n: number): string {
  return countLabel(n, RECIPIENT_FORMS);
}

/** Kontrolní seznam před odesláním. Chyby (error) odeslání blokují, varování ne. */
export function campaignChecks(c: CampaignContent, recipients: number): CheckItem[] {
  const subjectOk = c.subject.trim() !== '';
  const contentOk = hasContent(c.blocks);
  const items: CheckItem[] = [
    {
      id: 'consent',
      label: 'Jen klienti se souhlasem s obchodními sděleními',
      state: 'ok',
      hint: 'Klienty bez souhlasu systém vynechá vždy.',
    },
    { id: 'unsubscribe', label: 'Odkaz pro odhlášení v patičce', state: 'ok', hint: 'Přidává se automaticky ke každému e-mailu.' },
    { id: 'subject', label: 'Předmět vyplněn', state: subjectOk ? 'ok' : 'error', hint: subjectOk ? undefined : 'Doplňte předmět e-mailu.' },
    {
      id: 'content',
      label: 'Obsah e-mailu',
      state: contentOk ? 'ok' : 'error',
      hint: contentOk ? undefined : 'Přidejte alespoň nadpis nebo odstavec textu.',
    },
    {
      id: 'recipients',
      label: recipients > 0 ? `Příjemci: ${recipientsLabel(recipients)}` : 'Žádný příjemce',
      state: recipients > 0 ? 'ok' : 'error',
      hint: recipients > 0 ? undefined : 'Segmentu neodpovídá nikdo se souhlasem – upravte pravidla.',
    },
  ];
  if (!c.preheader.trim()) {
    items.push({ id: 'preheader', label: 'Náhledový text', state: 'warn', hint: 'Doporučujeme – zobrazí se v doručené poště hned za předmětem.' });
  }
  const issues = campaignVariableIssues(c);
  if (issues.length) items.push({ id: 'vars', label: 'Personalizace', state: 'warn', hint: issues.join(' ') });
  const badLinks = c.blocks.filter((b) => b.type === 'button' && b.label.trim() && !isValidUrl(b.url)).length;
  if (badLinks) {
    items.push({
      id: 'links',
      label: badLinks > 1 ? 'Odkazy tlačítek' : 'Odkaz tlačítka',
      state: 'warn',
      hint: 'Doplňte celou adresu (https://…), jinak tlačítko povede na rezervace kliniky.',
    });
  }
  const empty = c.blocks.filter((b) => b.type !== 'divider' && !blockHasContent(b)).length;
  if (empty) {
    items.push({
      id: 'empty',
      label: 'Prázdné bloky',
      state: 'warn',
      hint: `${countLabel(empty, ['prázdný blok', 'prázdné bloky', 'prázdných bloků'])} se při odeslání ${plural(empty, ['vynechá', 'vynechají', 'vynechá'])}.`,
    });
  }
  return items;
}

/* ------------------------------------------------------------------ */
/* Segmenty                                                            */
/* ------------------------------------------------------------------ */

export interface SegmentInsight {
  funnel: { consented: number; matched: number; excluded: number; final: number };
  recipients: Id[];
  /** Kolik klientů se souhlasem odpovídá každému pravidlu samostatně. */
  ruleCounts: number[];
  /** Kolik klientů po pravidlech vyřadí každé vyloučení. */
  excludeCounts: number[];
  /** Klienti bez souhlasu s obchodními sděleními nebo bez e-mailu. */
  noConsent: number;
  totalClients: number;
}

export function segmentInsight(s: ClinicState, seg: SegmentDefinition, now: LocalDateTime): SegmentInsight {
  const funnel = segmentFunnel(s, seg, now);
  const recipients = evaluateSegment(s, seg, now);
  const ruleCounts = seg.rules.map((rule) => segmentFunnel(s, { match: 'all', rules: [rule], exclude: [] }, now).matched);
  const excludeCounts = seg.exclude.map((rule) => segmentFunnel(s, { ...seg, exclude: [rule] }, now).excluded);
  return {
    funnel,
    recipients,
    ruleCounts,
    excludeCounts,
    noConsent: s.clients.length - funnel.consented,
    totalClients: s.clients.length,
  };
}

export interface SegmentGroups {
  recipients: Id[];
  excluded: Id[];
  noConsent: { id: Id; reason: string }[];
}

/** Rozpad klientů pro přehled příjemců: příjemci, vyloučení, bez souhlasu. */
export function segmentGroups(s: ClinicState, seg: SegmentDefinition, now: LocalDateTime): SegmentGroups {
  const recipients = evaluateSegment(s, seg, now);
  const matched = evaluateSegment(s, { ...seg, exclude: [] }, now);
  const chosen = new Set(recipients);
  return {
    recipients,
    excluded: matched.filter((id) => !chosen.has(id)),
    noConsent: s.clients
      .filter((c) => !c.consents.marketingEmail || !c.email)
      .map((c) => ({ id: c.id, reason: !c.consents.marketingEmail ? 'Bez souhlasu s obchodními sděleními' : 'Chybí e-mailová adresa' })),
  };
}

/** Štítky klientů seřazené podle četnosti. */
export function tagStats(s: ClinicState): { tag: string; count: number }[] {
  const map = new Map<string, number>();
  for (const c of s.clients) for (const t of c.tags) map.set(t, (map.get(t) ?? 0) + 1);
  return [...map.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'cs'));
}

/* ------------------------------------------------------------------ */
/* Předpřipravené kampaně                                              */
/* ------------------------------------------------------------------ */

export interface CampaignPreset {
  id: string;
  title: string;
  description: string;
  name: string;
  build: (s: ClinicState) => Pick<Campaign, 'subject' | 'preheader' | 'blocks' | 'segment'>;
}

const EVERYONE: SegmentDefinition = { match: 'all', rules: [], exclude: [] };

export const CAMPAIGN_PRESETS: CampaignPreset[] = [
  {
    id: 'blank',
    title: 'Prázdný e-mail',
    description: 'Nadpis a odstavec s oslovením. Příjemci: všichni se souhlasem.',
    name: 'Nová kampaň',
    build: () => ({
      subject: '',
      preheader: '',
      blocks: [
        { type: 'heading', text: '' },
        { type: 'text', text: 'Dobrý den, [jméno],\n\n' },
      ],
      segment: EVERYONE,
    }),
  },
  {
    id: 'news',
    title: 'Novinky z kliniky',
    description: 'Nadpis, text, seznam novinek a tlačítko k rezervaci. Všem se souhlasem.',
    name: 'Novinky z kliniky',
    build: (s) => ({
      subject: `Novinky z kliniky ${s.settings.clinicName}`,
      preheader: 'Co je u nás nového a na co se můžete těšit',
      blocks: [
        { type: 'heading', text: 'Co je u nás nového' },
        { type: 'text', text: 'Dobrý den, [jméno],\n\nposíláme pár novinek, které by vás mohly zajímat.' },
        { type: 'list', items: ['Nová služba · od příštího měsíce', 'Skupinové lekce · pondělí a středa', 'Dárkové poukazy · na recepci'] },
        { type: 'button', label: 'Rezervovat termín', url: '' },
      ],
      segment: EVERYONE,
    }),
  },
  {
    id: 'package',
    title: 'Permanentka brzy končí',
    description: 'Připomínka klientům, kterým do 30 dní končí permanentka s volnými vstupy.',
    name: 'Nevyčerpané permanentky',
    build: () => ({
      subject: '[jméno], nezapomeňte vyčerpat permanentku',
      preheader: 'Zbývající vstupy si zarezervujte, dokud platí.',
      blocks: [
        { type: 'heading', text: 'Vaše permanentka brzy končí' },
        {
          type: 'text',
          text: 'Dobrý den, [jméno],\n\nna vaší permanentce ještě zbývají volné vstupy. Rezervujte si termín včas, ať o ně nepřijdete – volné časy najdete v aplikaci.',
        },
        { type: 'button', label: 'Vybrat termín', url: '' },
      ],
      segment: { match: 'all', rules: [{ type: 'package_expiring', withinDays: 30 }], exclude: [] },
    }),
  },
  {
    id: 'reactivation',
    title: 'Dlouho jsme se neviděli',
    description: 'Pozvání pro klienty, kteří přes měsíc nepřišli a nemají budoucí termín.',
    name: 'Reaktivace klientů',
    build: () => ({
      subject: 'Dlouho jsme se neviděli, [jméno]',
      preheader: 'Rádi vás zase uvidíme – vyberte si termín, který vám sedí.',
      blocks: [
        { type: 'heading', text: 'Jak se vám daří?' },
        {
          type: 'text',
          text: 'Dobrý den, [jméno],\n\nje to už nějaký čas od vaší poslední návštěvy. Pokud se potíže vracejí nebo chcete navázat na cvičení, rádi vás zase uvidíme.',
        },
        { type: 'button', label: 'Rezervovat termín', url: '' },
      ],
      segment: { match: 'all', rules: [{ type: 'no_visit_for', days: 30 }], exclude: [] },
    }),
  },
];

export function emptyCampaign(now: LocalDateTime): Campaign {
  return {
    id: '',
    name: '',
    subject: '',
    preheader: '',
    blocks: [],
    segment: EVERYONE,
    status: 'draft',
    scheduledAt: null,
    sentAt: null,
    recipients: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/* ------------------------------------------------------------------ */
/* Automatické zprávy                                                  */
/* ------------------------------------------------------------------ */

export const TEMPLATE_GROUPS: { id: string; label: string; keys: TemplateKey[] }[] = [
  { id: 'visits', label: 'Rezervace a návštěvy', keys: ['booking_confirmation', 'reminder', 'reschedule', 'after_visit'] },
  { id: 'cancel', label: 'Storna a omluvenky', keys: ['cancellation', 'excuse', 'late_cancel', 'no_show', 'clinic_cancel'] },
  { id: 'offers', label: 'Čekací listina, náhrady a permanentky', keys: ['waitlist_offer', 'makeup_reminder', 'package_low', 'package_expiring'] },
  { id: 'marketing', label: 'Obchodní sdělení', keys: ['reactivation', 'birthday'] },
];

/** Šablony, které engine automaticky neodesílá (všechny se už odesílají). */
export const NOT_AUTOMATED: readonly TemplateKey[] = [];

const PERSON = ['jméno', 'příjmení', 'klinika'];
const BOOKING = ['jméno', 'příjmení', 'služba', 'datum', 'čas', 'konec', 'terapeut', 'místnost', 'platba', 'klinika'];

/** Proměnné, které engine pro danou šablonu opravdu vyplní (podle commands.ts / processes.ts). */
export function templateVariableKeys(key: TemplateKey): string[] {
  switch (key) {
    case 'booking_confirmation':
      return [...BOOKING, 'storno_do'];
    case 'cancellation':
    case 'clinic_cancel':
      return [...BOOKING, 'platba_vratka'];
    case 'excuse':
      return [...BOOKING, 'náhrada_text'];
    case 'late_cancel':
    case 'no_show':
      return [...BOOKING, 'poplatek'];
    case 'reminder':
    case 'reschedule':
    case 'after_visit':
      return BOOKING;
    case 'waitlist_offer':
      return [...PERSON, 'služba', 'datum', 'čas', 'terapeut', 'nabídka_do'];
    case 'makeup_reminder':
      return [...PERSON, 'náhrada_do'];
    case 'package_low':
    case 'package_expiring':
      return [...PERSON, 'permanentka', 'zbývá', 'platnost_do'];
    default:
      return PERSON;
  }
}

const EXTRA_VARIABLE_LABELS: Record<string, string> = {
  platba_vratka: 'Informace o vrácení platby',
  náhrada_text: 'Informace o náhradním termínu',
};

export function variableLabel(key: string): string {
  return TEMPLATE_VARIABLES.find((v) => v.key === key)?.label ?? EXTRA_VARIABLE_LABELS[key] ?? key;
}

export function channelsLabel(channels: readonly string[]): string {
  if (!channels.length) return 'bez kanálu';
  return channels.map((c) => (c === 'sms' ? 'SMS' : 'e-mail')).join(' + ');
}

/** Krátký popis, kdy se zpráva posílá (s ohledem na nastavení kliniky). */
export function templateTiming(t: MessageTemplate, s: ClinicState): string {
  switch (t.key) {
    case 'booking_confirmation':
      return 'ihned po rezervaci';
    case 'reminder':
      return s.settings.reminders.enabled ? `${s.settings.reminders.hoursBefore} h před termínem` : 'připomínky jsou v nastavení vypnuté';
    case 'reschedule':
      return 'po přesunu termínu';
    case 'after_visit':
      return '2 h po proběhlém termínu';
    case 'cancellation':
      return 'po zrušení v bezplatné lhůtě';
    case 'excuse':
      return 'po omluvení termínu';
    case 'late_cancel':
      return 'po zrušení po lhůtě';
    case 'no_show':
      return 'po označení nedostavení';
    case 'clinic_cancel':
      return 'když termín ruší klinika';
    case 'waitlist_offer':
      return s.settings.waitlist.enabled ? `při uvolnění termínu, nabídka platí ${s.settings.waitlist.offerMinutes} min` : 'čekací listina je vypnutá';
    case 'makeup_reminder':
      return '4 dny před koncem lhůty náhrady';
    case 'package_low':
      return 'když zbývají 2 volné vstupy';
    case 'package_expiring':
      return '14 dní před koncem platnosti';
    case 'reactivation':
      return 'po 90 dnech bez návštěvy';
    case 'birthday':
      return 'v den narozenin';
    default:
      return t.description;
  }
}

export interface TemplateIssue {
  id: string;
  text: string;
}

/** Upozornění k šabloně: nevyplnitelné proměnné, prázdné texty zapnutých kanálů. */
export function templateIssues(key: TemplateKey, d: Pick<MessageTemplate, 'subject' | 'body' | 'smsBody' | 'channels'>): TemplateIssue[] {
  const issues: TemplateIssue[] = [];
  const allowed = templateVariableKeys(key);
  const bad = new Set<string>();
  for (const text of [d.subject, d.body, d.smsBody]) for (const t of tokensIn(text)) if (!allowed.includes(t)) bad.add(t);
  if (bad.size) {
    const list = [...bad].map((t) => `[${t}]`).join(', ');
    issues.push({ id: 'vars', text: `${list} se u této zprávy nevyplní a klient by ji viděl doslova.` });
  }
  if ([d.subject, d.body, d.smsBody].some((t) => CURLY_RE.test(t))) {
    issues.push({ id: 'curly', text: 'Proměnné pište do hranatých závorek, např. [jméno].' });
  }
  if (!d.channels.length) issues.push({ id: 'channels', text: 'Není zapnutý žádný kanál – zpráva se nikomu neodešle.' });
  if (d.channels.includes('email') && !d.body.trim()) issues.push({ id: 'email', text: 'Text e-mailu je prázdný – e-mail se neodešle.' });
  if (d.channels.includes('email') && !d.subject.trim()) issues.push({ id: 'subject', text: 'Chybí předmět e-mailu.' });
  if (d.channels.includes('sms') && !d.smsBody.trim()) issues.push({ id: 'sms', text: 'Text SMS je prázdný – SMS se neodešle.' });
  return issues;
}

/** Ukázkové hodnoty proměnných – z nejbližší skutečné rezervace, jinak smyšlené. */
export function sampleVars(s: ClinicState, now: LocalDateTime): TemplateVars {
  const booking = s.bookings.find((b) => b.status === 'confirmed' && b.start > now && !b.sessionId);
  const service = s.services.find((x) => x.active) ?? s.services[0];
  const start = booking?.start ?? combine(addDays(dateOf(now), 1), '09:00');
  const base: TemplateVars = booking
    ? bookingVars(s, booking)
    : {
        jméno: 'Jana',
        příjmení: 'Nováková',
        služba: service?.name ?? 'Fyzioterapie',
        datum: formatDayShort(start),
        čas: formatTime(start),
        konec: formatTime(addMinutes(start, service?.durationMin ?? 50)),
        terapeut: therapistName(s.therapists.find((t) => t.active) ?? s.therapists[0]),
        místnost: s.rooms[0]?.name ?? 'Sál 1',
        platba: `na místě (${formatMoney(service?.priceCzk ?? 900)})`,
        klinika: s.settings.clinicName,
      };
  const policy = s.settings.policy;
  const freeHours = booking && isGroupBooking(s, booking) ? policy.groupCancelHours : policy.freeCancelHours;
  const freeUntil = addHours(start, -freeHours);
  const price = booking?.price ?? service?.priceCzk ?? 900;
  const pct = policy.lateTiers[0]?.feePct ?? 50;
  const makeupUntil = addDays(start, policy.excuses.makeupDays);
  const offerUntil = addMinutes(now, s.settings.waitlist.offerMinutes);
  const pkg = s.packageTemplates.find((p) => p.active) ?? s.packageTemplates[0];
  return {
    ...base,
    storno_do: `${formatDayShort(freeUntil)} ${formatTime(freeUntil)}`,
    poplatek: `storno poplatek ${formatMoney(Math.round((price * pct) / 100))} (${formatPercent(pct)})`,
    platba_vratka: `Platba ${formatMoney(price)} se vrátila na váš kredit.`,
    náhrada_do: formatDayShort(makeupUntil),
    náhrada_text: `Náhradní termín si vyberte do ${formatDayShort(makeupUntil)}.`,
    permanentka: pkg?.name ?? 'Fyzio 10',
    zbývá: countLabel(2, ['vstup', 'vstupy', 'vstupů']),
    platnost_do: formatDate(addDays(dateOf(now), 14)),
    nabídka_do: `${formatDayShort(offerUntil)} ${formatTime(offerUntil)}`,
    klinika: s.settings.clinicName,
  };
}

/* ------------------------------------------------------------------ */
/* SMS                                                                 */
/* ------------------------------------------------------------------ */

const GSM_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXTENDED = '^{}\\[~]|€';

export interface SmsInfo {
  length: number;
  parts: number;
  /** Text s diakritikou se posílá v Unicode (70 znaků na SMS). */
  unicode: boolean;
  limit: number;
}

export function smsInfo(text: string): SmsInfo {
  let gsmLength = 0;
  let unicode = false;
  for (const ch of text) {
    if (GSM_BASIC.includes(ch)) gsmLength += 1;
    else if (GSM_EXTENDED.includes(ch)) gsmLength += 2;
    else {
      unicode = true;
      break;
    }
  }
  if (unicode) {
    const length = text.length;
    return { length, unicode, limit: 70, parts: length === 0 ? 0 : length <= 70 ? 1 : Math.ceil(length / 67) };
  }
  return { length: gsmLength, unicode, limit: 160, parts: gsmLength === 0 ? 0 : gsmLength <= 160 ? 1 : Math.ceil(gsmLength / 153) };
}

/* ------------------------------------------------------------------ */
/* Odeslané                                                            */
/* ------------------------------------------------------------------ */

export function kindLabel(kind: Message['kind'], templates: readonly MessageTemplate[]): string {
  if (kind === 'campaign') return 'Kampaň';
  if (kind === 'manual') return 'Ruční zpráva';
  return templates.find((t) => t.key === kind)?.name ?? kind;
}

/** Rada, jak napravit neodeslanou zprávu. */
export function skipAdvice(reason: string | undefined): string {
  const r = reason ?? '';
  if (r.includes('SMS')) return 'Souhlas se SMS zaznamenáte v detailu klienta (záložka Souhlasy) – jen pokud ho klient skutečně udělil.';
  if (r.includes('obchodních')) return 'Obchodní sdělení smí dostat jen klient, který k tomu dal souhlas. Klient si ho může zapnout v portálu.';
  if (r.includes('telefon') || r.includes('e-mail')) return 'Doplňte kontakt v detailu klienta.';
  return 'Zkontrolujte kontaktní údaje a souhlasy v detailu klienta.';
}
