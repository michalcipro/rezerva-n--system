import type { Booking, Client, ClinicState, FollowUp, Id, LocalDateTime, Stage } from '../../domain/types';
import { clientStage, followUpsOfClient, stageSince } from '../../engine/crm';
import { countLabel, formatDate, formatDayShort, formatNumber, formatTime, plural, prepZ } from '../../engine/format';
import { bookingsOfClient, bookingsOnDate, clientName, getClient, therapistName } from '../../engine/selectors';
import { addDays, dateOf, daysBetween } from '../../engine/time';

/**
 * Čisté pomocné funkce obrazovek Pipeline a Follow-upy (nad ClinicState, bez Reactu).
 * „Kouč“ klienta = terapeut jeho poslední schůzky (viz coachOf).
 */

/** Hodnota filtru „bez kouče“ / „bez přiřazení“. */
export const NONE = '__none';

/** Maximální délka poznámky ke změně fáze (sdílený limit z engine/crm). */
export { STAGE_NOTE_MAX } from '../../engine/crm';

/** Text pro hledání: malá písmena bez diakritiky. */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const byName = (a: Pick<Client, 'firstName' | 'lastName'>, b: Pick<Client, 'firstName' | 'lastName'>): number =>
  a.lastName.localeCompare(b.lastName, 'cs') || a.firstName.localeCompare(b.firstName, 'cs');

/* ------------------------------------------------------------------ */
/* Kouč a příští schůzka                                               */
/* ------------------------------------------------------------------ */

/**
 * Kouč klienta = terapeut jeho poslední schůzky: poslední nezrušená schůzka, která už začala;
 * když žádná není, nejbližší naplánovaná; jinak poslední schůzka vůbec (i zrušená). Bez schůzek null.
 * `bookings` jsou seřazené podle začátku (jako vrací bookingsOfClient).
 */
export function coachOf(bookings: readonly Booking[], now: LocalDateTime): Id | null {
  let upcoming: Booking | undefined;
  for (let i = bookings.length - 1; i >= 0; i--) {
    const b = bookings[i];
    if (b.start <= now) {
      if (b.status === 'completed' || b.status === 'no_show' || b.status === 'confirmed') return b.therapistId;
    } else if (b.status === 'confirmed') {
      upcoming = b; // jdeme od konce – poslední přiřazení je nejbližší budoucí schůzka
    }
  }
  if (upcoming) return upcoming.therapistId;
  return bookings.length ? bookings[bookings.length - 1].therapistId : null;
}

/** Začátek nejbližší potvrzené schůzky od teď (nebo null). */
export function nextSessionOf(bookings: readonly Booking[], now: LocalDateTime): LocalDateTime | null {
  for (const b of bookings) if (b.status === 'confirmed' && b.start >= now) return b.start;
  return null;
}

/** 'Dnes 14:00', 'Zítra 9:00', 'Čt 22. 10. 9:00', '5. 1. 2027 9:00'. */
export function sessionLabel(start: LocalDateTime, now: LocalDateTime): string {
  const diff = daysBetween(dateOf(now), dateOf(start));
  const time = formatTime(start);
  if (diff === 0) return 'Dnes ' + time;
  if (diff === 1) return 'Zítra ' + time;
  if (start.slice(0, 4) !== now.slice(0, 4)) return formatDate(start) + ' ' + time;
  return formatDayShort(start) + ' ' + time;
}

/** Text tlačítka pro další stránku seznamu: 'Zobrazit zbývající (6)', 'Zobrazit dalších 30 ze 328'. */
export function showMoreLabel(rest: number, step: number): string {
  if (rest <= step) return `Zobrazit zbývající (${formatNumber(rest)})`;
  return `Zobrazit ${plural(step, ['další', 'další', 'dalších'])} ${formatNumber(step)} ${prepZ(rest)} ${formatNumber(rest)}`;
}

