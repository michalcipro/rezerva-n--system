import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import type { ClinicState, FileRecord, Id, LocalDateTime, Note, NoteKind } from '../../domain/types';
import { addNote, updateNote } from '../../engine/commands';
import {
  filesOfNote,
  getFileRecord,
  NOTE_KIND_LABEL,
  NOTE_KINDS,
  NOTE_TEXT_MAX,
  NOTE_TITLE_MAX,
  notesOfClient,
  sessionNoteOfBooking,
} from '../../engine/crm';
import { countLabel, formatClockDuration, formatDate, formatDayShort, formatFileSize, formatMonthYear, formatNumber } from '../../engine/format';
import { getBooking, getTherapist, therapistName } from '../../engine/selectors';
import { isValidLocalDateTime } from '../../engine/time';
import { fileMaxBytes } from '../../store/files';
import { useClinic, useCommand, useNow } from '../../store/hooks';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Field,
  Icon,
  IconButton,
  Input,
  Menu,
  Segmented,
  Select,
  Spinner,
  Textarea,
  cx,
  toast,
  type MenuEntry,
} from '../../ui';
import { AudioRecorderDialog } from './AudioRecorder';
import { FileUploadButton } from './FileUploadButton';
import { FileViewerDialog } from './FileViewerDialog';
import { PlaudImportDialog } from './PlaudImportDialog';
import { SendSessionNotesDialog } from './SendSessionNotesDialog';
import { SessionNoteEditor } from './SessionNoteEditor';
import {
  bookingLabel,
  defaultSessionBooking,
  deleteNoteWithFiles,
  FILE_KIND_ICON,
  linkableBookings,
  NOTE_KIND_ICON,
  NOTE_KIND_PLURAL,
  NOTE_KIND_TONE,
  NOTE_SAVED,
  noteWhen,
  recordStoredBlob,
  storeBlob,
  useFileStorage,
  useFileUrl,
  useMatchMedia,
} from './shared';
import './crm.css';

export interface NotesPanelProps {
  clientId: Id;
  /** Otevře detail schůzky (např. BookingDrawer). Bez něj se navázaná schůzka zobrazí jen jako text. */
  onOpenBooking?: (bookingId: Id) => void;
  /** Posunout na poznámku a zvýraznit ji (např. po kliknutí na soubor v kartě Soubory). */
  focusNoteId?: Id | null;
  className?: string;
}

type Filter = 'all' | NoteKind;
type Overlay =
  | { kind: 'session' }
  | { kind: 'plaud' }
  | { kind: 'audio'; noteId?: Id }
  | { kind: 'send'; noteId: Id }
  | { kind: 'delete'; note: Note }
  | { kind: 'file'; file: FileRecord }
  | null;

const PAGE = 20;
/** Dlouhý text se zkrátí a rozbalí tlačítkem. */
const LONG_TEXT = 700;
const LONG_LINES = 10;

/**
 * Poznámky klienta jako časová osa: poznámky, zápisy ze sezení, Plaud importy a telefonáty.
 * Filtr podle druhu, připnuté nahoře, nová poznámka, úprava, připnutí, smazání (i s daty příloh),
 * přílohy u poznámky, navázaná schůzka a odeslání zápisu klientovi.
 */
