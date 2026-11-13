import type { ChunkData } from '../api/protocol';
import type { ClinicState } from '../domain/types';
import { COLLECTIONS, assembleState, chunkCollection, metaOf, type CollectionName } from './persistence';

type ChunkChange = ChunkData;

/**
 * Sdílené prohlížečem i serverem.
 * Převod stavu kliniky na části (stejné rozdělení jako v testovací verzi) a výpočet změněných částí.
 *   meta                      nastavení, katalog, šablony…
 *   bookings/2026-W46         rezervace po ISO týdnech
 *   clients/c0 …              kolekce podle persistence.chunkCollection
 */

export const META_KEY = 'meta';

/** Uložené části: klíč → JSON (porovnává se text, ne objekty). */
export type ChunkJson = Map<string, string>;

const collectionOf = (key: string): CollectionName | null => {
  const slash = key.indexOf('/');
  const name = slash < 0 ? key : key.slice(0, slash);
  return (COLLECTIONS as readonly string[]).includes(name) ? (name as CollectionName) : null;
};

/** Všechny části stavu jako JSON. */
export function stateToChunkJson(state: ClinicState): ChunkJson {
  const out: ChunkJson = new Map();
  out.set(META_KEY, JSON.stringify(metaOf(state)));
  for (const c of COLLECTIONS) {
    const items = (state as unknown as Record<string, unknown[]>)[c] ?? [];
    for (const [key, list] of chunkCollection(c, items)) out.set(key, JSON.stringify(list));
  }
  return out;
}

/** Sestaví stav z uložených částí (null = chybí meta, klinika nemá stav). */
export function chunksToState(chunks: Map<string, unknown>): ClinicState | null {
  const meta = chunks.get(META_KEY) as Record<string, unknown> | undefined;
  if (!meta) return null;
  const collections: Partial<Record<CollectionName, unknown[]>> = {};
  const keys = [...chunks.keys()].sort();
  for (const key of keys) {
    const c = collectionOf(key);
    const data = chunks.get(key);
    if (!c || !Array.isArray(data)) continue;
    (collections[c] ??= []).push(...data);
  }
  return assembleState(meta, collections);
}

/**
 * Změněné části mezi starým a novým stavem. Kolekce, které Immer nezměnil (stejná reference),
 * se vůbec neserializují; u ostatních se porovná JSON jednotlivých částí.
 */
export function computeChanges(prev: { state: ClinicState; chunkJson: ChunkJson }, next: ClinicState): { changes: ChunkChange[]; chunkJson: ChunkJson } {
  const changes: ChunkChange[] = [];
  const chunkJson: ChunkJson = new Map();

  const metaJson = JSON.stringify(metaOf(next));
  chunkJson.set(META_KEY, metaJson);
  if (prev.chunkJson.get(META_KEY) !== metaJson) changes.push({ key: META_KEY, data: JSON.parse(metaJson) });

  for (const c of COLLECTIONS) {
    const before = (prev.state as unknown as Record<string, unknown[]>)[c];
    const after = (next as unknown as Record<string, unknown[]>)[c] ?? [];
    const prefix = c + '/';
    if (before === after) {
      for (const [key, json] of prev.chunkJson) if (key.startsWith(prefix)) chunkJson.set(key, json);
      continue;
    }
    for (const [key, list] of chunkCollection(c, after)) {
      const json = JSON.stringify(list);
      chunkJson.set(key, json);
      if (prev.chunkJson.get(key) !== json) changes.push({ key, data: list });
    }
    for (const key of prev.chunkJson.keys()) {
      if (key.startsWith(prefix) && !chunkJson.has(key)) changes.push({ key, data: null });
    }
  }
  return { changes, chunkJson };
}
