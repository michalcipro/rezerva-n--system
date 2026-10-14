import type {
  Booking,
  ClinicState,
  GroupSession,
  Id,
  LocalDate,
  LocalDateTime,
  Service,
  Therapist,
  TimeOff,
} from '../domain/types';
import {
  bookingsOfClient,
  bookingsOfTherapistOnDate,
  getClient,
  getService,
  getSession,
  getTherapist,
  isNewClient,
  isOccupying,
  sessionFreeSpots,
  sessionParticipants,
  sessionsOnDate,
} from './selectors';
import {
  addDays,
  addMinutes,
  ceilToStep,
  combine,
  dateOf,
  daysBetween,
  diffMinutes,
  maxStr,
  minStr,
  minutesOf,
  overlaps,
  timeFromMinutes,
  weekdayOf,
} from './time';

export interface Interval {
  start: LocalDateTime;
  end: LocalDateTime;
}

export interface BusyBlock extends Interval {
  /** Konec včetně rezervy po službě. */
  endWithBuffer: LocalDateTime;
  kind: 'booking' | 'session';
  bookingId?: Id;
  sessionId?: Id;
}

export interface Slot {
  start: LocalDateTime;
  end: LocalDateTime;
  therapistId: Id;
  sessionId?: Id;
  /** U skupinových lekcí počet volných míst. */
  freeSpots?: number;
  capacity?: number;
}

/* ------------------------------------------------------------------ */
/* Pracovní doba                                                       */
/* ------------------------------------------------------------------ */

function subtract(intervals: Interval[], cut: Interval): Interval[] {
  const out: Interval[] = [];
  for (const iv of intervals) {
    if (!overlaps(iv.start, iv.end, cut.start, cut.end)) {
      out.push(iv);
      continue;
    }
    if (cut.start > iv.start) out.push({ start: iv.start, end: cut.start });
    if (cut.end < iv.end) out.push({ start: cut.end, end: iv.end });
  }
  return out;
}

export function timeOffOn(s: ClinicState, therapistId: Id, date: LocalDate): TimeOff[] {
  const dayStart = combine(date, '00:00');
  const dayEnd = combine(addDays(date, 1), '00:00');
  return s.timeOff.filter(
    (t) => (t.therapistId === null || t.therapistId === therapistId) && overlaps(t.start, t.end, dayStart, dayEnd),
  );
}

export function breakIntervals(_s: ClinicState, therapist: Therapist, date: LocalDate): Interval[] {
  const wd = weekdayOf(date);
  return (therapist.breaks[wd] ?? []).map((r) => ({ start: combine(date, r.start), end: combine(date, r.end) }));
}

/** Intervaly, kdy terapeut pracuje (bez pauz a nepřítomností). */
export function workingIntervals(s: ClinicState, therapistId: Id, date: LocalDate): Interval[] {
  const t = getTherapist(s, therapistId);
  if (!t || !t.active) return [];
  const wd = weekdayOf(date);
  let ivs: Interval[] = (t.workingHours[wd] ?? [])
    .map((r) => ({ start: combine(date, r.start), end: combine(date, r.end) }))
    .filter((iv) => iv.start < iv.end);
  for (const b of breakIntervals(s, t, date)) ivs = subtract(ivs, b);
  for (const off of timeOffOn(s, therapistId, date)) ivs = subtract(ivs, { start: off.start, end: off.end });
  return ivs.sort((a, b) => (a.start < b.start ? -1 : 1));
}

/** Celá směna (od prvního začátku po poslední konec) – pro zobrazení. */
export function shiftBounds(s: ClinicState, therapistId: Id, date: LocalDate): Interval | null {
  const t = getTherapist(s, therapistId);
  if (!t) return null;
  const ranges = t.workingHours[weekdayOf(date)] ?? [];
  if (!ranges.length) return null;
  const start = ranges.reduce((m, r) => (r.start < m ? r.start : m), ranges[0].start);
  const end = ranges.reduce((m, r) => (r.end > m ? r.end : m), ranges[0].end);
  return { start: combine(date, start), end: combine(date, end) };
}

