import { useMemo, useState } from 'react';
import type { Id, LocalDate, LocalDateTime } from '../../domain/types';
import { freeWindows } from '../../engine/availability';
import { countLabel, formatDayShort, formatDuration, formatSpan, formatTime, formatTimeRange } from '../../engine/format';
import {
  clientName,
  getClient,
  getService,
  getSession,
  getTherapist,
  serviceCategoryTone,
  sessionParticipants,
  therapistName,
  therapistShort,
} from '../../engine/selectors';
import { dateOf, diffMinutes } from '../../engine/time';
import { TherapistAvatar } from '../../components/domain';
import { useClinic } from '../../store/hooks';
import { navigate } from '../../store/session';
import { AvatarStack, Badge, Card, CardHeader, EmptyState, Icon, cx } from '../../ui';
import { activeOfferGroups, relativeDayLabel, waitingEntries, type OfferGroup } from './model';

export interface SidePanelProps {
  dates: LocalDate[];
  therapistIds: Id[];
  now: LocalDateTime;
  onCreate: (therapistId: Id, start: LocalDateTime) => void;
  onOpenSession: (sessionId: Id) => void;
}

function ClientLink({ id }: { id: Id }): JSX.Element {
  const clinic = useClinic();
  return (
    <button type="button" className="link cal-namelink" onClick={() => navigate({ name: 'klient', clientId: id })}>
      {clientName(getClient(clinic, id))}
    </button>
  );
}

function joinNames(ids: Id[]): JSX.Element[] {
  const out: JSX.Element[] = [];
  ids.forEach((id, i) => {
    if (i > 0) out.push(<span key={'s' + i}>{i === ids.length - 1 ? ' a ' : ', '}</span>);
    out.push(<ClientLink key={id} id={id} />);
  });
  return out;
}

