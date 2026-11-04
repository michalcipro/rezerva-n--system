import type { ClinicState, GroupSession, Id, LocalDate, LocalDateTime } from '../domain/types';
import { getService, sessionParticipants, sessionsOnDate } from './selectors';
import { eachDay } from './time';

/**
 * Volná místa ve skupinových lekcích (docs/VSTUPY-SKUPINY-QR.md, část 2). Čisté funkce bez Reactu.
 */

export interface GroupSessionOverview {
  session: GroupSession;
  serviceName: string;
  therapistId: Id;
  capacity: number;
  /** Obsazující rezervace (potvrzené, proběhlé, nedostavení). */
  booked: number;
  free: number;
  /** Čekající na tento termín (čekací listina, stav čeká / nabídnuto). */
  waitlist: number;
  /** Termín zrušen (cancelledSessions). */
  cancelled: boolean;
  /** Termín už skončil (jen když je zadané `now`). */
  past: boolean;
  /** almost = volná místa ≤ 2 nebo obsazenost ≥ 80 %. */
  fill: 'free' | 'almost' | 'full';
}

export function sessionFill(capacity: number, booked: number): GroupSessionOverview['fill'] {
  const free = Math.max(0, capacity - booked);
  if (free <= 0) return 'full';
  if (free <= 2 || (capacity > 0 && booked / capacity >= 0.8)) return 'almost';
  return 'free';
}

/**
 * Termíny skupinových lekcí ve dnech [from, to) (konec exkluzivně, stejně jako ostatní přehledy) s obsazeností,
 * čekací listinou a stavem. `onlyFree` nechá jen nezrušené termíny s volným místem. Seřazené podle začátku.
 */
export function groupSessionsOverview(
  s: ClinicState,
  from: LocalDate,
  to: LocalDate,
  f: { serviceId?: Id | null; therapistId?: Id | null; onlyFree?: boolean } = {},
  now?: LocalDateTime,
): GroupSessionOverview[] {
  const waiting = new Map<Id, number>();
  for (const w of s.waitlist) {
    if (!w.sessionId || (w.status !== 'waiting' && w.status !== 'offered')) continue;
    waiting.set(w.sessionId, (waiting.get(w.sessionId) ?? 0) + 1);
  }
  const out: GroupSessionOverview[] = [];
  for (const day of eachDay(from, to)) {
    for (const ses of sessionsOnDate(s, day)) {
      if (f.serviceId && ses.serviceId !== f.serviceId) continue;
      if (f.therapistId && ses.therapistId !== f.therapistId) continue;
      const booked = sessionParticipants(s, ses.id).length;
      const capacity = ses.capacity;
      const free = Math.max(0, capacity - booked);
      if (f.onlyFree && (ses.cancelled || free <= 0)) continue;
      out.push({
        session: ses,
        serviceName: getService(s, ses.serviceId)?.name ?? ses.title,
        therapistId: ses.therapistId,
        capacity,
        booked,
        free,
        waitlist: waiting.get(ses.id) ?? 0,
        cancelled: ses.cancelled,
        past: now ? ses.end <= now : false,
        fill: sessionFill(capacity, booked),
      });
    }
  }
  return out.sort((a, b) => (a.session.start < b.session.start ? -1 : a.session.start > b.session.start ? 1 : a.session.title.localeCompare(b.session.title, 'cs')));
}

/** Souhrn nad přehledem (zrušené termíny se nepočítají): počet termínů, volná místa celkem, plné termíny. */
export function groupOverviewSummary(list: readonly GroupSessionOverview[]): { sessions: number; freeSpots: number; fullSessions: number; waiting: number } {
  let sessions = 0;
  let freeSpots = 0;
  let fullSessions = 0;
  let waiting = 0;
  for (const g of list) {
    if (g.cancelled) continue;
    sessions++;
    freeSpots += g.free;
    if (g.fill === 'full') fullSessions++;
    waiting += g.waitlist;
  }
  return { sessions, freeSpots, fullSessions, waiting };
}