export function NotesPanel({ clientId, onOpenBooking, focusNoteId, className }: NotesPanelProps): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const run = useCommand();
  const compact = useMatchMedia('(max-width: 640px)');
  const storage = useFileStorage();
  const notes = notesOfClient(clinic, clientId);
  const [filter, setFilter] = useState<Filter>('all');
  const [limit, setLimit] = useState(PAGE);
  const [composer, setComposer] = useState<{ kind: NoteKind; key: number } | null>(null);
  const [editingId, setEditingId] = useState<Id | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [highlight, setHighlight] = useState<Id | null>(null);
  const close = (): void => setOverlay(null);

  const counts = useMemo(() => {
    const c = new Map<NoteKind, number>();
    for (const n of notes) c.set(n.kind, (c.get(n.kind) ?? 0) + 1);
    return c;
  }, [notes]);
  const kinds = NOTE_KINDS.filter((k) => counts.has(k));
  const current: Filter = filter !== 'all' && !counts.has(filter) ? 'all' : filter;
  const { pinned, rest, shownRest, groups } = useMemo(() => {
    const list = current === 'all' ? notes : notes.filter((n) => n.kind === current);
    const pinnedList = list.filter((n) => n.pinned);
    const restList = list.filter((n) => !n.pinned);
    const shown = restList.slice(0, Math.max(0, limit - pinnedList.length));
    const out: { key: string; label: string; notes: Note[] }[] = [];
    for (const n of shown) {
      const key = n.at.slice(0, 7);
      const last = out[out.length - 1];
      if (last && last.key === key) last.notes.push(n);
      else out.push({ key, label: formatMonthYear(n.at.slice(0, 10)), notes: [n] });
    }
    return { pinned: pinnedList, rest: restList, shownRest: shown, groups: out };
  }, [notes, current, limit]);

  // Skok na poznámku (z karty Soubory).
  useEffect(() => {
    if (!focusNoteId) return undefined;
    const idx = notes.findIndex((n) => n.id === focusNoteId);
    if (idx < 0) return undefined;
    setFilter('all');
    setLimit((l) => Math.max(l, idx + 1));
    setHighlight(focusNoteId);
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(noteDomId(focusNoteId));
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el?.focus({ preventScroll: true });
    });
    const t = window.setTimeout(() => setHighlight(null), 2400);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [focusNoteId]);

  const openComposer = (kind: NoteKind = 'note'): void => setComposer({ kind, key: Date.now() });

  const options = [
    { value: 'all' as Filter, label: `Vše (${formatNumber(notes.length)})` },
    ...kinds.map((k) => ({ value: k as Filter, label: `${NOTE_KIND_PLURAL[k]} (${formatNumber(counts.get(k) ?? 0)})` })),
  ];

  const more: MenuEntry[] = [
    { id: 'session', label: 'Zápis ze sezení', icon: 'clipboard', onSelect: () => setOverlay({ kind: 'session' }) },
    { id: 'plaud', label: 'Import z Plaud', icon: 'message', onSelect: () => setOverlay({ kind: 'plaud' }) },
    { id: 'audio', label: 'Nahrát audio', icon: 'activity', onSelect: () => setOverlay({ kind: 'audio' }) },
  ];
  const actions = compact ? (
    <>
      <Button size="sm" variant="primary" icon="plus" onClick={() => openComposer()}>
        Nová poznámka
      </Button>
      <Menu label="Další způsoby zápisu" trigger={<IconButton icon="more" label="Další způsoby zápisu" variant="secondary" size="sm" />} items={more} />
    </>
  ) : (
    <>
      <Button size="sm" variant="ghost" icon="activity" onClick={() => setOverlay({ kind: 'audio' })}>
        Nahrát audio
      </Button>
      <Button size="sm" variant="secondary" icon="message" onClick={() => setOverlay({ kind: 'plaud' })}>
        Import z Plaud
      </Button>
      <Button size="sm" variant="secondary" icon="clipboard" onClick={() => setOverlay({ kind: 'session' })}>
        Zápis ze sezení
      </Button>
      <Button size="sm" variant="primary" icon="plus" onClick={() => openComposer()}>
        Nová poznámka
      </Button>
    </>
  );

  const itemProps = {
    now,
    onEdit: (n: Note) => setEditingId(n.id),
    onCancelEdit: () => setEditingId(null),
    onSend: (n: Note) => setOverlay({ kind: 'send', noteId: n.id }),
    onDelete: (n: Note) => setOverlay({ kind: 'delete', note: n }),
    onAudio: (n: Note) => setOverlay({ kind: 'audio', noteId: n.id }),
    onOpenFile: (f: FileRecord) => setOverlay({ kind: 'file', file: f }),
    onPin: (n: Note) =>
      run(updateNote, { noteId: n.id, patch: { pinned: !n.pinned } }, { success: n.pinned ? 'Poznámka je odepnutá' : 'Poznámka je připnutá nahoru' }),
    onOpenBooking,
  };

  const deleting = overlay?.kind === 'delete' ? overlay.note : null;
  const deletingFiles = deleting ? attachmentCount(clinic, deleting) : 0;
  // Přílohy jdou z úložiště odstranit jen s přístupem k souborům (v artefaktu jen ten, kdo ho smí upravovat).
  // Bez něj by po smazání poznámky zůstala data příloh v úložišti bez záznamu – smazání proto nepustíme.
  const deleteBlocked = deletingFiles > 0 && storage.status !== 'ok';
  const viewed = overlay?.kind === 'file' ? getFileRecord(clinic, overlay.file.id) ?? null : null;

  return (
    <Card padding="none" as="section" aria-label="Poznámky klienta" className={cx('crm-notes', className)}>
      <CardHeader
        divided
        title="Poznámky"
        meta={notes.length ? countLabel(notes.length, ['záznam', 'záznamy', 'záznamů']) : undefined}
        actions={actions}
      />

      {composer && (
        <div className="crm-notes__composer">
          <NoteForm
            key={composer.key}
            clientId={clientId}
            initialKind={composer.kind}
            onDone={(id) => {
              setComposer(null);
              if (id) {
                setFilter('all');
                setHighlight(id);
                window.setTimeout(() => setHighlight((h) => (h === id ? null : h)), 2400);
              }
            }}
          />
        </div>
      )}

      {notes.length > 0 && kinds.length > 1 && (
        <div className="crm-toolbar">
          {compact ? (
            <Select aria-label="Druh záznamů" size="sm" value={current} onValueChange={(v) => setFilter(v as Filter)} options={options} />
          ) : (
            <Segmented aria-label="Druh záznamů" size="sm" value={current} onChange={setFilter} options={options} />
          )}
        </div>
      )}

      {notes.length === 0 ? (
        !composer && (
          <EmptyState
            icon="edit"
            title="Zatím žádné poznámky"
            text="Zapište první dojem z freetalku, zápis ze sezení, telefonát nebo importujte shrnutí z Plaud."
            action={
              <div className="crm-empty-actions">
                <Button variant="primary" icon="plus" onClick={() => openComposer()}>
                  Nová poznámka
                </Button>
                <Button icon="clipboard" onClick={() => setOverlay({ kind: 'session' })}>
                  Zápis ze sezení
                </Button>
              </div>
            }
          />
        )
      ) : (
        <div className="crm-tl">
          {pinned.length > 0 && (
            <section className="crm-tl__group" aria-label="Připnuté">
              <h3 className="crm-tl__label">
                <Icon name="pin" size={12} /> Připnuté
              </h3>
              <ol className="crm-tl__list">
                {pinned.map((n) => (
                  <NoteItem key={n.id} note={n} editing={editingId === n.id} highlighted={highlight === n.id} {...itemProps} />
                ))}
              </ol>
            </section>
          )}
          {groups.map((g) => (
            <section key={g.key} className="crm-tl__group" aria-label={g.label}>
              <h3 className="crm-tl__label">{g.label}</h3>
              <ol className="crm-tl__list">
                {g.notes.map((n) => (
                  <NoteItem key={n.id} note={n} editing={editingId === n.id} highlighted={highlight === n.id} {...itemProps} />
                ))}
              </ol>
            </section>
          ))}
          {rest.length > shownRest.length && (
            <div className="crm-more">
              <Button size="sm" variant="secondary" onClick={() => setLimit((l) => l + PAGE)}>
                Zobrazit starší ({formatNumber(rest.length - shownRest.length)})
              </Button>
            </div>
          )}
        </div>
      )}

      {overlay?.kind === 'session' && (
        <SessionNoteDialog
          clientId={clientId}
          onClose={close}
          onWithoutBooking={() => {
            close();
            openComposer('session');
          }}
        />
      )}
      {overlay?.kind === 'plaud' && <PlaudImportDialog open clientId={clientId} onClose={close} />}
      {overlay?.kind === 'audio' && <AudioRecorderDialog open clientId={clientId} noteId={overlay.noteId} onClose={close} />}
      <SendSessionNotesDialog open={overlay?.kind === 'send'} noteId={overlay?.kind === 'send' ? overlay.noteId : null} onClose={close} />
      <FileViewerDialog file={viewed} onClose={close} />
      <ConfirmDialog
        open={!!deleting}
        onClose={close}
        tone="danger"
        title={deleteBlocked && storage.status !== 'checking' ? 'Poznámku tady nejde smazat' : 'Smazat poznámku?'}
        message={
          !deleting
            ? undefined
            : deleteBlocked
              ? storage.status === 'checking'
                ? 'Ověřuji přístup k úložišti souborů…'
                : `Poznámka má ${countLabel(deletingFiles, ['přílohu', 'přílohy', 'příloh'])}, které odsud nejde odstranit z úložiště souborů – zůstaly by v něm bez záznamu. Poznámku s přílohami smaže jen ten, kdo může soubory spravovat (v claude.ai ten, kdo smí artefakt upravovat).`
              : `${NOTE_KIND_LABEL[deleting.kind]}${deleting.title ? ` „${deleting.title}“` : ''} (${formatDate(deleting.at)}) se trvale smaže${
                  deletingFiles ? ` včetně ${countLabel(deletingFiles, ['přílohy', 'příloh', 'příloh'])}` : ''
                }. Tuto akci nelze vrátit.`
        }
        confirmLabel="Smazat poznámku"
        cancelLabel={deleteBlocked && storage.status !== 'checking' ? 'Zavřít' : undefined}
        confirmDisabled={deleteBlocked}
        onConfirm={async () => {
          if (!deleting || deleteBlocked) return;
          if (!(await deleteNoteWithFiles(run, deleting.id))) throw new Error('fail');
          if (editingId === deleting.id) setEditingId(null);
        }}
      />
    </Card>
  );
}

