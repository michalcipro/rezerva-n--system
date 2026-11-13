/** Úložiště stavu kliniky na serveru. Implementace: SQL (PGlite pro vývoj a testy) a Supabase (REST RPC). */

export type StaffRole = 'owner' | 'reception' | 'therapist';

export interface ChunkRow {
  key: string;
  /** null = smazaná část */
  data: unknown | null;
  version: number;
}

export interface ChunksResult {
  /** Aktuální verze stavu kliniky (null = klinika neexistuje). */
  version: number | null;
  chunks: ChunkRow[];
}

export interface ChunkChange {
  key: string;
  data: unknown | null;
}

export interface MemberInfo {
  clinicId: string;
  role: StaffRole;
  therapistId: string | null;
  displayName: string;
}

export interface Whoami {
  members: MemberInfo[];
  clients: { clinicId: string; clientId: string }[];
}

export interface CommandLogEntry {
  clinicId: string;
  userId: string | null;
  role: string;
  command: string;
  ok: boolean;
  error?: string | null;
  version?: number | null;
}

export interface StateStore {
  /** Části stavu změněné po verzi `since` (0 = všechny). */
  getChunks(clinicId: string, since: number): Promise<ChunksResult>;
  /** Zapíše změny, jen pokud je stav pořád ve verzi `expected`. */
  applyChanges(clinicId: string, expected: number, changes: ChunkChange[]): Promise<{ ok: boolean; version: number }>;
  whoami(userId: string): Promise<Whoami>;
  createClinic(name: string, ownerId: string, ownerName: string, chunks: { key: string; data: unknown }[]): Promise<string>;
  upsertMember(clinicId: string, userId: string, role: StaffRole, therapistId: string | null, displayName: string): Promise<void>;
  removeMember(clinicId: string, userId: string): Promise<void>;
  listMembers(clinicId: string): Promise<{ userId: string; role: StaffRole; therapistId: string | null; displayName: string }[]>;
  linkClient(clinicId: string, userId: string, clientId: string): Promise<void>;
  logCommand(entry: CommandLogEntry): Promise<void>;
}
