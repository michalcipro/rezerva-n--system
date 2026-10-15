import type { Client, ClinicState, LocalDateTime, Note } from '../domain/types';
import { inferStageId } from '../engine/crm';
import { defaultStages, SCHEMA_VERSION } from '../engine/defaults';
import { DEFAULT_TEMPLATES } from '../engine/messages';
import { clearSelectorCaches } from '../engine/selectors';
import { isoWeekKey, monthKey, nowLocal } from '../engine/time';

/**
 * Ukládání stavu kliniky.
 *  - Ve claude.ai artefaktu: sdílená databáze (`db` capability), stav rozdělený do dokumentů ≤ 180 kB.
 *  - Mimo artefakt (lokální vývoj): IndexedDB v prohlížeči.
 */

export type StorageKind = 'artifact' | 'local' | 'memory';

export type RemoteChange =
  | { kind: 'collection'; collection: CollectionName; items: unknown[] }
  | { kind: 'meta'; meta: Partial<ClinicState> };

export interface PersistenceAdapter {
  kind: StorageKind;
  load(): Promise<ClinicState | null>;
  save(state: ClinicState): Promise<void>;
  clear(): Promise<void>;
  /** Odběr změn od ostatních (jen sdílené úložiště). */
  subscribe?(onChange: (change: RemoteChange) => void): () => void;
  /** Načte aktuální stav ze serveru a nahlásí rozdíly odběrateli. */
  refresh?(): Promise<void>;
}

/* ------------------------------------------------------------------ */
/* Rozdělení stavu do dokumentů                                        */
/* ------------------------------------------------------------------ */

const META_KEYS = [
  'schema',
  'settings',
  'categories',
  'services',
  'rooms',
  'therapists',
  'timeOff',
  'groupTemplates',
  'cancelledSessions',
  'packageTemplates',
  'templates',
  'demoSeededAt',
] as const;

export const COLLECTIONS = [
  'clients',
  'bookings',
  'packages',
  'makeups',
  'waitlist',
  'ledger',
  'payments',
  'messages',
  'campaigns',
  'audit',
  'notes',
  'files',
  'followUps',
] as const;
export type CollectionName = (typeof COLLECTIONS)[number];

/**
 * Kolekce, které se při ukládání do artefaktu zapíšou (a potvrdí) před ostatními: záznamy, které do nich
 * přesouvá migrace (client.notes → notes), musí v databázi být dřív, než z klientů zmizí.
 */
const WRITE_FIRST: ReadonlySet<CollectionName> = new Set<CollectionName>(['notes', 'files', 'followUps']);

/** Největší velikost jednoho dokumentu v bajtech UTF-8 (limit databáze je 256 KiB, necháváme rezervu). */
export const MAX_CHUNK_BYTES = 180_000;

const encoder = new TextEncoder();

/** Velikost JSON v bajtech UTF-8 (čeština má dvoubajtové znaky, délka řetězce nestačí). */
export function utf8Bytes(text: string): number {
  return encoder.encode(text).length;
}

type Item = { id: string } & Record<string, unknown>;

function chunkKey(collection: CollectionName, item: Item, index: number): string {
  switch (collection) {
    case 'bookings':
      return isoWeekKey(String(item.start));
    case 'ledger':
    case 'payments':
    case 'audit':
    case 'notes':
      return monthKey(String(item.at));
    case 'messages':
      return isoWeekKey(String(item.at));
    case 'clients':
      return 'c' + Math.floor(index / 200);
    case 'packages':
      return 'p' + Math.floor(index / 300);
    default:
      return 'all';
  }
}

