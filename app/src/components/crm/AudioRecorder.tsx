import { useEffect, useMemo, useRef, useState } from 'react';
import type { Id } from '../../domain/types';
import { addNote } from '../../engine/commands';
import { NOTE_KIND_LABEL, notesOfClient } from '../../engine/crm';
import { formatClockDuration, formatDayShort, formatFileSize, formatTime } from '../../engine/format';
import { fileMaxBytes } from '../../store/files';
import { clinicNow, useClinic, useCommand, useNow } from '../../store/hooks';
import { Button, Callout, ConfirmDialog, Dialog, Field, Icon, Input, Select, toast } from '../../ui';
import { noteWhen, probeMediaDuration, recordStoredBlob, storeBlob, useFileStorage } from './shared';
import './crm.css';

/* ------------------------------------------------------------------ */
/* Nahrávání z mikrofonu                                               */
/* ------------------------------------------------------------------ */

export interface RecordedAudio {
  blob: Blob;
  /** Navržený název souboru (s příponou). */
  name: string;
  durationSec: number | null;
}

export interface AudioRecorderProps {
  /** Uložení nahrávky (nebo vybraného souboru). Může vrátit promise – do jejího dokončení je tlačítko zaneprázdněné. */
  onSave: (audio: RecordedAudio) => void | Promise<unknown>;
  /** Zavřít bez uložení (tlačítko Zpět). */
  onCancel?: () => void;
  saveLabel?: string;
  /**
   * Hlásí, zda je rozpracovaná nahrávka, která by se zavřením ztratila (nahrává se, pozastaveno, nebo ukončeno
   * a neuloženo). Dialog podle toho před zavřením požádá o potvrzení.
   */
  onUnsavedChange?: (unsaved: boolean) => void;
}

type Phase = 'idle' | 'starting' | 'recording' | 'paused' | 'stopped' | 'error';

const PREFERRED_TYPES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'];

function pickMimeType(): string {
  const MR = typeof window !== 'undefined' ? window.MediaRecorder : undefined;
  if (!MR || typeof MR.isTypeSupported !== 'function') return '';
  return PREFERRED_TYPES.find((t) => MR.isTypeSupported(t)) ?? '';
}

export function recordingSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof window !== 'undefined' && typeof window.MediaRecorder === 'function';
}

/** Česky, proč mikrofon nejde použít. */
function micErrorMessage(e: unknown): string {
  const name = (e as { name?: string })?.name ?? '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'Přístup k mikrofonu není povolený. Povolte ho v nastavení stránky v prohlížeči (ikona zámku vedle adresy). Když aplikace běží uvnitř claude.ai, mikrofon může být zakázaný úplně – nahrajte zvuk v telefonu (Diktafon) nebo v Plaud a soubor sem vložte.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'Nenašli jsme žádný mikrofon. Připojte ho, nebo nahrajte zvukový soubor z jiného zařízení.';
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'Mikrofon teď používá jiná aplikace nebo ho systém nepustil. Zavřete ostatní aplikace s mikrofonem a zkuste to znovu.';
    default:
      return 'Nahrávání se nepodařilo spustit. Zkuste to znovu, nebo nahrajte zvukový soubor.';
  }
}

const UNSUPPORTED =
  'Tento prohlížeč neumí nahrávat zvuk přímo v aplikaci (nebo to tady není povolené, např. uvnitř claude.ai). Nahrajte zvuk v telefonu nebo v Plaud a vložte sem soubor.';

/** Název nahrávky: 'Nahrávka 2026-10-15 0930.webm'. */
function recordingName(mime: string): string {
  const now = clinicNow();
  const ext = mime.includes('mp4') ? 'mp4' : mime.includes('ogg') ? 'ogg' : 'webm';
  return `Nahrávka ${now.slice(0, 10)} ${now.slice(11, 13)}${now.slice(14, 16)}.${ext}`;
}

/**
 * Nahrávání zvuku z mikrofonu (MediaRecorder): start, pauza, stop, poslech, zahodit, uložit.
 * Když mikrofon nejde použít, vysvětlí proč a nabídne nahrání zvukového souboru.
 */
