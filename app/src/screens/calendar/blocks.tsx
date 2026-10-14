import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import type { Booking, GroupSession, LocalDateTime } from '../../domain/types';
import { countLabel, formatDuration, formatSpan, formatTime, formatTimeRange } from '../../engine/format';
import {
  clientName,
  getClient,
  getService,
  serviceCategoryTone,
  sessionParticipants,
  therapistName,
  getTherapist,
} from '../../engine/selectors';
import { dateOf, diffMinutes } from '../../engine/time';
import { useClinic } from '../../store/hooks';
import { EventBlock, EventChip, EventProgress, EventSeats, EventStatus, Icon, cx } from '../../ui';
import { GHOST_LABEL, densityFor, isFirstVisit, noShowLabel, paymentHint, waitingForSession, type OfferGroup } from './model';

type Density = 'xs' | 'sm' | 'md' | 'lg';

interface CommonProps {
  style: CSSProperties;
  ppm: number;
  now: LocalDateTime;
  selected?: boolean;
  onOpen: () => void;
}

/* ------------------------------------------------------------------ */
/* Rezervace                                                           */
/* ------------------------------------------------------------------ */

export interface BookingBlockProps extends CommonProps {
  booking: Booking;
  draggable: boolean;
  dragging: boolean;
  describedBy?: string;
  onPointerDown?: (e: ReactPointerEvent<HTMLButtonElement>) => void;
}

