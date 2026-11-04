import { useMemo, useState } from 'react';
import type { Booking, ClinicState, Id, WaitlistEntry } from '../../domain/types';
import { cancelSession } from '../../engine/commands';
import { countLabel, formatDayShort, formatRelative, formatTimeRange } from '../../engine/format';
import type { GroupSessionOverview } from '../../engine/groups';
import { bookingsOfSession, clientName, getClient, getRoom, getTherapist, isOccupying, therapistName } from '../../engine/selectors';
import { dateOf } from '../../engine/time';
import { packageEntryIndex, visitPaymentInfo, type VisitPaymentInfo } from '../../engine/visits';
import { ClientAvatar } from '../../components/domain';
import { VisitSourceBadge } from '../../components/payments';
import { useActor, useClinic, useCommand, useNow } from '../../store/hooks';
import { navigate, setSession } from '../../store/session';
import { Button, Callout, ConfirmDialog, Drawer, EmptyState, Field, IconButton, StatusPill, Textarea } from '../../ui';
import { noShowText, sessionOverview } from './model';
import { SpotsMeter, WaitlistBadge } from './parts';
import './groups.css';

export interface ParticipantsDrawerProps {
  /** Termín lekce; null = zavřeno. */
  sessionId: Id | null;
  onClose: () => void;
  /** Přihlásit klienta / přidat na čekací listinu (otevře dialog nové rezervace). */
  onBook: (row: GroupSessionOverview) => void;
  /** Detail rezervace účastníka. */
  onOpenBooking: (bookingId: Id) => void;
}

const byName =
  (s: ClinicState) =>
  (a: { clientId: Id }, b: { clientId: Id }): number => {
    const ca = getClient(s, a.clientId);
    const cb = getClient(s, b.clientId);
    return (ca ? `${ca.lastName} ${ca.firstName}` : '').localeCompare(cb ? `${cb.lastName} ${cb.firstName}` : '', 'cs');
  };

function openCalendar(date: string): void {
  setSession({ calendarDate: date, calendarView: 'day' });
  navigate({ name: 'kalendar' });
}

/** Účastníci termínu skupinové lekce: přihlášení se zdrojem platby, čekací listina, odhlášení. */
export function ParticipantsDrawer({ sessionId, onClose, onBook, onOpenBooking }: ParticipantsDrawerProps): JSX.Element | null {
  const clinic = useClinic();
  const now = useNow();
  const row = useMemo(() => (sessionId ? sessionOverview(clinic, sessionId, now) : undefined), [clinic, sessionId, now]);
  if (!sessionId) return null;
  if (!row) {
    return (
      <Drawer open onClose={onClose} size="md" title="Účastníci lekce">
        <EmptyState compact icon="alertCircle" title="Lekce nebyla nalezena" text="Termín mezitím zmizel z rozvrhu (lekce byla upravena nebo vypnuta)." />
      </Drawer>
    );
  }
  return <ParticipantsContent row={row} onClose={onClose} onBook={onBook} onOpenBooking={onOpenBooking} />;
}