export function AudioRecorder({ onSave, onCancel, saveLabel = 'Uložit nahrávku', onUnsavedChange }: AudioRecorderProps): JSX.Element {
  const supported = useMemo(recordingSupported, []);
  const [phase, setPhase] = useState<Phase>(supported ? 'idle' : 'error');
  const [error, setError] = useState<string | null>(supported ? null : UNSUPPORTED);
  const [elapsed, setElapsed] = useState(0);
  const [bytes, setBytes] = useState(0);
  const [result, setResult] = useState<{ blob: Blob; url: string; durationSec: number; name: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timingRef = useRef({ startedAt: 0, accumulated: 0 });
  const discardRef = useRef(false);
  const maxBytes = fileMaxBytes();

  const stopTracks = (): void => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const seconds = (): number => {
    const t = timingRef.current;
    return t.accumulated + (t.startedAt ? (Date.now() - t.startedAt) / 1000 : 0);
  };

  // Uvolnit mikrofon a náhled při zavření (StrictMode efekt spustí znovu – proto příznak nastavit i při připojení).
  useEffect(() => {
    discardRef.current = false;
    return () => {
      discardRef.current = true;
      const rec = recorderRef.current;
      if (rec && rec.state !== 'inactive') {
        try {
          rec.stop();
        } catch {
          /* už zastaveno */
        }
      }
      stopTracks();
    };
  }, []);
  useEffect(() => {
    const url = result?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [result?.url]);

  // Prohlížeč se ptá na povolení – po chvíli napovědět, co dělat, když se nic neukázalo.
  const [slowStart, setSlowStart] = useState(false);
  useEffect(() => {
    if (phase !== 'starting') {
      setSlowStart(false);
      return undefined;
    }
    const id = window.setTimeout(() => setSlowStart(true), 6000);
    return () => window.clearTimeout(id);
  }, [phase]);

  // Časomíra.
  useEffect(() => {
    if (phase !== 'recording') return undefined;
    const id = window.setInterval(() => setElapsed(seconds()), 250);
    return () => window.clearInterval(id);
  }, [phase]);

  const start = async (): Promise<void> => {
    if (!recordingSupported()) {
      setError(UNSUPPORTED);
      setPhase('error');
      return;
    }
    setPhase('starting');
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      setError(micErrorMessage(e));
      setPhase('error');
      return;
    }
    if (discardRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    streamRef.current = stream;
    const mimeType = pickMimeType();
    let rec: MediaRecorder;
    try {
      rec = mimeType ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 48000 }) : new MediaRecorder(stream);
    } catch (e) {
      stopTracks();
      setError(micErrorMessage(e));
      setPhase('error');
      return;
    }
    chunksRef.current = [];
    let size = 0;
    rec.ondataavailable = (ev) => {
      if (!ev.data || ev.data.size === 0) return;
      chunksRef.current.push(ev.data);
      size += ev.data.size;
      setBytes(size);
      // Nahrávka by se nevešla do úložiště – ukončit včas.
      if (size > maxBytes * 0.95 && rec.state === 'recording') {
        toast.warning('Nahrávka dosáhla maximální velikosti a byla ukončena.');
        stop();
      }
    };
    rec.onstop = () => {
      stopTracks();
      if (discardRef.current) return;
      const type = (rec.mimeType || mimeType || 'audio/webm').split(';')[0];
      const blob = new Blob(chunksRef.current, { type });
      chunksRef.current = [];
      if (!blob.size) {
        setError('Nahrávka je prázdná – mikrofon nic nezaznamenal. Zkuste to znovu.');
        setPhase('error');
        return;
      }
      const durationSec = Math.max(1, Math.round(seconds()));
      timingRef.current = { startedAt: 0, accumulated: 0 };
      setResult({ blob, url: URL.createObjectURL(blob), durationSec, name: recordingName(type) });
      setPhase('stopped');
    };
    rec.onerror = () => {
      stopTracks();
      setError('Nahrávání se přerušilo. Zkuste to znovu.');
      setPhase('error');
    };
    recorderRef.current = rec;
    timingRef.current = { startedAt: Date.now(), accumulated: 0 };
    setElapsed(0);
    setBytes(0);
    rec.start(1000);
    setPhase('recording');
  };

  const stop = (): void => {
    const rec = recorderRef.current;
    if (!rec || rec.state === 'inactive') return;
    const t = timingRef.current;
    if (t.startedAt) timingRef.current = { startedAt: 0, accumulated: t.accumulated + (Date.now() - t.startedAt) / 1000 };
    rec.stop();
  };

  const pause = (): void => {
    const rec = recorderRef.current;
    if (!rec || rec.state !== 'recording' || typeof rec.pause !== 'function') return;
    rec.pause();
    const t = timingRef.current;
    timingRef.current = { startedAt: 0, accumulated: t.accumulated + (Date.now() - t.startedAt) / 1000 };
    setElapsed(timingRef.current.accumulated);
    setPhase('paused');
  };

  const resume = (): void => {
    const rec = recorderRef.current;
    if (!rec || rec.state !== 'paused') return;
    rec.resume();
    timingRef.current = { ...timingRef.current, startedAt: Date.now() };
    setPhase('recording');
  };

  const discard = (): void => {
    setResult(null);
    setElapsed(0);
    setBytes(0);
    setPhase('idle');
  };

  const save = async (audio: RecordedAudio): Promise<void> => {
    setSaving(true);
    try {
      await onSave(audio);
    } finally {
      setSaving(false);
    }
  };

  const pickFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    const durationSec = await probeMediaDuration(file);
    await save({ blob: file, name: file.name, durationSec: durationSec === null ? null : Math.round(durationSec) });
  };

  const live = phase === 'recording' || phase === 'paused';
  const unsaved = live || (phase === 'stopped' && !!result);
  const unsavedRef = useRef(onUnsavedChange);
  unsavedRef.current = onUnsavedChange;
  useEffect(() => {
    unsavedRef.current?.(unsaved);
  }, [unsaved]);

  return (
    <div className="crm-rec">
      <input
        ref={fileRef}
        type="file"
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        accept="audio/*,.mp3,.m4a,.wav,.webm,.ogg,.opus,.aac,.flac"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          void pickFile(f);
        }}
      />

      {phase === 'error' ? (
        <Callout tone="warning" title="Mikrofon nejde použít">
          {error}
        </Callout>
      ) : (
        <div className={`crm-rec__panel crm-rec__panel--${phase}`}>
          <span className={`crm-rec__dot${phase === 'recording' ? ' is-live' : ''}`} aria-hidden="true" />
          <div className="crm-rec__time tnum" role="timer" aria-live="off">
            {formatClockDuration(phase === 'stopped' && result ? result.durationSec : elapsed)}
          </div>
          <div className="crm-rec__state" aria-live="polite">
            {phase === 'idle' && 'Připraveno k nahrávání'}
            {phase === 'starting' && 'Čekám na povolení mikrofonu…'}
            {phase === 'recording' && 'Nahrává se'}
            {phase === 'paused' && 'Pozastaveno'}
            {phase === 'stopped' && result && `Hotovo · ${formatFileSize(result.blob.size)}`}
            {live && bytes > 0 && <span className="crm-rec__size"> · {formatFileSize(bytes)}</span>}
          </div>
        </div>
      )}

      {slowStart && (
        <p className="crm-hint">
          Potvrďte v prohlížeči přístup k mikrofonu. Když se žádný dotaz neobjevil, mikrofon tu nejspíš není povolený – vyberte raději zvukový soubor.
        </p>
      )}

      {phase === 'stopped' && result && (
        <audio className="crm-rec__player" controls src={result.url} preload="metadata">
          Prohlížeč nepřehraje náhled nahrávky.
        </audio>
      )}

      <div className="crm-rec__actions">
        {(phase === 'idle' || phase === 'starting') && (
          <Button variant="primary" icon="activity" loading={phase === 'starting'} onClick={() => void start()}>
            Začít nahrávat
          </Button>
        )}
        {phase === 'recording' && (
          <>
            <Button variant="danger" icon="check" onClick={stop}>
              Ukončit
            </Button>
            {typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.prototype.pause === 'function' && (
              <Button icon="pause" onClick={pause}>
                Pozastavit
              </Button>
            )}
          </>
        )}
        {phase === 'paused' && (
          <>
            <Button variant="primary" icon="play" onClick={resume}>
              Pokračovat
            </Button>
            <Button variant="danger" icon="check" onClick={stop}>
              Ukončit
            </Button>
          </>
        )}
        {phase === 'stopped' && result && (
          <>
            <Button variant="primary" icon="check" loading={saving} onClick={() => void save({ blob: result.blob, name: result.name, durationSec: result.durationSec })}>
              {saveLabel}
            </Button>
            <Button variant="danger-secondary" icon="trash" disabled={saving} onClick={discard}>
              Zahodit
            </Button>
          </>
        )}
        {phase === 'error' && supported && (
          <Button icon="refresh" onClick={() => void start()}>
            Zkusit znovu
          </Button>
        )}
        <span className="spacer" />
        {onCancel && !live && (
          <Button variant="ghost" disabled={saving} onClick={onCancel}>
            Zpět
          </Button>
        )}
      </div>

      {!live && phase !== 'stopped' && (
        <p className="crm-rec__fallback">
          {phase === 'error' ? 'Místo nahrávání můžete vložit hotový zvukový soubor (MP3, M4A, WAV, WebM).' : 'Máte nahrávku z telefonu nebo z Plaud?'}{' '}
          <Button size="sm" variant={phase === 'error' ? 'primary' : 'ghost'} icon="upload" loading={saving} onClick={() => fileRef.current?.click()}>
            Vybrat zvukový soubor
          </Button>
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dialog: nahrát audio ke klientovi (a případně k poznámce)           */
/* ------------------------------------------------------------------ */

export interface AudioRecorderDialogProps {
  open: boolean;
  onClose: () => void;
  clientId: Id;
  /** Připojit k této poznámce (bez výběru). Bez něj dialog nabídne výběr poznámky nebo založení nové. */
  noteId?: Id | null;
  onSaved?: (fileId: Id, noteId: Id | null) => void;
}

const NEW_NOTE = '__new__';

/** Nahrání audia ke klientovi: nahrávka z mikrofonu nebo soubor, volitelně připojený k poznámce. */
export function AudioRecorderDialog({ open, onClose, clientId, noteId, onSaved }: AudioRecorderDialogProps): JSX.Element | null {
  const clinic = useClinic();
  const now = useNow();
  const run = useCommand();
  const storage = useFileStorage();
  const fixedNote = noteId !== undefined;
  const [target, setTarget] = useState<string>(NEW_NOTE);
  const [title, setTitle] = useState('');
  const [unsaved, setUnsaved] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  useEffect(() => {
    if (open) {
      setTarget(NEW_NOTE);
      setTitle('');
      setUnsaved(false);
      setConfirmClose(false);
    }
  }, [open]);

  // Esc, klik mimo dialog, křížek i Zpět: rozpracovanou nahrávku nezahodit bez potvrzení.
  const requestClose = (): void => {
    if (unsaved) setConfirmClose(true);
    else onClose();
  };

  const notes = notesOfClient(clinic, clientId);
  const noteOptions = useMemo(
    () => [
      { value: NEW_NOTE, label: 'Nová hlasová poznámka' },
      { value: '', label: 'Nepřipojovat – jen do Souborů' },
      ...notes.slice(0, 40).map((n) => ({ value: n.id, label: `${noteWhen(n.at, now)} · ${n.title || NOTE_KIND_LABEL[n.kind]}` })),
    ],
    [notes, now],
  );
  if (!open) return null;

  const fixed = fixedNote && noteId ? notes.find((n) => n.id === noteId) : undefined;

  const save = async (audio: RecordedAudio): Promise<void> => {
    let stored;
    try {
      stored = await storeBlob(audio.blob, audio.name, audio.durationSec);
    } catch (e) {
      toast.error('Nahrávku se nepodařilo uložit.', { description: e instanceof Error ? e.message : undefined });
      return;
    }
    let attachTo: Id | null = fixedNote ? noteId ?? null : target === NEW_NOTE ? null : target || null;
    if (!fixedNote && target === NEW_NOTE) {
      const at = clinicNow();
      const r = run(addNote, {
        clientId,
        kind: 'note',
        title: title.trim() || `Hlasová poznámka ${formatDayShort(at)} ${formatTime(at)}`,
        text: '',
        at,
      });
      if (r.ok) {
        attachTo = r.value;
      } else {
        // Nahrávku neztratit – uložit ji aspoň do Souborů.
        const id = recordStoredBlob(run, { clientId }, stored);
        if (id) {
          toast.warning('Poznámku se nepodařilo založit, nahrávka je uložená v Souborech.');
          onSaved?.(id, null);
          onClose();
        }
        return;
      }
    }
    const id = recordStoredBlob(run, { clientId, noteId: attachTo }, stored);
    if (!id) return;
    toast.success(attachTo ? 'Nahrávka je uložená u poznámky' : 'Nahrávka je uložená v Souborech');
    onSaved?.(id, attachTo);
    onClose();
  };

  return (
    <>
      <Dialog
        open
        onClose={requestClose}
        title="Nahrát audio"
        description={fixed ? `Připojí se k poznámce: ${fixed.title || NOTE_KIND_LABEL[fixed.kind]}` : 'Hlasová poznámka nebo záznam sezení. Nahrávku uslyšíte, než ji uložíte.'}
        size="md"
      >
        <div className="crm-form">
          {storage.status === 'unavailable' ? (
            <Callout tone="info" title="Ukládání souborů není dostupné">
              {storage.reason}
            </Callout>
          ) : (
            <>
              {!fixedNote && (
                <div className="crm-form__row crm-form__row--even">
                  <Field label="Připojit k">
                    <Select value={target} options={noteOptions} onValueChange={setTarget} />
                  </Field>
                  {target === NEW_NOTE && (
                    <Field label="Nadpis poznámky" optional>
                      <Input value={title} maxLength={120} placeholder="Hlasová poznámka" onValueChange={setTitle} />
                    </Field>
                  )}
                </div>
              )}
              <AudioRecorder onSave={save} onCancel={requestClose} onUnsavedChange={setUnsaved} />
              <p className="crm-hint">
                <Icon name="lock" size={12} /> Nahrávky vidí jen tým. Nahrávejte jen se souhlasem klienta.
              </p>
            </>
          )}
        </div>
      </Dialog>
      <ConfirmDialog
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        tone="danger"
        title="Zahodit nahrávku?"
        message="Nahrávka ještě není uložená. Když dialog zavřete, ztratí se a nepůjde obnovit."
        cancelLabel="Pokračovat s nahrávkou"
        confirmLabel="Zahodit nahrávku"
        onConfirm={() => {
          setConfirmClose(false);
          onClose();
        }}
      />
    </>
  );
}
