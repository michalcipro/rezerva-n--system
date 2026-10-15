import type { Booking, Client, Id, LocalDateTime } from '../../domain/types';
import { countLabel, formatDayShort, formatTime, formatTimeRange } from '../../engine/format';
import {
  getRoom,
  getService,
  getTherapist,
  pastBookingsOfClient,
  serviceCategoryTone,
  therapistName,
  therapistShort,
  upcomingBookingsOfClient,
} from '../../engine/selectors';
import { NOTE_KIND_LABEL, notesOfClient } from '../../engine/crm';
import { dateOf } from '../../engine/time';
import { ToneDot } from '../../components/domain';
import { useClinic } from '../../store/hooks';
import { navigate, setSession } from '../../store/session';
import { Badge, Button, Card, CardHeader, EmptyState, Icon, IconButton, Menu, StatusPill, Table, cx } from '../../ui';
import { bookingMoneyNote, messageKindLabel, messagesOfClient, policyBar, policyLines, stornoChip, upcomingPaymentNote } from './model';
import { CONSENT_META, ConsentState, consentDate, DateBlock, Eyebrow, StornoChipView, type Permissions } from './parts';

export function openInCalendar(start: LocalDateTime): void {
  setSession({ calendarDate: dateOf(start), calendarView: 'day', calendarTherapist: 'all' });
  navigate({ name: 'kalendar' });
}

/* ------------------------------------------------------------------ */
/* Nadcházející termíny                                                */
/* ------------------------------------------------------------------ */

export function UpcomingRow({ booking: b, now, finance, onOpen }: { booking: Booking; now: LocalDateTime; finance: boolean; onOpen: (id: Id) => void }): JSX.Element {
  const clinic = useClinic();
  const svc = getService(clinic, b.serviceId);
  const therapist = getTherapist(clinic, b.therapistId);
  const room = getRoom(clinic, b.roomId);
  const chip = stornoChip(clinic, b, now);
  const label = `${formatDayShort(b.start)} ${formatTime(b.start)} · ${svc?.name ?? 'Termín'}`;
  return (
    <li className={cx('cli-up', !finance && 'cli-up--nofin')} onClick={() => onOpen(b.id)}>
      <DateBlock start={b.start} />
      <div className="cli-up__main">
        <button
          type="button"
          className="cli-rowlink cli-up__title tnum"
          aria-label={`Detail rezervace ${label}`}
          onClick={(e) => {
            e.stopPropagation();
            onOpen(b.id);
          }}
        >
          <ToneDot tone={serviceCategoryTone(clinic, b.serviceId)} />
          <span className="truncate">
            {formatTimeRange(b.start, b.end)} · {svc?.name ?? 'Termín'}
          </span>
        </button>
        <span className="cli-up__sub truncate">
          {therapistName(therapist)}
          {room ? ` · ${room.name}` : ''}
          {b.makeupForBookingId ? ' · náhradní termín' : ''}
        </span>
      </div>
      {finance && <span className="cli-up__pay">{upcomingPaymentNote(clinic, b)}</span>}
      <span className="cli-up__chip">
        <StornoChipView chip={chip} />
      </span>
      <span className="cli-up__menu" onClick={(e) => e.stopPropagation()}>
        <Menu
          label={`Akce pro termín ${label}`}
          trigger={<IconButton icon="more" label={`Akce pro termín ${formatDayShort(b.start)}`} size="sm" />}
          items={[
            { id: 'detail', label: 'Detail, přesun nebo zrušení', icon: 'eye', onSelect: () => onOpen(b.id) },
            { id: 'cal', label: 'Ukázat v kalendáři', icon: 'calendar', onSelect: () => openInCalendar(b.start) },
          ]}
        />
      </span>
    </li>
  );
}