export function workingMinutes(s: ClinicState, therapistId: Id, date: LocalDate): number {
  return workingIntervals(s, therapistId, date).reduce((sum, iv) => sum + diffMinutes(iv.end, iv.start), 0);
}

/* ------------------------------------------------------------------ */
/* Obsazenost                                                          */
/* ------------------------------------------------------------------ */

export function busyBlocks(
  s: ClinicState,
  therapistId: Id,
  date: LocalDate,
  opts: { ignoreBookingId?: Id } = {},
): BusyBlock[] {
  const blocks: BusyBlock[] = [];
  for (const b of bookingsOfTherapistOnDate(s, therapistId, date)) {
    if (b.id === opts.ignoreBookingId || !isOccupying(b.status) || b.sessionId) continue;
    const svc = getService(s, b.serviceId);
    blocks.push({
      start: b.start,
      end: b.end,
      endWithBuffer: addMinutes(b.end, svc?.bufferMin ?? 0),
      kind: 'booking',
      bookingId: b.id,
    });
  }
  for (const ses of sessionsOnDate(s, date)) {
    if (ses.therapistId !== therapistId || ses.cancelled) continue;
    blocks.push({ start: ses.start, end: ses.end, endWithBuffer: ses.end, kind: 'session', sessionId: ses.id });
  }
  return blocks.sort((a, b) => (a.start < b.start ? -1 : 1));
}

/** Obsazené minuty terapeuta v daný den (rezervace + skupinové lekce s účastníky). */
export function bookedMinutes(s: ClinicState, therapistId: Id, date: LocalDate): number {
  let sum = 0;
  for (const b of bookingsOfTherapistOnDate(s, therapistId, date)) {
    if (!isOccupying(b.status) || b.sessionId) continue;
    sum += diffMinutes(b.end, b.start);
  }
  for (const ses of sessionsOnDate(s, date)) {
    if (ses.therapistId !== therapistId || ses.cancelled) continue;
    if (sessionParticipants(s, ses.id).length > 0) sum += diffMinutes(ses.end, ses.start);
  }
  return sum;
}

export function occupancyPct(s: ClinicState, therapistId: Id, date: LocalDate): number {
  const work = workingMinutes(s, therapistId, date);
  if (!work) return 0;
  return Math.min(100, Math.round((bookedMinutes(s, therapistId, date) / work) * 100));
}

