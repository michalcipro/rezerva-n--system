import type { FileKind, FileRecord, FileStorage } from '../domain/types';
import { formatFileSize, formatNumber, NBSP } from '../engine/format';
import { newId } from '../engine/ids';
import { IDB_FILES_STORE, openIdb } from './persistence';
import { getStoreState } from './store';

/**
 * Soubory klientů (fotky, audio, PDF, přepisy…). Jediné místo, které sahá na binární data – UI volá jen
 * funkce z tohoto modulu a záznam o souboru ukládá příkazem addFileRecord (docs/CRM.md).
 *
 *  - Artefakt (`storage === 'artifact'` ve store): assety artefaktu (`window.claude.use('assets')`).
 *    Typy, které asset přijímá, se nahrají přímo; nahrávka z mikrofonu (audio/webm, audio/mp4) jako video/webm
 *    / video/mp4; ostatní (mp3, wav, m4a, docx, svg…) jako base64 v text/plain assetu (`storage: 'asset-b64'`).
 *  - Lokálně: IndexedDB, úložiště `files` (`storage: 'local'`).
 *
 * Publikace artefaktu musí deklarovat `capabilities: { db: {}, assets: {}, downloads: true }`.
 */

/* ------------------------------------------------------------------ */
/* Limity a typy                                                       */
/* ------------------------------------------------------------------ */

const MiB = 1024 * 1024;
/** Limit originálu v artefaktu (base64 obal 15 MiB = 20 MiB, což je limit assetu). */
export const FILE_MAX_BYTES_ARTIFACT = 15 * MiB;
/** Limit lokálně (IndexedDB). */
export const FILE_MAX_BYTES_LOCAL = 100 * MiB;
/**
 * Limit velikosti souboru, který platí všude (artefakt 15 MiB). Lokálně je limit vyšší – přesnou hodnotu
 * pro aktuální úložiště vrací fileMaxBytes().
 */
export const FILE_MAX_BYTES: number = FILE_MAX_BYTES_ARTIFACT;

/** Limit velikosti souboru pro aktuální úložiště (artefakt 15 MiB, lokálně 100 MiB). */
export function fileMaxBytes(): number {
  return storageKind() === 'local' ? FILE_MAX_BYTES_LOCAL : FILE_MAX_BYTES_ARTIFACT;
}

/**
 * Typy, které se nahrají jako asset artefaktu přímo (bez fontů, CSS a skriptů – ty klienti nenahrávají).
 * SVG asset sice přijímá, ale jen do 2 MiB a uloží ho upravené (sanitizace) – SVG klienta proto jde jako
 * base64 (původní bajty, limit 15 MiB jako u ostatních souborů).
 */
const ASSET_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
  'application/pdf',
  'text/csv',
  'text/markdown',
  'application/json',
  'text/plain',
]);

/** Přípony, které lze v artefaktu nabídnout ke stažení (capability `downloads`). */
const DOWNLOAD_EXTENSIONS = new Set([
  'gif', 'png', 'jpg', 'jpeg', 'webp', 'mp4', 'webm', 'mov', 'txt', 'json', 'md',
  'docx', 'pptx', 'epub', 'csv', 'ttf', 'html', 'svg', 'pdf', 'xlsx', 'zip',
]);

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  heic: 'image/heic',
  heif: 'image/heif',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  flac: 'audio/flac',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  srt: 'application/x-subrip',
  vtt: 'text/vtt',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  rtf: 'application/rtf',
  zip: 'application/zip',
};

const TEXT_EXTENSIONS = new Set(['txt', 'md', 'markdown', 'csv', 'json', 'srt', 'vtt', 'log']);

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).trim().toLowerCase() : '';
}

/** Typ bez parametrů ('audio/webm;codecs=opus' → 'audio/webm'). */
function baseMime(type: string | undefined | null): string {
  return (type ?? '').split(';')[0].trim().toLowerCase();
}

/** Skutečný typ souboru: z blobu, jinak podle přípony. */
export function mimeOf(type: string | undefined | null, name: string): string {
  const m = baseMime(type);
  const ext = extOf(name);
  // .md bývá bez typu, .csv na Windows hlášené jako Excel
  if (!m || m === 'application/octet-stream') return MIME_BY_EXT[ext] ?? (m || 'application/octet-stream');
  if (ext === 'csv' && m === 'application/vnd.ms-excel') return 'text/csv';
  return m;
}