function ParticipantsContent({
  row,
  onClose,
  onBook,
  onOpenBooking,
}: Omit<ParticipantsDrawerProps, 'sessionId'> & { row: GroupSessionOverview }): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const actor = useActor();
  const run = useCommand();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [reason, setReason] = useState('');
  const ses = row.session;
  const today = dateOf(now);
  const therapist = getTherapist(clinic, ses.therapistId);
  const room = getRoom(clinic, ses.roomId);
  const upcoming = !row.past && !row.cancelled;
  const canCancel = upcoming && (actor.role === 'owner' || actor.role === 'reception');

  const lists = useMemo(() => {
    const sort = byName(clinic);
    const entryIndex = packageEntryIndex(clinic);
    const participants = [...row.participants]
      .sort(sort)
      .map((b) => ({ booking: b, info: visitPaymentInfo(clinic, b, today, now, { entryIndex }) }));
    const left = bookingsOfSession(clinic, ses.id)
      .filter((b) => !isOccupying(b.status))
      .sort(sort);
    const waiting = clinic.waitlist
      .filter((w) => w.sessionId === ses.id && (w.status === 'waiting' || w.status === 'offered'))
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
    return { participants, left, waiting };
  }, [clinic, ses.id, row.participants, today, now]);

  const footer: JSX.Element[] = [];
  if (upcoming && row.free > 0) {
    footer.push(
      <Button key="book" variant="primary" icon="userPlus" onClick={() => onBook(row)}>
        Přihlásit klienta
      </Button>,
    );
  } else if (upcoming && clinic.settings.waitlist.enabled) {
    footer.push(
      <Button key="wait" variant="secondary" icon="hourglass" onClick={() => onBook(row)}>
        Přidat na čekací listinu
      </Button>,
    );
  }
  if (canCancel) {
    footer.push(
      <Button key="cancel" variant="danger-secondary" icon="calendarX" onClick={() => setConfirmCancel(true)}>
        Zrušit lekci
      </Button>,
    );
  }

  const confirmedCount = row.participants.filter((b) => b.status === 'confirmed').length;
  // U zrušené lekce jsou všichni v „Zrušené rezervace“ – prázdný seznam přihlášených nemá smysl.
  const showParticipants = !(row.cancelled && lists.participants.length === 0);

  return (
    <Drawer open onClose={onClose} size="md" title="Účastníci lekce" footer={footer.length ? <>{footer}</> : undefined}>
      <div className="grp-dr">
        <div className="grp-dr__head">
          <span className={row.cancelled ? 'grp-dr__title is-cancelled' : 'grp-dr__title'}>{ses.title}</span>
          <span className="grp-dr__when tnum">
            {formatDayShort(ses.start)} · {formatTimeRange(ses.start, ses.end)}
          </span>
          <span className="grp-dr__meta">{[therapistName(therapist), room?.name].filter(Boolean).join(' · ')}</span>
          <button type="button" className="link grp-dr__cal" onClick={() => openCalendar(dateOf(ses.start))}>
            Otevřít den v kalendáři
          </button>
        </div>

        {row.cancelled ? (
          <Callout tone="danger" title="Lekce je zrušená">
            Přihlášení dostali omluvnou zprávu a jejich platby se vrátily.
          </Callout>
        ) : (
          <SpotsMeter row={row} now={now} className="grp-dr__fill" extra={!row.past ? <WaitlistBadge count={row.waitlist} /> : undefined} />
        )}

        {showParticipants && (
          <section className="grp-dr__group" aria-labelledby="grp-dr-in">
            <h3 id="grp-dr-in" className="grp-dr__label">
              Přihlášení · {row.participants.length}
            </h3>
            {lists.participants.length === 0 ? (
              <p className="grp-dr__hint">{row.past ? 'Na lekci nikdo nebyl přihlášený.' : 'Zatím nikdo. Přihlaste prvního klienta.'}</p>
            ) : (
              <ul className="grp-people">
                {lists.participants.map(({ booking, info }) => (
                  <ParticipantRow key={booking.id} booking={booking} info={info} onOpen={() => onOpenBooking(booking.id)} />
                ))}
              </ul>
            )}
          </section>
        )}

        {lists.waiting.length > 0 && (
          <section className="grp-dr__group" aria-labelledby="grp-dr-wait">
            <h3 id="grp-dr-wait" className="grp-dr__label">
              Čekací listina · {lists.waiting.length}
            </h3>
            <ol className="grp-people">
              {lists.waiting.map((w, i) => (
                <WaitingRow key={w.id} entry={w} order={i + 1} />
              ))}
            </ol>
          </section>
        )}

        {lists.left.length > 0 && (
          <details className="grp-dr__left" open={row.cancelled}>
            <summary>
              {row.cancelled ? 'Zrušené rezervace' : 'Odhlášení a zrušení'} · {lists.left.length}
            </summary>
            <ul className="grp-people">
              {lists.left.map((b) => (
                <LeftRow key={b.id} booking={b} onOpen={() => onOpenBooking(b.id)} />
              ))}
            </ul>
          </details>
        )}
      </div>

      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        tone="danger"
        title="Zrušit celou lekci?"
        message={`${ses.title} ${formatDayShort(ses.start)} ${formatTimeRange(ses.start, ses.end)} · ${countLabel(confirmedCount, ['přihlášený', 'přihlášení', 'přihlášených'])}`}
        confirmLabel="Zrušit lekci"
        onConfirm={() => {
          const r = run(
            cancelSession,
            { sessionId: ses.id, reason: reason.trim() || 'Zrušeno klinikou' },
            { success: (n) => (n ? `Lekce zrušena · omluva odešla ${countLabel(n, ['účastníkovi', 'účastníkům', 'účastníkům'])}` : 'Lekce zrušena') },
          );
          if (!r.ok) throw new Error(r.error);
          setReason('');
        }}
      >
        <div className="grp-form">
          <p className="grp-form__lead">Všem přihlášeným se termín zruší ze strany kliniky – bez poplatku a s vrácením platby. Dostanou omluvnou zprávu.</p>
          <Field label="Důvod" hint="Pošle se přihlášeným ve zprávě." optional>
            <Textarea value={reason} onValueChange={setReason} rows={2} placeholder="Např. nemoc lektora" />
          </Field>
        </div>
      </ConfirmDialog>
    </Drawer>
  );
}

