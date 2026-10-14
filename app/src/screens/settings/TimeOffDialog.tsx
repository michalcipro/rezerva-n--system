import { useMemo, useState } from 'react';
import type { Id } from '../../domain/types';
import { addTimeOff, cancelSession } from '../../engine/commands';
import { countLabel, formatDayShort, formatTime } from '../../engine/format';
import { clientName, getClient, getService, getTherapist, therapistName, therapistShort } from '../../engine/selectors';
import { addDays, combine, dateOf, isValidLocalDate } from '../../engine/time';
import { useClinic, useCommand, useNow } from '../../store/hooks';
import { navigate, setSession } from '../../store/session';
import { Button, Callout, Checkbox, ChoiceChips, Dialog, Field, Input, Segmented, Select, toast } from '../../ui';
import { TIME_OFF_REASONS, byOrder, describeRange, timeOffImpact } from './helpers';
import { FieldGroup, TimeSelect } from './shared';
import './set-team.css';

const CLINIC = 'clinic';
type Mode = 'days' | 'hours';

function cancelledLessonsText(n: number): string {
  if (n === 1) return 'Zrušena 1 skupinová lekce';
  if (n < 5) return `Zrušeny ${n} skupinové lekce`;
  return `Zrušeno ${n} skupinových lekcí`;
}

