import { useContext, useId, useMemo, useState } from 'react';
import type { Client, ClinicState, Id, LocalDate, LocalDateTime } from '../domain/types';
import { availableSlots } from '../engine/availability';
import { countLabel, formatDateLong, formatDuration, formatTime, plural } from '../engine/format';
import { groupSessionsOverview, type GroupSessionOverview } from '../engine/groups';
import { bookingsOfClient, getClient, getTherapist, therapistName } from '../engine/selectors';
import { addDays, dateOf, daysBetween, diffMinutes } from '../engine/time';
import { useClinic, useNow } from '../store/hooks';
import { navigatePortal, useSession, type PortalRoute } from '../store/session';
import { Button, Icon, cx } from '../ui';
import { PortalContext } from './context';
import { bookableServices, placeLabel } from './logic';
import { SectionTitle, StateChip } from './parts';
import './group-schedule.css';

export interface GroupScheduleProps {
  /** Kolik dní dopředu ukázat (výchozí 7 = tento týden). */
  days?: number;
}

/** Kolik lekcí ukázat před rozbalením. */
const INITIAL_ROWS = 5;

/** „Jste přihlášena“ / „Jste přihlášen“ podle příjmení, když si nejsme jistí, „Jste přihlášen(a)“. */
function bookedLabel(client: Pick<Client, 'firstName' | 'lastName'> | undefined): string {
  const last = client?.lastName.trim().toLocaleLowerCase('cs') ?? '';
  const first = client?.firstName.trim().toLocaleLowerCase('cs') ?? '';
  if (last.endsWith('á')) return 'Jste přihlášena';
  if (!last || last.endsWith('í') || first.endsWith('a')) return 'Jste přihlášen(a)';
  return 'Jste přihlášen';
}

/** „Dnes · středa 4. listopadu“, „Zítra · čtvrtek 5. listopadu“, „Pátek 6. listopadu“. */
function dayTitle(date: LocalDate, today: LocalDate): string {
  const d = daysBetween(today, date);
  if (d === 0) return `Dnes · ${formatDateLong(date, { year: false })}`;
  if (d === 1) return `Zítra · ${formatDateLong(date, { year: false })}`;
  return formatDateLong(date, { capital: true, year: false });
}

/** „4 volná místa“, „Poslední 2 místa“, „Poslední místo“, „Plno“. */
function spotsText(r: GroupSessionOverview): { text: string; tone: 'free' | 'almost' | 'full' } {
  if (r.free <= 0) return { text: 'Plno', tone: 'full' };
  if (r.fill === 'almost') {
    return { text: r.free === 1 ? 'Poslední místo' : `${plural(r.free, ['Poslední', 'Poslední', 'Posledních'])} ${countLabel(r.free, ['místo', 'místa', 'míst'])}`, tone: 'almost' };
  }
  return { text: countLabel(r.free, ['volné místo', 'volná místa', 'volných míst']), tone: 'free' };
}

interface ScheduleData {
  /** Klinika nabízí online aspoň jednu skupinovou lekci. */
  hasServices: boolean;
  rows: GroupSessionOverview[];
  /** Termíny, na které je klient přihlášený. */
  mine: Set<Id>;
  /** Termíny, na které klient čeká (čekací listina). */
  waiting: Set<Id>;
  /** Termíny, které si klient může teď rezervovat online (lhůta, horizont, volné místo). */
  bookable: Set<Id>;
}

function scheduleData(clinic: ClinicState, client: Client | undefined, today: LocalDate, end: LocalDate, now: LocalDateTime): ScheduleData {
  const services = (client ? bookableServices(clinic, client.id) : clinic.services.filter((s) => s.active && s.onlineBookable)).filter(
    (s) => s.kind === 'group',
  );
  const ids = new Set(services.map((s) => s.id));
  const rows = groupSessionsOverview(clinic, today, end, { includeCancelled: true }, now).filter((r) => ids.has(r.session.serviceId));
  const mine = new Set<Id>();
  const waiting = new Set<Id>();
  if (client) {
    for (const b of bookingsOfClient(clinic, client.id)) if (b.sessionId && b.status === 'confirmed') mine.add(b.sessionId);
    for (const w of clinic.waitlist) {
      if (w.clientId === client.id && w.sessionId && (w.status === 'waiting' || w.status === 'offered')) waiting.add(w.sessionId);
    }
  }
  // Stejná pravidla jako průvodce rezervací (předstih, horizont, už přihlášený).
  const bookable = new Set<Id>();
  for (const svc of services) {
    for (let d = today; d < end; d = addDays(d, 1)) {
      for (const sl of availableSlots(clinic, { serviceId: svc.id, therapistId: 'any', date: d, now, mode: 'client', clientId: client?.id })) {
        if (sl.sessionId && (sl.freeSpots ?? 0) > 0) bookable.add(sl.sessionId);
      }
    }
  }
  return { hasServices: services.length > 0, rows, mine, waiting, bookable };
}

/**
 * Klientský portál: skupinové lekce na příštích 7 dní s volnými místy.
 * Klient vidí, kde je volno, kam je už přihlášený, a lekci si rovnou zarezervuje.
 */