export function UpcomingCard({
  client,
  now,
  finance,
  onOpen,
  onNew,
}: {
  client: Client;
  now: LocalDateTime;
  finance: boolean;
  onOpen: (id: Id) => void;
  onNew: () => void;
}): JSX.Element {
  const clinic = useClinic();
  const list = upcomingBookingsOfClient(clinic, client.id, now);
  return (
    <Card padding="none" as="section" aria-label="Nadcházející rezervace">
      <CardHeader
        divided
        title={`Nadcházející (${list.length})`}
        actions={
          list.length > 0 ? (
            <button type="button" className="link" onClick={() => openInCalendar(list[0].start)}>
              Otevřít v kalendáři
            </button>
          ) : undefined
        }
      />
      {list.length === 0 ? (
        <EmptyState
          compact
          icon="calendar"
          title="Žádné nadcházející termíny"
          text={`${client.firstName} teď nemá rezervovaný žádný termín.`}
          action={
            <Button size="sm" variant="primary" icon="calendarPlus" onClick={onNew}>
              Nová rezervace
            </Button>
          }
        />
      ) : (
        <ul className="cli-uplist">
          {list.map((b) => (
            <UpcomingRow key={b.id} booking={b} now={now} finance={finance} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Tabulka termínů (poslední návštěvy i celá historie)                 */
/* ------------------------------------------------------------------ */

export function BookingTable({
  bookings,
  now,
  finance,
  onOpen,
  caption,
}: {
  bookings: Booking[];
  now: LocalDateTime;
  finance: boolean;
  onOpen: (id: Id) => void;
  caption: string;
}): JSX.Element {
  const clinic = useClinic();
  const year = now.slice(0, 4);
  return (
    <Table caption={caption} hover minWidth={finance ? 720 : 560} wrapperClassName="cli-tablewrap">
      <thead>
        <tr>
          <th scope="col">Datum</th>
          <th scope="col">Služba</th>
          <th scope="col">Terapeut</th>
          <th scope="col">Stav</th>
          {finance && <th scope="col">Platba a poznámka</th>}
        </tr>
      </thead>
      <tbody>
        {bookings.map((b) => {
          const svc = getService(clinic, b.serviceId);
          const struck = b.status === 'cancelled' || b.status === 'excused' || b.status === 'clinic_cancelled' || b.status === 'late_cancelled';
          return (
            <tr key={b.id} data-clickable="" onClick={() => onOpen(b.id)}>
              <td className="nowrap">
                <button
                  type="button"
                  className="cli-rowlink"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(b.id);
                  }}
                  aria-label={`Detail rezervace ${formatDayShort(b.start)} ${formatTime(b.start)} ${svc?.name ?? ''}`}
                >
                  {formatDayShort(b.start)}
                  {b.start.slice(0, 4) !== year ? ` ${b.start.slice(0, 4)}` : ''}
                </button>
                <span className="cli-cell-sub">{formatTime(b.start)}</span>
              </td>
              <td className={cx(struck && 'cli-struck')}>
                <span className="cli-svc">
                  <ToneDot tone={serviceCategoryTone(clinic, b.serviceId)} />
                  {svc?.name ?? 'Služba'}
                </span>
              </td>
              <td className="secondary nowrap">{therapistShort(getTherapist(clinic, b.therapistId))}</td>
              <td className="nowrap">
                <StatusPill status={b.status} appearance="plain" />
                {b.status === 'confirmed' && b.end <= now && <span className="cli-cell-sub">čeká na docházku</span>}
              </td>
              {finance && (
                <td className={cx('secondary', b.fee?.status === 'due' && 'cli-cell-due')}>{bookingMoneyNote(clinic, b)}</td>
              )}
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}

export function RecentCard({
  client,
  now,
  finance,
  onOpen,
  onShowAll,
}: {
  client: Client;
  now: LocalDateTime;
  finance: boolean;
  onOpen: (id: Id) => void;
  onShowAll: () => void;
}): JSX.Element {
  const clinic = useClinic();
  const past = pastBookingsOfClient(clinic, client.id, now);
  const shown = past.slice(0, 5);
  return (
    <Card padding="none" as="section" aria-label="Historie návštěv">
      <CardHeader
        divided
        title="Historie"
        meta={past.length ? countLabel(past.length, ['záznam', 'záznamy', 'záznamů']) : undefined}
        actions={
          past.length > shown.length ? (
            <button type="button" className="link" onClick={onShowAll}>
              Celá historie
            </button>
          ) : undefined
        }
      />
      {shown.length === 0 ? (
        <EmptyState compact icon="history" title="Zatím bez historie" text="Proběhlé, zrušené a omluvené termíny se zobrazí tady." />
      ) : (
        <BookingTable bookings={shown} now={now} finance={finance} onOpen={onOpen} caption="Posledních 5 termínů" />
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Boční sloupec                                                       */
/* ------------------------------------------------------------------ */

export function ClinicalNoteCard({ client, perms, onOpenDocs }: { client: Client; perms: Permissions; onOpenDocs: () => void }): JSX.Element {
  const clinic = useClinic();
  const notes = notesOfClient(clinic, client.id);
  const note = notes.find((n) => !n.pinned) ?? notes[0];
  const pinned = notes.filter((n) => n.pinned);
  return (
    <Card as="section" className="cli-side" aria-label="Poslední poznámka">
      <div className="cli-side__head">
        <Icon name="file" size={16} className="cli-side__icon" />
        <Eyebrow as="h2">{note?.pinned ? 'Připnutá poznámka' : 'Poslední poznámka'}</Eyebrow>
        <Badge tone="neutral" icon="lock">
          důvěrné
        </Badge>
      </div>
      {!perms.clinical ? (
        <p className="cli-side__muted">
          Poznámky ke klientovi vidí jen kouči a terapeuti
          {notes.length ? ` (${countLabel(notes.length, ['záznam', 'záznamy', 'záznamů'])}).` : '.'}
        </p>
      ) : note ? (
        <>
          {pinned.length > 0 && note !== pinned[0] && (
            <p className="cli-side__pinned">
              <Icon name="pin" size={12} /> {pinned[0].title || NOTE_KIND_LABEL[pinned[0].kind]}
            </p>
          )}
          {note.title && <strong className="cli-note-title">{note.title}</strong>}
          {note.text && <p className="cli-note-text cli-note-text--clamp">{note.text}</p>}
          <span className="cli-side__meta tnum">
            {NOTE_KIND_LABEL[note.kind]} · {note.authorId ? therapistName(getTherapist(clinic, note.authorId)) + ', ' : ''}
            {formatDayShort(note.at)}
          </span>
          <button type="button" className="link cli-side__link" onClick={onOpenDocs}>
            {notes.length > 1 ? `Všechny poznámky (${notes.length})` : 'Otevřít poznámky'}
          </button>
        </>
      ) : (
        <>
          <p className="cli-side__muted">Zatím bez poznámky ani zápisu ze sezení.</p>
          <button type="button" className="link cli-side__link" onClick={onOpenDocs}>
            Napsat poznámku
          </button>
        </>
      )}
    </Card>
  );
}

export function InternalNoteCard({ client, onEdit }: { client: Client; onEdit?: () => void }): JSX.Element | null {
  if (!client.internalNote.trim() && !onEdit) return null;
  return (
    <Card as="section" className="cli-side" aria-label="Interní poznámka">
      <div className="cli-side__head">
        <Icon name="clipboard" size={16} className="cli-side__icon" />
        <Eyebrow as="h2">Interní poznámka</Eyebrow>
        {onEdit && <IconButton icon="edit" label="Upravit interní poznámku" size="sm" onClick={onEdit} />}
      </div>
      {client.internalNote.trim() ? <p className="cli-note-text">{client.internalNote}</p> : <p className="cli-side__muted">Poznámka pro recepci, např. preference termínů.</p>}
    </Card>
  );
}

export function ConsentsCard({ client, onManage }: { client: Client; onManage: () => void }): JSX.Element {
  return (
    <Card as="section" className="cli-side" aria-label="Souhlasy">
      <div className="cli-side__head">
        <Eyebrow as="h2">Souhlasy (GDPR)</Eyebrow>
        <button type="button" className="link cli-side__headlink" onClick={onManage}>
          Spravovat
        </button>
      </div>
      <ul className="cli-consent-list">
        {CONSENT_META.map((m) => {
          const rec = client.consents[m.key];
          return (
            <li key={m.key}>
              <ConsentState record={rec} />
              <span className={cx('cli-consent-list__label', !rec && 'muted')}>{m.label}</span>
              <span className="cli-consent-list__date tnum">{rec ? consentDate(rec) : 'ne'}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function CommsCard({ client, onShowAll }: { client: Client; onShowAll: () => void }): JSX.Element {
  const clinic = useClinic();
  const all = messagesOfClient(clinic, client.id);
  const last = all.slice(0, 3);
  return (
    <Card as="section" className="cli-side" aria-label="Komunikace">
      <div className="cli-side__head">
        <Eyebrow as="h2">Komunikace</Eyebrow>
        {all.length > 0 && (
          <button type="button" className="link cli-side__headlink" onClick={onShowAll}>
            Vše ({all.length})
          </button>
        )}
      </div>
      {last.length === 0 ? (
        <p className="cli-side__muted">Klientovi zatím nic neodešlo.</p>
      ) : (
        <ul className="cli-comms-mini">
          {last.map((m) => (
            <li key={m.id}>
              <Icon name={m.channel === 'sms' ? 'smartphone' : 'mail'} size={16} className="cli-side__icon" />
              <span className="cli-comms-mini__text">
                <span className="truncate">
                  {m.channel === 'sms' ? 'SMS' : 'E-mail'} · {messageKindLabel(clinic, m)}
                </span>
                <span className={cx('cli-side__meta tnum', m.status === 'skipped' && 'text-warning')}>
                  {formatDayShort(m.at)} {formatTime(m.at)} · {m.status === 'sent' ? 'odesláno' : 'neodesláno'}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function PolicyCard(): JSX.Element {
  const clinic = useClinic();
  const policy = clinic.settings.policy;
  return (
    <Card as="section" className="cli-side" aria-label="Storno podmínky">
      <div className="cli-side__head">
        <Eyebrow as="h2">Storno podmínky</Eyebrow>
        <span className="cli-side__meta">aktivní</span>
      </div>
      <div className="cli-policybar" aria-hidden="true">
        {policyBar(policy).map((tone, i) => (
          <span key={i} className={`cli-policybar__seg cli-policybar__seg--${tone}`} />
        ))}
      </div>
      <ul className="cli-policy-lines">
        {policyLines(policy).map((l, i) => (
          <li key={i}>
            <strong>{l.strong}</strong> {l.text}
          </li>
        ))}
      </ul>
    </Card>
  );
}
