import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Booking, ClinicState, FileKind, FileRecord, Id, LocalDateTime, NoteKind, Tone } from '../../domain/types';
import { addFileRecord, deleteNote, removeFileRecord } from '../../engine/commands';
import { formatDayShort, formatFileSize, formatTime } from '../../engine/format';
import { bookingsOfClient, getService, getTherapist, therapistShort } from '../../engine/selectors';
import { canStoreFiles, deleteStoredFile, fileErrorMessage, fileKindOf, fileMaxBytes, getFileUrl, storeFile } from '../../store/files';
import type { useCommand } from '../../store/hooks';
import { getStoreState } from '../../store/store';
import { toast, type IconName } from '../../ui';

/** Funkce vrácená z useCommand(). */
export type RunCommand = ReturnType<typeof useCommand>;

/* ------------------------------------------------------------------ */
/* Druhy poznámek a souborů                                            */
/* ------------------------------------------------------------------ */

export const NOTE_KIND_ICON: Record<NoteKind, IconName> = {
  note: 'edit',
  session: 'clipboard',
  plaud: 'message',
  call: 'phone',
};

export const NOTE_KIND_TONE: Record<NoteKind, Tone> = {
  note: 'slate',
  session: 'teal',
  plaud: 'violet',
  call: 'blue',
};

/** Potvrzení po uložení (správný rod podle druhu). */
export const NOTE_SAVED: Record<NoteKind, string> = {
  note: 'Poznámka je uložená',
  session: 'Zápis ze sezení je uložený',
  plaud: 'Plaud import je uložený',
  call: 'Telefonát je uložený',
};

/** Popisky filtru (množné číslo). */
export const NOTE_KIND_PLURAL: Record<NoteKind, string> = {
  note: 'Poznámky',
  session: 'Zápisy ze sezení',
  plaud: 'Plaud',
  call: 'Telefonáty',
};

export const FILE_KIND_ICON: Record<FileKind, IconName> = {
  image: 'eye',
  audio: 'activity',
  video: 'video',
  pdf: 'file',
  text: 'list',
  other: 'layers',
};

export const FILE_KIND_PLURAL: Record<FileKind, string> = {
  image: 'Fotky',
  audio: 'Audio',
  video: 'Video',
  pdf: 'PDF',
  text: 'Texty',
  other: 'Ostatní',
};

export const FILE_KIND_ORDER: readonly FileKind[] = ['image', 'audio', 'video', 'pdf', 'text', 'other'];

/* ------------------------------------------------------------------ */
/* Hooks                                                               */
/* ------------------------------------------------------------------ */

/** Odpovídá mediální dotaz (např. telefon)? */
export function useMatchMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
      const mq = window.matchMedia(query);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  );
}

export interface FileStorageState {
  status: 'checking' | 'ok' | 'unavailable';
  /** Česky, proč nelze soubory ukládat (jen u 'unavailable'). */
  reason: string | null;
}

/** Výsledek kontroly podle druhu úložiště (artefakt / lokálně) – v jedné záložce se nemění. */
const storageChecks = new Map<string, Promise<FileStorageState>>();
const storageResolved = new Map<string, FileStorageState>();

function checkStorage(): { key: string; promise: Promise<FileStorageState> } {
  const key = String(getStoreState().storage);
  let promise = storageChecks.get(key);
  if (!promise) {
    promise = canStoreFiles().then(
      (r): FileStorageState => (r.ok ? { status: 'ok', reason: null } : { status: 'unavailable', reason: r.reason }),
      (): FileStorageState => ({ status: 'unavailable', reason: 'Soubory teď nelze ukládat – úložiště není dostupné.' }),
    );
    promise.then((st) => storageResolved.set(key, st));
    storageChecks.set(key, promise);
  }
  return { key, promise };
}

