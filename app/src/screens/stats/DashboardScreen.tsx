import { useMemo, useState, type ReactNode } from 'react';
import type { Booking, Id, LocalDateTime, MoneyMethod } from '../../domain/types';
import { markCompleted, markNoShow } from '../../engine/commands';
import {
  NBSP,
  countLabel,
  formatDateLong,
  formatDayShort,
  formatDuration,
  formatMoney,
  formatNumber,
  formatRelative,
  formatSlot,
  formatSpan,
  formatTime,
  formatTimeRange,
} from '../../engine/format';
import { occupancyPct } from '../../engine/availability';
import {
  bookingsOfClient,
  bookingsOnDate,
  clientCredit,
  clientName,
  getClient,
  getRoom,
  getService,
  getTherapist,
  isOccupying,
  serviceCategoryTone,
  therapistShort,
} from '../../engine/selectors';
import { daySummary } from '../../engine/stats';
import { addDays, dateOf, diffMinutes, minutesOf } from '../../engine/time';
import { ToneDot } from '../../components/domain';
import { useActor, useClinic, useCommand, useNow } from '../../store/hooks';
import { navigate, setSession } from '../../store/session';
import {
  Badge,
  Button,
  Callout,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  Icon,
  IconButton,
  KpiTile,
  Menu,
  PageHeader,
  Progress,
  cx,
  type BadgeTone,
  type IconName,
  type MenuEntry,
} from '../../ui';
import { BookingDrawer, NewBookingDialog } from '../calendar';
import { HourlyChart, LegendItem } from './charts';
import { hourlyOccupancy, pct } from './model';
import { NewClientDialog } from './NewClientDialog';
import {
  activeOffers,
  blockedClients,
  dayLists,
  dueFees,
  firstOnDate,
  makeupsDue,
  noShowConsequence,
  noShowsLast90,
  packagesExpiring,
  paymentsOn,
  type SessionNow,
} from './today';
import './stats.css';

/* ------------------------------------------------------------------ */
/* Pozdrav                                                             */
/* ------------------------------------------------------------------ */

function greetingFor(now: LocalDateTime): string {
  const h = Number(now.slice(11, 13));
  if (h >= 4 && h < 10) return 'Dobré ráno';
  if (h >= 10 && h < 12) return 'Dobré dopoledne';
  if (h >= 12 && h < 18) return 'Dobré odpoledne';
  return 'Dobrý večer';
}

/** 5. pád běžných českých křestních jmen; když si nejsme jistí, jméno vynecháme. */
export function vocative(first: string): string | null {
  const n = first.trim();
  if (n.length < 2) return null;
  if (/a$/.test(n)) return n.slice(0, -1) + 'o';
  if (/(ie|e|i|í|y|ý)$/.test(n)) return n;
  if (/ek$/.test(n)) return n.slice(0, -2) + 'ku';
  if (/el$/.test(n)) return n.slice(0, -2) + 'le';
  if (/[bdfmnptv]$/.test(n)) return n + 'e';
  if (/[šžčřjc]$/.test(n)) return n + 'i';
  return null;
}

/* ------------------------------------------------------------------ */
/* Řádek příchodu                                                      */
/* ------------------------------------------------------------------ */

type RowMode = 'now' | 'next' | 'unmarked';

const MONEY_TEXT: Record<MoneyMethod | 'credit', string> = {
  card: 'kartou',
  cash: 'hotově',
  online: 'online',
  transfer: 'převodem',
  credit: 'z kreditu',
};

