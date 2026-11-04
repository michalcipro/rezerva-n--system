import { useMemo } from 'react';
import type { Id } from '../../domain/types';
import { ClientAvatar } from '../../components/domain';
import { VisitSourceBadge } from '../../components/payments';
import { countLabel, formatDateLong, formatDateTimeShort, formatSpan, formatTimeRange } from '../../engine/format';
import { sessionFill } from '../../engine/groups';
import { clientName, getClient, getRoom, getSession, getTherapist, sessionParticipants, therapistName } from '../../engine/selectors';
import { dateOf, diffMinutes } from '../../engine/time';
import { sessionParticipantRows } from '../../engine/visits';
import { useActor, useClinic, useNow } from '../../store/hooks';
import { navigate, setSession } from '../../store/session';
import { Badge, Button, Callout, Drawer, EmptyState, StatusPill } from '../../ui';
import { waitingForSession } from './model';
import { OccupancyMeter } from './OccupancyMeter';
import './groups.css';

export interface ParticipantsDrawerProps {
  /** Termín lekce; null = zavřeno. */
  sessionId: Id | null;
  onClose: () => void;
  /** Otevře přihlášení klienta na tento termín (NewBookingDialog). */
  onAddClient: (sessionId: Id) => void;
}

/** Panel „Účastníci“: přihlášení se zdrojem platby a odkazem na kartu klienta, čekací listina. */
export function ParticipantsDrawer({ sessionId, onClose, onAddClient }: ParticipantsDrawerProps): JSX.Element | null {
  const clinic = useClinic();
  const ses = sessionId ? getSession(clinic, sessionId) : undefined;
  if (!sessionId) return null;
  return (
    <Drawer
      open
      onClose={onClose}
      size="md"
      title="Účastníci"
      description={
        ses ? (
          <>
            {ses.title} · {formatDateLong(ses.start, { capital: true, year: false })} · <span className="nowrap">{formatTimeRange(ses.start, ses.end)}</span>
          </>
        ) : undefined
      }
      footer={ses ? <ParticipantsFooter sessionId={ses.id} onClose={onClose} onAddClient={onAddClient} /> : undefined}
    >
      {ses ? (
        <ParticipantsBody sessionId={ses.id} onClose={onClose} onAddClient={onAddClient} />
      ) : (
        <EmptyState compact icon="alertCircle" title="Termín nebyl nalezen" text="Lekce mohla být mezitím vyřazena z rozvrhu." />
      )}
    </Drawer>
  );
}

