import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { createArtifactAdapter, type RemoteChange } from '../src/store/persistence';
import { generateDemoState } from '../src/engine/seed';

/** Jednoduchá náhrada sdílené databáze artefaktu (dokumenty v paměti, okamžité snímky). */
function fakeDb() {
  const docs = new Map<string, Record<string, unknown>>();
  const listeners = new Map<string, Set<(s: unknown) => void>>();
  const freeze = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
  const snapOf = (collection: string) => ({
    docs: [...docs.entries()]
      .filter(([p]) => p.startsWith(collection + '/') && p.split('/').length === 2)
      .map(([p, body]) => ({ id: p.split('/')[1], exists: true, data: () => Object.freeze(freeze(body)) })),
    metadata: { hasPendingWrites: false, fromCache: false },
  });
  const notify = (path: string) => {
    const c = path.split('/')[0];
    for (const l of listeners.get(c) ?? []) l(snapOf(c));
  };
  let bytes = 0;
  return {
    docs,
    get maxDocBytes() {
      return bytes;
    },
    doc(path: string) {
      return {
        async get() {
          const body = docs.get(path);
          return { id: path.split('/')[1], exists: !!body, data: () => (body ? freeze(body) : undefined) };
        },
        async set(data: Record<string, unknown>) {
          const size = new TextEncoder().encode(JSON.stringify(data)).length;
          if (size > 256 * 1024) throw Object.assign(new Error('too big'), { code: 'invalid_argument' });
          bytes = Math.max(bytes, size);
          docs.set(path, freeze(data));
          notify(path);
        },
        async delete() {
          docs.delete(path);
          notify(path);
        },
      };
    },
    collection(path: string) {
      return {
        async get() {
          return snapOf(path);
        },
        onSnapshot(next: (s: never) => void) {
          const set = listeners.get(path) ?? new Set();
          set.add(next as (s: unknown) => void);
          listeners.set(path, set);
          return () => set.delete(next as (s: unknown) => void);
        },
      };
    },
  };
}

describe('sdílené úložiště artefaktu', () => {
  it('uloží a znovu načte celý stav po dokumentech do 256 KiB', async () => {
    const db = fakeDb();
    const state = generateDemoState('2026-10-14T10:40');
    const a = createArtifactAdapter(db as never);
    await a.save(state);
    expect(db.docs.size).toBeGreaterThan(10);
    expect(db.docs.size).toBeLessThan(200);
    expect(db.maxDocBytes).toBeLessThan(256 * 1024);
    const b = createArtifactAdapter(db as never);
    const loaded = await b.load();
    expect(loaded).not.toBeNull();
    expect(loaded!.bookings.length).toBe(state.bookings.length);
    expect(loaded!.clients.length).toBe(state.clients.length);
    expect(JSON.stringify(loaded!.settings)).toBe(JSON.stringify(state.settings));
  });

  it('druhé zařízení dostane změnu, vlastní zápis se nevrací jako cizí', async () => {
    const db = fakeDb();
    const state = generateDemoState('2026-10-14T10:40');
    const a = createArtifactAdapter(db as never);
    const aChanges: RemoteChange[] = [];
    a.subscribe!((c) => aChanges.push(c));
    await a.save(state);
    const b = createArtifactAdapter(db as never);
    const bState = (await b.load())!;
    const bChanges: RemoteChange[] = [];
    b.subscribe!((c) => bChanges.push(c));
    const next = produce(state, (d) => {
      d.clients[0].internalNote = 'Změna z prvního zařízení';
    });
    await a.save(next);
    expect(aChanges.length).toBe(0);
    const clientChange = bChanges.find((c) => c.kind === 'collection' && c.collection === 'clients');
    expect(clientChange).toBeTruthy();
    expect(bState.clients.length).toBe(state.clients.length);
  });
});