/** Rozdělí kolekci do dokumentů: { 'bookings/2026-W42': {items}, ... } */
export function chunkCollection(collection: CollectionName, items: readonly unknown[]): Map<string, unknown[]> {
  const groups = new Map<string, unknown[]>();
  items.forEach((raw, i) => {
    const key = chunkKey(collection, raw as Item, i);
    const list = groups.get(key);
    if (list) list.push(raw);
    else groups.set(key, [raw]);
  });
  const out = new Map<string, unknown[]>();
  for (const [key, list] of groups) {
    const size = utf8Bytes(JSON.stringify(list));
    if (size <= MAX_CHUNK_BYTES) {
      out.set(`${collection}/${key}`, list);
      continue;
    }
    // Velký blok: rozdělit postupně podle skutečné velikosti položek (každá část ≤ MAX_CHUNK_BYTES).
    let part: unknown[] = [];
    let partBytes = 2; // []
    let p = 0;
    for (const item of list) {
      const bytes = utf8Bytes(JSON.stringify(item)) + 1; // čárka
      if (part.length && partBytes + bytes > MAX_CHUNK_BYTES) {
        out.set(`${collection}/${key}~${p++}`, part);
        part = [];
        partBytes = 2;
      }
      part.push(item);
      partBytes += bytes;
    }
    if (part.length) out.set(`${collection}/${key}~${p}`, part);
  }
  return out;
}

export function metaOf(state: ClinicState): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  for (const k of META_KEYS) meta[k] = state[k];
  return meta;
}

/** Sestaví stav z dokumentů (meta + kolekce). */
export function assembleState(meta: Record<string, unknown> | null, collections: Partial<Record<CollectionName, unknown[]>>): ClinicState | null {
  if (!meta) return null;
  const state = { ...(meta as unknown as ClinicState) };
  for (const c of COLLECTIONS) (state as unknown as Record<string, unknown>)[c] = collections[c] ?? [];
  return normalizeState(state);
}

const sortBy = <T,>(arr: T[], key: (x: T) => string): T[] => arr.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));

/** Seřadí kopii kolekce stejně jako po načtení (pro změny od jiných zařízení). */
export function sortCollection(name: CollectionName, items: readonly unknown[]): unknown[] {
  const copy = [...items] as Record<string, string>[];
  switch (name) {
    case 'bookings':
      return sortBy(copy, (b) => b.start + b.id);
    case 'ledger':
    case 'payments':
    case 'messages':
    case 'audit':
    case 'notes':
    case 'files':
      return sortBy(copy, (x) => x.at + x.id);
    case 'followUps':
      return sortBy(copy, (f) => followUpKey(f as unknown as { due: string; dueTime: string | null; id: string }));
    case 'clients':
      return sortBy(copy, (c) => c.createdAt + c.id);
    default:
      return copy;
  }
}

const followUpKey = (f: { due: string; dueTime: string | null; id: string }): string => f.due + 'T' + (f.dueTime ?? '99:99') + f.id;

/* ------------------------------------------------------------------ */
/* Migrace (idempotentní – lze volat opakovaně)                        */
/* ------------------------------------------------------------------ */

/** Doplní CRM části nastavení: výchozí fáze spolupráce a šablonu „Zápis ze sezení“. Vrací true, když něco změnila. */
export function migrateMeta(s: Pick<ClinicState, 'settings' | 'templates'>): boolean {
  let changed = false;
  if (s.settings && (!Array.isArray(s.settings.stages) || s.settings.stages.length === 0)) {
    s.settings.stages = defaultStages();
    changed = true;
  }
  if (!Array.isArray(s.templates)) s.templates = [];
  for (const tpl of DEFAULT_TEMPLATES) {
    if (tpl.key === 'session_notes' && !s.templates.some((t) => t.key === tpl.key)) {
      s.templates.push(JSON.parse(JSON.stringify(tpl)));
      changed = true;
    }
  }
  return changed;
}

let migratedOnLoad = false;

/** Změnila poslední normalizace načtený stav (migrace)? Volání příznak vynuluje. */
export function takeMigrationFlag(): boolean {
  const v = migratedOnLoad;
  migratedOnLoad = false;
  return v;
}