function ParticipantsBody({ sessionId, onClose, onAddClient }: { sessionId: Id; onClose: () => void; onAddClient: (id: Id) => void }): JSX.Element | null {
  const clinic = useClinic();
  const now = useNow();
  const actor = useActor();
  // Částky jen finančním rolím (jako v detailu rezervace) – terapeut vidí zdroj platby bez částky, i u cizích lekcí.
  const showFinance = actor.role !== 'therapist';
  const today = dateOf(now);
  const ses = getSession(clinic, sessionId);
  const rows = useMemo(() => sessionParticipantRows(clinic, sessionId, today), [clinic, sessionId, today]);
  const waiting = useMemo(() => waitingForSession(clinic, sessionId), [clinic, sessionId]);
  if (!ses) return null;

  const therapist = getTherapist(clinic, ses.therapistId);
  const room = getRoom(clinic, ses.roomId);
  const past = ses.end <= now;
  const bookable = !past && !ses.cancelled;
  const full = sessionFill(ses.capacity, rows.length) === 'full';

  const openClient = (clientId: Id): void => {
    onClose();
    navigate({ name: 'klient', clientId });
  };

  return (
    <div className="grp-dr">
      <div className="grp-dr__head">
        <span className="grp-dr__meta">{[therapistName(therapist), room?.name].filter(Boolean).join(' · ')}</span>
        <OccupancyMeter booked={rows.length} capacity={ses.capacity} cancelled={ses.cancelled} />
      </div>

      {ses.cancelled && (
        <Callout tone="danger" title="Termín je zrušený">
          Přihlášení dostali omluvnou zprávu a platby se jim vrátily.
        </Callout>
      )}

      <section className="grp-dr__section" aria-labelledby="grp-dr-people">
        <h3 id="grp-dr-people" className="grp-dr__label">
          Přihlášení · {rows.length}
        </h3>
        {rows.length === 0 ? (
          <EmptyState
            compact
            icon="users"
            title={bookable ? 'Zatím nikdo není přihlášený' : 'Nikdo není přihlášený'}
            text={
              bookable
                ? 'Přihlaste prvního klienta – rezervace se hned objeví v kalendáři i tady.'
                : ses.cancelled
                  ? 'Při zrušení termínu se přihlášení odhlásili. Jejich rezervace najdete v kalendáři.'
                  : 'Na tento termín se nikdo nepřihlásil.'
            }
            action={
              bookable ? (
                <Button size="sm" icon="userPlus" onClick={() => onAddClient(ses.id)}>
                  Přihlásit klienta
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="grp-people">
            {rows.map(({ booking: b, info }) => {
              const c = getClient(clinic, b.clientId);
              const name = clientName(c);
              return (
                <li key={b.id} className="grp-person">
                  <ClientAvatar client={c} size="sm" />
                  <div className="grp-person__main">
                    <span className="grp-person__line">
                      <button
                        type="button"
                        className="link grp-person__name"
                        aria-label={`${name} – otevřít kartu klienta`}
                        onClick={() => openClient(b.clientId)}
                      >
                        {name}
                      </button>
                      {b.status !== 'confirmed' && <StatusPill status={b.status} appearance="plain" />}
                    </span>
                    <VisitSourceBadge info={info} booking={b} showDetail showAmount={showFinance} className="grp-person__source" />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {waiting.length > 0 && (
        <section className="grp-dr__section" aria-labelledby="grp-dr-wait">
          <h3 id="grp-dr-wait" className="grp-dr__label">
            Čekací listina · {waiting.length}
          </h3>
          <ol className="grp-people">
            {waiting.map((w) => {
              const c = getClient(clinic, w.clientId);
              const name = clientName(c);
              return (
                <li key={w.id} className="grp-person">
                  <ClientAvatar client={c} size="sm" />
                  <div className="grp-person__main">
                    <span className="grp-person__line">
                      <button
                        type="button"
                        className="link grp-person__name"
                        aria-label={`${name} – otevřít kartu klienta`}
                        onClick={() => openClient(w.clientId)}
                      >
                        {name}
                      </button>
                      {w.status === 'offered' && (
                        <Badge tone="info" size="sm" dot="ring">
                          Místo nabídnuto
                        </Badge>
                      )}
                    </span>
                    <span className="grp-person__meta">
                      {w.status === 'offered' && w.offer
                        ? w.offer.expiresAt > now
                          ? `nabídka vyprší za ${formatSpan(diffMinutes(w.offer.expiresAt, now))}`
                          : 'nabídka vypršela'
                        : `čeká od ${formatDateTimeShort(w.createdAt)}`}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
          {bookable && !full && (
            <p className="grp-dr__hint">Místo se čekajícím nabízí automaticky, jakmile se někdo odhlásí.</p>
          )}
        </section>
      )}

      {bookable && full && (
        <p className="grp-dr__hint">
          Termín je plný ({countLabel(rows.length, ['účastník', 'účastníci', 'účastníků'])}).{' '}
          {clinic.settings.waitlist.enabled
            ? 'Dalšího zájemce můžete přidat na čekací listinu – při odhlášení se mu místo nabídne.'
            : 'Čekací listina je vypnutá v nastavení.'}
        </p>
      )}
    </div>
  );
}

function ParticipantsFooter({ sessionId, onClose, onAddClient }: { sessionId: Id; onClose: () => void; onAddClient: (id: Id) => void }): JSX.Element | null {
  const clinic = useClinic();
  const now = useNow();
  const ses = getSession(clinic, sessionId);
  if (!ses) return null;
  const bookable = !ses.cancelled && ses.end > now;
  const full = sessionFill(ses.capacity, sessionParticipants(clinic, ses.id).length) === 'full';
  const canAdd = bookable && (!full || clinic.settings.waitlist.enabled);
  return (
    <>
      <Button
        variant="secondary"
        icon="calendar"
        onClick={() => {
          onClose();
          setSession({ calendarDate: dateOf(ses.start), calendarView: 'day' });
          navigate({ name: 'kalendar' });
        }}
      >
        V kalendáři
      </Button>
      {canAdd && (
        <Button variant="primary" icon={full ? 'hourglass' : 'userPlus'} onClick={() => onAddClient(ses.id)}>
          {full ? 'Na čekací listinu' : 'Přihlásit klienta'}
        </Button>
      )}
    </>
  );
}