const noteDomId = (id: Id): string => `crm-note-${id}`;

/** Počet souborů, které deleteNote odebere (přílohy poznámky a přepis z Plaud). */
function attachmentCount(s: ClinicState, note: Note): number {
  const files = filesOfNote(s, note.id);
  const transcriptId = note.plaud?.transcriptFileId;
  return files.length + (transcriptId && !files.some((f) => f.id === transcriptId) && getFileRecord(s, transcriptId) ? 1 : 0);
}

/* ------------------------------------------------------------------ */
/* Jedna poznámka                                                      */
/* ------------------------------------------------------------------ */

interface NoteItemProps {
  note: Note;
  now: LocalDateTime;
  editing: boolean;
  highlighted: boolean;
  onEdit: (n: Note) => void;
  onCancelEdit: () => void;
  onSend: (n: Note) => void;
  onDelete: (n: Note) => void;
  onAudio: (n: Note) => void;
  onPin: (n: Note) => void;
  onOpenFile: (f: FileRecord) => void;
  onOpenBooking?: (bookingId: Id) => void;
}

function NoteItem({ note: n, now, editing, highlighted, onEdit, onCancelEdit, onSend, onDelete, onAudio, onPin, onOpenFile, onOpenBooking }: NoteItemProps): JSX.Element {
  const clinic = useClinic();
  const storage = useFileStorage();
  const [expanded, setExpanded] = useState(false);
  const author = n.authorId ? getTherapist(clinic, n.authorId) : undefined;
  const booking = n.bookingId ? getBooking(clinic, n.bookingId) : undefined;
  const files = filesOfNote(clinic, n.id);
  const transcript = n.plaud?.transcriptFileId ? getFileRecord(clinic, n.plaud.transcriptFileId) : undefined;
  const attachments = transcript ? files.filter((f) => f.id !== transcript.id) : files;
  const sendable = n.kind === 'session' || n.kind === 'plaud';
  const long = n.text.length > LONG_TEXT || n.text.split('\n').length > LONG_LINES;
  const tone = NOTE_KIND_TONE[n.kind];
  const heading = n.title || NOTE_KIND_LABEL[n.kind];

  const menu: MenuEntry[] = [
    { id: 'edit', label: 'Upravit', icon: 'edit', onSelect: () => onEdit(n) },
    { id: 'pin', label: n.pinned ? 'Odepnout' : 'Připnout nahoru', icon: 'pin', onSelect: () => onPin(n) },
    ...(sendable ? [{ id: 'send', label: n.sentAt ? 'Odeslat klientovi znovu' : 'Odeslat klientovi', icon: 'send' as const, onSelect: () => onSend(n) }] : []),
    ...(storage.status !== 'unavailable' ? [{ id: 'audio', label: 'Nahrát audio k poznámce', icon: 'activity' as const, onSelect: () => onAudio(n) }] : []),
    { type: 'separator', id: 'sep' },
    { id: 'delete', label: 'Smazat', icon: 'trash', danger: true, onSelect: () => onDelete(n) },
  ];

  return (
    <li id={noteDomId(n.id)} tabIndex={-1} className={cx('crm-note', n.pinned && 'is-pinned', highlighted && 'is-highlighted')}>
      <span className={cx('crm-note__icon', `crm-note__icon--${tone}`)} aria-hidden="true">
        <Icon name={NOTE_KIND_ICON[n.kind]} size={16} />
      </span>
      <div className="crm-note__main">
        {editing ? (
          <NoteForm clientId={n.clientId} note={n} onDone={onCancelEdit} />
        ) : (
          <>
            <div className="crm-note__head">
              <div className="crm-note__badges">
                <Badge tone={tone} size="sm">
                  {NOTE_KIND_LABEL[n.kind]}
                </Badge>
                {n.pinned && (
                  <Badge tone="neutral" size="sm" icon="pin">
                    Připnuto
                  </Badge>
                )}
                {n.sentAt && (
                  <Badge tone="success" size="sm" icon="check">
                    Odesláno {formatDayShort(n.sentAt)}
                  </Badge>
                )}
                <span className="crm-note__when tnum">{noteWhen(n.at, now)}</span>
              </div>
              <div className="crm-note__tools">
                {sendable && !n.sentAt && n.text.trim() && (
                  <Button size="sm" variant="ghost" icon="send" onClick={() => onSend(n)} className="crm-note__send">
                    Odeslat klientovi
                  </Button>
                )}
                <Menu align="end" label={`Akce: ${heading}`} trigger={<IconButton icon="more" size="sm" label={`Akce: ${heading}`} />} items={menu} />
              </div>
            </div>

            {n.title && <h4 className="crm-note__title">{n.title}</h4>}

            {(booking || n.bookingId) && (
              <span className="crm-note__booking">
                <Icon name="calendar" size={12} />
                {booking ? (
                  onOpenBooking ? (
                    <button type="button" className="link" onClick={() => onOpenBooking(booking.id)}>
                      {bookingLabel(clinic, booking, now)}
                    </button>
                  ) : (
                    <span>{bookingLabel(clinic, booking, now)}</span>
                  )
                ) : (
                  <span className="muted">Schůzka už neexistuje</span>
                )}
              </span>
            )}

            {n.kind === 'plaud' && n.plaud?.recordedAt && n.plaud.recordedAt !== n.at && (
              <span className="crm-note__sub tnum">Nahráno {noteWhen(n.plaud.recordedAt, now)}</span>
            )}

            {n.text ? (
              <>
                <p className={cx('crm-note__text', long && !expanded && 'is-clamped')}>{n.text}</p>
                {long && (
                  <button type="button" className="link crm-note__more" aria-expanded={expanded} onClick={() => setExpanded((x) => !x)}>
                    {expanded ? 'Zobrazit méně' : 'Zobrazit celý text'}
                  </button>
                )}
              </>
            ) : !transcript && !attachments.length ? (
              <p className="crm-note__empty">Bez textu.</p>
            ) : null}

            {(transcript || attachments.length > 0) && (
              <ul className="crm-attach" aria-label="Přílohy">
                {transcript && (
                  <li>
                    <AttachmentChip file={transcript} label="Přepis" onOpen={onOpenFile} />
                  </li>
                )}
                {attachments.map((f) => (
                  <li key={f.id}>
                    <AttachmentChip file={f} onOpen={onOpenFile} />
                  </li>
                ))}
              </ul>
            )}

            <div className="crm-note__foot">
              <span className="crm-note__meta tnum">
                {author ? therapistName(author) : 'Autor neznámý'}
                {n.updatedAt ? ` · upraveno ${formatDayShort(n.updatedAt)}` : ''}
              </span>
              {storage.status === 'ok' && <FileUploadButton clientId={n.clientId} noteId={n.id} label="Přiložit" variant="ghost" icon="plus" />}
            </div>
          </>
        )}
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Příloha u poznámky                                                  */
/* ------------------------------------------------------------------ */

function AttachmentChip({ file: f, label, onOpen }: { file: FileRecord; label?: string; onOpen: (f: FileRecord) => void }): JSX.Element {
  const [playing, setPlaying] = useState(false);
  const isAudio = f.kind === 'audio';
  const { url, error, loading } = useFileUrl(f, (isAudio && playing) || f.kind === 'image');
  // Náhled obrázku, který prohlížeč neumí dekódovat (např. HEIC), nahradí ikona.
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const thumb = f.kind === 'image' && !!url && brokenUrl !== url ? url : null;
  const name = label ? `${label} · ${f.name}` : f.name;
  const meta = [f.durationSec ? formatClockDuration(f.durationSec) : null, formatFileSize(f.size)].filter(Boolean).join(' · ');

  if (isAudio && playing) {
    return (
      <span className="crm-chip crm-chip--player">
        {loading ? (
          <Spinner size={16} label="Načítám nahrávku…" />
        ) : error || !url ? (
          <span className="crm-error">{error ?? 'Nahrávku se nepodařilo načíst.'}</span>
        ) : (
          <audio controls autoPlay preload="metadata" src={url} aria-label={name} className="crm-chip__audio" />
        )}
        <IconButton icon="x" size="sm" label="Zavřít přehrávač" onClick={() => setPlaying(false)} />
      </span>
    );
  }

  return (
    <button
      type="button"
      className={cx('crm-chip', thumb && 'crm-chip--thumb')}
      onClick={() => (isAudio ? setPlaying(true) : onOpen(f))}
      aria-label={isAudio ? `Přehrát ${name}` : `Otevřít ${name}`}
    >
      {thumb ? (
        <img className="crm-chip__thumb" src={thumb} alt="" onError={() => setBrokenUrl(thumb)} />
      ) : (
        <Icon name={isAudio ? 'play' : FILE_KIND_ICON[f.kind]} size={14} className="crm-chip__icon" />
      )}
      <span className="crm-chip__name">{label ?? f.name}</span>
      <span className="crm-chip__meta tnum">{meta}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Formulář poznámky (nová i úprava)                                   */
/* ------------------------------------------------------------------ */

const CREATE_KINDS: NoteKind[] = ['note', 'call', 'session'];

function NoteForm({ clientId, note, initialKind = 'note', onDone }: { clientId: Id; note?: Note; initialKind?: NoteKind; onDone: (noteId: Id | null) => void }): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const run = useCommand();
  const storage = useFileStorage();
  const compact = useMatchMedia('(max-width: 640px)');
  const formId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<NoteKind>(note?.kind ?? initialKind);
  const [title, setTitle] = useState(note?.title ?? '');
  const [text, setText] = useState(note?.text ?? '');
  const [at, setAt] = useState<string>(note?.at ?? now);
  const [atTouched, setAtTouched] = useState(!!note);
  const [bookingId, setBookingId] = useState<string>(note?.bookingId ?? '');
  const [pending, setPending] = useState<File[]>([]);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  const bookings = useMemo(() => linkableBookings(clinic, clientId), [clinic, clientId]);
  const showBooking = kind === 'session' || kind === 'plaud' || !!bookingId;
  const bookingOptions = [
    { value: '', label: 'Bez schůzky' },
    ...bookings.slice(0, 80).map((b) => {
      const other = sessionNoteOfBooking(clinic, b.id);
      const taken = kind === 'session' && !!other && other.id !== note?.id;
      return { value: b.id, label: bookingLabel(clinic, b, now) + (taken ? ' – už má zápis' : ''), disabled: taken };
    }),
  ];

  const kinds = note ? NOTE_KINDS : CREATE_KINDS;
  const trimmedTitle = title.trim();
  const trimmedText = text.trim();
  const hasTranscript = !!note?.plaud?.transcriptFileId;
  const max = fileMaxBytes();
  const errors = {
    title: trimmedTitle.length > NOTE_TITLE_MAX ? `Nadpis může mít nejvýše ${NOTE_TITLE_MAX} znaků.` : undefined,
    text:
      trimmedText.length > NOTE_TEXT_MAX
        ? `Text je příliš dlouhý (max. ${formatNumber(NOTE_TEXT_MAX)} znaků). Dlouhý přepis vložte jako soubor.`
        : !trimmedText && !trimmedTitle && !(kind === 'plaud' && hasTranscript)
          ? 'Napište text poznámky nebo aspoň nadpis.'
          : undefined,
    at: isValidLocalDateTime(at) ? undefined : 'Zadejte datum a čas.',
    files: pending.some((f) => f.size > max) ? `Některý soubor je větší než ${formatFileSize(max)}.` : undefined,
  };
  const invalid = Object.values(errors).some(Boolean);
  const show = (m: string | undefined): string | undefined => (touched ? m : undefined);

  const pickBooking = (id: string): void => {
    setBookingId(id);
    const b = id ? getBooking(clinic, id) : undefined;
    if (b && (!atTouched || kind === 'session')) setAt(b.start);
  };

  const changeKind = (k: NoteKind): void => {
    setKind(k);
    if (k === 'session' && bookingId) {
      const b = getBooking(clinic, bookingId);
      if (b) setAt(b.start);
    }
  };

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setTouched(true);
    if (invalid || busy) return;
    if (note) {
      const r = run(
        updateNote,
        { noteId: note.id, patch: { kind, title: trimmedTitle, text: trimmedText, at: at as LocalDateTime, bookingId: bookingId || null } },
        { success: 'Změny jsou uložené' },
      );
      if (r.ok) onDone(note.id);
      return;
    }
    const r = run(
      addNote,
      { clientId, kind, title: trimmedTitle, text: trimmedText, at: at as LocalDateTime, bookingId: bookingId || null },
      { success: pending.length ? undefined : NOTE_SAVED[kind] },
    );
    if (!r.ok) return;
    if (pending.length) {
      setBusy(true);
      let saved = 0;
      for (const f of pending) {
        try {
          const stored = await storeBlob(f, f.name);
          if (recordStoredBlob(run, { clientId, noteId: r.value }, stored)) saved++;
        } catch (err) {
          toast.error(`Přílohu „${f.name}“ se nepodařilo uložit.`, { description: err instanceof Error ? err.message : undefined });
        }
      }
      setBusy(false);
      toast.success(NOTE_SAVED[kind], {
        description: saved ? `Přiloženo: ${countLabel(saved, ['soubor', 'soubory', 'souborů'])}` : undefined,
      });
    }
    onDone(r.value);
  };

  return (
    <form id={formId} className="crm-noteform" onSubmit={(e) => void submit(e)} noValidate aria-label={note ? 'Úprava poznámky' : 'Nová poznámka'}>
      <div className="crm-noteform__top">
        {compact ? (
          <Field label="Druh záznamu">
            <Select value={kind} onValueChange={(v) => changeKind(v as NoteKind)} options={kinds.map((k) => ({ value: k, label: NOTE_KIND_LABEL[k] }))} />
          </Field>
        ) : (
          <Segmented
            aria-label="Druh záznamu"
            size="sm"
            value={kind}
            onChange={changeKind}
            options={kinds.map((k) => ({ value: k, label: NOTE_KIND_LABEL[k], icon: NOTE_KIND_ICON[k] }))}
          />
        )}
      </div>
      <div className="crm-form__row crm-form__row--even">
        <Field label="Kdy" error={show(errors.at)}>
          <Input
            type="datetime-local"
            value={at}
            step={60}
            onValueChange={(v) => {
              setAt(v);
              setAtTouched(true);
            }}
          />
        </Field>
        {showBooking ? (
          <Field label="Schůzka" optional hint={bookings.length ? undefined : 'Klient zatím nemá žádnou schůzku.'}>
            <Select value={bookingId} options={bookingOptions} onValueChange={pickBooking} disabled={!bookings.length} />
          </Field>
        ) : (
          <Field label="Nadpis" optional error={show(errors.title)}>
            <Input value={title} maxLength={NOTE_TITLE_MAX} onValueChange={setTitle} placeholder={kind === 'call' ? 'Např. domluva freetalku' : 'Např. cíle klienta'} />
          </Field>
        )}
      </div>
      {showBooking && (
        <Field label="Nadpis" optional error={show(errors.title)}>
          <Input value={title} maxLength={NOTE_TITLE_MAX} onValueChange={setTitle} placeholder="Např. práce s trémou" />
        </Field>
      )}
      <Field
        label="Text"
        error={show(errors.text)}
        hint={`${kind === 'session' || kind === 'plaud' ? 'Text lze poslat klientovi e-mailem. ' : ''}${formatNumber(trimmedText.length)} / ${formatNumber(NOTE_TEXT_MAX)} znaků`}
      >
        <Textarea
          rows={note ? 8 : 5}
          value={text}
          onValueChange={setText}
          autoFocus={!note}
          placeholder={
            kind === 'call'
              ? 'S kým, o čem a co je domluveno…'
              : kind === 'session'
                ? 'Co jsme na sezení probrali a na čem klient do příště pracuje…'
                : 'Postřehy, cíle, souvislosti…'
          }
        />
      </Field>

      {!note && storage.status === 'ok' && (
        <div className="crm-pick">
          <input
            ref={fileRef}
            type="file"
            multiple
            className="visually-hidden"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []);
              e.target.value = '';
              setPending((list) => [...list, ...picked.filter((f) => !list.some((x) => x.name === f.name && x.size === f.size))]);
            }}
          />
          {pending.map((f, i) => (
            <span key={f.name + f.size} className="crm-picked">
              <Icon name="file" size={14} />
              <span className="crm-picked__name">{f.name}</span>
              <span className="crm-picked__size tnum">{formatFileSize(f.size)}</span>
              <IconButton icon="x" size="sm" label={`Odebrat ${f.name}`} onClick={() => setPending((list) => list.filter((_, k) => k !== i))} />
            </span>
          ))}
          <Button size="sm" variant="ghost" icon="plus" onClick={() => fileRef.current?.click()}>
            {pending.length ? 'Přidat další přílohu' : 'Přiložit soubory'}
          </Button>
          {show(errors.files) && <p className="crm-error">{errors.files}</p>}
        </div>
      )}

      <div className="crm-noteform__actions">
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => onDone(null)}>
          Zpět
        </Button>
        <Button size="sm" variant="primary" type="submit" icon="check" loading={busy}>
          {note ? 'Uložit změny' : 'Uložit poznámku'}
        </Button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Zápis ze sezení – výběr schůzky                                     */