/** Starou klinickou poznámku klienta převede na `Note` (id zůstává). */
function noteFromClinical(client: Client, n: Client['notes'][number]): Note {
  return {
    id: n.id,
    clientId: client.id,
    at: n.at,
    createdAt: n.at,
    updatedAt: null,
    authorId: n.therapistId ?? '',
    kind: 'note',
    title: '',
    text: n.text ?? '',
    bookingId: null,
    pinned: false,
    sentAt: null,
    plaud: null,
  };
}

/**
 * CRM migrace klientů: chybějící fáze podle historie schůzek (dokončená schůzka za 90 dní → Aktivní spolupráce,
 * jiná schůzka → Pozastaveno, bez schůzek → Potenciální klient), historie fází, přesun `client.notes` do `notes`.
 * Vrací true, když něco změnila.
 */
export function migrateClients(s: ClinicState, now: LocalDateTime): boolean {
  let changed = false;
  if (!Array.isArray(s.notes)) {
    s.notes = [];
    changed = true;
  }
  const stages = s.settings?.stages ?? [];
  const known = new Set(stages.map((st) => st.id));
  const first = [...stages].sort((a, b) => a.order - b.order)[0]?.id ?? '';
  const noteIds = new Set(s.notes.map((n) => n.id));
  for (const c of s.clients) {
    if (!c.stageId) {
      const inferred = inferStageId(s, c.id, now);
      c.stageId = known.has(inferred) ? inferred : first;
      changed = true;
    }
    if (!Array.isArray(c.stageHistory) || c.stageHistory.length === 0) {
      c.stageHistory = c.stageId ? [{ stageId: c.stageId, at: c.createdAt, actor: 'Systém' }] : [];
      changed = true;
    }
    if (!Array.isArray(c.notes)) {
      c.notes = [];
      changed = true;
    } else if (c.notes.length) {
      for (const n of c.notes) {
        if (noteIds.has(n.id)) continue;
        s.notes.push(noteFromClinical(c, n));
        noteIds.add(n.id);
      }
      c.notes = [];
      changed = true;
    }
  }
  if (changed) sortBy(s.notes, (n) => n.at + n.id);
  return changed;
}

/** Doplní chybějící pole, provede migrace a seřadí kolekce (po načtení z úložiště). */
export function normalizeState(s: ClinicState): ClinicState {
  let migrated = (s.schema ?? 0) < SCHEMA_VERSION;
  s.schema = Math.max(s.schema ?? 0, SCHEMA_VERSION);
  for (const c of COLLECTIONS) if (!Array.isArray((s as unknown as Record<string, unknown>)[c])) migrated = true;
  for (const c of COLLECTIONS) if (!Array.isArray((s as unknown as Record<string, unknown>)[c])) (s as unknown as Record<string, unknown>)[c] = [];
  s.cancelledSessions = s.cancelledSessions ?? [];
  s.timeOff = s.timeOff ?? [];
  sortBy(s.bookings, (b) => b.start + b.id);
  sortBy(s.ledger, (e) => e.at + e.id);
  sortBy(s.payments, (p) => p.at + p.id);
  sortBy(s.messages, (m) => m.at + m.id);
  sortBy(s.audit, (a) => a.at + a.id);
  sortBy(s.clients, (c) => c.createdAt + c.id);
  sortBy(s.notes, (n) => n.at + n.id);
  sortBy(s.files, (f) => f.at + f.id);
  sortBy(s.followUps, followUpKey);
  for (const w of s.waitlist) w.offeredStarts = w.offeredStarts ?? [];
  if (migrateMeta(s)) migrated = true;
  // indexy selektorů mohly vzniknout nad nesetříděnými poli
  clearSelectorCaches();
  if (migrateClients(s, s.settings?.simulatedNow ?? nowLocal())) migrated = true;
  if (migrated) migratedOnLoad = true;
  return s;
}

/* ------------------------------------------------------------------ */
/* Sdílená databáze artefaktu                                          */
/* ------------------------------------------------------------------ */