/** Lze v tomto zobrazení ukládat soubory? (canStoreFiles, výsledek se sdílí mezi komponentami) */
export function useFileStorage(): FileStorageState {
  const [state, setState] = useState<FileStorageState>(
    () => storageResolved.get(String(getStoreState().storage)) ?? { status: 'checking', reason: null },
  );
  useEffect(() => {
    let alive = true;
    const { promise } = checkStorage();
    promise.then((st) => {
      if (alive) setState((prev) => (prev.status === st.status && prev.reason === st.reason ? prev : st));
    });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

export interface FileUrlState {
  url: string | null;
  error: string | null;
  loading: boolean;
}

/** Adresa obsahu souboru pro <img>/<audio>/<video>. `enabled: false` = zatím nenačítat. */
export function useFileUrl(rec: Pick<FileRecord, 'storage' | 'ref' | 'mime'> | null | undefined, enabled = true): FileUrlState {
  const [state, setState] = useState<FileUrlState>({ url: null, error: null, loading: false });
  const storage = rec?.storage;
  const ref = rec?.ref;
  const mime = rec?.mime;
  useEffect(() => {
    if (!storage || !ref || !mime || !enabled) {
      setState({ url: null, error: null, loading: false });
      return undefined;
    }
    let alive = true;
    setState({ url: null, error: null, loading: true });
    getFileUrl({ storage, ref, mime }).then(
      (url) => {
        if (alive) setState({ url, error: null, loading: false });
      },
      (e) => {
        if (alive) setState({ url: null, error: fileErrorMessage(e), loading: false });
      },
    );
    return () => {
      alive = false;
    };
  }, [storage, ref, mime, enabled]);
  return state;
}

/* ------------------------------------------------------------------ */
/* Ukládání souborů                                                    */
/* ------------------------------------------------------------------ */

/** Délka audia/videa z metadat (null, když ji prohlížeč nezjistí do 6 s). */
export function probeMediaDuration(blob: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
      resolve(null);
      return;
    }
    const url = URL.createObjectURL(blob);
    const el = document.createElement(blob.type.startsWith('video/') ? 'video' : 'audio');
    let done = false;
    const finish = (value: number | null): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      el.onloadedmetadata = null;
      el.ontimeupdate = null;
      el.onerror = null;
      el.removeAttribute('src');
      URL.revokeObjectURL(url);
      resolve(value !== null && Number.isFinite(value) && value > 0 ? value : null);
    };
    const timer = setTimeout(() => finish(null), 6000);
    el.preload = 'metadata';
    el.muted = true;
    el.onloadedmetadata = () => {
      if (Number.isFinite(el.duration)) {
        finish(el.duration);
        return;
      }
      // WebM z MediaRecorderu nemá délku v hlavičce – posun na konec ji dopočítá.
      el.ontimeupdate = () => finish(Number.isFinite(el.duration) ? el.duration : null);
      try {
        el.currentTime = 1e7;
      } catch {
        finish(null);
      }
    };
    el.onerror = () => finish(null);
    el.src = url;
  });
}

export interface StoredBlob {
  name: string;
  storage: FileRecord['storage'];
  ref: string;
  size: number;
  mime: string;
  kind: FileKind;
  durationSec: number | null;
}

/**
 * Uloží obsah souboru do úložiště (bez záznamu ve stavu). Vyhazuje Error s českou hláškou.
 * Délku audia/videa zjistí z metadat, pokud ji volající nezná.
 */
export async function storeBlob(blob: Blob, name: string, durationSec?: number | null): Promise<StoredBlob> {
  const max = fileMaxBytes();
  if (blob.size > max) {
    throw new Error(`Soubor „${name}“ má ${formatFileSize(blob.size)}, nahrát lze nejvýše ${formatFileSize(max)}.`);
  }
  let stored: Awaited<ReturnType<typeof storeFile>>;
  try {
    stored = await storeFile(blob, name);
  } catch (e) {
    throw new Error(fileErrorMessage(e));
  }
  const kind = fileKindOf(stored.mime, name);
  let duration = durationSec ?? null;
  if (duration === null && (kind === 'audio' || kind === 'video')) duration = await probeMediaDuration(blob);
  return { name, storage: stored.storage, ref: stored.ref, size: stored.size, mime: stored.mime, kind, durationSec: duration === null ? null : Math.round(duration) };
}