export function fileKindOf(mime: string, name: string): FileKind {
  const m = mimeOf(mime, name);
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('audio/')) return 'audio';
  if (m.startsWith('video/')) return 'video';
  if (m === 'application/pdf') return 'pdf';
  if (m.startsWith('text/') || m === 'application/json' || m === 'application/x-subrip' || TEXT_EXTENSIONS.has(extOf(name))) return 'text';
  return 'other';
}

/** Typ, pod kterým se soubor nahraje jako asset (null = uložit jako base64). */
export function assetUploadType(mime: string): string | null {
  if (ASSET_TYPES.has(mime)) return mime;
  // nahrávka z mikrofonu (MediaRecorder) – stejný kontejner, asset přijímá jen video/*
  if (mime === 'audio/webm') return 'video/webm';
  if (mime === 'audio/mp4') return 'video/mp4';
  // jiné textové formáty (titulky .srt, .vtt…) se uloží jako prostý text
  if (mime.startsWith('text/') || mime === 'application/x-subrip') return 'text/plain';
  return null;
}

/* ------------------------------------------------------------------ */
/* Chyby                                                               */
/* ------------------------------------------------------------------ */

/** Chyba úložiště souborů s českou hláškou v `message` (lze rovnou zobrazit). */
export class FileStoreError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'FileStoreError';
    this.code = code;
  }
}

const NO_EDIT_REASON = 'Soubory může nahrávat jen ten, kdo smí tento artefakt upravovat.';
const LOCAL_UNAVAILABLE = 'Prohlížeč nepovoluje ukládání souborů (IndexedDB není dostupná). Zkuste jiný prohlížeč nebo ukončete anonymní režim.';
const STORAGE_UNAVAILABLE = 'Soubory teď nelze ukládat – úložiště není dostupné.';

const limitLabel = (bytes: number): string => formatNumber(Math.round(bytes / MiB)) + NBSP + 'MB';

const codeOf = (e: unknown): string => ((e as { code?: unknown })?.code ? String((e as { code: unknown }).code) : 'upstream_error');

function assetErrorMessage(code: string, action: 'upload' | 'delete' | 'read'): string {
  switch (code) {
    case 'too_large':
      return `Soubor je příliš velký. Nahrát lze nejvýše ${limitLabel(FILE_MAX_BYTES_ARTIFACT)}.`;
    case 'quota_or_state':
      return 'Úložiště souborů je plné nebo teď nepřijímá změny. Smažte nepotřebné soubory a zkuste to znovu.';
    case 'rate_limited':
      return 'Příliš mnoho požadavků najednou. Chvíli počkejte a zkuste to znovu.';
    case 'store_unavailable':
      return 'Úložiště souborů je dočasně nedostupné. Zkuste to prosím za chvíli.';
    case 'unsupported_type':
      return 'Tento typ souboru nelze uložit.';
    case 'invalid_request':
      return 'Soubor se nepodařilo zpracovat. Zkuste ho uložit znovu nebo v jiném formátu.';
    case 'not_uploader':
      return 'Tento soubor nahrál někdo jiný – smazat ho může jen on nebo vlastník artefaktu.';
    case 'upstream_auth':
      return 'Přihlášení vypršelo. Obnovte stránku a zkuste to znovu.';
    case 'not_granted':
      return NO_EDIT_REASON;
    case 'capability_disabled':
    case 'capability_removed':
      return 'Ukládání souborů tu není dostupné.';
    default:
      return action === 'delete'
        ? 'Soubor se nepodařilo smazat. Zkuste to prosím znovu.'
        : action === 'read'
          ? 'Soubor se nepodařilo načíst. Zkuste to prosím znovu.'
          : 'Soubor se nepodařilo uložit. Zkuste to prosím znovu.';
  }
}

const toFileError = (e: unknown, action: 'upload' | 'delete' | 'read'): FileStoreError =>
  e instanceof FileStoreError ? e : new FileStoreError(codeOf(e), assetErrorMessage(codeOf(e), action));

/** Česká hláška k jakékoli chybě z tohoto modulu (pro toast). */
export function fileErrorMessage(e: unknown): string {
  if (e instanceof FileStoreError) return e.message;
  return assetErrorMessage(codeOf(e), 'upload');
}