/* ------------------------------------------------------------------ */

function SessionNoteDialog({ clientId, onClose, onWithoutBooking }: { clientId: Id; onClose: () => void; onWithoutBooking: () => void }): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const bookings = useMemo(() => linkableBookings(clinic, clientId), [clinic, clientId]);
  const [bookingId, setBookingId] = useState<Id>(() => defaultSessionBooking(bookings, (id) => !!sessionNoteOfBooking(clinic, id), now)?.id ?? '');
  const options = bookings.slice(0, 80).map((b) => ({
    value: b.id,
    label: bookingLabel(clinic, b, now) + (sessionNoteOfBooking(clinic, b.id) ? ' – zápis hotový' : b.start > now ? ' – teprve proběhne' : ''),
  }));

  return (
    <Dialog
      open
      onClose={onClose}
      title="Zápis ze sezení"
      description="Vyberte schůzku – zápis se k ní uloží a můžete ho poslat klientovi."
      size="lg"
    >
      {bookings.length === 0 ? (
        <EmptyState
          compact
          icon="calendar"
          title="Klient zatím nemá žádnou schůzku"
          text="Zápis můžete napsat i bez navázání na schůzku."
          action={
            <Button variant="primary" icon="edit" onClick={onWithoutBooking}>
              Napsat zápis bez schůzky
            </Button>
          }
        />
      ) : (
        <div className="crm-form">
          <Field label="Schůzka">
            <Select value={bookingId} options={options} onValueChange={setBookingId} />
          </Field>
          {bookingId && <SessionNoteEditor key={bookingId} bookingId={bookingId} onDone={onClose} />}
          <button type="button" className="link crm-form__aside" onClick={onWithoutBooking}>
            Napsat zápis bez schůzky
          </button>
        </div>
      )}
    </Dialog>
  );
}