/** Volná okna v pracovní době (po „teď"), nejméně `minMinutes` dlouhá. */
export function freeWindows(
  s: ClinicState,
  therapistId: Id,
  date: LocalDate,
  now: LocalDateTime,
  minMinutes = 30,
): Interval[] {
  const blocks = busyBlocks(s, therapistId, date);
  const out: Interval[] = [];
  for (const iv of workingIntervals(s, therapistId, date)) {
    let pieces: Interval[] = [{ start: maxStr(iv.start, now), end: iv.end }].filter((p) => p.start < p.end);
    for (const b of blocks) pieces = subtract(pieces, { start: b.start, end: b.endWithBuffer });
    for (const p of pieces) {
      // zarovnat začátek na 15 minut
      const startMin = ceilToStep(minutesOf(p.start), 15);
      const start = combine(date, timeFromMinutes(startMin));
      if (start < p.end && diffMinutes(p.end, start) >= minMinutes) out.push({ start, end: p.end });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Volné termíny                                                       */
/* ------------------------------------------------------------------ */

export interface SlotQuery {
  serviceId: Id;
  therapistId: Id | 'any';
  date: LocalDate;
  now: LocalDateTime;
  mode: 'client' | 'staff';
  clientId?: Id;
  ignoreBookingId?: Id;
}

function candidateTherapists(s: ClinicState, service: Service, therapistId: Id | 'any'): Therapist[] {
  const ids = therapistId === 'any' ? service.therapistIds : service.therapistIds.includes(therapistId) ? [therapistId] : [];
  return ids
    .map((id) => getTherapist(s, id))
    .filter((t): t is Therapist => !!t && t.active)
    .sort((a, b) => a.order - b.order);
}

function withinBookingWindow(s: ClinicState, start: LocalDateTime, now: LocalDateTime): boolean {
  const rules = s.settings.bookingRules;
  if (diffMinutes(start, now) < rules.minNoticeMin) return false;
  if (daysBetween(dateOf(now), dateOf(start)) > rules.horizonDays) return false;
  return true;
}

function sessionSlots(s: ClinicState, service: Service, q: SlotQuery): Slot[] {
  return sessionsOnDate(s, q.date)
    .filter((ses) => ses.serviceId === service.id && !ses.cancelled)
    .filter((ses) => q.therapistId === 'any' || ses.therapistId === q.therapistId)
    .filter((ses) => (q.mode === 'staff' ? true : withinBookingWindow(s, ses.start, q.now)))
    .filter((ses) => !q.clientId || !sessionParticipants(s, ses.id).some((b) => b.clientId === q.clientId))
    .map((ses) => ({
      start: ses.start,
      end: ses.end,
      therapistId: ses.therapistId,
      sessionId: ses.id,
      freeSpots: sessionFreeSpots(s, ses),
      capacity: ses.capacity,
    }));
}

/** Všechny volné začátky služby v daný den (krok podle nastavení, standardně 15 min). */
export function availableSlots(s: ClinicState, q: SlotQuery): Slot[] {
  const service = getService(s, q.serviceId);
  if (!service || !service.active) return [];
  if (q.mode === 'client' && !service.onlineBookable) return [];
  if (q.mode === 'client' && q.date < dateOf(q.now)) return [];
  if (service.kind === 'group') return sessionSlots(s, service, q);

  const rules = s.settings.bookingRules;
  const step = rules.slotStepMin || 15;
  const dur = service.durationMin;
  const buf = service.bufferMin;
  const clientBusy: Interval[] = q.clientId
    ? bookingsOfClient(s, q.clientId)
        .filter((b) => isOccupying(b.status) && b.id !== q.ignoreBookingId && dateOf(b.start) === q.date)
        .map((b) => ({ start: b.start, end: b.end }))
    : [];

  const perTherapist: Slot[][] = [];
  for (const th of candidateTherapists(s, service, q.therapistId)) {
    const busy = busyBlocks(s, th.id, q.date, { ignoreBookingId: q.ignoreBookingId });
    const slots: Slot[] = [];
    for (const iv of workingIntervals(s, th.id, q.date)) {
      const ivStartMin = minutesOf(iv.start);
      const ivEndMin = dateOf(iv.end) > q.date ? 24 * 60 : minutesOf(iv.end);
      const candidates: Slot[] = [];
      for (let t = ceilToStep(ivStartMin, step); t + dur <= ivEndMin; t += step) {
        const start = combine(q.date, timeFromMinutes(t));
        const end = addMinutes(start, dur);
        const endBuf = addMinutes(end, buf);
        if (busy.some((b) => overlaps(start, endBuf, b.start, b.endWithBuffer))) continue;
        if (clientBusy.some((c) => overlaps(start, end, c.start, c.end))) continue;
        if (q.mode === 'client' && !withinBookingWindow(s, start, q.now)) continue;
        candidates.push({ start, end, therapistId: th.id });
      }
      if (q.mode === 'client' && rules.compactSlots && candidates.length) {
        const touches = (sl: Slot): boolean => {
          const endBuf = addMinutes(sl.end, buf);
          return (
            sl.start === iv.start ||
            sl.end === iv.end ||
            busy.some((b) => b.endWithBuffer === sl.start || b.start === endBuf)
          );
        };
        let compact = candidates.filter(touches);
        if (!compact.length) {
          // prázdný úsek: pravidelná mřížka podle délky služby
          const grid = Math.max(step, Math.ceil(dur / step) * step);
          compact = candidates.filter((sl) => (minutesOf(sl.start) - ivStartMin) % grid === 0);
        }
        slots.push(...compact);
      } else {
        slots.push(...candidates);
      }
    }
    perTherapist.push(slots);
  }

  if (q.therapistId !== 'any') return perTherapist[0] ?? [];

  // „Kdokoli": jeden slot na čas, přednost má méně vytížený terapeut
  const load = new Map<Id, number>();
  const minutesByTherapist = (id: Id): number => {
    if (!load.has(id)) {
      let sum = 0;
      for (const b of bookingsOfTherapistOnDate(s, id, q.date)) if (isOccupying(b.status)) sum += diffMinutes(b.end, b.start);
      load.set(id, sum);
    }
    return load.get(id) ?? 0;
  };
  const byStart = new Map<LocalDateTime, Slot>();
  for (const list of perTherapist) {
    for (const sl of list) {
      const existing = byStart.get(sl.start);
      if (!existing || minutesByTherapist(sl.therapistId) < minutesByTherapist(existing.therapistId)) byStart.set(sl.start, sl);
    }
  }
  return [...byStart.values()].sort((a, b) => (a.start < b.start ? -1 : 1));
}

/** Nejbližší den (od `fromDate`) s volným termínem – pro „nejbližší volný termín". */
export function nextAvailableDate(s: ClinicState, q: Omit<SlotQuery, 'date'> & { fromDate: LocalDate; maxDays?: number }): LocalDate | null {
  const max = q.maxDays ?? s.settings.bookingRules.horizonDays;
  for (let i = 0; i <= max; i++) {
    const date = addDays(q.fromDate, i);
    const slots = availableSlots(s, { ...q, date });
    if (slots.some((sl) => sl.freeSpots === undefined || sl.freeSpots > 0)) return date;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Kontrola konkrétního termínu                                        */
/* ------------------------------------------------------------------ */

export interface SlotCheck {
  ok: boolean;
  /** Blokující problémy. */
  errors: string[];
  /** Upozornění, která personál může vědomě přejít. */
  warnings: string[];
}

export function checkBookingSlot(
  s: ClinicState,
  q: {
    serviceId: Id;
    therapistId: Id;
    start: LocalDateTime;
    clientId: Id;
    now: LocalDateTime;
    mode: 'client' | 'staff';
    sessionId?: Id;
    ignoreBookingId?: Id;
  },
): SlotCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const service = getService(s, q.serviceId);
  const therapist = getTherapist(s, q.therapistId);
  const client = getClient(s, q.clientId);
  if (!service) return { ok: false, errors: ['Služba neexistuje.'], warnings };
  if (!therapist) return { ok: false, errors: ['Terapeut neexistuje.'], warnings };
  if (!client) return { ok: false, errors: ['Klient neexistuje.'], warnings };
  const strict = q.mode === 'client';
  const push = (msg: string, hard: boolean): void => {
    (hard ? errors : warnings).push(msg);
  };

  if (!service.active) push('Služba není aktivní.', true);
  if (strict && !service.onlineBookable) push('Tuto službu nelze rezervovat online.', true);
  if (!service.therapistIds.includes(therapist.id)) push(`${therapist.firstName} ${therapist.lastName} tuto službu neposkytuje.`, strict);
  if (strict && client.blocked) push('Online rezervace jsou pro tento účet pozastavené. Ozvěte se prosím na recepci.', true);
  if (service.newClientsOnly && !isNewClient(s, client.id, q.ignoreBookingId)) push('Služba je určená novým klientům.', strict);

  const minuteOfDay = minutesOf(q.start);
  const step = s.settings.bookingRules.slotStepMin || 15;
  if (minuteOfDay % step !== 0) push(`Začátek musí odpovídat ${step}minutové mřížce.`, true);

  if (strict) {
    if (q.start <= q.now) push('Termín už proběhl.', true);
    else if (!withinBookingWindow(s, q.start, q.now)) {
      const rules = s.settings.bookingRules;
      if (diffMinutes(q.start, q.now) < rules.minNoticeMin)
        push(`Online lze rezervovat nejpozději ${Math.round(rules.minNoticeMin / 60)} h předem.`, true);
      else push(`Online lze rezervovat nejvýše ${rules.horizonDays} dní dopředu.`, true);
    }
    const upcoming = bookingsOfClient(s, client.id).filter((b) => b.status === 'confirmed' && b.end > q.now && b.id !== q.ignoreBookingId).length;
    if (upcoming >= s.settings.bookingRules.maxUpcomingPerClient)
      push(`Najednou lze mít nejvýše ${s.settings.bookingRules.maxUpcomingPerClient} nadcházejících rezervací.`, true);
  }

  if (service.kind === 'group') {
    const ses: GroupSession | undefined = q.sessionId ? getSession(s, q.sessionId) : undefined;
    if (!ses) push('Termín lekce neexistuje.', true);
    else {
      if (ses.cancelled) push('Lekce je zrušená.', true);
      if (sessionParticipants(s, ses.id).some((b) => b.clientId === client.id && b.id !== q.ignoreBookingId))
        push('Klient je na lekci už přihlášený.', true);
      if (sessionFreeSpots(s, ses) <= 0) push('Lekce je plně obsazená.', true);
    }
    return { ok: errors.length === 0, errors, warnings };
  }

  const end = addMinutes(q.start, service.durationMin);
  const endBuf = addMinutes(end, service.bufferMin);
  const date = dateOf(q.start);
  const ivs = workingIntervals(s, therapist.id, date);
  if (!ivs.some((iv) => iv.start <= q.start && end <= iv.end)) push('Termín je mimo pracovní dobu terapeuta.', strict);
  const blocks = busyBlocks(s, therapist.id, date, { ignoreBookingId: q.ignoreBookingId });
  const clash = blocks.find((b) => overlaps(q.start, endBuf, b.start, b.endWithBuffer));
  if (clash) push('Terapeut má v tomto čase jinou rezervaci.', true);
  const clientClash = bookingsOfClient(s, client.id).find(
    (b) => b.id !== q.ignoreBookingId && isOccupying(b.status) && overlaps(q.start, end, b.start, b.end),
  );
  if (clientClash) push('Klient má v tomto čase jinou rezervaci.', true);
  return { ok: errors.length === 0, errors, warnings };
}

/* ------------------------------------------------------------------ */
/* Denní rozvrh pro kalendář                                           */
/* ------------------------------------------------------------------ */

export interface TherapistDay {
  therapist: Therapist;
  shift: Interval | null;
  working: Interval[];
  breaks: Interval[];
  timeOff: Interval[];
  bookings: Booking[];
  sessions: GroupSession[];
  occupancy: number;
  freeWindows: Interval[];
}

export function daySchedule(s: ClinicState, date: LocalDate, now: LocalDateTime): TherapistDay[] {
  return s.therapists
    .filter((t) => t.active)
    .sort((a, b) => a.order - b.order)
    .map((t) => {
      const dayStart = combine(date, '00:00');
      const dayEnd = combine(addDays(date, 1), '00:00');
      return {
        therapist: t,
        shift: shiftBounds(s, t.id, date),
        working: workingIntervals(s, t.id, date),
        breaks: breakIntervals(s, t, date),
        timeOff: timeOffOn(s, t.id, date).map((o) => ({ start: maxStr(o.start, dayStart), end: minStr(o.end, dayEnd) })),
        bookings: bookingsOfTherapistOnDate(s, t.id, date).filter((b) => !b.sessionId),
        sessions: sessionsOnDate(s, date).filter((ses) => ses.therapistId === t.id),
        occupancy: occupancyPct(s, t.id, date),
        freeWindows: freeWindows(s, t.id, date, now, 45),
      };
    });
}
