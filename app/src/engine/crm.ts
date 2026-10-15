import { isDraft } from 'immer';
import type {
  Client,
  ClinicState,
  FileKind,
  FileRecord,
  FollowUp,
  Id,
  LocalDate,
  LocalDateTime,
  Note,
  NoteKind,
  Stage,
  TimeOfDay,
} from '../domain/types';
import { countLabel, formatDate, formatDayShort, formatTime } from './format';
import { DEFAULT_TEMPLATES, renderTemplate, type TemplateVars } from './messages';
import { bookingsOfClient, getClient, getTherapist, registerSelectorCache, therapistName } from './selectors';
import { addDays, dateOf, daysBetween, diffMinutes } from './time';

/**
 * CRM vrstva (docs/CRM.md): fáze spolupráce, poznámky, soubory, follow-upy.
 * Čisté funkce nad ClinicState. Indexy se cachují podle identity pole (stejně jako v selectors.ts)
 * a mažou se přes clearSelectorCaches().
 */

/* ------------------------------------------------------------------ */
/* Konstanty a popisky                                                 */
/* ------------------------------------------------------------------ */

/** Maximální délka textu poznámky (delší přepis patří do souboru). */
export const NOTE_TEXT_MAX = 20_000;
export const NOTE_TITLE_MAX = 120;
export const FOLLOW_UP_TITLE_MAX = 160;
export const STAGE_NAME_MAX = 40;
export const FILE_CAPTION_MAX = 300;
/** Maximální délka poznámky ke změně fáze (historie fází). */
export const STAGE_NOTE_MAX = 500;

export const NOTE_KINDS: readonly NoteKind[] = ['note', 'session', 'plaud', 'call'];

export const NOTE_KIND_LABEL: Record<NoteKind, string> = {
  note: 'Poznámka',
  session: 'Zápis ze sezení',
  plaud: 'Plaud import',
  call: 'Telefonát',
};

export const FILE_KIND_LABEL: Record<FileKind, string> = {
  image: 'Obrázek',
  audio: 'Audio',
  video: 'Video',
  pdf: 'PDF',
  text: 'Text',
  other: 'Soubor',
};

/** Fáze, mezi kterými se měří konverze ve statistikách. */
export const CONVERSION_FROM_STAGE = 'st_freetalk';
export const CONVERSION_TO_STAGE = 'st_aktivni';

/** Náhradní fáze pro (nemožný) případ kliniky bez fází. */
const FALLBACK_STAGE: Stage = { id: '', name: 'Bez fáze', tone: 'slate', order: 0 };

/* ------------------------------------------------------------------ */
/* Cache                                                               */
/* ------------------------------------------------------------------ */

let groupCache = new WeakMap<object, { len: number; byKind: Map<string, Map<string, unknown[]>> }>();
let stagesCache = new WeakMap<object, Stage[]>();

registerSelectorCache(() => {
  groupCache = new WeakMap();
  stagesCache = new WeakMap();
});

/** Seskupí pole podle klíče (a seřadí skupiny). Drafty Immeru se necachují. */
function grouped<T>(
  arr: readonly T[],
  kind: string,
  keyOf: (x: T) => string | null | undefined,
  compare?: (a: T, b: T) => number,
): Map<string, T[]> {
  const build = (): Map<string, T[]> => {
    const m = new Map<string, T[]>();
    for (const x of arr) {
      const k = keyOf(x);
      if (!k) continue;
      const list = m.get(k);
      if (list) list.push(x);
      else m.set(k, [x]);
    }
    if (compare) for (const list of m.values()) list.sort(compare);
    return m;
  };
  if (isDraft(arr)) return build();
  let entry = groupCache.get(arr);
  if (!entry || entry.len !== arr.length) {
    entry = { len: arr.length, byKind: new Map() };
    groupCache.set(arr, entry);
  }
  let m = entry.byKind.get(kind) as Map<string, T[]> | undefined;
  if (!m) {
    m = build();
    entry.byKind.set(kind, m as Map<string, unknown[]>);
  }
  return m;
}

const EMPTY: never[] = [];
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/* ------------------------------------------------------------------ */
/* Fáze                                                                */
/* ------------------------------------------------------------------ */

/** Fáze seřazené podle pořadí. */
export function stagesSorted(s: ClinicState): Stage[] {
  const stages = s.settings.stages ?? EMPTY;
  const build = (): Stage[] => [...stages].sort((a, b) => a.order - b.order || cmp(a.id, b.id));
  if (isDraft(stages)) return build();
  let hit = stagesCache.get(stages);
  if (!hit) {
    hit = build();
    stagesCache.set(stages, hit);
  }
  return hit;
}

