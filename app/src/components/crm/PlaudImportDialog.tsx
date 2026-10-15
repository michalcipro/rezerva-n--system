import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import type { Id, LocalDateTime } from '../../domain/types';
import { addNote, updateFileRecord } from '../../engine/commands';
import { NOTE_TEXT_MAX, NOTE_TITLE_MAX } from '../../engine/crm';
import { countLabel, formatDate, formatFileSize, formatNumber } from '../../engine/format';
import { clientName, getBooking, getClient } from '../../engine/selectors';
import { isValidLocalDateTime } from '../../engine/time';
import { fileMaxBytes } from '../../store/files';
import { useClinic, useCommand, useNow } from '../../store/hooks';
import { Button, Callout, Dialog, Field, Icon, IconButton, Input, Segmented, Select, Textarea, toast } from '../../ui';
import {
  bookingLabel,
  deleteFileWithData,
  discardStored,
  fileSafe,
  linkableBookings,
  recordStoredBlob,
  storeBlob,
  useFileStorage,
  type StoredBlob,
} from './shared';
import './crm.css';

export interface PlaudImportDialogProps {
  open: boolean;
  onClose: () => void;
  clientId: Id;
  /** Předvybraná schůzka (např. z detailu schůzky). */
  bookingId?: Id | null;
  /** Po importu (id nové poznámky). */
  onImported?: (noteId: Id) => void;
}

type TranscriptMode = 'paste' | 'file';

const TRANSCRIPT_ACCEPT = '.txt,.md,.markdown,.srt,.vtt,text/plain,text/markdown';
const AUDIO_ACCEPT = 'audio/*,.mp3,.m4a,.wav,.webm,.ogg,.opus,.aac';

/**
 * Import z Plaud AI: Plaud nemá veřejné API, proto se shrnutí vloží jako text poznámky (druh 'plaud'),
 * přepis se uloží jako textový soubor (plaud.transcriptFileId) a volitelně audio a další přílohy.
 */