/** Nepřítomnost terapeuta nebo zavření celé kliniky s náhledem dopadu na rezervace. */
export function TimeOffDialog({ therapistId, onClose }: { therapistId?: Id | null; onClose: () => void }): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const run = useCommand();
  const today = dateOf(now);
  const therapists = useMemo(() => clinic.therapists.filter((t) => t.active).sort(byOrder), [clinic.therapists]);
  const [who, setWho] = useState<string>(therapistId === null ? CLINIC : therapistId ?? therapists[0]?.id ?? CLINIC);
  const [mode, setMode] = useState<Mode>('days');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [date, setDate] = useState(today);
  const [tFrom, setTFrom] = useState('12:00');
  const [tTo, setTTo] = useState('16:00');
  const [reason, setReason] = useState<string>(therapistId === null ? 'Státní svátek' : 'Dovolená');
  const [note, setNote] = useState('');
  const [cancelLessons, setCancelLessons] = useState(true);
  const [submitted, setSubmitted] = useState(false);

  const isClinic = who === CLINIC;
  const target: Id | null = isClinic ? null : who;
  const start = mode === 'days' ? combine(from, '00:00') : combine(date, tFrom);
  const end = mode === 'days' ? combine(addDays(isValidLocalDate(to) ? to : from, 1), '00:00') : combine(date, tTo);

  const errors: Partial<Record<'from' | 'to' | 'date' | 'time' | 'note', string>> = {};
  if (mode === 'days') {
    if (!isValidLocalDate(from)) errors.from = 'Zadejte datum začátku.';
    if (!isValidLocalDate(to)) errors.to = 'Zadejte datum konce.';
    else if (isValidLocalDate(from) && to < from) errors.to = 'Konec musí být ve stejný den nebo později.';
  } else {
    if (!isValidLocalDate(date)) errors.date = 'Zadejte datum.';
    if (!(tFrom < tTo)) errors.time = 'Konec musí být později než začátek.';
  }
  if (reason === 'Jiné' && !note.trim()) errors.note = 'Napište krátce důvod.';
  const valid = Object.keys(errors).length === 0;

  const impact = useMemo(
    () => (valid ? timeOffImpact(clinic, target, start, end, now) : { bookings: [], sessions: [] }),
    [clinic, target, start, end, now, valid],
  );
  const participants = impact.sessions.reduce((sum, s) => sum + s.participants, 0);
  const overlapping = valid
    ? clinic.timeOff.filter((o) => (o.therapistId === target || o.therapistId === null) && o.start < end && start < o.end)
    : [];
  const past = valid && end <= now;

  const reasonText = reason === 'Jiné' ? note.trim() : note.trim() ? `${reason} – ${note.trim()}` : reason;

  const save = (): void => {
    setSubmitted(true);
    if (!valid) return;
    const r = run(addTimeOff, { therapistId: target, start, end, reason: reasonText }, {
      success: isClinic ? `Zavření kliniky uloženo (${describeRange(start, end)})` : `Nepřítomnost uložena (${describeRange(start, end)})`,
    });
    if (!r.ok) return;
    if (cancelLessons && impact.sessions.length) {
      let cancelled = 0;
      let people = 0;
      for (const item of impact.sessions) {
        const c = run(cancelSession, { sessionId: item.session.id, reason: reasonText }, { quiet: true });
        if (c.ok) {
          cancelled++;
          people += c.value;
        }
      }
      if (cancelled)
        toast.info(cancelledLessonsText(cancelled), {
          description: people
            ? `${countLabel(people, ['přihlášený klient dostal', 'přihlášení klienti dostali', 'přihlášených klientů dostalo'])} omluvnou zprávu, platby se vracejí.`
            : undefined,
        });
    }
    onClose();
  };

  const openCalendar = (day: string): void => {
    setSession({ calendarDate: day, calendarView: 'day', calendarTherapist: target ?? 'all' });
    navigate({ name: 'kalendar' });
    onClose();
  };

  const shownBookings = impact.bookings.slice(0, 5);

  return (
    <Dialog
      open
      onClose={onClose}
      size="md"
      title={isClinic ? 'Zavřít kliniku' : 'Nepřítomnost'}
      description={
        isClinic
          ? 'Celá klinika bude zavřená – online rezervace v tomto čase nenabídne žádný termín.'
          : 'Terapeut nebude v tomto čase k dispozici pro nové rezervace.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Zpět
          </Button>
          <Button variant="primary" icon="check" onClick={save}>
            {isClinic ? 'Zavřít kliniku' : 'Uložit nepřítomnost'}
          </Button>
        </>
      }
    >
      <div className="set-form">
        <Field label="Kdo">
          <Select
            value={who}
            onValueChange={setWho}
            options={[
              { value: CLINIC, label: 'Celá klinika (zavřeno)' },
              ...therapists.map((t) => ({ value: t.id, label: therapistName(t) })),
            ]}
          />
        </Field>

        <FieldGroup label="Rozsah">
          <Segmented<Mode>
            aria-label="Rozsah"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'days', label: 'Celé dny', icon: 'calendar' },
              { value: 'hours', label: 'Část dne', icon: 'clock' },
            ]}
          />
        </FieldGroup>

        {mode === 'days' ? (
          <div className="set-form__grid">
            <Field label="Od" error={submitted ? errors.from : undefined}>
              <Input
                type="date"
                value={from}
                onValueChange={(v) => {
                  setFrom(v);
                  if (isValidLocalDate(v) && (!isValidLocalDate(to) || to < v)) setTo(v);
                }}
              />
            </Field>
            <Field label="Do (včetně)" error={errors.to}>
              <Input type="date" value={to} min={from} onValueChange={setTo} />
            </Field>
          </div>
        ) : (
          <div className="set-form__grid set-form__grid--3">
            <Field label="Datum" error={submitted ? errors.date : undefined}>
              <Input type="date" value={date} onValueChange={setDate} />
            </Field>
            <Field label="Od" error={errors.time}>
              <TimeSelect value={tFrom} from={5 * 60} to={23 * 60} onChange={setTFrom} />
            </Field>
            <Field label="Do">
              <TimeSelect value={tTo} from={5 * 60} to={23 * 60} onChange={setTTo} invalid={!!errors.time} />
            </Field>
          </div>
        )}

        <FieldGroup label="Důvod" error={submitted ? errors.note : undefined}>
          <ChoiceChips
            aria-label="Důvod"
            value={reason}
            onChange={setReason}
            options={[...TIME_OFF_REASONS, 'Jiné'].map((r) => ({ value: r, label: r }))}
          />
        </FieldGroup>
        <Field label={reason === 'Jiné' ? 'Popis důvodu' : 'Poznámka'} optional={reason !== 'Jiné'} hint="Vidí jen personál.">
          <Input value={note} maxLength={80} onValueChange={setNote} placeholder={reason === 'Jiné' ? 'např. Rekonstrukce' : 'např. Lyžování'} />
        </Field>

        {valid && (
          <div className="set-impact" aria-live="polite">
            <p className="set-impact__range">
              <strong>{describeRange(start, end)}</strong>
              {past && <span className="muted"> · období už proběhlo</span>}
            </p>
            {overlapping.length > 0 && (
              <Callout tone="info">
                Překrývá se s {overlapping.length === 1 ? 'existujícím záznamem' : 'existujícími záznamy'}:{' '}
                {overlapping.map((o) => `${describeRange(o.start, o.end)} (${o.reason || 'bez důvodu'})`).join('; ')}.
              </Callout>
            )}
            {impact.bookings.length === 0 ? (
              <Callout tone="success">V tomto čase nejsou žádné potvrzené individuální rezervace.</Callout>
            ) : (
              <Callout
                tone="warning"
                icon="alert"
                title={`${countLabel(impact.bookings.length, ['rezervace', 'rezervace', 'rezervací'])} v kolizi`}
                actions={
                  <Button size="sm" variant="secondary" icon="calendar" onClick={() => openCalendar(dateOf(impact.bookings[0].start))}>
                    Otevřít kalendář na {formatDayShort(impact.bookings[0].start)}
                  </Button>
                }
              >
                <p>Rezervace se automaticky neruší – přesuňte je nebo zrušte v kalendáři a dejte klientům vědět.</p>
                <ul className="set-bullets set-bullets--tight">
                  {shownBookings.map((b) => (
                    <li key={b.id}>
                      {formatDayShort(b.start)} {formatTime(b.start)} · {clientName(getClient(clinic, b.clientId))} · {getService(clinic, b.serviceId)?.name ?? ''}
                      {isClinic ? ` (${therapistShort(getTherapist(clinic, b.therapistId))})` : ''}
                    </li>
                  ))}
                </ul>
                {impact.bookings.length > shownBookings.length && <p className="muted">a {impact.bookings.length - shownBookings.length} dalších</p>}
              </Callout>
            )}
            {impact.sessions.length > 0 && (
              <div className="set-impact__lessons">
                <Checkbox
                  checked={cancelLessons}
                  onChange={setCancelLessons}
                  label={`Zrušit ${countLabel(impact.sessions.length, ['skupinovou lekci', 'skupinové lekce', 'skupinových lekcí'])} v tomto období`}
                  description={
                    (participants
                      ? `Přihlášení klienti (${participants}) dostanou omluvnou zprávu a platba se jim vrátí. `
                      : 'Zatím na ně nikdo není přihlášený. ') +
                    impact.sessions
                      .slice(0, 4)
                      .map((x) => `${formatDayShort(x.session.start)} ${formatTime(x.session.start)} ${x.session.title}`)
                      .join(' · ') +
                    (impact.sessions.length > 4 ? ' …' : '')
                  }
                />
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