export function getStage(s: ClinicState, id: Id): Stage | undefined {
  return (s.settings.stages ?? EMPTY).find((x) => x.id === id);
}

/** Fáze klienta; neznámá fáze (např. smazaná na jiném zařízení) se zobrazí jako první fáze. */
export function clientStage(s: ClinicState, client: Pick<Client, 'stageId'>): Stage {
  return getStage(s, client.stageId) ?? stagesSorted(s)[0] ?? FALLBACK_STAGE;
}

/** Od kdy je klient v aktuální fázi. */
export function stageSince(client: Pick<Client, 'stageId' | 'stageHistory' | 'createdAt'>): LocalDateTime {
  const h = client.stageHistory ?? EMPTY;
  for (let i = h.length - 1; i >= 0; i--) if (h[i].stageId === client.stageId) return h[i].at;
  return client.createdAt;
}

/** Počet celých dní v aktuální fázi. */
export function daysInStage(client: Pick<Client, 'stageId' | 'stageHistory' | 'createdAt'>, now: LocalDateTime): number {
  return Math.max(0, daysBetween(dateOf(stageSince(client)), dateOf(now)));
}

/** Klienti po fázích (klíče ve stejném pořadí jako stagesSorted, i prázdné fáze). Klienti řazení podle jména. */
export function clientsByStage(s: ClinicState): Map<Id, Client[]> {
  const stages = stagesSorted(s);
  const out = new Map<Id, Client[]>();
  for (const st of stages) out.set(st.id, []);
  const fallback = stages[0]?.id;
  for (const c of s.clients) {
    const key = out.has(c.stageId) ? c.stageId : fallback;
    if (key === undefined) continue;
    out.get(key)?.push(c);
  }
  for (const list of out.values()) list.sort((a, b) => a.lastName.localeCompare(b.lastName, 'cs') || a.firstName.localeCompare(b.firstName, 'cs'));
  return out;
}

/* ------------------------------------------------------------------ */
/* Poznámky a soubory                                                  */
/* ------------------------------------------------------------------ */

const noteOrder = (a: Note, b: Note): number =>
  Number(b.pinned) - Number(a.pinned) || cmp(b.at, a.at) || cmp(b.createdAt, a.createdAt) || cmp(b.id, a.id);

/** Poznámky klienta: připnuté první, pak od nejnovější. */
export function notesOfClient(s: ClinicState, clientId: Id): Note[] {
  return grouped(s.notes ?? EMPTY, 'client', (n) => n.clientId, noteOrder).get(clientId) ?? EMPTY;
}

export function getNote(s: ClinicState, noteId: Id): Note | undefined {
  return (s.notes ?? EMPTY).find((n) => n.id === noteId);
}

const fileOrder = (a: FileRecord, b: FileRecord): number => cmp(b.at, a.at) || cmp(b.id, a.id);

/** Soubory klienta od nejnovějšího. */
export function filesOfClient(s: ClinicState, clientId: Id): FileRecord[] {
  return grouped(s.files ?? EMPTY, 'client', (f) => f.clientId, fileOrder).get(clientId) ?? EMPTY;
}

/** Přílohy poznámky (od nejnovější). */
export function filesOfNote(s: ClinicState, noteId: Id): FileRecord[] {
  return grouped(s.files ?? EMPTY, 'note', (f) => f.noteId, fileOrder).get(noteId) ?? EMPTY;
}

export function getFileRecord(s: ClinicState, fileId: Id): FileRecord | undefined {
  return (s.files ?? EMPTY).find((f) => f.id === fileId);
}

/** Zápis ze sezení navázaný na schůzku. */
export function sessionNoteOfBooking(s: ClinicState, bookingId: Id): Note | undefined {
  const list = grouped(s.notes ?? EMPTY, 'booking', (n) => n.bookingId, noteOrder).get(bookingId);
  return list?.find((n) => n.kind === 'session');
}

/** Všechny poznámky navázané na schůzku (zápis ze sezení, Plaud import…). */
export function notesOfBooking(s: ClinicState, bookingId: Id): Note[] {
  return grouped(s.notes ?? EMPTY, 'booking', (n) => n.bookingId, noteOrder).get(bookingId) ?? EMPTY;
}