function ArrivalRow({
  booking,
  now,
  mode,
  onDetail,
  onNoShow,
}: {
  booking: Booking;
  now: LocalDateTime;
  mode: RowMode;
  onDetail: (id: Id) => void;
  onNoShow: (id: Id) => void;
}): JSX.Element {
  const clinic = useClinic();
  const run = useCommand();
  const client = getClient(clinic, booking.clientId);
  const service = getService(clinic, booking.serviceId);
  const therapist = getTherapist(clinic, booking.therapistId);
  const room = getRoom(clinic, booking.roomId);
  const name = clientName(client);
  const started = booking.start <= now;
  const duration = Math.max(1, diffMinutes(booking.end, booking.start));
  const elapsed = Math.min(duration, Math.max(0, diffMinutes(now, booking.start)));
  const onsiteDue = booking.payment.method === 'onsite' && !booking.payment.paid;
  const due = Math.max(0, booking.price - booking.payment.paidAmount);

  const complete = (settleWith: MoneyMethod | 'credit' | null): void => {
    run(
      markCompleted,
      { bookingId: booking.id, settleWith },
      { success: `Proběhlo · ${name}` + (settleWith ? ` · zaplaceno ${MONEY_TEXT[settleWith]}` : '') },
    );
  };

  const credit = onsiteDue ? clientCredit(clinic, booking.clientId) : 0;
  const settleItems: MenuEntry[] = [
    { type: 'label', label: `Úhrada na místě ${formatMoney(due)}` },
    { id: 'card', label: 'Zaplaceno kartou', icon: 'card', onSelect: () => complete('card') },
    { id: 'cash', label: 'Zaplaceno hotově', icon: 'cash', onSelect: () => complete('cash') },
    {
      id: 'credit',
      label: 'Z kreditu',
      hint: formatMoney(credit),
      icon: 'wallet',
      disabled: credit < due,
      onSelect: () => complete('credit'),
    },
    { type: 'separator' },
    { id: 'later', label: 'Bez úhrady, zaplatí později', icon: 'clock', onSelect: () => complete(null) },
  ];

  const when =
    mode === 'next'
      ? formatRelative(booking.start, now)
      : mode === 'now'
        ? `ještě ${formatSpan(diffMinutes(booking.end, now))}`
        : `skončilo ${formatTime(booking.end)}`;

  return (
    <li className={cx('st-arrival', mode === 'now' && 'st-arrival--now')}>
      <div className="st-arrival__time">
        <span className="st-arrival__clock">{formatTimeRange(booking.start, booking.end)}</span>
        <span className="st-arrival__rel">{when}</span>
        {mode === 'now' && (
          <Progress size="xs" value={elapsed} max={duration} label={`Uplynulo ${formatDuration(elapsed)} z ${formatDuration(duration)}`} />
        )}
      </div>
      <div className="st-arrival__main">
        <span className="st-arrival__name">
          <button
            type="button"
            className="link st-arrival__client"
            onClick={() => navigate({ name: 'klient', clientId: booking.clientId })}
          >
            {name}
          </button>
          {client && isNewClientForBooking(clinic, booking) && (
            <Badge tone="info" size="sm">
              Nový klient
            </Badge>
          )}
          {client?.blocked && (
            <Badge tone="danger" size="sm" dot="square">
              Blokace online
            </Badge>
          )}
        </span>
        <span className="st-arrival__meta">
          <ToneDot tone={serviceCategoryTone(clinic, booking.serviceId)} />
          <span>{service?.name ?? 'Služba'}</span>
          <span aria-hidden="true">·</span>
          <span>{therapistShort(therapist)}</span>
          {room && (
            <>
              <span aria-hidden="true">·</span>
              <span>{room.name}</span>
            </>
          )}
        </span>
        <span className="st-arrival__badges">
          {onsiteDue && (
            <Badge tone="warning" size="sm" dot="square">
              Platba na místě {formatMoney(due)}
            </Badge>
          )}
          {booking.makeupForBookingId && (
            <Badge tone="accent" size="sm" dot="ring">
              Náhradní termín
            </Badge>
          )}
          {booking.note && (
            <span className="st-arrival__note" title={booking.note}>
              <Icon name="message" size={12} /> {booking.note}
            </span>
          )}
        </span>
      </div>
      <div className="st-arrival__actions">
        {onsiteDue ? (
          <Menu
            label={`Proběhlo – ${name}`}
            trigger={
              <Button size="sm" icon="check" iconRight="chevronDown">
                Proběhlo
              </Button>
            }
            items={settleItems}
          />
        ) : (
          <Button size="sm" icon="check" onClick={() => complete(null)}>
            Proběhlo
          </Button>
        )}
        <Button
          size="sm"
          variant="danger-secondary"
          icon="userX"
          disabled={!started}
          title={started ? undefined : 'Nedostavení lze zapsat až po začátku termínu'}
          onClick={() => onNoShow(booking.id)}
        >
          Nedostavil/a se
        </Button>
        <IconButton icon="more" label={`Detail rezervace – ${name}`} size="sm" onClick={() => onDetail(booking.id)} />
      </div>
    </li>
  );
}

