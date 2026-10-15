import { useId, useState } from 'react';
import type { Booking } from '../../domain/types';
import { filesOfNote, NOTE_KIND_LABEL, notesOfBooking, sessionNoteOfBooking } from '../../engine/crm';
import { countLabel, formatDate, formatTime } from '../../engine/format';
import { clientName, getClient, getTherapist, therapistName } from '../../engine/selectors';
import { NOTE_KIND_ICON, SendSessionNotesDialog, SessionNoteEditor } from '../../components/crm';
import { useClinic, useNow } from '../../store/hooks';
import { Badge, Button, Dialog, Icon } from '../../ui';
import './calendar.css';

/** Náhled zápisu v detailu schůzky: nejvýš tolik řádků a znaků, zbytek po rozbalení. */
const PREVIEW_LINES = 5;
const PREVIEW_CHARS = 280;

/** Zkrácený text zápisu pro náhled (celé řádky, nejvýš PREVIEW_CHARS znaků, bez useknutého slova). */
export function sessionNotePreview(text: string): { text: string; truncated: boolean } {
  const full = text.trim();
  let short = full.split('\n').slice(0, PREVIEW_LINES).join('\n');
  if (short.length > PREVIEW_CHARS) {
    short = short.slice(0, PREVIEW_CHARS);
    const cut = short.replace(/\s+\S*$/, '');
    if (cut.length > PREVIEW_CHARS / 2) short = cut;
  }
  short = short.trimEnd();
  return short.length < full.length ? { text: short + '…', truncated: true } : { text: full, truncated: false };
}

export interface SessionNotesSectionProps {
  booking: Booking;
  /** Otevře kartu klienta (zavře detail schůzky). */
  onOpenClient: () => void;
}

/**
 * Zápis ze sezení v detailu schůzky: náhled, stav odeslání, napsat / upravit / odeslat klientovi a odkaz na
 * poznámky, Plaud importy a soubory v kartě klienta. Zobrazuj jen rolím s přístupem ke klinickým poznámkám.
 */
export function SessionNotesSection({ booking: b, onOpenClient }: SessionNotesSectionProps): JSX.Element | null {
  const clinic = useClinic();
  const now = useNow();
  const headingId = useId();
  const [overlay, setOverlay] = useState<'edit' | 'send' | null>(null);
  const [expanded, setExpanded] = useState(false);

  const note = sessionNoteOfBooking(clinic, b.id);
  const linked = notesOfBooking(clinic, b.id).filter((n) => n.kind !== 'session');
  // Zápis patří ke schůzce, která proběhne nebo proběhla; u zrušených jen když už nějaký existuje.
  if (!note && !linked.length && b.status !== 'confirmed' && b.status !== 'completed') return null;

  const client = getClient(clinic, b.clientId);
  const future = b.start > now;
  const close = (): void => setOverlay(null);

  let body: JSX.Element;
  if (note) {
    const preview = sessionNotePreview(note.text);
    const author = note.authorId ? getTherapist(clinic, note.authorId) : undefined;
    const attachments = filesOfNote(clinic, note.id).length;
    const meta = [
      author ? therapistName(author) : '',
      note.updatedAt ? `upraveno ${formatDate(note.updatedAt)}` : `zapsáno ${formatDate(note.createdAt)}`,
      attachments ? countLabel(attachments, ['příloha', 'přílohy', 'příloh']) : '',
    ].filter(Boolean);
    body = (
      <>
        <div className="cal-sn__card">
          {note.title && <p className="cal-sn__title">{note.title}</p>}
          {preview.text ? (
            <p className="cal-sn__text">{expanded ? note.text.trim() : preview.text}</p>
          ) : (
            <p className="cal-sn__text cal-soft">Zápis zatím nemá žádný text.</p>
          )}
          {preview.truncated && (
            <button type="button" className="link cal-sn__more" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
              {expanded ? 'Zobrazit méně' : 'Zobrazit celý zápis'}
            </button>
          )}
          <p className="cal-sn__meta tnum">{meta.join(' · ')}</p>
        </div>
        <div className="cal-row">
          <Button size="sm" variant="secondary" icon="edit" onClick={() => setOverlay('edit')}>
            Upravit
          </Button>
          <Button size="sm" variant={note.sentAt ? 'secondary' : 'primary'} icon="send" onClick={() => setOverlay('send')}>
            {note.sentAt ? 'Odeslat znovu' : 'Odeslat klientovi'}
          </Button>
        </div>
      </>
    );
  } else {
    body = (
      <div className="cal-sn__empty">
        <span className="cal-sn__empty-icon" aria-hidden="true">
          <Icon name="clipboard" size={16} />
        </span>
        <div className="cal-sn__empty-body">
          <p className="cal-sn__empty-title">Zatím bez zápisu</p>
          <p className="cal-hint">
            {future ? (
              'Schůzka teprve proběhne – zápis si můžete připravit předem.'
            ) : (
              <>
                Zapište, co jste probrali a na čem klient do příště pracuje. Zápis mu pak můžete poslat <span className="nowrap">e-mailem</span>.
              </>
            )}
          </p>
          <Button size="sm" variant={future ? 'secondary' : 'primary'} icon="edit" className="cal-sn__empty-action" onClick={() => setOverlay('edit')}>
            Napsat zápis
          </Button>
        </div>
      </div>
    );
  }

  return (
    <section className="cal-sn" aria-labelledby={headingId}>
      <div className="cal-sn__head">
        <h3 id={headingId} className="cal-subtitle">
          Zápis ze sezení
        </h3>
        {note &&
          (note.sentAt ? (
            <Badge tone="success" icon="check">
              Odesláno {formatDate(note.sentAt)} v {formatTime(note.sentAt)}
            </Badge>
          ) : (
            <Badge tone="neutral">Neodesláno klientovi</Badge>
          ))}
      </div>

      {body}

      {linked.length > 0 && (
        <ul className="cal-sn__linked" aria-label="Další záznamy ke schůzce">
          {linked.map((n) => (
            <li key={n.id} className="cal-sn__linked-item">
              <Icon name={NOTE_KIND_ICON[n.kind]} size={14} />
              <span className="cal-sn__linked-text">
                {NOTE_KIND_LABEL[n.kind]}
                {n.title ? <span className="cal-soft"> · {n.title}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}

      <button type="button" className="link cal-sn__link" onClick={onOpenClient}>
        Poznámky, Plaud a soubory v kartě klienta
        <Icon name="arrowRight" size={14} />
      </button>

      <Dialog open={overlay === 'edit'} onClose={close} title="Zápis ze sezení" description={clientName(client)} size="lg">
        <SessionNoteEditor bookingId={b.id} onDone={close} />
      </Dialog>
      <SendSessionNotesDialog open={overlay === 'send'} noteId={note?.id ?? null} onClose={close} />
    </section>
  );
}