/** Jeden opakovaný pokus při `store_unavailable` (přechodný výpadek platformy). */
async function retryOnce<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (codeOf(e) !== 'store_unavailable') throw e;
    await new Promise((r) => setTimeout(r, 800));
    return fn();
  }
}

/* ------------------------------------------------------------------ */
/* Capability artefaktu                                                */
/* ------------------------------------------------------------------ */

interface AssetsApi {
  upload(blob: Blob, options?: { type?: string }): Promise<{ id: string; url: string; sizeBytes: number; contentType: string }>;
  delete(ref: string): Promise<{ deleted: boolean }>;
}

interface DownloadsApi {
  save(request: { filename: string; data: string | Blob | ArrayBuffer | ArrayBufferView }): Promise<{ status: 'saved' | 'delivered' }>;
}

function useCapability<T>(name: string): Promise<T | null> {
  try {
    const host = typeof window !== 'undefined' ? window.claude : undefined;
    const use = host?.use;
    if (typeof use !== 'function') return Promise.resolve(null);
    return Promise.race([
      (use.call(host, name) as Promise<T | null>).then((x) => x ?? null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 11000)),
    ]).catch(() => null);
  } catch {
    return Promise.resolve(null);
  }
}

let assetsPromise: Promise<AssetsApi | null> | null = null;
let downloadsPromise: Promise<DownloadsApi | null> | null = null;
const getAssets = (): Promise<AssetsApi | null> => (assetsPromise ??= useCapability<AssetsApi>('assets'));
const getDownloads = (): Promise<DownloadsApi | null> => (downloadsPromise ??= useCapability<DownloadsApi>('downloads'));

function storageKind(): 'artifact' | 'local' | 'memory' | null {
  return getStoreState().storage;
}

/** Adresa assetu artefaktu (platí z každé stránky i verze artefaktu). */
const assetUrl = (id: string): string => '/_blob/' + id;

/* ------------------------------------------------------------------ */
/* Base64                                                              */
/* ------------------------------------------------------------------ */

export function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  const CHUNK = 3 * 8192; // násobek 3 → části lze spojit bez výplně uprostřed
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const sub = bytes.subarray(i, i + CHUNK);
    parts.push(btoa(String.fromCharCode.apply(null, sub as unknown as number[])));
  }
  return parts.join('');
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s+/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Text souboru: UTF-8, a když to není platné UTF-8, Windows-1250 (starší české soubory). */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    try {
      return new TextDecoder('windows-1250').decode(bytes);
    } catch {
      return new TextDecoder('utf-8').decode(bytes);
    }
  }
}

/* ------------------------------------------------------------------ */
/* IndexedDB                                                           */
/* ------------------------------------------------------------------ */

async function idbFiles<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openIdb();
  if (!db) throw new FileStoreError('unavailable', LOCAL_UNAVAILABLE);
  return new Promise<T>((resolve, reject) => {
    try {
      const t = db.transaction(IDB_FILES_STORE, mode);
      const req = fn(t.objectStore(IDB_FILES_STORE));
      t.oncomplete = () => resolve(req.result);
      const fail = (): void => {
        const err = t.error ?? req.error;
        reject(
          err?.name === 'QuotaExceededError'
            ? new FileStoreError('quota_or_state', 'V prohlížeči už není místo na další soubory. Smažte nepotřebné soubory.')
            : new FileStoreError('unavailable', mode === 'readonly' ? 'Soubor se nepodařilo načíst.' : 'Soubor se nepodařilo uložit do prohlížeče.'),
        );
      };
      t.onerror = fail;
      t.onabort = fail;
    } catch {
      reject(new FileStoreError('unavailable', LOCAL_UNAVAILABLE));
    }
  });
}

/* ------------------------------------------------------------------ */
/* Veřejné rozhraní                                                    */
/* ------------------------------------------------------------------ */

/** Lze v tomto zobrazení ukládat soubory? Když ne, UI nahrávání skryje a ukáže důvod. */
export async function canStoreFiles(): Promise<{ ok: true } | { ok: false; reason: string }> {
  const kind = storageKind();
  if (kind === 'artifact') return (await getAssets()) ? { ok: true } : { ok: false, reason: NO_EDIT_REASON };
  if (kind === 'local') return (await openIdb()) ? { ok: true } : { ok: false, reason: LOCAL_UNAVAILABLE };
  if (kind === 'memory') return { ok: false, reason: LOCAL_UNAVAILABLE };
  return { ok: false, reason: STORAGE_UNAVAILABLE };
}