/** Klient přichází poprvé (žádná dřívější proběhlá návštěva). */
function isNewClientForBooking(clinic: ReturnType<typeof useClinic>, b: Booking): boolean {
  return !bookingsOfClient(clinic, b.clientId).some((x) => x.status === 'completed' && x.start < b.start);
}

function SessionRow({ item, now, mode }: { item: SessionNow; now: LocalDateTime; mode: 'now' | 'next' }): JSX.Element {
  const clinic = useClinic();
  const ses = item.session;
  const therapist = getTherapist(clinic, ses.therapistId);
  const room = getRoom(clinic, ses.roomId);
  return (
    <li className={cx('st-arrival', 'st-arrival--session', mode === 'now' && 'st-arrival--now')}>
      <div className="st-arrival__time">
        <span className="st-arrival__clock">{formatTimeRange(ses.start, ses.end)}</span>
        <span className="st-arrival__rel">
          {mode === 'next' ? formatRelative(ses.start, now) : `ještě ${formatSpan(diffMinutes(ses.end, now))}`}
        </span>
      </div>
      <div className="st-arrival__main">
        <span className="st-arrival__name">
          <strong>{ses.title}</strong>
          <Badge tone="violet" size="sm">
            Skupinová lekce
          </Badge>
        </span>
        <span className="st-arrival__meta">
          <ToneDot tone={serviceCategoryTone(clinic, ses.serviceId)} />
          <span>
            {item.participants}/{ses.capacity} {countWord(item.participants)}
          </span>
          <span aria-hidden="true">·</span>
          <span>{therapistShort(therapist)}</span>
          {room && (
            <>
              <span aria-hidden="true">·</span>
              <span>{room.name}</span>
            </>
          )}
        </span>
      </div>
      <div className="st-arrival__actions">
        <Button size="sm" variant="ghost" iconRight="arrowRight" onClick={() => openCalendar(dateOf(ses.start))}>
          Účastníci v kalendáři
        </Button>
      </div>
    </li>
  );
}

const countWord = (n: number): string => (n === 1 ? 'účastník' : n >= 2 && n <= 4 ? 'účastníci' : 'účastníků');

function openCalendar(date: string): void {
  setSession({ calendarDate: date, calendarView: 'day' });
  navigate({ name: 'kalendar' });
}

/* ------------------------------------------------------------------ */
/* Upozornění                                                          */
/* ------------------------------------------------------------------ */

interface AlertItem {
  key: string;
  main: ReactNode;
  meta: ReactNode;
  value?: ReactNode;
}

function AlertGroup({
  icon,
  tone,
  title,
  count,
  summary,
  items,
  initial = 3,
}: {
  icon: IconName;
  tone: BadgeTone;
  title: string;
  count: number;
  summary?: ReactNode;
  items: AlertItem[];
  initial?: number;
}): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, initial);
  return (
    <section className={`st-alert st-alert--${tone}`} aria-label={title}>
      <div className="st-alert__head">
        <span className="st-alert__icon" aria-hidden="true">
          <Icon name={icon} size={16} />
        </span>
        <h3 className="st-alert__title">{title}</h3>
        <Badge tone={tone} size="md">
          {formatNumber(count)}
        </Badge>
      </div>
      {summary && <p className="st-alert__summary">{summary}</p>}
      <ul className={cx('st-alert__list', expanded && items.length > 8 && 'is-scroll')}>
        {shown.map((it) => (
          <li key={it.key} className="st-alert__item">
            <span className="st-alert__main">{it.main}</span>
            <span className="st-alert__meta">{it.meta}</span>
            {it.value != null && <span className="st-alert__value">{it.value}</span>}
          </li>
        ))}
      </ul>
      {items.length > initial && (
        <button type="button" className="link st-alert__more" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Zobrazit méně' : `Zobrazit všechny (${formatNumber(items.length)})`}
        </button>
      )}
    </section>
  );
}

const ClientLink = ({ id, name }: { id: Id; name: string }): JSX.Element => (
  <button type="button" className="link" onClick={() => navigate({ name: 'klient', clientId: id })}>
    {name}
  </button>
);