export function GroupSchedule({ days = 7 }: GroupScheduleProps = {}): JSX.Element | null {
  const clinic = useClinic();
  const now = useNow();
  const session = useSession();
  const portal = useContext(PortalContext);
  const titleId = useId();
  const [expanded, setExpanded] = useState(false);
  const client = portal?.client ?? (session.clientId ? getClient(clinic, session.clientId) : undefined);
  const today = dateOf(now);
  const span = Math.max(1, Math.round(days));
  const end = addDays(today, span);

  const data = useMemo(() => scheduleData(clinic, client, today, end, now), [clinic, client, today, end, now]);
  if (!data.hasServices) return null;

  const go = (route: PortalRoute): void => (portal ? portal.go(route) : navigatePortal(route));
  const title = span === 7 ? 'Skupinové lekce tento týden' : `Skupinové lekce na ${countLabel(span, ['den', 'dny', 'dní'])}`;
  // Sbalený seznam končí až po celém dni (nerozdělí lekce jednoho dne).
  let cut = Math.min(data.rows.length, INITIAL_ROWS);
  const cutDay = cut > 0 ? dateOf(data.rows[cut - 1].session.start) : '';
  while (cut < data.rows.length && dateOf(data.rows[cut].session.start) === cutDay) cut++;
  const visible = expanded ? data.rows : data.rows.slice(0, cut);
  const groups: { date: LocalDate; rows: GroupSessionOverview[] }[] = [];
  for (const r of visible) {
    const date = dateOf(r.session.start);
    const last = groups[groups.length - 1];
    if (last && last.date === date) last.rows.push(r);
    else groups.push({ date, rows: [r] });
  }
  const blocked = !!client?.blocked;
  const booked = bookedLabel(client);

  return (
    <section className="por-stack por-stack--tight por-gs" aria-labelledby={titleId}>
      <SectionTitle id={titleId}>{title}</SectionTitle>
      {data.rows.length === 0 ? (
        <div className="por-card por-card--empty">
          <Icon name="calendar" size={20} />
          <span>
            {span === 7 ? 'Tento týden' : span === 1 ? 'Dnes' : `V příštích ${span} dnech`} už žádná skupinová lekce není. Další termíny najdete v Rezervacích.
          </span>
        </div>
      ) : (
        <div className="por-gs__days">
          {groups.map((g) => (
            <div key={g.date} className="por-gs__day">
              <h3 className="por-gs__date">{dayTitle(g.date, today)}</h3>
              <ul className="por-card por-card--list por-gs__list">
                {g.rows.map((r) => (
                  <SessionItem
                    key={r.session.id}
                    row={r}
                    mine={data.mine.has(r.session.id)}
                    waiting={data.waiting.has(r.session.id)}
                    bookable={!blocked && data.bookable.has(r.session.id)}
                    blocked={blocked}
                    bookedText={booked}
                    onBook={() => go({ name: 'rezervace', serviceId: r.session.serviceId, date: r.session.start.slice(0, 10), sessionId: r.session.id })}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {data.rows.length > cut && (
        <button type="button" className="por-gs__more" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
          <span>{expanded ? 'Zobrazit méně' : `Zobrazit všechny lekce (${data.rows.length})`}</span>
          <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={16} />
        </button>
      )}
    </section>
  );
}

function SessionItem({
  row,
  mine,
  waiting,
  bookable,
  blocked,
  bookedText,
  onBook,
}: {
  row: GroupSessionOverview;
  mine: boolean;
  waiting: boolean;
  bookable: boolean;
  blocked: boolean;
  bookedText: string;
  onBook: () => void;
}): JSX.Element {
  const clinic = useClinic();
  const ses = row.session;
  const t = getTherapist(clinic, ses.therapistId);
  const place = placeLabel(clinic, { serviceId: ses.serviceId, roomId: ses.roomId });
  const spots = spotsText(row);
  const duration = formatDuration(diffMinutes(ses.end, ses.start));

  let status: JSX.Element;
  if (row.cancelled) status = <span className="por-gs__spots is-muted">Lekce se nekoná</span>;
  else if (mine) status = <StateChip tone="success" icon="check">{bookedText}</StateChip>;
  else if (spots.tone === 'full' && waiting) status = <StateChip tone="neutral" icon="bell">Plno · jste na čekací listině</StateChip>;
  else status = <span className={cx('por-gs__spots', `is-${spots.tone}`)}>{spots.text}</span>;

  // Volné místo, ale online už rezervovat nejde (krátce před začátkem) – poradíme recepci.
  const onlyDesk = !row.cancelled && !mine && !blocked && !bookable && row.free > 0;

  return (
    <li className={cx('por-gs__row', row.cancelled && 'is-cancelled')}>
      <span className="por-gs__time">
        <span className="por-gs__clock tnum">{formatTime(ses.start)}</span>
        <span className="por-gs__dur">{duration}</span>
      </span>
      <span className="por-gs__body">
        <span className="por-gs__title">{ses.title}</span>
        <span className="por-gs__meta">{[therapistName(t), place].filter(Boolean).join(' · ')}</span>
        <span className="por-gs__status">{status}</span>
      </span>
      {bookable && !mine && !row.cancelled ? (
        <Button
          size="sm"
          variant="secondary"
          className="por-gs__btn"
          aria-label={`Rezervovat – ${ses.title}, ${formatDateLong(ses.start, { year: false })} v ${formatTime(ses.start)}`}
          onClick={onBook}
        >
          Rezervovat
        </Button>
      ) : onlyDesk ? (
        <span className="por-gs__note">Jen přes recepci</span>
      ) : null}
    </li>
  );
}
