import { useEffect, useId, useState, type FormEvent } from 'react';
import type { Id } from '../../domain/types';
import { addNote, updateNote } from '../../engine/commands';
import { filesOfNote, NOTE_TEXT_MAX, NOTE_TITLE_MAX, sessionNoteOfBooking } from '../../engine/crm';
import { countLabel, formatDate, formatDayShort, formatNumber, formatTime, formatTimeRange } from '../../engine/format';
import { getBooking, getService, getTherapist, therapistName } from '../../engine/selectors';
import { useClinic, useCommand, useNow } from '../../store/hooks';
import { Badge, Button, EmptyState, Field, Input, Textarea, cx } from '../../ui';
import { SendSessionNotesDialog } from './SendSessionNotesDialog';
import './crm.css';

export interface SessionNoteEditorProps {
  /** Schůzka, ke které zápis patří. */
  bookingId: Id;
  /** Po uložení (id poznámky) nebo po návratu bez uložení (null). */
  onDone?: (noteId: Id | null) => void;
  className?: string;
}

/** Osnova zápisu – text může dostat klient e-mailem, proto bez interních poznámek. */
const OUTLINE = 'Téma sezení: \nCo jsme probrali: \nNa čem pracovat do příště: \nDalší krok: ';

/**
 * Zápis ze sezení ke schůzce: založí nebo upraví poznámku druhu 'session' (bookingId, čas = začátek schůzky).
 * Tlačítko „Uložit a odeslat“ po uložení otevře náhled e-mailu pro klienta.
 */
export function SessionNoteEditor({ bookingId, onDone, className }: SessionNoteEditorProps): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const run = useCommand();
  const formId = useId();
  const booking = getBooking(clinic, bookingId);
  const existing = sessionNoteOfBooking(clinic, bookingId);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [text, setText] = useState(existing?.text ?? '');
  const [touched, setTouched] = useState(false);
  const [sendId, setSendId] = useState<Id | null>(null);

  // Jiná schůzka nebo zápis smazaný/založený jinde → převzít aktuální obsah.
  useEffect(() => {
    setTitle(existing?.title ?? '');
    setText(existing?.text ?? '');
    setTouched(false);
  }, [bookingId, existing?.id]);

  if (!booking) {
    return <EmptyState compact icon="calendarX" title="Schůzka nenalezena" text="Schůzka mezitím zřejmě byla smazána." />;
  }

  const service = getService(clinic, booking.serviceId);
  const therapist = getTherapist(clinic, booking.therapistId);
  const attachments = existing ? filesOfNote(clinic, existing.id).length : 0;
  const trimmedTitle = title.trim();
  const trimmedText = text.trim();
  const errors = {
    title: trimmedTitle.length > NOTE_TITLE_MAX ? `Nadpis může mít nejvýše ${NOTE_TITLE_MAX} znaků.` : undefined,
    text: !trimmedText
      ? 'Napište, co se na sezení probíralo.'
      : trimmedText.length > NOTE_TEXT_MAX
        ? `Text je příliš dlouhý (max. ${formatNumber(NOTE_TEXT_MAX)} znaků). Dlouhý přepis vložte jako soubor.`
        : undefined,
  };
  const invalid = !!errors.title || !!errors.text;
  const dirty = !existing || trimmedTitle !== existing.title || trimmedText !== existing.text;
  const future = booking.start > now;

  const save = (): Id | null => {
    setTouched(true);
    if (invalid) return null;
    if (existing) {
      if (!dirty) return existing.id;
      const r = run(updateNote, { noteId: existing.id, patch: { title: trimmedTitle, text: trimmedText } }, { success: 'Zápis ze sezení je uložený' });
      return r.ok ? existing.id : null;
    }
    const r = run(
      addNote,
      { clientId: booking.clientId, kind: 'session', title: trimmedTitle, text: trimmedText, at: booking.start, bookingId: booking.id },
      { success: 'Zápis ze sezení je uložený' },
    );
    return r.ok ? r.value : null;
  };

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    const id = save();
    if (id) onDone?.(id);
  };

  const saveAndSend = (): void => {
    const id = save();
    if (id) setSendId(id);
  };

  return (
    <>
      <form id={formId} className={cx('crm-sne', className)} onSubmit={submit} noValidate>
        <div className="crm-sne__booking">
          <span className="crm-sne__when tnum">
            {formatDayShort(booking.start)} {booking.start.slice(0, 4) !== now.slice(0, 4) ? booking.start.slice(0, 4) + ' ' : ''}
            {formatTimeRange(booking.start, booking.end)}
          </span>
          <span className="crm-sne__what">
            {service?.name ?? 'Schůzka'}
            {therapist ? ` · ${therapistName(therapist)}` : ''}
          </span>
          <span className="crm-sne__badges">
            {existing?.sentAt ? (
              <Badge tone="success" icon="check">
                Odesláno {formatDate(existing.sentAt)}
              </Badge>
            ) : existing ? (
              <Badge tone="neutral">Neodesláno</Badge>
            ) : null}
            {attachments > 0 && (
              <Badge tone="neutral" icon="link">
                {countLabel(attachments, ['příloha', 'přílohy', 'příloh'])}
              </Badge>
            )}
          </span>
        </div>
        {future && !existing && <p className="crm-hint">Schůzka teprve proběhne – zápis si můžete připravit předem.</p>}
        {existing?.updatedAt && (
          <p className="crm-hint tnum">
            Naposledy upraveno {formatDate(existing.updatedAt)} v {formatTime(existing.updatedAt)}.
          </p>
        )}
        <Field label="Nadpis" optional error={touched ? errors.title : undefined}>
          <Input value={title} maxLength={NOTE_TITLE_MAX} onValueChange={setTitle} placeholder="Např. Práce s trémou před závodem" />
        </Field>
        <Field
          label="Zápis"
          error={touched ? errors.text : undefined}
          hint={`Text může klient dostat e-mailem. ${formatNumber(trimmedText.length)} / ${formatNumber(NOTE_TEXT_MAX)} znaků`}
        >
          <Textarea rows={9} value={text} onValueChange={setText} placeholder="Co jsme probrali, k čemu jsme došli a na čem klient do příště pracuje…" data-autofocus="" />
        </Field>
        <div className="crm-sne__actions">
          {!text.trim() && (
            <Button size="sm" variant="ghost" icon="list" onClick={() => setText(OUTLINE)}>
              Vložit osnovu
            </Button>
          )}
          <span className="spacer" />
          {onDone && (
            <Button size="sm" variant="secondary" onClick={() => onDone(null)}>
              Zpět
            </Button>
          )}
          <Button size="sm" variant="secondary" icon="send" onClick={saveAndSend}>
            {existing?.sentAt ? 'Uložit a odeslat znovu' : 'Uložit a odeslat'}
          </Button>
          <Button size="sm" variant="primary" icon="check" type="submit" disabled={!!existing && !dirty}>
            {existing ? 'Uložit změny' : 'Uložit zápis'}
          </Button>
        </div>
      </form>
      {/* Mimo <form>: submit z dialogu by v Reactu probublal i do tohoto formuláře. */}
      <SendSessionNotesDialog
        open={sendId !== null}
        noteId={sendId}
        onClose={() => {
          const id = sendId;
          setSendId(null);
          if (id) onDone?.(id);
        }}
      />
    </>
  );
}