/** 'Ve fázi od dneška', 'Ve fázi 1 den', 'Ve fázi 12 dní'. */
export function daysInStageLabel(days: number): string {
  return days <= 0 ? 'Ve fázi od dneška' : 'Ve fázi ' + countLabel(days, ['den', 'dny', 'dní']);
}

/* ------------------------------------------------------------------ */
/* Karty pipeline                                                      */
/* ------------------------------------------------------------------ */

export interface PipelineCardData {
  client: Client;
  name: string;
  /** Fáze, ve které se karta zobrazí (neznámá fáze → první, stejně jako clientStage). */
  stageId: Id;
  since: LocalDateTime;
  days: number;
  coachId: Id | null;
  nextSessionAt: LocalDateTime | null;
  openFollowUps: number;
  overdueFollowUps: number;
  /** Nejbližší otevřený follow-up (nejstarší po termínu první). */
  nextFollowUp: FollowUp | null;
  /** Jméno bez diakritiky pro hledání ('jana novakova novakova jana'). */
  search: string;
}

/** Data karet pro všechny klienty (jeden průchod; v UI v useMemo podle clinic a now). */
export function buildPipelineCards(s: ClinicState, now: LocalDateTime): PipelineCardData[] {
  const today = dateOf(now);
  return s.clients.map((client) => {
    const bookings = bookingsOfClient(s, client.id);
    let openFollowUps = 0;
    let overdueFollowUps = 0;
    let nextFollowUp: FollowUp | null = null;
    for (const f of followUpsOfClient(s, client.id)) {
      if (f.done) continue;
      openFollowUps++;
      if (f.due < today) overdueFollowUps++;
      if (!nextFollowUp) nextFollowUp = f; // otevřené jsou seřazené podle termínu
    }
    const since = stageSince(client);
    const name = clientName(client);
    return {
      client,
      name,
      stageId: clientStage(s, client).id,
      since,
      days: Math.max(0, daysBetween(dateOf(since), today)),
      coachId: coachOf(bookings, now),
      nextSessionAt: nextSessionOf(bookings, now),
      openFollowUps,
      overdueFollowUps,
      nextFollowUp,
      search: normalizeText(`${client.firstName} ${client.lastName} ${client.lastName} ${client.firstName}`),
    };
  });
}

export type CardSort = 'name' | 'longest' | 'newest' | 'next';

export const CARD_SORT_LABEL: Record<CardSort, string> = {
  name: 'Jméno',
  longest: 'Nejdéle ve fázi',
  newest: 'Nově ve fázi',
  next: 'Nejbližší schůzka',
};

export function compareCards(a: PipelineCardData, b: PipelineCardData, sort: CardSort): number {
  switch (sort) {
    case 'longest':
      return (a.since < b.since ? -1 : a.since > b.since ? 1 : 0) || byName(a.client, b.client);
    case 'newest':
      return (a.since > b.since ? -1 : a.since < b.since ? 1 : 0) || byName(a.client, b.client);
    case 'next': {
      const x = a.nextSessionAt ?? '~';
      const y = b.nextSessionAt ?? '~';
      return (x < y ? -1 : x > y ? 1 : 0) || byName(a.client, b.client);
    }
    default:
      return byName(a.client, b.client);
  }
}

export interface CardFilter {
  /** Hledání podle jména. */
  query: string;
  /** '' = všichni koučové, NONE = bez kouče, jinak id terapeuta. */
  coach: string;
}

export function matchesCard(card: PipelineCardData, f: CardFilter): boolean {
  if (f.coach === NONE ? card.coachId !== null : f.coach && card.coachId !== f.coach) return false;
  const q = normalizeText(f.query);
  return !q || card.search.includes(q);
}

export interface StageColumn {
  stage: Stage;
  /** Karty odpovídající filtru, seřazené. */
  cards: PipelineCardData[];
  /** Všichni klienti ve fázi (bez filtru). */
  total: number;
}

