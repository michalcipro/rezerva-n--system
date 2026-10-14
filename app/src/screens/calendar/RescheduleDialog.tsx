import { useMemo, useState } from 'react';
import type { Id, LocalDate, LocalDateTime } from '../../domain/types';
import { checkBookingSlot } from '../../engine/availability';
import { rescheduleBooking } from '../../engine/commands';
import { formatDateTimeShort, formatDayShort, formatTimeRange } from '../../engine/format';
import { canRescheduleFree, evaluateCancellation } from '../../engine/policy';
import { clientName, getBooking, getClient, getService, getSession, getTherapist, therapistName } from '../../engine/selectors';
import { addMinutes, dateOf } from '../../engine/time';
import { useClinic, useCommand, useNow } from '../../store/hooks';
import { Button, Callout, Dialog, EmptyState, Field, Select } from '../../ui';
import { MoveSummary } from './MoveDialog';
import { SessionPicker, SlotCheckNotice, SlotPicker } from './pickers';
import './calendar.css';

export interface RescheduleDialogProps {
  bookingId: Id | null;
  open: boolean;
  onClose: () => void;
}

/** Přesun termínu: datum + volné časy (bez kolize s původním termínem), terapeut, pravidla. */
export function RescheduleDialog({ bookingId, open, onClose }: RescheduleDialogProps): JSX.Element | null {
  if (!open || !bookingId) return null;
  return <RescheduleForm bookingId={bookingId} onClose={onClose} />;
}