/** Proměnné šablony „Zápis ze sezení“ pro danou poznámku. */
export function sessionNotesVars(s: ClinicState, note: Note): TemplateVars {
  const client = getClient(s, note.clientId);
  const author = note.authorId ? getTherapist(s, note.authorId) : undefined;
  return {
    jméno: client?.firstName ?? '',
    příjmení: client?.lastName ?? '',
    datum: formatDate(note.at),
    poznámky: note.text.trim(),
    terapeut: author ? therapistName(author) : '',
    klinika: s.settings.clinicName,
  };
}

/** Předmět a text e-mailu se zápisem ze sezení (podle šablony session_notes) – pro náhled před odesláním. */
export function sessionNotesEmail(s: ClinicState, note: Note): { subject: string; body: string } {
  const tpl = s.templates.find((t) => t.key === 'session_notes') ?? DEFAULT_TEMPLATES.find((t) => t.key === 'session_notes');
  const vars = sessionNotesVars(s, note);
  return { subject: renderTemplate(tpl?.subject ?? '', vars), body: renderTemplate(tpl?.body ?? '', vars) };
}

/* ------------------------------------------------------------------ */
/* Follow-upy                                                          */
/* ------------------------------------------------------------------ */

const followUpDueKey = (f: FollowUp): string => f.due + 'T' + (f.dueTime ?? '99:99');
const openOrder = (a: FollowUp, b: FollowUp): number => cmp(followUpDueKey(a), followUpDueKey(b)) || cmp(a.createdAt, b.createdAt) || cmp(a.id, b.id);
const doneOrder = (a: FollowUp, b: FollowUp): number => cmp(b.doneAt ?? '', a.doneAt ?? '') || cmp(b.due, a.due) || cmp(a.id, b.id);
/** Pořadí otevřených follow-upů (podle termínu) – stejné jako ve followUpBuckets a followUpsOfClient. */
export const compareOpenFollowUps = openOrder;
/** Pořadí hotových follow-upů (naposledy dokončené první). */
export const compareDoneFollowUps = doneOrder;

/** Follow-upy klienta: otevřené podle termínu, pak hotové od naposledy dokončeného. */
export function followUpsOfClient(s: ClinicState, clientId: Id): FollowUp[] {
  return (
    grouped(s.followUps ?? EMPTY, 'client', (f) => f.clientId, (a, b) => Number(a.done) - Number(b.done) || (a.done ? doneOrder(a, b) : openOrder(a, b))).get(clientId) ??
    EMPTY
  );
}

export function getFollowUp(s: ClinicState, followUpId: Id): FollowUp | undefined {
  return (s.followUps ?? EMPTY).find((f) => f.id === followUpId);
}

export interface FollowUpBuckets {
  /** Neodškrtnuté s termínem před dneškem (nejstarší první). */
  overdue: FollowUp[];
  /** Neodškrtnuté na dnešek (s časem podle času, bez času na konci). */
  today: FollowUp[];
  /** Neodškrtnuté s termínem po dnešku. */
  upcoming: FollowUp[];
  /** Hotové (naposledy dokončené první). */
  done: FollowUp[];
}

/**
 * Follow-upy rozdělené podle termínu vůči dnešku. `today` může být datum i datum s časem.
 * `assigneeId` (volitelně) omezí výběr na úkoly daného kouče.
 */
export function followUpBuckets(s: ClinicState, today: LocalDate | LocalDateTime, assigneeId?: Id): FollowUpBuckets {
  const day = dateOf(today);
  const out: FollowUpBuckets = { overdue: [], today: [], upcoming: [], done: [] };
  for (const f of s.followUps ?? EMPTY) {
    if (assigneeId !== undefined && f.assigneeId !== assigneeId) continue;
    if (f.done) out.done.push(f);
    else if (f.due < day) out.overdue.push(f);
    else if (f.due === day) out.today.push(f);
    else out.upcoming.push(f);
  }
  out.overdue.sort(openOrder);
  out.today.sort(openOrder);
  out.upcoming.sort(openOrder);
  out.done.sort(doneOrder);
  return out;
}

export interface DueLabel {
  /** 'Dnes v 9:00', 'Zítra', 'Čt 22. 10.', '3. 1. 2027'. */
  label: string;
  overdue: boolean;
  /** U úkolu po termínu: '3 dny po termínu'. */
  overdueText: string | null;
}