/**
 * Uloží obsah souboru. Vrací údaje pro addFileRecord (storage, ref, size, mime).
 * Při chybě vyhodí FileStoreError s českou hláškou.
 */
export async function storeFile(blob: Blob, name: string): Promise<{ storage: FileStorage; ref: string; size: number; mime: string }> {
  const mime = mimeOf(blob.type, name);
  const size = blob.size;
  if (size === 0) throw new FileStoreError('invalid_request', 'Soubor je prázdný.');
  const max = fileMaxBytes();
  if (size > max) throw new FileStoreError('too_large', `Soubor má ${formatFileSize(size)}, nahrát lze nejvýše ${limitLabel(max)}.`);
  const kind = storageKind();
  if (kind === 'artifact') return storeAsset(blob, mime, size);
  if (kind === 'local') {
    const ref = newId('file');
    await idbFiles('readwrite', (s) => s.put(blob, ref));
    return { storage: 'local', ref, size, mime };
  }
  throw new FileStoreError('unavailable', kind === 'memory' ? LOCAL_UNAVAILABLE : STORAGE_UNAVAILABLE);
}

async function storeAsset(blob: Blob, mime: string, size: number): Promise<{ storage: FileStorage; ref: string; size: number; mime: string }> {
  const assets = await getAssets();
  if (!assets) throw new FileStoreError('not_granted', NO_EDIT_REASON);
  const direct = assetUploadType(mime);
  if (direct) {
    try {
      const r = await retryOnce(() => assets.upload(blob, { type: direct }));
      return { storage: 'asset', ref: r.id, size, mime };
    } catch (e) {
      const code = codeOf(e);
      // text v jiném kódování než UTF-8, nebo typ, který tento artefakt nepřijímá → uložit zabalený v base64
      if (code !== 'invalid_request' && code !== 'unsupported_type') throw toFileError(e, 'upload');
    }
  }
  const b64 = bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
  try {
    const r = await retryOnce(() => assets.upload(new Blob([b64], { type: 'text/plain' }), { type: 'text/plain' }));
    return { storage: 'asset-b64', ref: r.id, size, mime };
  } catch (e) {
    throw toFileError(e, 'upload');
  }
}

/** Obsah souboru jako Blob se skutečným typem. */
async function readBlob(rec: Pick<FileRecord, 'storage' | 'ref' | 'mime'>): Promise<Blob> {
  if (rec.storage === 'local') {
    const blob = await idbFiles<Blob | undefined>('readonly', (s) => s.get(rec.ref) as IDBRequest<Blob | undefined>);
    if (!blob) throw new FileStoreError('not_found', 'Soubor v tomto prohlížeči není – možná byl nahrán na jiném zařízení nebo smazán.');
    return blob.type === rec.mime ? blob : new Blob([blob], { type: rec.mime });
  }
  let res: Response;
  try {
    res = await fetch(assetUrl(rec.ref));
  } catch {
    throw new FileStoreError('upstream_error', 'Soubor se nepodařilo načíst. Zkontrolujte připojení a zkuste to znovu.');
  }
  if (!res.ok) {
    throw new FileStoreError(
      res.status === 404 ? 'not_found' : 'upstream_error',
      res.status === 404 ? 'Soubor se nepodařilo najít – možná byl mezitím smazán.' : 'Soubor se nepodařilo načíst. Zkuste to prosím znovu.',
    );
  }
  if (rec.storage === 'asset-b64') {
    try {
      return new Blob([base64ToBytes(await res.text())], { type: rec.mime });
    } catch {
      throw new FileStoreError('invalid_request', 'Soubor je poškozený a nejde otevřít.');
    }
  }
  return new Blob([await res.arrayBuffer()], { type: rec.mime });
}

const urlCache = new Map<string, string>();
const urlPending = new Map<string, Promise<string>>();

/** Adresa pro <img>/<audio>/<video>/<a>. Object URL se cachují podle `ref`. */
export function getFileUrl(rec: Pick<FileRecord, 'storage' | 'ref' | 'mime'>): Promise<string> {
  if (rec.storage === 'asset') return Promise.resolve(assetUrl(rec.ref));
  const hit = urlCache.get(rec.ref);
  if (hit) return Promise.resolve(hit);
  let pending = urlPending.get(rec.ref);
  if (!pending) {
    pending = readBlob(rec).then((blob) => {
      const url = URL.createObjectURL(blob);
      urlCache.set(rec.ref, url);
      return url;
    });
    urlPending.set(rec.ref, pending);
    const clear = (): void => {
      urlPending.delete(rec.ref);
    };
    pending.then(clear, clear);
  }
  return pending;
}

