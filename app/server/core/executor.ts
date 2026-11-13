import { produce } from 'immer';
import type { Actor, ClinicState, Command, CommandResult, LocalDateTime } from '../../src/domain/types';
import { sequentialIds, withIdGenerator } from '../../src/engine/ids';
import { clearSelectorCaches } from '../../src/engine/selectors';
import type { ChunkChange, StateStore } from '../store/types';
import { chunksToState, computeChanges, stateToChunkJson, type ChunkJson } from './state';

interface Loaded {
  version: number;
  state: ClinicState;
  chunkJson: ChunkJson;
}

export interface ExecOk {
  ok: true;
  value: unknown;
  notices: string[];
  version: number;
  /** Změněné části stavu (prázdné, když příkaz nic nezměnil). */
  changes: ChunkChange[];
  /** Příkaz se stejným ID už byl zapsán dřív (opakované odeslání) – nic se neprovedlo. */
  duplicate?: boolean;
}
export interface ExecFail {
  ok: false;
  error: string;
  version: number;
}
export type ExecResult = ExecOk | ExecFail;

/** Identifikátor příkazu od klienta: jen písmena, číslice a pomlčky (určuje ID nových záznamů). */
export const isValidCommandId = (id: unknown): id is string => typeof id === 'string' && /^[a-z0-9-]{8,40}$/i.test(id);

const MAX_ATTEMPTS = 4;

/**
 * Provádí příkazy enginu nad stavem kliniky uloženým v databázi. Stav drží v paměti (mezi požadavky
 * se jen dočítají změněné části) a zápis chrání porovnáním verze – při souběžné změně se příkaz
 * provede znovu nad čerstvým stavem.
 */
export class ClinicEngine {
  private cache = new Map<string, Loaded>();

  constructor(private readonly store: StateStore) {}

  /** Aktuální stav kliniky (null = klinika neexistuje nebo nemá stav). */
  async current(clinicId: string): Promise<Loaded | null> {
    const cached = this.cache.get(clinicId);
    if (cached) {
      const delta = await this.store.getChunks(clinicId, cached.version);
      if (delta.version === null) return null;
      if (delta.version === cached.version) return cached;
      if (!delta.chunks.length) {
        const same = { ...cached, version: delta.version };
        this.cache.set(clinicId, same);
        return same;
      }
      // dočíst změněné části do kopie stavu
      const chunks = new Map<string, unknown>();
      for (const [key, json] of cached.chunkJson) chunks.set(key, JSON.parse(json));
      for (const c of delta.chunks) {
        if (c.data === null) chunks.delete(c.key);
        else chunks.set(c.key, c.data);
      }
      return this.remember(clinicId, delta.version, chunks);
    }
    const all = await this.store.getChunks(clinicId, 0);
    if (all.version === null) return null;
    const chunks = new Map<string, unknown>();
    for (const c of all.chunks) if (c.data !== null) chunks.set(c.key, c.data);
    return this.remember(clinicId, all.version, chunks);
  }

  private remember(clinicId: string, version: number, chunks: Map<string, unknown>): Loaded | null {
    const state = chunksToState(chunks);
    if (!state) return null;
    clearSelectorCaches();
    const loaded: Loaded = { version, state, chunkJson: stateToChunkJson(state) };
    this.cache.set(clinicId, loaded);
    return loaded;
  }

  forget(clinicId: string): void {
    this.cache.delete(clinicId);
  }

  /** Provede příkaz. `commandId` určuje identifikátory nových záznamů (stejné jako v prohlížeči). */
  async execute<I, R>(
    clinicId: string,
    command: Command<I, R>,
    input: I,
    ctx: { actor: Actor; now: LocalDateTime; commandId?: string },
  ): Promise<ExecResult> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const loaded = await this.current(clinicId);
      if (!loaded) return { ok: false, error: 'Klinika nemá založená data.', version: 0 };

      let result: CommandResult<R> = { ok: false, error: 'Neznámá chyba.' };
      const restore = ctx.commandId ? withIdGenerator(sequentialIds(ctx.commandId + '-')) : null;
      let next: ClinicState;
      try {
        clearSelectorCaches();
        next = produce(loaded.state, (draft) => {
          result = command(draft as ClinicState, input, { now: ctx.now, actor: ctx.actor });
        });
      } catch (e) {
        console.error('Příkaz selhal', e);
        return { ok: false, error: 'Akci se nepodařilo provést.', version: loaded.version };
      } finally {
        restore?.();
        clearSelectorCaches();
      }
      const r = result as CommandResult<R>;
      if (!r.ok) return { ok: false, error: r.error, version: loaded.version };
      if (next === loaded.state) return { ok: true, value: r.value, notices: r.notices, version: loaded.version, changes: [] };

      const { changes, chunkJson } = computeChanges(loaded, next);
      if (!changes.length) return { ok: true, value: r.value, notices: r.notices, version: loaded.version, changes: [] };
      const saved = await this.store.applyChanges(clinicId, loaded.version, changes, ctx.commandId);
      if (saved.ok) {
        this.cache.set(clinicId, { version: saved.version, state: next, chunkJson });
        return { ok: true, value: r.value, notices: r.notices, version: saved.version, changes };
      }
      if (saved.duplicate) {
        this.cache.delete(clinicId);
        return { ok: true, value: null, notices: [], version: saved.version, changes: [], duplicate: true };
      }
      // někdo stav mezitím změnil – načíst znovu a zopakovat
      this.cache.delete(clinicId);
    }
    return { ok: false, error: 'Data se právě mění z jiného zařízení. Zkuste to prosím znovu.', version: 0 };
  }
}
