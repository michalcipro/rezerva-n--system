import type { ChunkChange, ChunksResult, CommandLogEntry, StateStore, StaffRole, Whoami } from './types';

/** Minimální rozhraní dotazu – splňuje ho PGlite (`db.query`) i node-postgres. */
export type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;

const asJson = <T>(value: unknown): T => (typeof value === 'string' ? (JSON.parse(value) as T) : (value as T));

/** Úložiště nad SQL funkcemi z migrace (lokální vývoj, testy). */
export function createSqlStore(query: QueryFn): StateStore {
  const one = async <T>(sql: string, params: unknown[]): Promise<T> => {
    const r = await query(sql, params);
    return asJson<T>(r.rows[0]?.r);
  };
  return {
    async getChunks(clinicId, since) {
      const r = await one<{ version: number | null; chunks: { key: string; data: unknown; version: number }[] }>(
        'select public.app_get_chunks($1::uuid, $2::bigint) as r',
        [clinicId, since],
      );
      return { version: r.version === null ? null : Number(r.version), chunks: r.chunks.map((c) => ({ ...c, version: Number(c.version) })) } as ChunksResult;
    },
    async applyChanges(clinicId, expected, changes: ChunkChange[]) {
      const r = await one<{ ok: boolean; version: number }>('select public.app_apply_changes($1::uuid, $2::bigint, $3::jsonb) as r', [
        clinicId,
        expected,
        JSON.stringify(changes),
      ]);
      return { ok: r.ok, version: Number(r.version) };
    },
    async whoami(userId) {
      return one<Whoami>('select public.app_whoami($1::uuid) as r', [userId]);
    },
    async createClinic(name, ownerId, ownerName, chunks) {
      const r = await query('select public.app_create_clinic($1, $2::uuid, $3, $4::jsonb) as r', [name, ownerId, ownerName, JSON.stringify(chunks)]);
      return String(r.rows[0]?.r);
    },
    async upsertMember(clinicId, userId, role: StaffRole, therapistId, displayName) {
      await query('select public.app_upsert_member($1::uuid, $2::uuid, $3, $4, $5)', [clinicId, userId, role, therapistId, displayName]);
    },
    async removeMember(clinicId, userId) {
      await query('select public.app_remove_member($1::uuid, $2::uuid)', [clinicId, userId]);
    },
    async listMembers(clinicId) {
      return one('select public.app_list_members($1::uuid) as r', [clinicId]);
    },
    async linkClient(clinicId, userId, clientId) {
      await query('select public.app_link_client($1::uuid, $2::uuid, $3)', [clinicId, userId, clientId]);
    },
    async logCommand(e: CommandLogEntry) {
      await query('select public.app_log_command($1::uuid, $2::uuid, $3, $4, $5, $6, $7::bigint)', [
        e.clinicId,
        e.userId,
        e.role,
        e.command,
        e.ok,
        e.error ?? null,
        e.version ?? null,
      ]);
    },
  };
}

/**
 * SQL, které v čistém Postgresu (PGlite) napodobí to, co Supabase vytvoří samo:
 * role anon / authenticated / service_role. Spouští se před migrací jen lokálně.
 */
export const SUPABASE_ROLES_SQL = `
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
`;