export function SidePanel({ dates, therapistIds, now, onCreate, onOpenSession }: SidePanelProps): JSX.Element {
  const clinic = useClinic();
  const today = dateOf(now);
  const from = dates[0];
  const to = dates[dates.length - 1];
  const [allWindows, setAllWindows] = useState(false);

  const offers = useMemo(() => activeOfferGroups(clinic, now), [clinic, now]);
  const waiting = useMemo(() => waitingEntries(clinic, from, to), [clinic, from, to]);
  const sessionWaits = useMemo(() => {
    const map = new Map<Id, Id[]>();
    for (const w of waiting) {
      if (!w.sessionId) continue;
      map.set(w.sessionId, [...(map.get(w.sessionId) ?? []), w.clientId]);
    }
    return [...map.entries()]
      .map(([sessionId, clients]) => ({ session: getSession(clinic, sessionId), clients }))
      .filter((x): x is { session: NonNullable<typeof x.session>; clients: Id[] } => !!x.session && !x.session.cancelled && x.session.end > now)
      .sort((a, b) => (a.session.start < b.session.start ? -1 : 1));
  }, [clinic, waiting, now]);
  const dayWaits = waiting.filter((w) => !w.sessionId);

  const windows = useMemo(() => {
    const out: { therapistId: Id; date: LocalDate; start: LocalDateTime; end: LocalDateTime }[] = [];
    for (const d of dates) {
      if (d < today) continue;
      for (const id of therapistIds) for (const w of freeWindows(clinic, id, d, now, 45)) out.push({ therapistId: id, date: d, ...w });
    }
    return out.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  }, [clinic, dates, therapistIds, now, today]);
  const shownWindows = allWindows ? windows : windows.slice(0, 8);
  const multiDay = dates.length > 1;
  const activeCount = offers.reduce((n, g) => n + g.entries.length, 0) + waiting.length;
  const windowsTitle = multiDay ? 'Volná okna v týdnu' : from === today ? 'Volná okna dnes' : `Volná okna · ${formatDayShort(from)}`;

  return (
    <aside className="split__aside cal-aside" aria-label="Čekací listina a volná okna">
      <Card as="section" padding="none" aria-labelledby="cal-wl-title">
        <CardHeader
          id="cal-wl-title"
          title="Čekací listina"
          icon="hourglass"
          meta={activeCount ? countLabel(activeCount, ['aktivní', 'aktivní', 'aktivních']) : undefined}
          divided
        />
        <div className="cal-aside__body">
          {offers.length === 0 && sessionWaits.length === 0 && dayWaits.length === 0 ? (
            <EmptyState
              compact
              icon="hourglass"
              title="Nikdo nečeká"
              text="Klienta přidáte na čekací listinu v nové rezervaci, když je termín nebo lekce plná. Uvolněné místo se pak nabídne automaticky."
            />
          ) : null}

          {offers.map((g) => (
            <OfferCard key={g.key} group={g} now={now} today={today} />
          ))}

          {sessionWaits.map(({ session: ses, clients }) => {
            const taken = sessionParticipants(clinic, ses.id).length;
            return (
              <article key={ses.id} className="cal-wl">
                <div className="cal-wl__head">
                  <span className={cx('cal-dot', `cal-dot--${serviceCategoryTone(clinic, ses.serviceId)}`)} aria-hidden="true" />
                  <span className="cal-wl__title">
                    {ses.title} {formatTime(ses.start)}
                  </span>
                  <Badge tone={taken >= ses.capacity ? 'violet' : 'neutral'}>{taken >= ses.capacity ? `plno ${taken}/${ses.capacity}` : `${taken}/${ses.capacity}`}</Badge>
                </div>
                <p className="cal-wl__text">
                  {ses.start.slice(0, 10) !== today && <span className="tnum">{formatDayShort(ses.start)} · </span>}
                  {clients.length === 1 ? 'Čeká' : 'Čekají'} {clients.length} ({joinNames(clients)}) · při odhlášení se místo nabídne automaticky.
                </p>
                <button type="button" className="link cal-wl__more" onClick={() => onOpenSession(ses.id)}>
                  Detail lekce
                </button>
              </article>
            );
          })}

          {dayWaits.length > 0 && (
            <div className="cal-wl-list">
              <span className="cal-aside__label">Čekají na termín</span>
              <ul className="cal-wl-list__items">
                {dayWaits.map((w) => {
                  const svc = getService(clinic, w.serviceId);
                  const t = w.therapistId ? getTherapist(clinic, w.therapistId) : undefined;
                  return (
                    <li key={w.id} className="cal-wl-item">
                      <ClientLink id={w.clientId} />
                      <span className="cal-wl-item__meta">
                        {svc?.name ?? 'Služba'} · {t ? therapistShort(t) : 'kdokoli'} ·{' '}
                        <span className="tnum">{w.dateFrom === w.dateTo ? formatDayShort(w.dateFrom) : `${formatDayShort(w.dateFrom)} – ${formatDayShort(w.dateTo)}`}</span>
                      </span>
                      {w.note && <span className="cal-wl-item__note">„{w.note}“</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </Card>

      <Card as="section" padding="none" aria-labelledby="cal-fw-title">
        <CardHeader id="cal-fw-title" title={windowsTitle} icon="clock" meta="od 45 min" divided />
        <div className="cal-aside__body">
          {to < today ? (
            <EmptyState compact icon="history" title="Den už proběhl" text="Volná okna se ukazují jen pro dnešek a budoucí dny." />
          ) : windows.length === 0 ? (
            <EmptyState compact icon="calendarCheck" title="Žádná volná okna" text="Rozvrh je plný nebo v pracovní době nezbývá souvislých 45 minut." />
          ) : (
            <>
              <ul className="cal-windows">
                {shownWindows.map((w) => {
                  const t = getTherapist(clinic, w.therapistId);
                  const len = diffMinutes(w.end, w.start);
                  return (
                    <li key={w.therapistId + w.start}>
                      <button
                        type="button"
                        className="cal-window"
                        onClick={() => onCreate(w.therapistId, w.start)}
                        aria-label={`Volné okno ${multiDay ? formatDayShort(w.start) + ' ' : ''}${formatTimeRange(w.start, w.end)}, ${formatDuration(len)}, ${therapistName(t)} – vytvořit rezervaci`}
                      >
                        <span className="cal-window__time tnum">
                          {multiDay && <span className="cal-window__day">{formatDayShort(w.start)}</span>}
                          {formatTimeRange(w.start, w.end)}
                        </span>
                        <span className="cal-window__len tnum">{formatDuration(len)}</span>
                        <span className="cal-window__who">
                          <TherapistAvatar therapist={t} size="xs" />
                          <span className="truncate">{therapistShort(t)}</span>
                        </span>
                        <Icon name="plus" size={16} className="cal-window__icon" />
                      </button>
                    </li>
                  );
                })}
              </ul>
              {windows.length > 8 && (
                <button type="button" className="link cal-aside__more" onClick={() => setAllWindows(!allWindows)}>
                  {allWindows ? 'Zobrazit méně' : `Zobrazit všech ${windows.length}`}
                </button>
              )}
            </>
          )}
        </div>
      </Card>
    </aside>
  );
}

function OfferCard({ group: g, now, today }: { group: OfferGroup; now: LocalDateTime; today: LocalDate }): JSX.Element {
  const clinic = useClinic();
  const t = getTherapist(clinic, g.therapistId);
  const svc = getService(clinic, g.serviceId);
  const ses = g.sessionId ? getSession(clinic, g.sessionId) : undefined;
  const left = diffMinutes(g.expiresAt, now);
  const day = dateOf(g.start);
  const people = g.entries.map((w) => {
    const c = getClient(clinic, w.clientId);
    return { name: clientName(c), initials: c ? (c.firstName.charAt(0) + c.lastName.charAt(0)).toUpperCase() : '?' };
  });
  return (
    <article className="cal-wl">
      <div className="cal-wl__head">
        <span className="cal-dot cal-dot--accent" aria-hidden="true" />
        <span className="cal-wl__title tnum">
          Uvolněno {day !== today ? formatDayShort(g.start) + ' ' : ''}
          {formatTimeRange(g.start, g.end)} · {therapistName(t)}
        </span>
      </div>
      <p className="cal-wl__text">
        {ses ? `Lekce ${ses.title}` : svc?.name ?? 'Termín'} · {relativeDayLabel(day, today).toLowerCase()}. Nabídnuto {countLabel(g.entries.length, ['klientovi', 'klientům', 'klientům'])} z čekací listiny: {joinNames(g.entries.map((w) => w.clientId))}.{' '}
        {g.entries.length > 1 ? 'Potvrdí první, kdo odpoví.' : 'Čeká se na potvrzení.'}
      </p>
      <div className="cal-wl__foot">
        <AvatarStack people={people} size="xs" label={`Nabídnuto: ${people.map((p) => p.name).join(', ')}`} />
        <span className="spacer" />
        <span className={cx('cal-countdown', left <= 30 && 'is-urgent')}>
          <Icon name="clock" size={14} />
          zbývá {formatSpan(left)}
        </span>
      </div>
    </article>
  );
}