/* ------------------------------------------------------------------ */
/* Obrazovka                                                           */
/* ------------------------------------------------------------------ */

export function DashboardScreen(): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const actor = useActor();
  const run = useCommand();
  const today = dateOf(now);
  const scope = actor.role === 'therapist' ? (actor.therapistId ?? null) : null;
  const finance = actor.role === 'owner' || actor.role === 'reception';

  const [newBooking, setNewBooking] = useState(false);
  const [newClient, setNewClient] = useState(false);
  const [drawerId, setDrawerId] = useState<Id | null>(null);
  const [noShowId, setNoShowId] = useState<Id | null>(null);

  const summary = useMemo(() => daySummary(clinic, today, now), [clinic, today, now]);
  const lists = useMemo(() => dayLists(clinic, today, now, scope), [clinic, today, now, scope]);
  const hourly = useMemo(() => hourlyOccupancy(clinic, today, scope), [clinic, today, scope]);
  const tomorrowFirst = useMemo(() => firstOnDate(clinic, addDays(today, 1), scope), [clinic, today, scope]);
  const packages = useMemo(() => packagesExpiring(clinic, today, 14), [clinic, today]);
  const alerts = useMemo(
    () => ({
      fees: dueFees(clinic),
      offers: activeOffers(clinic, now),
      makeups: makeupsDue(clinic, now, 14),
      blocked: blockedClients(clinic),
    }),
    [clinic, now],
  );
  const received = useMemo(() => (finance ? paymentsOn(clinic, today) : 0), [clinic, today, finance]);

  // čísla dne v rozsahu role (terapeut vidí svůj den)
  const day = useMemo(() => {
    const list = bookingsOnDate(clinic, today).filter((b) => !scope || b.therapistId === scope);
    const individual = list.filter((b) => !b.sessionId);
    const group = list.filter((b) => b.sessionId && isOccupying(b.status));
    return {
      bookings: individual.filter((b) => isOccupying(b.status)).length,
      completed: individual.filter((b) => b.status === 'completed').length,
      groupSessions: new Set(group.map((b) => b.sessionId)).size,
      groupParticipants: group.length,
      excused: list.filter((b) => b.status === 'excused').length,
      noShows: list.filter((b) => b.status === 'no_show').length,
      occupancy: scope ? occupancyPct(clinic, scope, today) : summary.occupancy,
    };
  }, [clinic, today, scope, summary.occupancy]);

  /* --------------------------- pozdrav --------------------------- */
  const firstName =
    actor.role === 'therapist'
      ? getTherapist(clinic, actor.therapistId ?? '')?.firstName
      : actor.role === 'owner'
        ? actor.name.split(' ')[0]
        : undefined;
  const voc = firstName ? vocative(firstName) : null;
  const greeting = greetingFor(now) + (voc ? `, ${voc}` : '');

  /* --------------------------- docházka --------------------------- */
  const noShowBooking = noShowId ? clinic.bookings.find((b) => b.id === noShowId) : undefined;
  const nextArrival = lists.next[0] ?? lists.later;
  const nowCount = lists.inProgress.length + lists.sessionsNow.length;
  const nextCount = lists.next.length + lists.sessionsNext.length;
  const whoNext = (b: Booking | null): string => (b ? `${formatTime(b.start)} – ${clientName(getClient(clinic, b.clientId))}` : '');

  /* --------------------------- obsazenost po hodinách --------------------------- */
  const nowMin = minutesOf(now);
  const freeLeft = hourly.reduce((sum, s) => {
    const free = Math.max(0, s.available - s.booked);
    const start = s.hour * 60;
    const end = start + 60;
    if (nowMin >= end) return sum;
    if (nowMin <= start) return sum + free;
    return sum + free * ((end - nowMin) / 60);
  }, 0);
  const totalAvail = hourly.reduce((s, h) => s + h.available, 0);

  /* --------------------------- upozornění --------------------------- */
  const groups: JSX.Element[] = [];
  if (finance && alerts.fees.items.length > 0) {
    groups.push(
      <AlertGroup
        key="fees"
        icon="receipt"
        tone="warning"
        title="Neuhrazené poplatky"
        count={alerts.fees.items.length}
        summary={
          <>
            Celkem <strong>{formatMoney(alerts.fees.total)}</strong> u {countLabel(alerts.fees.clients, ['klienta', 'klientů', 'klientů'])}.
            Uhradit nebo odpustit je můžete v kartě klienta.
          </>
        }
        items={alerts.fees.items.map((f) => ({
          key: f.booking.id,
          main: <ClientLink id={f.booking.clientId} name={clientName(f.client)} />,
          meta: `${f.booking.fee?.reason === 'no_show' ? 'Nedostavení' : 'Pozdní storno'} ${formatDayShort(f.booking.start)}`,
          value: formatMoney(f.amount),
        }))}
      />,
    );
  }
  if (alerts.offers.length > 0) {
    groups.push(
      <AlertGroup
        key="offers"
        icon="hourglass"
        tone="info"
        title="Nabídky z čekací listiny"
        count={alerts.offers.length}
        summary="Uvolněné termíny čekají na potvrzení klientem. Potvrdí ten, kdo odpoví první."
        items={alerts.offers.map((o) => {
          const svc = getService(clinic, o.serviceId);
          return {
            key: o.key,
            main: (
              <button type="button" className="link" onClick={() => openCalendar(dateOf(o.start))}>
                {formatSlot(o.start)}
              </button>
            ),
            meta: (
              <>
                <span className="st-alert__line">
                  {svc?.name ?? 'Termín'} · {therapistShort(getTherapist(clinic, o.therapistId))}
                </span>
                <span className="st-alert__line">
                  nabídnuto {countLabel(o.clientIds.length, ['klientovi', 'klientům', 'klientům'])} ·{' '}
                  <span className="st-countdown">vyprší {formatRelative(o.expiresAt, now)}</span>
                </span>
              </>
            ),
          };
        })}
      />,
    );
  }
  if (alerts.makeups.length > 0) {
    groups.push(
      <AlertGroup
        key="makeups"
        icon="repeat"
        tone="warning"
        title="Náhrady s blížící se lhůtou"
        count={alerts.makeups.length}
        summary="Klient má právo na náhradní termín – pomozte mu ho rezervovat, než propadne."
        items={alerts.makeups.map((m) => ({
          key: m.id,
          main: <ClientLink id={m.clientId} name={clientName(getClient(clinic, m.clientId))} />,
          meta: `náhrada do ${formatDayShort(m.validUntil)}`,
          value: <span className="st-countdown">{formatRelative(m.validUntil, now)}</span>,
        }))}
      />,
    );
  }
  if (packages.length > 0) {
    groups.push(
      <AlertGroup
        key="packages"
        icon="ticket"
        tone="warning"
        title="Permanentky končí do 14 dní"
        count={packages.length}
        summary={`Nevyčerpané vstupy celkem: ${formatNumber(packages.reduce((s, p) => s + p.usage.free, 0))}. Nabídněte termín nebo prodloužení.`}
        items={packages.map((p) => ({
          key: p.pkg.id,
          main: <ClientLink id={p.pkg.clientId} name={clientName(getClient(clinic, p.pkg.clientId))} />,
          meta: `${p.pkg.name} · zbývá ${countLabel(p.usage.free, ['vstup', 'vstupy', 'vstupů'])}`,
          value: p.daysLeft <= 0 ? 'končí dnes' : `do ${formatDayShort(p.usage.validUntil)}`,
        }))}
      />,
    );
  }
  if (alerts.blocked.length > 0) {
    groups.push(
      <AlertGroup
        key="blocked"
        icon="ban"
        tone="danger"
        title="Zablokované online rezervace"
        count={alerts.blocked.length}
        summary="Po opakovaném nedostavení se mohou objednat jen přes recepci. Odblokovat lze v kartě klienta."
        items={alerts.blocked.map((c) => ({
          key: c.id,
          main: <ClientLink id={c.id} name={clientName(c)} />,
          meta: `${countLabel(noShowsLast90(clinic, c.id, now), ['nedostavení', 'nedostavení', 'nedostavení'])} za 90 dní`,
        }))}
      />,
    );
  }

  return (
    <div className="page st-root st-dash">
      <PageHeader
        title={greeting}
        subtitle={
          <>
            {formatDateLong(today, { capital: true })} · {formatTime(now)}
            {scope && <span className="st-sub-muted"> · vaše termíny</span>}
          </>
        }
        actions={
          <>
            <Button icon="calendar" onClick={() => openCalendar(today)}>
              Kalendář
            </Button>
            <Button icon="userPlus" onClick={() => setNewClient(true)}>
              Nový klient
            </Button>
            <Button variant="primary" icon="plus" onClick={() => setNewBooking(true)}>
              Nová rezervace
            </Button>
          </>
        }
      />

      <div className="st-kpis st-kpis--day" aria-label="Souhrn dne">
        <KpiTile label="Rezervace dnes" value={formatNumber(day.bookings)}>
          <span className="st-kpi-extra">
            proběhlo <strong>{formatNumber(day.completed)}</strong> · zbývá <strong>{formatNumber(lists.remaining)}</strong>
          </span>
        </KpiTile>
        <KpiTile label="Obsazenost" value={`${formatNumber(day.occupancy)}${NBSP}%`}>
          <span className="st-kpi-progress">
            <Progress value={day.occupancy} target={85} label={`Obsazenost dne ${day.occupancy} %, cíl 85 %`} />
            <span className="st-kpi-extra">cíl 85{NBSP}%</span>
          </span>
        </KpiTile>
        <KpiTile label="Teď probíhá" value={formatNumber(nowCount)}>
          <span className="st-kpi-extra">{nextArrival ? <>další {whoNext(nextArrival)}</> : 'dnes už nikdo nepřichází'}</span>
        </KpiTile>
        <KpiTile label="Skupinové lekce" value={formatNumber(day.groupSessions)}>
          <span className="st-kpi-extra">{countLabel(day.groupParticipants, ['účastník', 'účastníci', 'účastníků'])}</span>
        </KpiTile>
        <KpiTile label="Nedostavení" value={formatNumber(day.noShows)}>
          <span className="st-kpi-extra">
            omluveno <strong>{formatNumber(day.excused)}</strong>
          </span>
        </KpiTile>
        {finance && (
          <KpiTile label="Přijato dnes" value={formatMoney(received)}>
            <span className="st-kpi-extra">platby na místě i online</span>
          </KpiTile>
        )}
      </div>

      <div className="split st-dash__split">
        <div className="split__main">
          <Card as="section" aria-label="Teď probíhá" className="st-card">
            <CardHeader title="Teď probíhá" meta={nowCount > 0 ? countLabel(nowCount, ['termín', 'termíny', 'termínů']) : undefined} />
            {nowCount === 0 && lists.unmarked.length === 0 ? (
              <p className="st-muted-text">Teď neprobíhá žádný termín.{nextArrival ? ` Další příchod: ${whoNext(nextArrival)}.` : ''}</p>
            ) : (
              <ul className="st-arrivals">
                {lists.sessionsNow.map((x) => (
                  <SessionRow key={x.session.id} item={x} now={now} mode="now" />
                ))}
                {lists.inProgress.map((b) => (
                  <ArrivalRow key={b.id} booking={b} now={now} mode="now" onDetail={setDrawerId} onNoShow={setNoShowId} />
                ))}
              </ul>
            )}
            {lists.unmarked.length > 0 && (
              <>
                <span className="st-section-label">Skončilo – čeká na zápis docházky</span>
                <ul className="st-arrivals">
                  {lists.unmarked.map((b) => (
                    <ArrivalRow key={b.id} booking={b} now={now} mode="unmarked" onDetail={setDrawerId} onNoShow={setNoShowId} />
                  ))}
                </ul>
              </>
            )}
          </Card>

          <Card as="section" aria-label="Další na řadě" className="st-card">
            <CardHeader
              title="Další na řadě"
              subtitle="Příchody v příštích 2 hodinách"
              meta={nextCount > 0 ? countLabel(nextCount, ['příchod', 'příchody', 'příchodů']) : undefined}
            />
            {nextCount === 0 ? (
              <p className="st-muted-text">
                V příštích 2 hodinách nikdo nepřichází.{' '}
                {lists.later
                  ? `Další příchod dnes: ${whoNext(lists.later)}.`
                  : tomorrowFirst
                    ? `Dnes už žádné další termíny, zítra začíná první v ${formatTime(tomorrowFirst.start)}.`
                    : 'Dnes už žádné další termíny.'}
              </p>
            ) : (
              <ul className="st-arrivals">
                {[
                  ...lists.sessionsNext.map((x) => ({
                    start: x.session.start,
                    el: <SessionRow key={x.session.id} item={x} now={now} mode="next" />,
                  })),
                  ...lists.next.map((b) => ({
                    start: b.start,
                    el: <ArrivalRow key={b.id} booking={b} now={now} mode="next" onDetail={setDrawerId} onNoShow={setNoShowId} />,
                  })),
                ]
                  .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
                  .map((x) => x.el)}
              </ul>
            )}
            {lists.later && nextCount > 0 && <p className="st-footnote">Potom: {whoNext(lists.later)}</p>}
          </Card>

          <Card as="section" aria-label="Obsazenost dnes po hodinách" className="st-card">
            <CardHeader
              title="Obsazenost dnes"
              subtitle={scope ? 'Po hodinách, vaše pracovní doba' : 'Po hodinách, pracovní doba celého týmu'}
              meta={`${formatNumber(day.occupancy)}${NBSP}% celkem`}
            />
            <div className="st-legend">
              <LegendItem colorClass="st-c-accent">obsazeno</LegendItem>
              <LegendItem colorClass="st-c-past">uplynulé hodiny</LegendItem>
              <LegendItem colorClass="st-c-track">volno</LegendItem>
            </div>
            {totalAvail > 0 ? (
              <HourlyChart
                slots={hourly}
                nowMinutes={nowMin}
                label={`Obsazenost dnes po hodinách: ${hourly
                  .filter((s) => s.available > 0)
                  .map((s) => `${s.hour} h ${pct(s.booked / s.available)}`)
                  .join(', ')}`}
              />
            ) : (
              <p className="st-muted-text">Dnes nikdo z týmu nepracuje.</p>
            )}
            {totalAvail > 0 && (
              <div className="st-hourly-foot">
                <span>
                  Volná kapacita do konce dne: <strong>{formatDuration(Math.round(freeLeft / 15) * 15)}</strong>
                </span>
                <button type="button" className="link" onClick={() => openCalendar(today)}>
                  Volná okna v kalendáři
                </button>
              </div>
            )}
          </Card>
        </div>

        <aside className="split__aside" aria-label="Upozornění">
          <Card as="section" aria-label="Upozornění" className="st-card">
            <CardHeader
              title="Upozornění"
              meta={groups.length > 0 ? countLabel(groups.length, ['oblast', 'oblasti', 'oblastí']) : undefined}
            />
            {groups.length === 0 ? (
              <EmptyState
                compact
                icon="checkCircle"
                title="Vše vyřízeno"
                text="Žádné poplatky, nabídky ani končící permanentky nečekají na pozornost."
              />
            ) : (
              <div className="st-alerts">{groups}</div>
            )}
          </Card>
        </aside>
      </div>

      <NewBookingDialog open={newBooking} onClose={() => setNewBooking(false)} />
      <NewClientDialog
        open={newClient}
        onClose={() => setNewClient(false)}
        onCreated={(id) => navigate({ name: 'klient', clientId: id })}
      />
      <BookingDrawer bookingId={drawerId} onClose={() => setDrawerId(null)} />
      <ConfirmDialog
        open={!!noShowBooking}
        onClose={() => setNoShowId(null)}
        tone="danger"
        title="Zapsat nedostavení?"
        message={
          noShowBooking ? (
            <>
              {clientName(getClient(clinic, noShowBooking.clientId))} · {getService(clinic, noShowBooking.serviceId)?.name} ·{' '}
              {formatSlot(noShowBooking.start, noShowBooking.end)}
            </>
          ) : undefined
        }
        confirmLabel="Zapsat nedostavení"
        onConfirm={() => {
          if (!noShowBooking) return;
          const r = run(markNoShow, { bookingId: noShowBooking.id }, { success: (v) => `Nedostavení zapsáno. ${v.message}` });
          if (!r.ok) throw new Error(r.error);
        }}
      >
        {noShowBooking && (
          <Callout tone="warning" title="Podle storno podmínek">
            {noShowConsequence(clinic, noShowBooking, now)}
          </Callout>
        )}
      </ConfirmDialog>
    </div>
  );
}
