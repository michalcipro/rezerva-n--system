import type { Booking, ClinicState, GroupSession, Id, LocalDate, LocalDateTime } from '../domain/types';
import { getService, isOccupying, sessionsOnDate } from './selectors';
import { addDays } from './time';

/** Obsazenost skupinových lekcí – volná místa, plné termíny, čekací listina. */

/** free = volno · almost = poslední místa (≤ 2 nebo obsazenost ≥ 80 %) · full = plno */
export type GroupFill = 'free' | 'almost' | 'full';

export interface GroupSessionOverview {
  session: GroupSession;
  serviceName: string;
  capacity: number;
  /** Obsazující rezervace (potvrzené, proběhlé, nedostavení). */
  participants: Booking[];
  booked: number;
  free: number;
  /** Čekající na tento termín (čekací listina). */
  waitlist: number;
  fill: GroupFill;
  /** Termín už začal. */
  past: boolean;
  /** Termín zrušila klinika. */
  cancelled: boolean;
}

export interface GroupFilters {
  serviceId?: Id | null;
  therapistId?: Id | null;
  onlyFree?: boolean;
  includePast?: boolean;
  includeCancelled?: boolean;
}

export function fillOf(capacity: number, booked: number): GroupFill {
  const free = Math.max(0, capacity - booked);
  if (free <= 0) return 'full';
  if (free <= 2 || booked / Math.max(1, capacity) >= 0.8) return 'almost';
  return 'free';
}

/** Termíny skupinových lekcí od `from` do `to` (exkluzivně) s obsazeností. */
export function groupSessionsOverview(s: ClinicState, from: LocalDate, to: LocalDate, f: GroupFilters = {}, now?: LocalDateTime): GroupSessionOverview[] {
  // rezervace a čekající podle termínu (jedním průchodem)
  const bySession = new Map<Id, Booking[]>();
  for (const b of s.bookings) {
    if (!b.sessionId || !isOccupying(b.status)) continue;
    if (b.start.slice(0, 10) < from || b.start.slice(0, 10) >= to) continue;
    const list = bySession.get(b.sessionId);
    if (list) list.push(b);
    else bySession.set(b.sessionId, [b]);
  }
  const waiting = new Map<Id, number>();
  for (const w of s.waitlist) {
    if (!w.sessionId || (w.status !== 'waiting' && w.status !== 'offered')) continue;
    waiting.set(w.sessionId, (waiting.get(w.sessionId) ?? 0) + 1);
  }

  const out: GroupSessionOverview[] = [];
  for (let day = from; day < to; day = addDays(day, 1)) {
    for (const ses of sessionsOnDate(s, day)) {
      if (f.serviceId && ses.serviceId !== f.serviceId) continue;
      if (f.therapistId && ses.therapistId !== f.therapistId) continue;
      if (ses.cancelled && !f.includeCancelled) continue;
      const past = !!now && ses.start <= now;
      if (past && !f.includePast) continue;
      const participants = bySession.get(ses.id) ?? [];
      const booked = participants.length;
      const free = ses.cancelled ? 0 : Math.max(0, ses.capacity - booked);
      if (f.onlyFree && free <= 0) continue;
      out.push({
        session: ses,
        serviceName: getService(s, ses.serviceId)?.name ?? ses.title,
        capacity: ses.capacity,
        participants,
        booked,
        free,
        waitlist: waiting.get(ses.id) ?? 0,
        fill: fillOf(ses.capacity, booked),
        past,
        cancelled: ses.cancelled,
      });
    }
  }
  return out;
}

export interface GroupTotals {
  sessions: number;
  freeSpots: number;
  full: number;
  almost: number;
  waitlist: number;
  booked: number;
  capacity: number;
}

export function groupTotals(rows: readonly GroupSessionOverview[]): GroupTotals {
  const t: GroupTotals = { sessions: 0, freeSpots: 0, full: 0, almost: 0, waitlist: 0, booked: 0, capacity: 0 };
  for (const r of rows) {
    if (r.cancelled) continue;
    t.sessions++;
    t.freeSpots += r.free;
    t.booked += r.booked;
    t.capacity += r.capacity;
    t.waitlist += r.waitlist;
    if (r.fill === 'full') t.full++;
    else if (r.fill === 'almost') t.almost++;
  }
  return t;
}

/** Skupinové služby, které mají aspoň jeden pravidelný termín (pro filtry). */
export function groupServices(s: ClinicState): { id: Id; name: string }[] {
  const ids = new Set(s.groupTemplates.filter((t) => t.active).map((t) => t.serviceId));
  return s.services.filter((x) => x.kind === 'group' && ids.has(x.id)).sort((a, b) => a.order - b.order).map((x) => ({ id: x.id, name: x.name }));
}