function RescheduleForm({ bookingId, onClose }: { bookingId: Id; onClose: () => void }): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const run = useCommand();
  const booking = getBooking(clinic, bookingId);
  const service = booking ? getService(clinic, booking.serviceId) : undefined;
  const isGroup = !!booking?.sessionId || service?.kind === 'group';
  const [therapistId, setTherapistId] = useState<Id>(booking?.therapistId ?? '');
  const [date, setDate] = useState<LocalDate>(booking ? dateOf(booking.start) : dateOf(now));
  const [start, setStart] = useState<LocalDateTime | null>(null);
  const [sessionId, setSessionId] = useState<Id | null>(null);
  const [manual, setManual] = useState(false);
  const [override, setOverride] = useState(false);

  const therapists = useMemo(
    () =>
      (service?.therapistIds ?? [])
        .map((id) => getTherapist(clinic, id))
        .filter((t): t is NonNullable<typeof t> => !!t && t.active)
        .sort((a, b) => a.order - b.order),
    [clinic, service],
  );

  const session = sessionId ? getSession(clinic, sessionId) : undefined;
  const check = useMemo(() => {
    if (!booking) return null;
    if (isGroup) {
      if (!session) return null;
      return checkBookingSlot(clinic, {
        serviceId: booking.serviceId,
        therapistId: session.therapistId,
        start: session.start,
        clientId: booking.clientId,
        now,
        mode: 'staff',
        sessionId: session.id,
        ignoreBookingId: booking.id,
      });
    }
    if (!start) return null;
    return checkBookingSlot(clinic, { serviceId: booking.serviceId, therapistId, start, clientId: booking.clientId, now, mode: 'staff', ignoreBookingId: booking.id });
  }, [clinic, booking, isGroup, session, start, therapistId, now]);

  if (!booking || !service) {
    return (
      <Dialog open onClose={onClose} title="Přesunout termín" size="md">
        <EmptyState compact icon="alertCircle" title="Rezervace nebyla nalezena" />
      </Dialog>
    );
  }

  const client = getClient(clinic, booking.clientId);
  const free = canRescheduleFree(clinic, booking, now);
  const ev = evaluateCancellation(clinic, booking, now, 'staff');
  const newStart = isGroup ? session?.start ?? null : start;
  const newEnd = isGroup ? session?.end ?? null : start ? addMinutes(start, service.durationMin) : null;
  const sameAsNow = !!newStart && newStart === booking.start && (isGroup ? session?.therapistId === booking.therapistId : therapistId === booking.therapistId);
  const warnings = check?.warnings ?? [];
  const ready = booking.status === 'confirmed' && !!newStart && !!check && check.ok && (warnings.length === 0 || override) && !sameAsNow;

  const submit = (): void => {
    if (!ready || !newStart) return;
    const r = run(
      rescheduleBooking,
      {
        bookingId: booking.id,
        start: newStart,
        therapistId: isGroup ? session?.therapistId : therapistId,
        sessionId: isGroup ? session?.id : undefined,
        override: warnings.length > 0 && override,
      },
      { success: `Termín přesunut na ${formatDayShort(newStart)} ${formatTimeRange(newStart, newEnd ?? newStart)}` },
    );
    if (r.ok) onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title="Přesunout termín"
      description={
        <span className="tnum">
          {clientName(client)} · {service.name} · nyní {formatDayShort(booking.start)} {formatTimeRange(booking.start, booking.end)}, {therapistName(getTherapist(clinic, booking.therapistId))}
        </span>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Zpět
          </Button>
          <Button variant="primary" icon="calendarCheck" disabled={!ready} onClick={submit}>
            {warnings.length ? 'Přesunout i přesto' : 'Přesunout termín'}
          </Button>
        </>
      }
    >
      {booking.status !== 'confirmed' ? (
        <EmptyState compact icon="info" title="Přesunout lze jen potvrzenou rezervaci" />
      ) : (
        <div className="cal-form">
          <Callout tone={free ? 'success' : 'warning'} title={free ? 'Přesun zdarma' : 'Po bezplatné lhůtě'}>
            {free
              ? `Bezplatná lhůta trvá do ${formatDateTimeShort(ev.freeUntil)} – přesun je bez sankce.`
              : `Bezplatná lhůta skončila ${formatDateTimeShort(ev.freeUntil)}. Klient by mohl přesunout jen s omluvenkou; personál může termín přesunout bez sankce.`}{' '}
            Klient dostane zprávu o přesunu a původní čas se nabídne čekající listině.
          </Callout>

          {isGroup ? (
            <SessionPicker
              serviceId={booking.serviceId}
              date={date}
              onDateChange={(d) => {
                setDate(d);
                setSessionId(null);
              }}
              value={sessionId}
              onChange={(id) => {
                setSessionId(id);
                setOverride(false);
              }}
              clientId={booking.clientId}
              excludeSessionId={booking.sessionId}
            />
          ) : (
            <>
              <Field label="Terapeut">
                <Select
                  value={therapistId}
                  onValueChange={(v) => {
                    setTherapistId(v);
                    setOverride(false);
                    if (!manual) setStart(null);
                  }}
                  options={therapists.map((t) => ({ value: t.id, label: therapistName(t) + (t.id === booking.therapistId ? ' (původní)' : '') }))}
                />
              </Field>
              <SlotPicker
                serviceId={booking.serviceId}
                therapistId={therapistId}
                date={date}
                onDateChange={(d) => {
                  setDate(d);
                  setOverride(false);
                  setStart(manual && start ? d + 'T' + start.slice(11, 16) : null);
                }}
                value={start}
                onChange={(s) => {
                  setStart(s);
                  setOverride(false);
                }}
                clientId={booking.clientId}
                ignoreBookingId={booking.id}
                manual={manual}
                onManualChange={(m) => {
                  setManual(m);
                  setOverride(false);
                  if (!m) setStart(null);
                }}
              />
            </>
          )}
          {sameAsNow ? (
            <p className="cal-hint">Vybraný čas je stejný jako původní termín.</p>
          ) : (
            <SlotCheckNotice check={check} override={override} onOverride={setOverride} overrideLabel="Přesunout i přesto" />
          )}
          {newStart && newEnd && !sameAsNow && check?.ok && (
            <MoveSummary
              from={{ start: booking.start, end: booking.end, therapistId: booking.therapistId }}
              to={{ start: newStart, end: newEnd, therapistId: isGroup ? session?.therapistId ?? booking.therapistId : therapistId }}
            />
          )}
        </div>
      )}
    </Dialog>
  );
}
