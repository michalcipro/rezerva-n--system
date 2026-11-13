import type { ChunkChange, ChunksResult, ClinicRow, CommandLogEntry, StateStore, StaffRole, Whoami } from './types';

/**
 * Úložiště v Supabase přes REST API (PostgREST RPC) se služebním klíčem.
 * Bez knihovny supabase-js – jen fetch, takže stejný kód běží v Edge Function (Deno) i v Node.
 */
/**
 * Hlavičky se služebním klíčem. Starší klíče (JWT „service_role“) jdou i do Authorization,
 * nové tajné klíče `sb_secret_…` nejsou JWT – posílají se jen v hlavičce apikey.
 */
export function serviceHeaders(serviceKey: string): Record<string, string> {
  const h: Record<string, string> = { apikey: serviceKey, 'Content-Type': 'application/json' };
  if (!serviceKey.startsWith('sb_')) h.Authorization = `Bearer ${serviceKey}`;
  return h;
}

export function createRestStore(cfg: { url: string; serviceKey: string; fetchImpl?: typeof fetch }): StateStore {
  const f = cfg.fetchImpl ?? fetch;
  const rpc = async <T>(fn: string, body: Record<string, unknown>): Promise<T> => {
    const res = await f(`${cfg.url.replace(/\/$/, '')}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: serviceHeaders(cfg.serviceKey),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Databáze odmítla volání ${fn} (${res.status}). ${text.slice(0, 300)}`);
    }
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  };
  return {
    async getChunks(clinicId, since) {
      const r = await rpc<{ version: number | null; chunks: { key: string; data: unknown; version: number }[] }>('app_get_chunks', {
        p_clinic: clinicId,
        p_since: since,
      });
      return { version: r.version === null ? null : Number(r.version), chunks: r.chunks.map((c) => ({ ...c, version: Number(c.version) })) } as ChunksResult;
    },
    async applyChanges(clinicId, expected, changes: ChunkChange[], commandId) {
      const r = await rpc<{ ok: boolean; version: number; duplicate?: boolean }>('app_apply_changes', {
        p_clinic: clinicId,
        p_expected: expected,
        p_changes: changes,
        p_command_id: commandId ?? null,
      });
      return { ok: r.ok, version: Number(r.version), duplicate: r.duplicate === true };
    },
    async commandApplied(clinicId, commandId) {
      const v = await rpc<number | string | null>('app_command_applied', { p_clinic: clinicId, p_command_id: commandId });
      return v === null || v === undefined ? null : Number(v);
    },
    async maintenance() {
      await rpc('app_maintenance', {});
    },
    async acquireLock(name, holder, seconds) {
      return (await rpc<boolean>('app_acquire_lock', { p_name: name, p_holder: holder, p_seconds: seconds })) === true;
    },
    async releaseLock(name, holder) {
      await rpc('app_release_lock', { p_name: name, p_holder: holder });
    },
    whoami(userId) {
      return rpc<Whoami>('app_whoami', { p_user: userId });
    },
    async createClinic(name, ownerId, ownerName, chunks, ownerEmail = '') {
      return rpc<string>('app_create_clinic', { p_name: name, p_owner: ownerId, p_owner_name: ownerName, p_chunks: chunks, p_owner_email: ownerEmail });
    },
    async upsertMember(clinicId, userId, role: StaffRole, therapistId, displayName, email = '') {
      await rpc('app_upsert_member', { p_clinic: clinicId, p_user: userId, p_role: role, p_therapist: therapistId, p_name: displayName, p_email: email });
    },
    async removeMember(clinicId, userId) {
      await rpc('app_remove_member', { p_clinic: clinicId, p_user: userId });
    },
    listMembers(clinicId) {
      return rpc('app_list_members', { p_clinic: clinicId });
    },
    async listClinics() {
      const rows = await rpc<ClinicRow[]>('app_list_clinics', {});
      return rows.map((c) => ({ ...c, version: Number(c.version) }));
    },
    async userIdByEmail(email) {
      const id = await rpc<string | null>('app_user_id_by_email', { p_email: email });
      return id ?? null;
    },
    async linkClient(clinicId, userId, clientId) {
      await rpc('app_link_client', { p_clinic: clinicId, p_user: userId, p_client: clientId });
    },
    async unlinkClient(clinicId, clientId) {
      await rpc('app_unlink_client', { p_clinic: clinicId, p_client: clientId });
    },
    async logCommand(e: CommandLogEntry) {
      await rpc('app_log_command', {
        p_clinic: e.clinicId,
        p_user: e.userId,
        p_role: e.role,
        p_command: e.command,
        p_ok: e.ok,
        p_error: e.error ?? null,
        p_version: e.version ?? null,
      });
    },
  };
}