/** Textový obsah souboru (přepis z Plaud, poznámky .txt/.md/.srt…). */
export async function readFileText(rec: Pick<FileRecord, 'storage' | 'ref' | 'mime'>): Promise<string> {
  const blob = await readBlob(rec);
  return decodeText(new Uint8Array(await blob.arrayBuffer()));
}

/** Smaže obsah souboru z úložiště (po removeFileRecord / deleteNote). */
export async function deleteStoredFile(rec: Pick<FileRecord, 'storage' | 'ref'>): Promise<void> {
  const url = urlCache.get(rec.ref);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(rec.ref);
  }
  if (rec.storage === 'local') {
    await idbFiles('readwrite', (s) => s.delete(rec.ref));
    return;
  }
  const assets = await getAssets();
  if (!assets) throw new FileStoreError('not_granted', 'Soubory může mazat jen ten, kdo smí tento artefakt upravovat.');
  try {
    await retryOnce(() => assets.delete(rec.ref));
  } catch (e) {
    throw toFileError(e, 'delete');
  }
}

/**
 * Smaže obsah všech lokálně uložených souborů (IndexedDB) a uvolní cachované adresy – když se celý stav
 * nahrazuje (nová ukázková data), na staré soubory už žádný záznam neukazuje. Assety artefaktu zůstávají
 * (stejně jako při smazání všech dat). Nevyhazuje.
 */
export async function clearLocalFiles(): Promise<void> {
  for (const url of urlCache.values()) URL.revokeObjectURL(url);
  urlCache.clear();
  if (storageKind() !== 'local') return;
  try {
    await idbFiles('readwrite', (s) => s.clear());
  } catch {
    /* úložiště souborů není dostupné – není co mazat */
  }
}

export type DownloadResult = { ok: true } | { ok: false; reason: string; cancelled?: boolean };

/**
 * Nabídne soubor ke stažení pod jménem `name`. V artefaktu přes capability `downloads` (uživatel stažení
 * potvrdí; povolené jsou jen některé přípony), jinde klikem na <a download>. Nevyhazuje – vrací důvod.
 */
export async function downloadFile(rec: Pick<FileRecord, 'storage' | 'ref' | 'mime'>, name: string): Promise<DownloadResult> {
  const filename = name.trim() || 'soubor';
  if (storageKind() === 'artifact') {
    const ext = extOf(filename);
    if (!DOWNLOAD_EXTENSIONS.has(ext)) {
      return {
        ok: false,
        reason: ext
          ? `Soubor typu .${ext} tady stáhnout nejde – stáhnout lze jen obrázky, videa, PDF, texty, dokumenty Office, CSV a ZIP.`
          : 'Soubor bez přípony tady stáhnout nejde. Přejmenujte ho s příponou (např. .pdf).',
      };
    }
    const downloads = await getDownloads();
    if (!downloads) return { ok: false, reason: 'Stahování souborů tady není dostupné.' };
    let blob: Blob;
    try {
      blob = await readBlob(rec);
    } catch (e) {
      return { ok: false, reason: fileErrorMessage(e) };
    }
    try {
      await downloads.save({ filename, data: blob });
      return { ok: true };
    } catch (e) {
      switch (codeOf(e)) {
        case 'declined':
          return { ok: false, reason: 'Stažení bylo zrušeno.', cancelled: true };
        case 'rate_limited':
          return { ok: false, reason: 'Už čeká jiné stažení. Chvíli počkejte a zkuste to znovu.' };
        case 'rejected_extension':
        case 'extension_not_enabled':
        case 'not_signed':
          return { ok: false, reason: `Soubor typu .${ext} tady stáhnout nejde.` };
        case 'too_large':
          return { ok: false, reason: 'Soubor je na stažení příliš velký.' };
        default:
          return { ok: false, reason: 'Soubor se nepodařilo stáhnout. Zkuste to prosím znovu.' };
      }
    }
  }
  try {
    const url = await getFileUrl(rec);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: fileErrorMessage(e) };
  }
}
