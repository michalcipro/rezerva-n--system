import { useEffect, useId, useState, type FormEvent } from 'react';
import type { Id } from '../../domain/types';
import { SESSION_NOTES_TOO_LONG, sendSessionNotes, SUBJECT_TOO_LONG } from '../../engine/commands';
import { getNote, NOTE_KIND_LABEL, sessionNotesVars } from '../../engine/crm';
import { formatDate, formatNumber, formatTime } from '../../engine/format';
import { DEFAULT_TEMPLATES, MESSAGE_BODY_MAX, MESSAGE_SUBJECT_MAX, renderTemplate } from '../../engine/messages';
import { clientName, getClient } from '../../engine/selectors';
import { useClinic, useCommand } from '../../store/hooks';
import { Button, Callout, Dialog, Field, Input, Textarea } from '../../ui';
import './crm.css';

export interface SendSessionNotesDialogProps {
  open: boolean;
  onClose: () => void;
  /** Odesílaná poznámka (zápis ze sezení nebo Plaud shrnutí). */
  noteId: Id | null;
  /** Po odeslání (id zprávy). */
  onSent?: (messageId: Id) => void;
}

/**
 * Odeslání zápisu ze sezení klientovi e-mailem: náhled podle šablony „Zápis ze sezení“ (session_notes),
 * předmět i text lze před odesláním upravit. Varuje, když klient nemá e-mail nebo už zápis dostal.
 */
export function SendSessionNotesDialog({ open, onClose, noteId, onSent }: SendSessionNotesDialogProps): JSX.Element | null {
  const clinic = useClinic();
  const run = useCommand();
  const formId = useId();
  const note = noteId ? getNote(clinic, noteId) : undefined;
  const client = note ? getClient(clinic, note.clientId) : undefined;
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [touched, setTouched] = useState(false);

  const render = (): { subject: string; body: string } => {
    if (!note) return { subject: '', body: '' };
    const tpl = clinic.templates.find((t) => t.key === 'session_notes') ?? DEFAULT_TEMPLATES.find((t) => t.key === 'session_notes');
    const vars = sessionNotesVars(clinic, note);
    return { subject: renderTemplate(tpl?.subject ?? '', vars), body: renderTemplate(tpl?.body ?? '', vars) };
  };

  const reset = (): void => {
    const r = render();
    setSubject(r.subject);
    setBody(r.body);
    setTouched(false);
  };

  useEffect(() => {
    if (open) reset();
    // Šablonu vykreslit jen při otevření – rozepsané úpravy se nepřepisují.
  }, [open, noteId]);

  if (!open) return null;
  if (!note || !client) {
    return (
      <Dialog open onClose={onClose} title="Odeslat zápis klientovi" size="sm" footer={<Button onClick={onClose}>Zavřít</Button>}>
        <Callout tone="warning" title="Zápis nenalezen">
          Poznámka mezitím zřejmě byla smazána.
        </Callout>
      </Dialog>
    );
  }

  const noEmail = !client.email;
  const emptyText = !note.text.trim();
  const subjectLong = subject.trim().length > MESSAGE_SUBJECT_MAX;
  const bodyLong = body.trim().length > MESSAGE_BODY_MAX;
  const errors = {
    subject: !subject.trim() ? 'Doplňte předmět e-mailu.' : subjectLong ? SUBJECT_TOO_LONG : undefined,
    body: !body.trim() ? 'Text e-mailu je prázdný.' : bodyLong ? SESSION_NOTES_TOO_LONG : undefined,
  };
  const canSend = !noEmail && !errors.subject && !errors.body;

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    setTouched(true);
    if (!canSend) return;
    const r = run(sendSessionNotes, { noteId: note.id, subject, body }, { success: note.sentAt ? 'Zápis je znovu odeslaný' : 'Zápis je odeslaný klientovi' });
    if (r.ok) {
      onSent?.(r.value);
      onClose();
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Odeslat zápis klientovi"
      description={`${NOTE_KIND_LABEL[note.kind]} (${formatDate(note.at)}). Náhled e-mailu podle šablony – před odesláním ho můžete upravit.`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Zpět
          </Button>
          <Button variant="primary" type="submit" form={formId} icon="send" disabled={noEmail}>
            {note.sentAt ? 'Odeslat znovu' : 'Odeslat e-mail'}
          </Button>
        </>
      }
    >
      <form id={formId} className="crm-form" onSubmit={submit} noValidate>
        {noEmail ? (
          <Callout tone="danger" title="Klient nemá e-mail">
            {clientName(client)} nemá v kartě vyplněný e-mail, zápis proto nelze odeslat. Doplňte e-mail v údajích klienta.
          </Callout>
        ) : (
          <p className="crm-to">
            Komu: <strong>{clientName(client)}</strong> &lt;{client.email}&gt;
          </p>
        )}
        {note.sentAt && (
          <Callout tone="warning" title="Už odesláno">
            Tento zápis klient dostal {formatDate(note.sentAt)} v {formatTime(note.sentAt)}. Odesláním ho dostane znovu.
          </Callout>
        )}
        {emptyText && !noEmail && (
          <Callout tone="warning" title="Zápis je prázdný">
            Poznámka nemá žádný text – do e-mailu doplňte, co má klient dostat.
          </Callout>
        )}
        <Field label="Předmět" error={touched || subjectLong ? errors.subject : undefined}>
          <Input value={subject} onValueChange={setSubject} disabled={noEmail} />
        </Field>
        <Field
          label="Text e-mailu"
          error={touched || bodyLong ? errors.body : undefined}
          hint={`Úprava se týká jen tohoto e-mailu – zápis v kartě klienta zůstane beze změny. Nejvýše ${formatNumber(MESSAGE_BODY_MAX)} znaků.`}
        >
          <Textarea rows={14} value={body} onValueChange={setBody} disabled={noEmail} className="crm-mailbody" />
        </Field>
        <div className="crm-form__aside">
          <button type="button" className="link" onClick={reset} disabled={noEmail}>
            Obnovit podle šablony
          </button>
          <span className="crm-hint">Odeslání se zapíše do komunikace klienta.</span>
        </div>
      </form>
    </Dialog>
  );
}