/** Popis termínu follow-upu vůči dnešku. */
export function followUpDueLabel(f: { due: LocalDate; dueTime: TimeOfDay | null; done?: boolean }, today: LocalDate | LocalDateTime): DueLabel {
  const day = dateOf(today);
  const diff = daysBetween(day, f.due);
  const time = f.dueTime ? ' v ' + formatTime(f.dueTime) : '';
  let label: string;
  if (diff === 0) label = 'Dnes' + time;
  else if (diff === 1) label = 'Zítra' + time;
  else if (diff === -1) label = 'Včera' + time;
  else if (f.due.slice(0, 4) !== day.slice(0, 4)) label = formatDate(f.due) + time;
  else label = formatDayShort(f.due) + time;
  const overdue = !f.done && diff < 0;
  return { label, overdue, overdueText: overdue ? `${countLabel(-diff, ['den', 'dny', 'dní'])} po termínu` : null };
}

/* ------------------------------------------------------------------ */
/* Statistiky klienta                                                  */
/* ------------------------------------------------------------------ */

export interface ClientCrmStats {
  completedSessions: number;
  upcomingSessions: number;
  /** Přijaté platby od klienta (rezervace, balíčky, kredit, poplatky). */
  revenueCzk: number;
  firstSessionAt: LocalDateTime | null;
  lastSessionAt: LocalDateTime | null;
  nextSessionAt: LocalDateTime | null;
  notesCount: number;
  filesCount: number;
  openFollowUps: number;
  overdueFollowUps: number;
  stageSince: LocalDateTime | null;
}

export function clientCrmStats(s: ClinicState, clientId: Id, now: LocalDateTime): ClientCrmStats {
  const client = getClient(s, clientId);
  let completedSessions = 0;
  let upcomingSessions = 0;
  let firstSessionAt: LocalDateTime | null = null;
  let lastSessionAt: LocalDateTime | null = null;
  let nextSessionAt: LocalDateTime | null = null;
  for (const b of bookingsOfClient(s, clientId)) {
    if (b.status === 'completed') {
      completedSessions++;
      if (!firstSessionAt || b.start < firstSessionAt) firstSessionAt = b.start;
      if (!lastSessionAt || b.start > lastSessionAt) lastSessionAt = b.start;
    } else if (b.status === 'confirmed' && b.end > now) {
      upcomingSessions++;
      if (b.start >= now && (!nextSessionAt || b.start < nextSessionAt)) nextSessionAt = b.start;
    }
  }
  let revenue = 0;
  for (const p of s.payments) if (p.clientId === clientId) revenue += p.amount;
  const today = dateOf(now);
  let openFollowUps = 0;
  let overdueFollowUps = 0;
  for (const f of followUpsOfClient(s, clientId)) {
    if (f.done) continue;
    openFollowUps++;
    if (f.due < today) overdueFollowUps++;
  }
  return {
    completedSessions,
    upcomingSessions,
    revenueCzk: Math.round(revenue),
    firstSessionAt,
    lastSessionAt,
    nextSessionAt,
    notesCount: notesOfClient(s, clientId).length,
    filesCount: filesOfClient(s, clientId).length,
    openFollowUps,
    overdueFollowUps,
    stageSince: client ? stageSince(client) : null,
  };
}

/* ------------------------------------------------------------------ */
/* Pipeline – statistiky po fázích                                     */
/* ------------------------------------------------------------------ */

export interface PipelineStageStat {
  stage: Stage;
  /** Klienti, kteří jsou ve fázi teď. */
  count: number;
  /** Kolikrát klient do fáze vstoupil v období (včetně založení klienta přímo do fáze). */
  entered: number;
  /** Kolikrát klient z fáze odešel v období. */
  left: number;
  /** Průměrná doba ve fázi ve dnech – pobyty, které v období skončily (null = žádný). */
  avgDays: number | null;
  avgDaysSamples: number;
  /** Průměrně dní ve fázi u klientů, kteří v ní jsou teď (null = fáze je prázdná). */
  currentAvgDays: number | null;
}

export interface PipelineTransition {
  fromStageId: Id;
  toStageId: Id;
  count: number;
}

export interface PipelineConversion {
  fromStageId: Id;
  toStageId: Id;
  /** Klienti, kteří v období vstoupili do výchozí fáze. */
  entered: number;
  /** Z nich se později (do teď) dostali do cílové fáze. */
  converted: number;
  /** converted / entered (0–1), null když nikdo nevstoupil. */
  rate: number | null;
}

export interface PipelineStats {
  from: LocalDate;
  /** Konec období (exkluzivně). */
  to: LocalDate;
  /** Všichni klienti. */
  total: number;
  /** Klienti mimo ukončené fáze. */
  open: number;
  /** Klienti založení v období. */
  newClients: number;
  stages: PipelineStageStat[];
  /** Přechody mezi fázemi v období (nejčastější první). */
  transitions: PipelineTransition[];
  transitionsTotal: number;
  /** Konverze Freetalk → Aktivní spolupráce (null, když jedna z fází v nastavení chybí). */
  conversion: PipelineConversion | null;
}