interface DbDocSnap {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}
interface DbQuerySnap {
  docs: DbDocSnap[];
  metadata: { hasPendingWrites: boolean; fromCache: boolean };
}
interface DbDocRef {
  get(): Promise<DbDocSnap>;
  set(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
}
interface DbCollectionRef {
  get(): Promise<DbQuerySnap>;
  onSnapshot(next: (s: DbQuerySnap) => void, error?: (e: { code: string; message: string }) => void): () => void;
}
interface Db {
  doc(path: string): DbDocRef;
  collection(path: string): DbCollectionRef;
}

declare global {
  interface Window {
    claude?: { use?: (name: string) => Promise<unknown> };
  }
}

export async function getArtifactDb(timeoutMs = 11000): Promise<Db | null> {
  try {
    const use = typeof window !== 'undefined' ? window.claude?.use : undefined;
    if (typeof use !== 'function') return null;
    const db = (await Promise.race([
      use.call(window.claude, 'db'),
      new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ])) as Db | null;
    return db ?? null;
  } catch {
    return null;
  }
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === 'unavailable' || code === 'resource_exhausted') {
      await new Promise((r) => setTimeout(r, 400 + Math.random() * 600));
      return fn();
    }
    throw e;
  }
}

async function inBatches<T>(items: T[], size: number, fn: (x: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

export function createArtifactAdapter(db: Db): PersistenceAdapter {
  /** Obsah dokumentů tak, jak ho naposledy známe ze serveru (cesta → JSON). */
  const known = new Map<string, string>();
  let lastSavedRefs: Partial<Record<string, unknown>> = {};
  /** Probíhá vlastní zápis – snímky změn mezitím ignorujeme a po zápisu se dorovnáme. */
  let busy = 0;
  let deferred = false;
  let listener: ((change: RemoteChange) => void) | null = null;

  const collectionDocs = (state: ClinicState, c: CollectionName): Map<string, unknown[]> =>
    chunkCollection(c, (state as unknown as Record<string, unknown[]>)[c]);

  /** Porovná dokumenty kolekce se známým stavem; při rozdílu vrátí změnu. */
  const processCollection = (c: CollectionName, docs: DbDocSnap[]): RemoteChange | null => {
    let changed = false;
    const present = new Set<string>();
    const items: unknown[] = [];
    for (const doc of docs) {
      const path = `${c}/${doc.id}`;
      present.add(path);
      const json = JSON.stringify((doc.data()?.items as unknown[]) ?? []);
      if (known.get(path) !== json) {
        changed = true;
        known.set(path, json);
      }
      items.push(...(JSON.parse(json) as unknown[]));
    }
    for (const path of [...known.keys()]) {
      if (path.startsWith(c + '/') && !present.has(path)) {
        known.delete(path);
        changed = true;
      }
    }
    if (!changed) return null;
    lastSavedRefs[c] = undefined;
    return { kind: 'collection', collection: c, items };
  };

  const processMeta = (doc: DbDocSnap | undefined): RemoteChange | null => {
    const meta = doc?.data()?.data as Record<string, unknown> | undefined;
    if (!meta) return null;
    const json = JSON.stringify(meta);
    if (known.get('clinic/meta') === json) return null;
    known.set('clinic/meta', json);
    return { kind: 'meta', meta: JSON.parse(json) as Partial<ClinicState> };
  };

  const refresh = async (): Promise<void> => {
    if (!listener) return;
    const metaSnap = await withRetry(() => db.doc('clinic/meta').get());
    const metaChange = processMeta(metaSnap.exists ? metaSnap : undefined);
    if (metaChange) listener(metaChange);
    for (const c of COLLECTIONS) {
      const snap = await withRetry(() => db.collection(c).get());
      const change = processCollection(c, snap.docs);
      if (change) listener(change);
    }
  };

  return {
    kind: 'artifact',
    async load() {
      const metaSnap = await withRetry(() => db.doc('clinic/meta').get());
      if (!metaSnap.exists) return null;
      const rawMeta = metaSnap.data()?.data as Record<string, unknown> | undefined;
      if (!rawMeta) return null;
      const metaJson = JSON.stringify(rawMeta);
      known.set('clinic/meta', metaJson);
      const meta = JSON.parse(metaJson) as Record<string, unknown>;
      const collections: Partial<Record<CollectionName, unknown[]>> = {};
      await Promise.all(
        COLLECTIONS.map(async (c) => {
          const snap = await withRetry(() => db.collection(c).get());
          const items: unknown[] = [];
          for (const doc of snap.docs) {
            const json = JSON.stringify((doc.data()?.items as unknown[]) ?? []);
            known.set(`${c}/${doc.id}`, json);
            // data ze snapshotu jsou zmrazená – pracujeme s kopií
            items.push(...(JSON.parse(json) as unknown[]));
          }
          collections[c] = items;
        }),
      );
      lastSavedRefs = {};
      return assembleState(meta, collections);
    },
    async save(state) {
      busy++;
      try {
        type Write = { path: string; body: Record<string, unknown> | null; json: string | null };
        // Dvě fáze: nejdřív CRM kolekce, až po jejich úspěšném zápisu zbytek. Migrace přesouvá client.notes do
        // kolekce notes – klienti s prázdným notes tak nikdy nejsou v databázi dřív než přesunuté poznámky.
        const phases: Write[][] = [[], []];
        const meta = metaOf(state);
        const metaJson = JSON.stringify(meta);
        if (known.get('clinic/meta') !== metaJson) phases[1].push({ path: 'clinic/meta', body: { data: meta }, json: metaJson });
        for (const c of COLLECTIONS) {
          const arr = (state as unknown as Record<string, unknown>)[c];
          if (lastSavedRefs[c] === arr) continue;
          const writes = phases[WRITE_FIRST.has(c) ? 0 : 1];
          const docs = collectionDocs(state, c);
          for (const [path, items] of docs) {
            const json = JSON.stringify(items);
            if (known.get(path) !== json) writes.push({ path, body: { items }, json });
          }
          for (const path of [...known.keys()]) {
            if (path.startsWith(c + '/') && !docs.has(path)) writes.push({ path, body: null, json: null });
          }
        }
        const write = async (w: Write): Promise<void> => {
          const prev = known.get(w.path);
          // známý stav aktualizujeme před zápisem, aby se vlastní změna nevracela jako „cizí"
          if (w.json === null) known.delete(w.path);
          else known.set(w.path, w.json);
          try {
            if (w.body) await withRetry(() => db.doc(w.path).set(w.body as Record<string, unknown>));
            else await withRetry(() => db.doc(w.path).delete());
          } catch (e) {
            if (prev === undefined) known.delete(w.path);
            else known.set(w.path, prev);
            throw e;
          }
        };
        for (const writes of phases) await inBatches(writes, 4, write);
        for (const c of COLLECTIONS) lastSavedRefs[c] = (state as unknown as Record<string, unknown>)[c];
      } finally {
        busy--;
      }
      if (busy === 0 && deferred) {
        deferred = false;
        await refresh();
      }
    },
    async clear() {
      busy++;
      try {
        const paths = [...known.keys()];
        await inBatches(paths, 4, async (p) => {
          await withRetry(() => db.doc(p).delete());
          known.delete(p);
        });
        lastSavedRefs = {};
      } finally {
        busy--;
      }
    },
    refresh,
    subscribe(onChange) {
      listener = onChange;
      const unsubs: (() => void)[] = [];
      unsubs.push(
        db.collection('clinic').onSnapshot(
          (snap) => {
            if (snap.metadata.hasPendingWrites || snap.metadata.fromCache) return;
            if (busy > 0) {
              deferred = true;
              return;
            }
            const change = processMeta(snap.docs.find((x) => x.id === 'meta'));
            if (change) onChange(change);
          },
          () => undefined,
        ),
      );
      for (const c of COLLECTIONS) {
        unsubs.push(
          db.collection(c).onSnapshot(
            (snap) => {
              if (snap.metadata.hasPendingWrites || snap.metadata.fromCache) return;
              if (busy > 0) {
                deferred = true;
                return;
              }
              const change = processCollection(c, snap.docs);
              if (change) onChange(change);
            },
            () => undefined,
          ),
        );
      }
      return () => {
        listener = null;
        unsubs.forEach((u) => u());
      };
    },
  };
}

/* ------------------------------------------------------------------ */
/* Lokální úložiště (IndexedDB)                                        */
/* ------------------------------------------------------------------ */

export const IDB_NAME = 'winningminds-rezervace';
/** 1 = jen stav kliniky, 2 = navíc úložiště souborů. */
export const IDB_VERSION = 2;
const IDB_STORE = 'state';
/** Binární obsah souborů klientů (klíč = FileRecord.ref). */
export const IDB_FILES_STORE = 'files';
const IDB_KEY = 'clinic';

let idbPromise: Promise<IDBDatabase | null> | null = null;

/** Otevře (sdílené) spojení s IndexedDB aplikace; null, když prohlížeč IndexedDB nemá nebo ji blokuje. */
export function openIdb(): Promise<IDBDatabase | null> {
  if (idbPromise) return idbPromise;
  idbPromise = new Promise<IDBDatabase | null>((resolve) => {
    let settled = false;
    const done = (db: IDBDatabase | null): void => {
      if (settled) return;
      settled = true;
      resolve(db);
    };
    try {
      if (typeof indexedDB === 'undefined') return done(null);
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
        if (!db.objectStoreNames.contains(IDB_FILES_STORE)) db.createObjectStore(IDB_FILES_STORE);
      };
      req.onsuccess = () => {
        const db = req.result;
        // novější verze aplikace v jiné záložce potřebuje databázi povýšit – uvolníme ji
        db.onversionchange = () => {
          db.close();
          idbPromise = null;
        };
        if (settled) db.close();
        else done(db);
      };
      req.onerror = () => done(null);
      // starší záložka drží databázi otevřenou – chvíli počkáme, pak pokračujeme bez ní
      req.onblocked = () => setTimeout(() => done(null), 4000);
    } catch {
      done(null);
    }
  }).then((db) => {
    if (!db) idbPromise = null;
    return db;
  });
  return idbPromise;
}

export async function createLocalAdapter(): Promise<PersistenceAdapter> {
  const idb = await openIdb();
  if (!idb) {
    let memory: ClinicState | null = null;
    return {
      kind: 'memory',
      async load() {
        return memory;
      },
      async save(state) {
        memory = state;
      },
      async clear() {
        memory = null;
      },
    };
  }
  const tx = <T,>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> =>
    new Promise((resolve) => {
      try {
        const t = idb.transaction(IDB_STORE, mode);
        const req = fn(t.objectStore(IDB_STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  return {
    kind: 'local',
    async load() {
      const raw = await tx<string>('readonly', (s) => s.get(IDB_KEY) as IDBRequest<string>);
      if (!raw) return null;
      try {
        return normalizeState(JSON.parse(raw) as ClinicState);
      } catch {
        return null;
      }
    },
    async save(state) {
      await tx('readwrite', (s) => s.put(JSON.stringify(state), IDB_KEY));
    },
    async clear() {
      await tx('readwrite', (s) => s.delete(IDB_KEY));
      // smazat i obsah souborů klientů
      await new Promise<void>((resolve) => {
        try {
          const t = idb.transaction(IDB_FILES_STORE, 'readwrite');
          const req = t.objectStore(IDB_FILES_STORE).clear();
          req.onsuccess = () => resolve();
          req.onerror = () => resolve();
        } catch {
          resolve();
        }
      });
    },
  };
}
