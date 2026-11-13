import type { ChunkChange, ChunksResult, ClinicRow, CommandLogEntry, StateStore, StaffRole, Whoami } from './types';

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
    async applyChanges(clinicId, expected, changes: ChunkChange[], commandId) {
      const r = await one<{ ok: boolean; version: number; duplicate?: boolean }>(
        'select public.app_apply_changes($1::uuid, $2::bigint, $3::jsonb, $4) as r',
        [clinicId, expected, JSON.stringify(changes), commandId ?? null],
      );
      return { ok: r.ok, version: Number(r.version), duplicate: r.duplicate === true };
    },
    async commandApplied(clinicId, commandId) {
      const r = await query('select public.app_command_applied($1::uuid, $2) as r', [clinicId, commandId]);
      const v = r.rows[0]?.r;
      return v === null || v === undefined ? null : Number(v);
    },
    async maintenance() {
      await query('select public.app_maintenance()', []);
    },
    async acquireLock(name, holder, seconds) {
      const r = await query('select public.app_acquire_lock($1, $2, $3::integer) as r', [name, holder, seconds]);
      return r.rows[0]?.r === true;
    },
    async releaseLock(name, holder) {
      await query('select public.app_release_lock($1, $2)', [name, holder]);
    },
    async whoami(userId) {
      return one<Whoami>('select public.app_whoami($1::uuid) as r', [userId]);
    },
    async createClinic(name, ownerId, ownerName, chunks, ownerEmail = '') {
      const r = await query('select public.app_create_clinic($1, $2::uuid, $3, $4::jsonb, $5) as r', [name, ownerId, ownerName, JSON.stringify(chunks), ownerEmail]);
      return String(r.rows[0]?.r);
    },
    async upsertMember(clinicId, userId, role: StaffRole, therapistId, displayName, email = '') {
      await query('select public.app_upsert_member($1::uuid, $2::uuid, $3, $4, $5, $6)', [clinicId, userId, role, therapistId, displayName, email]);
    },
    async removeMember(clinicId, userId) {
      await query('select public.app_remove_member($1::uuid, $2::uuid)', [clinicId, userId]);
    },
    async listMembers(clinicId) {
      return one('select public.app_list_members($1::uuid) as r', [clinicId]);
    },
    async listClinics() {
      const rows = await one<ClinicRow[]>('select public.app_list_clinics() as r', []);
      return rows.map((c) => ({ ...c, version: Number(c.version) }));
    },
    async userIdByEmail(email) {
      const r = await query('select public.app_user_id_by_email($1) as r', [email]);
      const v = r.rows[0]?.r;
      return v ? String(v) : null;
    },
    async linkClient(clinicId, userId, clientId) {
      await query('select public.app_link_client($1::uuid, $2::uuid, $3)', [clinicId, userId, clientId]);
    },
    async unlinkClient(clinicId, clientId) {
      await query('select public.app_unlink_client($1::uuid, $2)', [clinicId, clientId]);
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
 * role anon / authenticated / service_role a tabulku uživatelů auth.users (jen sloupce, které čteme).
 * Spouští se před migrací jen lokálně (testy, vývojový server).
 */
export const SUPABASE_ROLES_SQL = `
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  email text,
  email_confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
revoke all on schema auth from public;
`;
