import type { ChunkChange, ChunksResult, CommandLogEntry, StateStore, StaffRole, Whoami } from './types';

/**
 * Úložiště v Supabase přes REST API (PostgREST RPC) se služebním klíčem.
 * Bez knihovny supabase-js – jen fetch, takže stejný kód běží v Edge Function (Deno) i v Node.
 */
export function createRestStore(cfg: { url: string; serviceKey: string; fetchImpl?: typeof fetch }): StateStore {
  const f = cfg.fetchImpl ?? fetch;
  const rpc = async <T>(fn: string, body: Record<string, unknown>): Promise<T> => {
    const res = await f(`${cfg.url.replace(/\/$/, '')}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: cfg.serviceKey,
        Authorization: `Bearer ${cfg.serviceKey}`,
        'Content-Type': 'application/json',
      },
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
    async applyChanges(clinicId, expected, changes: ChunkChange[]) {
      const r = await rpc<{ ok: boolean; version: number }>('app_apply_changes', { p_clinic: clinicId, p_expected: expected, p_changes: changes });
      return { ok: r.ok, version: Number(r.version) };
    },
    whoami(userId) {
      return rpc<Whoami>('app_whoami', { p_user: userId });
    },
    async createClinic(name, ownerId, ownerName, chunks) {
      return rpc<string>('app_create_clinic', { p_name: name, p_owner: ownerId, p_owner_name: ownerName, p_chunks: chunks });
    },
    async upsertMember(clinicId, userId, role: StaffRole, therapistId, displayName) {
      await rpc('app_upsert_member', { p_clinic: clinicId, p_user: userId, p_role: role, p_therapist: therapistId, p_name: displayName });
    },
    async removeMember(clinicId, userId) {
      await rpc('app_remove_member', { p_clinic: clinicId, p_user: userId });
    },
    listMembers(clinicId) {
      return rpc('app_list_members', { p_clinic: clinicId });
    },
    async linkClient(clinicId, userId, clientId) {
      await rpc('app_link_client', { p_clinic: clinicId, p_user: userId, p_client: clientId });
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