export function PlaudImportDialog({ open, onClose, clientId, bookingId, onImported }: PlaudImportDialogProps): JSX.Element | null {
  const clinic = useClinic();
  const now = useNow();
  const run = useCommand();
  const formId = useId();
  const storage = useFileStorage();
  const client = getClient(clinic, clientId);

  const [title, setTitle] = useState('');
  const [recordedAt, setRecordedAt] = useState<string>(now);
  const [atTouched, setAtTouched] = useState(false);
  const [booking, setBooking] = useState<string>('');
  const [summary, setSummary] = useState('');
  const [mode, setMode] = useState<TranscriptMode>('paste');
  const [transcriptText, setTranscriptText] = useState('');
  const [transcriptFile, setTranscriptFile] = useState<File | null>(null);
  const [audio, setAudio] = useState<File | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);
  const attachRef = useRef<HTMLInputElement>(null);

  const bookings = useMemo(() => linkableBookings(clinic, clientId), [clinic, clientId]);

  useEffect(() => {
    if (!open) return;
    const b = bookingId ? getBooking(clinic, bookingId) : undefined;
    setTitle('');
    setRecordedAt(b ? b.start : now);
    setAtTouched(false);
    setBooking(b ? b.id : '');
    setSummary('');
    setMode('paste');
    setTranscriptText('');
    setTranscriptFile(null);
    setAudio(null);
    setAttachments([]);
    setTouched(false);
    setBusy(null);
    // Jen při otevření.
  }, [open, bookingId]);

  if (!open) return null;

  const canFiles = storage.status === 'ok';
  const max = fileMaxBytes();
  const hasTranscript = canFiles && (mode === 'paste' ? !!transcriptText.trim() : !!transcriptFile);
  const tooBig = [transcriptFile, audio, ...attachments].filter((f): f is File => !!f && f.size > max);

  const errors = {
    title: title.trim().length > NOTE_TITLE_MAX ? `Nadpis může mít nejvýše ${NOTE_TITLE_MAX} znaků.` : undefined,
    recordedAt: isValidLocalDateTime(recordedAt) ? undefined : 'Zadejte datum a čas nahrávky.',
    summary:
      summary.trim().length > NOTE_TEXT_MAX
        ? `Shrnutí je příliš dlouhé (max. ${formatNumber(NOTE_TEXT_MAX)} znaků). Dlouhý text vložte jako přepis.`
        : !summary.trim() && !hasTranscript
          ? 'Vložte shrnutí nebo přepis nahrávky.'
          : undefined,
    files: tooBig.length ? `Příliš velké soubory (max. ${formatFileSize(max)}): ${tooBig.map((f) => f.name).join(', ')}.` : undefined,
  };
  const invalid = Object.values(errors).some(Boolean);
  const show = (m: string | undefined): string | undefined => (touched ? m : undefined);

  const bookingOptions = [
    { value: '', label: 'Bez schůzky' },
    ...bookings.slice(0, 60).map((b) => ({ value: b.id, label: bookingLabel(clinic, b, now) })),
  ];

  const pickBooking = (id: string): void => {
    setBooking(id);
    const b = id ? getBooking(clinic, id) : undefined;
    if (b && !atTouched) setRecordedAt(b.start);
  };

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setTouched(true);
    if (invalid || busy) return;
    const at = recordedAt as LocalDateTime;
    const noteTitle = title.trim() || `Plaud – ${formatDate(at)}`;

    // 1) Nejdřív uložit obsah souborů – když něco selže, nic se nezaloží.
    const stored: { blob: StoredBlob; role: 'transcript' | 'audio' | 'attachment' }[] = [];
    const jobs: { file: Blob; name: string; role: 'transcript' | 'audio' | 'attachment'; label: string }[] = [];
    if (hasTranscript) {
      if (mode === 'paste') {
        jobs.push({
          file: new Blob([transcriptText.trim()], { type: 'text/plain' }),
          name: `prepis-${fileSafe(noteTitle)}.txt`,
          role: 'transcript',
          label: 'přepis',
        });
      } else if (transcriptFile) {
        // Přepis (.txt, .md, .srt…) se ukládá jako prostý text.
        jobs.push({ file: new Blob([transcriptFile], { type: 'text/plain' }), name: transcriptFile.name, role: 'transcript', label: 'přepis' });
      }
    }
    if (canFiles && audio) jobs.push({ file: audio, name: audio.name, role: 'audio', label: 'audio' });
    if (canFiles) for (const f of attachments) jobs.push({ file: f, name: f.name, role: 'attachment', label: f.name });

    for (const [i, job] of jobs.entries()) {
      setBusy(jobs.length > 1 ? `Ukládám ${i + 1}/${jobs.length}: ${job.label}…` : `Ukládám ${job.label}…`);
      try {
        stored.push({ blob: await storeBlob(job.file, job.name), role: job.role });
      } catch (err) {
        discardStored(stored.map((s) => s.blob));
        setBusy(null);
        toast.error(job.role === 'transcript' ? 'Přepis se nepodařilo uložit.' : `Soubor „${job.name}“ se nepodařilo uložit.`, {
          description: err instanceof Error ? err.message : undefined,
        });
        return;
      }
    }

    // 2) Záznam přepisu (zatím bez poznámky), poznámka s odkazem na přepis, pak přílohy poznámky.
    const transcriptStored = stored.find((s) => s.role === 'transcript');
    const others = stored.filter((s) => s !== transcriptStored);
    let transcriptId: Id | null = null;
    if (transcriptStored) {
      transcriptId = recordStoredBlob(run, { clientId, caption: 'Přepis z Plaud' }, transcriptStored.blob);
      if (!transcriptId) {
        discardStored(others.map((s) => s.blob));
        setBusy(null);
        return;
      }
    }
    const r = run(addNote, {
      clientId,
      kind: 'plaud',
      title: noteTitle,
      text: summary.trim(),
      at,
      bookingId: booking || null,
      plaud: { recordedAt: at, transcriptFileId: transcriptId },
    });
    if (!r.ok) {
      if (transcriptId) void deleteFileWithData(run, transcriptId, true);
      discardStored(others.map((s) => s.blob));
      setBusy(null);
      return;
    }
    const noteId = r.value;
    if (transcriptId) run(updateFileRecord, { fileId: transcriptId, patch: { noteId } }, { quiet: true });
    let failed = 0;
    for (const s of others) {
      const id = recordStoredBlob(run, { clientId, noteId, caption: s.role === 'audio' ? 'Nahrávka z Plaud' : '' }, s.blob);
      if (!id) failed++;
    }
    setBusy(null);
    toast.success('Import z Plaud je uložený', {
      description: [
        transcriptId ? 'přepis jako soubor' : null,
        others.length - failed > 0 ? countLabel(others.length - failed, ['příloha', 'přílohy', 'příloh']) : null,
        failed ? `${countLabel(failed, ['soubor se neuložil', 'soubory se neuložily', 'souborů se neuložilo'])}` : null,
      ]
        .filter(Boolean)
        .join(' · ') || undefined,
    });
    onImported?.(noteId);
    onClose();
  };

  return (
    <Dialog
      open
      onClose={busy ? () => undefined : onClose}
      title="Import z Plaud"
      description={client ? `Shrnutí a přepis nahrávky ke klientovi ${clientName(client)}.` : undefined}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={!!busy}>
            Zpět
          </Button>
          <Button variant="primary" type="submit" form={formId} icon="upload" loading={!!busy}>
            {busy ?? 'Importovat'}
          </Button>
        </>
      }
    >
      <form id={formId} className="crm-form" onSubmit={(e) => void submit(e)} noValidate>
        <details className="crm-help">
          <summary>
            <Icon name="info" size={14} /> Jak data z Plaud dostat sem
          </summary>
          <ol className="crm-help__list">
            <li>
              V aplikaci Plaud otevřete nahrávku a zkopírujte <strong>shrnutí</strong> (Summary) – vložte ho do pole Shrnutí.
            </li>
            <li>
              Přepis exportujte přes <strong>Sdílet → Export → TXT</strong> (nebo Markdown) a soubor nahrajte, případně text přepisu zkopírujte a vložte.
            </li>
            <li>Audio můžete exportovat stejně (MP3 nebo M4A) a přiložit. Plaud nemá veřejné rozhraní, proto se data přenášejí ručně.</li>
          </ol>
        </details>

        <div className="crm-form__row crm-form__row--even">
          <Field label="Název" optional error={show(errors.title)}>
            <Input value={title} maxLength={NOTE_TITLE_MAX} placeholder={`Plaud – ${formatDate(isValidLocalDateTime(recordedAt) ? recordedAt : now)}`} onValueChange={setTitle} />
          </Field>
          <Field label="Datum a čas nahrávky" error={show(errors.recordedAt)}>
            <Input
              type="datetime-local"
              value={recordedAt}
              step={60}
              onValueChange={(v) => {
                setRecordedAt(v);
                setAtTouched(true);
              }}
            />
          </Field>
        </div>
        <Field label="Navázat na schůzku" optional hint={bookings.length ? undefined : 'Klient zatím nemá žádnou schůzku.'}>
          <Select value={booking} options={bookingOptions} onValueChange={pickBooking} disabled={!bookings.length} />
        </Field>
        <Field
          label="Shrnutí"
          error={show(errors.summary)}
          hint={`Uloží se jako text poznámky a lze ho poslat klientovi. ${formatNumber(summary.trim().length)} / ${formatNumber(NOTE_TEXT_MAX)} znaků`}
        >
          <Textarea rows={7} value={summary} onValueChange={setSummary} placeholder="Vložte shrnutí z Plaud (klíčové body, úkoly, závěry)…" />
        </Field>

        {storage.status === 'unavailable' ? (
          <Callout tone="info" title="Přepis a přílohy teď nelze uložit">
            {storage.reason} Uložit můžete aspoň shrnutí.
          </Callout>
        ) : (
          <>
            <fieldset className="crm-fieldset">
              <legend className="crm-eyebrow">Přepis</legend>
              <Segmented
                aria-label="Jak vložit přepis"
                size="sm"
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'paste', label: 'Vložit text' },
                  { value: 'file', label: 'Nahrát soubor' },
                ]}
              />
              {mode === 'paste' ? (
                <Textarea
                  aria-label="Text přepisu"
                  rows={6}
                  value={transcriptText}
                  onValueChange={setTranscriptText}
                  placeholder="Vložte přepis – uloží se jako textový soubor, délka není omezená."
                />
              ) : (
                <div className="crm-pick">
                  <input
                    ref={transcriptRef}
                    type="file"
                    className="visually-hidden"
                    tabIndex={-1}
                    aria-hidden="true"
                    accept={TRANSCRIPT_ACCEPT}
                    onChange={(e) => {
                      setTranscriptFile(e.target.files?.[0] ?? null);
                      e.target.value = '';
                    }}
                  />
                  {transcriptFile ? (
                    <PickedFile file={transcriptFile} onRemove={() => setTranscriptFile(null)} />
                  ) : (
                    <Button size="sm" icon="upload" onClick={() => transcriptRef.current?.click()}>
                      Vybrat soubor (.txt, .md, .srt)
                    </Button>
                  )}
                </div>
              )}
            </fieldset>

            <fieldset className="crm-fieldset">
              <legend className="crm-eyebrow">Audio a přílohy (nepovinné)</legend>
              <div className="crm-pick">
                <input
                  ref={audioRef}
                  type="file"
                  className="visually-hidden"
                  tabIndex={-1}
                  aria-hidden="true"
                  accept={AUDIO_ACCEPT}
                  onChange={(e) => {
                    setAudio(e.target.files?.[0] ?? null);
                    e.target.value = '';
                  }}
                />
                {audio ? (
                  <PickedFile file={audio} onRemove={() => setAudio(null)} />
                ) : (
                  <Button size="sm" icon="activity" onClick={() => audioRef.current?.click()}>
                    Přiložit audio (MP3, M4A, WAV)
                  </Button>
                )}
              </div>
              <div className="crm-pick">
                <input
                  ref={attachRef}
                  type="file"
                  multiple
                  className="visually-hidden"
                  tabIndex={-1}
                  aria-hidden="true"
                  onChange={(e) => {
                    const picked = Array.from(e.target.files ?? []);
                    e.target.value = '';
                    setAttachments((list) => [...list, ...picked.filter((f) => !list.some((x) => x.name === f.name && x.size === f.size))]);
                  }}
                />
                {attachments.map((f, i) => (
                  <PickedFile key={f.name + f.size} file={f} onRemove={() => setAttachments((list) => list.filter((_, k) => k !== i))} />
                ))}
                <Button size="sm" variant="ghost" icon="plus" onClick={() => attachRef.current?.click()}>
                  {attachments.length ? 'Přidat další přílohu' : 'Přidat přílohu (např. PDF)'}
                </Button>
              </div>
              {show(errors.files) && <p className="crm-error">{errors.files}</p>}
            </fieldset>
          </>
        )}
      </form>
    </Dialog>
  );
}

function PickedFile({ file, onRemove }: { file: File; onRemove: () => void }): JSX.Element {
  return (
    <span className="crm-picked">
      <Icon name="file" size={14} />
      <span className="crm-picked__name">{file.name}</span>
      <span className="crm-picked__size tnum">{formatFileSize(file.size)}</span>
      <IconButton icon="x" size="sm" label={`Odebrat ${file.name}`} onClick={onRemove} />
    </span>
  );
}