/** Karty rozdělené do sloupců podle fází (pořadí podle `stages`). */
export function groupColumns(stages: readonly Stage[], cards: readonly PipelineCardData[], filter: CardFilter, sort: CardSort): StageColumn[] {
  const byStage = new Map<Id, StageColumn>();
  for (const stage of stages) byStage.set(stage.id, { stage, cards: [], total: 0 });
  for (const card of cards) {
    const col = byStage.get(card.stageId);
    if (!col) continue;
    col.total++;
    if (matchesCard(card, filter)) col.cards.push(card);
  }
  for (const col of byStage.values()) col.cards.sort((a, b) => compareCards(a, b, sort));
  return [...byStage.values()];
}

/** Volby filtru kouče: aktivní terapeuti a ti, kteří jsou koučem některého klienta (podle pořadí). */
export function coachOptions(s: ClinicState, coachIds: ReadonlySet<Id>): { value: string; label: string }[] {
  return [...s.therapists]
    .filter((t) => t.active || coachIds.has(t.id))
    .sort((a, b) => a.order - b.order)
    .map((t) => ({ value: t.id, label: therapistName(t) }));
}

/* ------------------------------------------------------------------ */
/* Follow-upy                                                          */
/* ------------------------------------------------------------------ */

export interface FollowUpFilter {
  /** '' = všichni, NONE = bez přiřazení, jinak id terapeuta. */
  assignee: string;
  query: string;
}

/** Follow-up odpovídá filtru (přiřazení a hledání v názvu, poznámce a jménu klienta). */
export function matchesFollowUp(s: ClinicState, f: FollowUp, filter: FollowUpFilter): boolean {
  if (filter.assignee === NONE ? f.assigneeId !== null : filter.assignee && f.assigneeId !== filter.assignee) return false;
  const q = normalizeText(filter.query);
  if (!q) return true;
  const c = getClient(s, f.clientId);
  const hay = normalizeText(`${f.title} ${f.note} ${c ? `${c.firstName} ${c.lastName} ${c.lastName} ${c.firstName}` : ''}`);
  return hay.includes(q);
}

/* ------------------------------------------------------------------ */
/* Výběr klienta                                                       */
/* ------------------------------------------------------------------ */

/** Klienti odpovídající hledání (jméno, e-mail, telefon); ti, jejichž jméno začíná hledaným textem, první. */
export function searchClients(s: ClinicState, query: string, limit: number): Client[] {
  const q = normalizeText(query);
  if (!q) return [];
  const digits = query.replace(/\D/g, '');
  const scored: { c: Client; score: number }[] = [];
  for (const c of s.clients) {
    const first = normalizeText(c.firstName);
    const last = normalizeText(c.lastName);
    const full = `${first} ${last}`;
    const reversed = `${last} ${first}`;
    let score = -1;
    if (full.startsWith(q) || reversed.startsWith(q)) score = 0;
    else if (first.startsWith(q) || last.startsWith(q)) score = 1;
    else if (full.includes(q) || reversed.includes(q)) score = 2;
    else if (c.email.toLowerCase().includes(q)) score = 3;
    else if (digits.length >= 3 && c.phone.replace(/\D/g, '').includes(digits)) score = 3;
    if (score >= 0) scored.push({ c, score });
  }
  scored.sort((a, b) => a.score - b.score || byName(a.c, b.c));
  return scored.slice(0, limit).map((x) => x.c);
}

/** Klienti z naposledy proběhlých schůzek (nejnovější první, bez opakování) – návrhy při prázdném hledání. */
export function recentSessionClients(s: ClinicState, now: LocalDateTime, limit: number, maxDays = 30): Client[] {
  const out: Client[] = [];
  const seen = new Set<Id>();
  const today = dateOf(now);
  for (let d = 0; d <= maxDays && out.length < limit; d++) {
    const list = bookingsOnDate(s, addDays(today, -d));
    for (let i = list.length - 1; i >= 0 && out.length < limit; i--) {
      const b = list[i];
      if (b.start > now || (b.status !== 'completed' && b.status !== 'confirmed') || seen.has(b.clientId)) continue;
      seen.add(b.clientId);
      const c = getClient(s, b.clientId);
      if (c) out.push(c);
    }
  }
  return out;
}