export function BookingBlock({ booking: b, style, ppm, now, selected, draggable, dragging, describedBy, onOpen, onPointerDown }: BookingBlockProps): JSX.Element {
  const clinic = useClinic();
  const svc = getService(clinic, b.serviceId);
  const client = getClient(clinic, b.clientId);
  const minutes = diffMinutes(b.end, b.start);
  const density: Density = densityFor(minutes, ppm);
  const tone = serviceCategoryTone(clinic, b.serviceId);
  const name = clientName(client);
  const serviceName = svc?.name ?? 'Služba';
  const today = dateOf(now);
  const inProgress = b.status === 'confirmed' && b.start <= now && b.end > now;
  const pastUnmarked = b.status === 'confirmed' && b.end <= now;
  const unpaidOnsite = b.payment.method === 'onsite' && !b.payment.paid;
  const first = isFirstVisit(clinic, b);

  let variant: 'default' | 'active' | 'completed' | 'no_show' = 'default';
  if (b.status === 'completed') variant = 'completed';
  else if (b.status === 'no_show') variant = 'no_show';
  else if (inProgress) variant = 'active';

  const parts: JSX.Element[] = [];
  let statusText = '';
  if (inProgress) {
    const left = diffMinutes(b.end, now);
    statusText = 'Probíhá';
    parts.push(
      <EventStatus key="s">
        Probíhá<span className="cal-ev__soft">· zbývá {formatSpan(left)}</span>
      </EventStatus>,
    );
    if (unpaidOnsite) parts.push(<EventChip key="pay" tone="warning">Čeká na platbu</EventChip>);
    else if (density === 'lg')
      parts.push(
        <span key="p" className="cal-ev__progress">
          <EventProgress value={diffMinutes(now, b.start) / Math.max(1, minutes)} />
        </span>,
      );
  } else if (b.status === 'completed') {
    statusText = 'Proběhlo';
    parts.push(<EventStatus key="s" tone="muted">Proběhlo</EventStatus>);
    if (unpaidOnsite) parts.push(<EventChip key="pay" tone="warning">Čeká na platbu</EventChip>);
    else if (first) parts.push(<EventChip key="new">Nový klient</EventChip>);
    else parts.push(<span key="h" className="cal-ev__soft">{paymentHint(clinic, b, today)}</span>);
  } else if (b.status === 'no_show') {
    statusText = noShowLabel(client);
    parts.push(<EventStatus key="s" tone="danger">{statusText}</EventStatus>);
    if (b.fee?.status === 'due') parts.push(<EventChip key="fee" tone="danger">Poplatek k úhradě</EventChip>);
  } else if (pastUnmarked) {
    statusText = 'Doplnit docházku';
    parts.push(<EventChip key="att" tone="warning">Doplnit docházku</EventChip>);
  } else {
    statusText = 'Potvrzeno';
    if (first) parts.push(<EventChip key="new">Nový klient</EventChip>);
    if (b.fromWaitlist) parts.push(<EventChip key="wl">Z čekací listiny</EventChip>);
    parts.push(<span key="h" className="cal-ev__soft">{paymentHint(clinic, b, today)}</span>);
  }

  const meta = density === 'xs' ? (
    <>
      <strong className="cal-ev__time">{formatTime(b.start)}</strong> {serviceName}
    </>
  ) : (
    `${formatTime(b.start)} ${serviceName}`
  );

  const label = [
    name,
    serviceName,
    formatTimeRange(b.start, b.end),
    therapistName(getTherapist(clinic, b.therapistId)),
    statusText,
    first ? 'nový klient' : '',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <EventBlock
      tone={tone}
      variant={variant}
      density={density}
      title={density === 'xs' ? <>{meta} · {client?.lastName ?? name}</> : name}
      meta={density === 'xs' ? undefined : meta}
      footer={parts.length ? parts : undefined}
      icon={svc?.remote ? 'video' : undefined}
      selected={selected}
      style={style}
      className={cx('cal-ev', 'cal-ev--booking', draggable && 'is-draggable', dragging && 'is-dragging')}
      aria-label={label}
      aria-describedby={draggable ? describedBy : undefined}
      onClick={onOpen}
      onPointerDown={onPointerDown}
      data-booking-id={b.id}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Skupinová lekce                                                     */
/* ------------------------------------------------------------------ */

export function SessionBlock({ session: ses, style, ppm, now, selected, onOpen, offer }: CommonProps & { session: GroupSession; offer: OfferGroup | null }): JSX.Element {
  const clinic = useClinic();
  const taken = sessionParticipants(clinic, ses.id).length;
  const waiting = waitingForSession(clinic, ses.id).length;
  const minutes = diffMinutes(ses.end, ses.start);
  const density = densityFor(minutes, ppm);
  const tone = serviceCategoryTone(clinic, ses.serviceId);
  const inProgress = !ses.cancelled && ses.start <= now && ses.end > now;
  const past = ses.end <= now;
  const variant = ses.cancelled ? 'cancelled' : inProgress ? 'active' : past ? 'completed' : 'default';
  const full = taken >= ses.capacity;

  const footer = ses.cancelled ? (
    <EventStatus tone="muted">Lekce zrušena</EventStatus>
  ) : (
    <>
      <EventSeats taken={Math.min(taken, ses.capacity)} capacity={ses.capacity}>
        <span className="cal-ev__seats-text">
          {taken}/{ses.capacity}
        </span>
      </EventSeats>
      {full && !past && <EventChip>plno</EventChip>}
      {waiting > 0 && <span className="cal-ev__soft">{countLabel(waiting, ['čeká', 'čekají', 'čeká'])}</span>}
      {offer && <span className="cal-ev__soft">nabídnuto</span>}
    </>
  );

  const label = `Skupinová lekce ${ses.title}, ${formatTimeRange(ses.start, ses.end)}, ${taken} z ${ses.capacity} míst obsazeno` +
    (waiting ? `, ${countLabel(waiting, ['čekající', 'čekající', 'čekajících'])}` : '') +
    (ses.cancelled ? ', zrušeno' : '');

  return (
    <EventBlock
      tone={tone}
      variant={variant}
      density={density}
      title={`„${ses.title}“`}
      meta={`${formatTime(ses.start)} Skupinová lekce`}
      footer={footer}
      icon="users"
      selected={selected}
      style={style}
      className={cx('cal-ev', 'cal-ev--session', ses.cancelled && 'cal-ev--ghost')}
      aria-label={label}
      onClick={onOpen}
      data-session-id={ses.id}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Zrušený termín („duch“) a uvolněný termín nabídnutý čekající listině */
/* ------------------------------------------------------------------ */

export function GhostBlock({ booking: b, offer, style, ppm, now, selected, onOpen }: CommonProps & { booking: Booking; offer: OfferGroup | null }): JSX.Element {
  const clinic = useClinic();
  const client = getClient(clinic, b.clientId);
  const svc = getService(clinic, b.serviceId);
  const minutes = diffMinutes(b.end, b.start);
  const density = densityFor(minutes, ppm);
  const tone = serviceCategoryTone(clinic, b.serviceId);
  const status = GHOST_LABEL[b.status] ?? 'Zrušeno';

  if (offer) {
    const left = diffMinutes(offer.expiresAt, now);
    return (
      <EventBlock
        tone={tone}
        variant="released"
        density={density}
        title={`Uvolněno · ${formatTimeRange(offer.start, offer.end)}`}
        meta={`nabídnuto ${countLabel(offer.entries.length, ['čekajícímu', 'čekajícím', 'čekajícím'])}`}
        footer={
          <span className="cal-ev__countdown">
            <Icon name="clock" size={11} />
            zbývá {formatSpan(left)}
          </span>
        }
        selected={selected}
        style={style}
        className={cx('cal-ev', 'cal-ev--released')}
        aria-label={`Uvolněný termín ${formatTimeRange(offer.start, offer.end)} po zrušení (${clientName(client)}), nabídnuto ${countLabel(offer.entries.length, ['čekajícímu', 'čekajícím', 'čekajícím'])} z čekací listiny, nabídka vyprší za ${formatSpan(left)}`}
        onClick={onOpen}
        data-booking-id={b.id}
      />
    );
  }

  const feeDue = b.fee?.status === 'due';
  return (
    <EventBlock
      tone={tone}
      variant="cancelled"
      density={density}
      title={density === 'xs' ? `${formatTime(b.start)} ${client?.lastName ?? ''}` : clientName(client)}
      meta={density === 'xs' ? undefined : `${formatTime(b.start)} ${svc?.name ?? ''}`}
      footer={
        <>
          <span className="cal-ev__status-text">{status}</span>
          {feeDue && <EventChip tone="warning">poplatek</EventChip>}
        </>
      }
      selected={selected}
      style={style}
      className={cx('cal-ev', 'cal-ev--ghost')}
      aria-label={`${status}: ${clientName(client)}, ${svc?.name ?? ''}, ${formatTimeRange(b.start, b.end)}${feeDue ? ', poplatek k úhradě' : ''}`}
      onClick={onOpen}
      data-booking-id={b.id}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Volné okno, pauza, nepřítomnost                                     */
/* ------------------------------------------------------------------ */

export function FreeBlock({ start, end, style, ppm, onOpen }: { start: LocalDateTime; end: LocalDateTime; style: CSSProperties; ppm: number; onOpen: () => void }): JSX.Element {
  const minutes = diffMinutes(end, start);
  return (
    <EventBlock
      variant="free"
      density={densityFor(minutes, ppm)}
      title={
        <span className="cal-ev__free-title">
          <Icon name="plus" size={12} />
          Volné okno
        </span>
      }
      meta={`${formatTimeRange(start, end)} · ${formatDuration(minutes)}`}
      style={style}
      className={cx('cal-ev', 'cal-ev--free')}
      aria-label={`Volné okno ${formatTimeRange(start, end)}, ${formatDuration(minutes)} – vytvořit rezervaci`}
      onClick={onOpen}
    />
  );
}

export function BlockedBlock({ label, timeRange, style, ppm, minutes }: { label: string; timeRange: string; style: CSSProperties; ppm: number; minutes: number }): JSX.Element {
  return (
    <EventBlock
      variant="break"
      density={densityFor(minutes, ppm)}
      title={label}
      meta={timeRange}
      style={style}
      className="cal-ev cal-ev--blocked"
      aria-label={`${label} ${timeRange}`}
    />
  );
}