function ParticipantRow({ booking, info, onOpen }: { booking: Booking; info: VisitPaymentInfo; onOpen: () => void }): JSX.Element {
  const clinic = useClinic();
  const c = getClient(clinic, booking.clientId);
  const name = clientName(c);
  return (
    <li className="grp-person">
      <ClientAvatar client={c} size="sm" />
      <div className="grp-person__main">
        <button type="button" className="link grp-person__name" onClick={() => navigate({ name: 'klient', clientId: booking.clientId })}>
          {name}
        </button>
        <VisitSourceBadge info={info} withDetail />
      </div>
      <div className="grp-person__side">
        <StatusPill status={booking.status} appearance="plain" label={booking.status === 'no_show' ? noShowText(c) : undefined} />
        <IconButton icon="chevronRight" size="sm" label={`Detail rezervace – ${name}`} onClick={onOpen} />
      </div>
    </li>
  );
}

function WaitingRow({ entry, order }: { entry: WaitlistEntry; order: number }): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const c = getClient(clinic, entry.clientId);
  return (
    <li className="grp-person">
      <span className="grp-person__order tnum" aria-hidden="true">
        {order}.
      </span>
      <div className="grp-person__main">
        <button type="button" className="link grp-person__name" onClick={() => navigate({ name: 'klient', clientId: entry.clientId })}>
          {clientName(c)}
        </button>
        <span className="grp-person__detail">
          {entry.status === 'offered' && entry.offer
            ? `Nabídnuto místo · vyprší ${formatRelative(entry.offer.expiresAt, now)}`
            : `Na listině od ${formatDayShort(entry.createdAt)}`}
        </span>
      </div>
    </li>
  );
}

function LeftRow({ booking, onOpen }: { booking: Booking; onOpen: () => void }): JSX.Element {
  const clinic = useClinic();
  const c = getClient(clinic, booking.clientId);
  const name = clientName(c);
  return (
    <li className="grp-person">
      <ClientAvatar client={c} size="sm" />
      <div className="grp-person__main">
        <button type="button" className="link grp-person__name" onClick={() => navigate({ name: 'klient', clientId: booking.clientId })}>
          {name}
        </button>
      </div>
      <div className="grp-person__side">
        <StatusPill status={booking.status} appearance="plain" />
        <IconButton icon="chevronRight" size="sm" label={`Detail rezervace – ${name}`} onClick={onOpen} />
      </div>
    </li>
  );
}