/**
 * Statistiky pipeline za období [fromDate, toDate) – toDate je exkluzivní (stejně jako computeStats).
 */
export function pipelineStats(s: ClinicState, now: LocalDateTime, fromDate: LocalDate, toDate: LocalDate): PipelineStats {
  const stages = stagesSorted(s);
  const known = new Set(stages.map((st) => st.id));
  const fallback = stages[0]?.id ?? '';
  const inPeriod = (at: LocalDateTime): boolean => at >= fromDate && dateOf(at) < toDate;
  const acc = new Map<Id, { count: number; entered: number; left: number; sum: number; n: number; curSum: number }>();
  for (const st of stages) acc.set(st.id, { count: 0, entered: 0, left: 0, sum: 0, n: 0, curSum: 0 });
  const transitions = new Map<string, PipelineTransition>();
  let transitionsTotal = 0;
  let open = 0;
  let newClients = 0;
  const conv = known.has(CONVERSION_FROM_STAGE) && known.has(CONVERSION_TO_STAGE) ? { entered: 0, converted: 0 } : null;
  const closed = new Set(stages.filter((st) => st.closed).map((st) => st.id));
  const days = (a: LocalDateTime, b: LocalDateTime): number => Math.max(0, diffMinutes(b, a) / 1440);

  for (const c of s.clients) {
    const current = known.has(c.stageId) ? c.stageId : fallback;
    const a = acc.get(current);
    if (a) {
      a.count++;
      a.curSum += days(stageSince(c), now);
    }
    if (!closed.has(current)) open++;
    if (inPeriod(c.createdAt)) newClients++;
    const h = c.stageHistory ?? EMPTY;
    for (let i = 0; i < h.length; i++) {
      const e = h[i];
      if (e.at > now) continue;
      if (inPeriod(e.at)) {
        const into = acc.get(e.stageId);
        if (into) into.entered++;
        if (i > 0) {
          const from = h[i - 1].stageId;
          const fromAcc = acc.get(from);
          if (fromAcc) fromAcc.left++;
          const key = from + '>' + e.stageId;
          const t = transitions.get(key);
          if (t) t.count++;
          else transitions.set(key, { fromStageId: from, toStageId: e.stageId, count: 1 });
          transitionsTotal++;
          if (fromAcc) {
            fromAcc.sum += days(h[i - 1].at, e.at);
            fromAcc.n++;
          }
        }
      }
    }
    if (conv) {
      const start = h.findIndex((e) => e.stageId === CONVERSION_FROM_STAGE && inPeriod(e.at) && e.at <= now);
      if (start >= 0) {
        conv.entered++;
        if (h.some((e, i) => i > start && e.stageId === CONVERSION_TO_STAGE && e.at <= now)) conv.converted++;
      }
    }
  }

  const round1 = (x: number): number => Math.round(x * 10) / 10;
  return {
    from: fromDate,
    to: toDate,
    total: s.clients.length,
    open,
    newClients,
    stages: stages.map((stage) => {
      const a = acc.get(stage.id) ?? { count: 0, entered: 0, left: 0, sum: 0, n: 0, curSum: 0 };
      return {
        stage,
        count: a.count,
        entered: a.entered,
        left: a.left,
        avgDays: a.n ? round1(a.sum / a.n) : null,
        avgDaysSamples: a.n,
        currentAvgDays: a.count ? round1(a.curSum / a.count) : null,
      };
    }),
    transitions: [...transitions.values()].sort((x, y) => y.count - x.count || cmp(x.fromStageId, y.fromStageId) || cmp(x.toStageId, y.toStageId)),
    transitionsTotal,
    conversion: conv
      ? {
          fromStageId: CONVERSION_FROM_STAGE,
          toStageId: CONVERSION_TO_STAGE,
          entered: conv.entered,
          converted: conv.converted,
          rate: conv.entered ? conv.converted / conv.entered : null,
        }
      : null,
  };
}

/** Výchozí fáze podle historie schůzek (pro migraci starých dat). */
export function inferStageId(s: ClinicState, clientId: Id, now: LocalDateTime): Id {
  const list = bookingsOfClient(s, clientId);
  const since = addDays(now, -90);
  if (list.some((b) => b.status === 'completed' && b.start >= since && b.start <= now)) return 'st_aktivni';
  if (list.length) return 'st_pozastaveno';
  return 'st_potencialni';
}