/** Zapíše uložený soubor ke klientovi (addFileRecord). Při chybě smaže uložená data. */
export function recordStoredBlob(
  run: RunCommand,
  input: { clientId: Id; noteId?: Id | null; caption?: string },
  stored: StoredBlob,
): Id | null {
  const r = run(
    addFileRecord,
    {
      clientId: input.clientId,
      noteId: input.noteId ?? null,
      name: stored.name,
      mime: stored.mime,
      size: stored.size,
      kind: stored.kind,
      storage: stored.storage,
      ref: stored.ref,
      durationSec: stored.durationSec,
      caption: input.caption ?? '',
    },
    { quiet: true },
  );
  if (!r.ok) {
    void deleteStoredFile(stored).catch(() => undefined);
    return null;
  }
  return r.value;
}

/** Úklid uložených dat, když se import nepovede. */
export function discardStored(list: StoredBlob[]): void {
  for (const s of list) void deleteStoredFile(s).catch(() => undefined);
}

/** Smaže poznámku i data jejích souborů. Vrací false, když příkaz selhal (chybu už ukázal toast). */
export async function deleteNoteWithFiles(run: RunCommand, noteId: Id): Promise<boolean> {
  const r = run(deleteNote, { noteId }, { success: 'Poznámka je smazaná' });
  if (!r.ok) return false;
  const results = await Promise.allSettled(r.value.fileRecords.map((f) => deleteStoredFile(f)));
  if (results.some((x) => x.status === 'rejected')) {
    toast.warning('Poznámka je smazaná, ale některé přílohy se nepodařilo odstranit z úložiště.');
  }
  return true;
}

/** Smaže soubor (záznam i data). Vrací false, když příkaz selhal. `quiet` = bez potvrzení (úklid). */
export async function deleteFileWithData(run: RunCommand, fileId: Id, quiet = false): Promise<boolean> {
  const r = run(removeFileRecord, { fileId }, quiet ? { quiet: true } : { success: 'Soubor je smazaný' });
  if (!r.ok) return false;
  try {
    await deleteStoredFile(r.value.record);
  } catch (e) {
    toast.warning('Záznam souboru je smazaný, ale data se nepodařilo odstranit z úložiště.', { description: fileErrorMessage(e) });
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Schůzky klienta pro výběr                                           */
/* ------------------------------------------------------------------ */

const LINKABLE: ReadonlySet<Booking['status']> = new Set(['completed', 'confirmed', 'no_show']);

/** Schůzky, ke kterým lze navázat zápis (proběhlé a naplánované), od nejnovější. */
export function linkableBookings(s: ClinicState, clientId: Id): Booking[] {
  return bookingsOfClient(s, clientId)
    .filter((b) => LINKABLE.has(b.status))
    .slice()
    .reverse();
}

/** 'Čt 15. 10. 9:00 · Mentální koučink · T. Malá' (rok jen mimo letošek). */
export function bookingLabel(s: ClinicState, b: Booking, now: LocalDateTime): string {
  const svc = getService(s, b.serviceId)?.name ?? 'Schůzka';
  const year = b.start.slice(0, 4) !== now.slice(0, 4) ? ' ' + b.start.slice(0, 4) : '';
  const t = getTherapist(s, b.therapistId);
  return `${formatDayShort(b.start)}${year} ${formatTime(b.start)} · ${svc}${t ? ' · ' + therapistShort(t) : ''}`;
}

/** Datum a čas události poznámky: 'Čt 15. 10. 9:00' (s rokem mimo letošek). */
export function noteWhen(at: LocalDateTime, now: LocalDateTime): string {
  const year = at.slice(0, 4) !== now.slice(0, 4) ? ' ' + at.slice(0, 4) : '';
  return `${formatDayShort(at)}${year} ${formatTime(at)}`;
}

/** Nejbližší vhodná schůzka pro nový zápis: poslední proběhlá bez zápisu, jinak nejbližší další. */
export function defaultSessionBooking(list: Booking[], hasNote: (bookingId: Id) => boolean, now: LocalDateTime): Booking | undefined {
  const past = list.filter((b) => b.start <= now);
  return past.find((b) => !hasNote(b.id)) ?? [...list].reverse().find((b) => b.start > now && !hasNote(b.id)) ?? past[0] ?? list[0];
}

/** Bezpečná část názvu souboru z textu. */
export function fileSafe(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 60) || 'soubor'
  );
}
