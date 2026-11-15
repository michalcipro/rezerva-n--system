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

export interface MemberRow {
  userId: string;
  role: StaffRole;
  therapistId: string | null;
  displayName: string;
  email: string;
}

export interface ClinicRow {
  id: string;
  name: string;
  version: number;
}

export type LicensePlan = 'trial' | 'monthly' | 'yearly' | 'lifetime';
export type LicenseStatus = 'active' | 'suspended' | 'cancelled';

export interface LicenseInfo {
  plan: LicensePlan;
  status: LicenseStatus;
  /** Platnost do (YYYY-MM-DD); null = bez omezení (doživotní licence). */
  validUntil: string | null;
  note: string;
}

/** Provozovna na platformě (bez osobních údajů). */
export interface ClinicInfo {
  id: string;
  slug: string;
  name: string;
  version: number;
  createdAt: string;
  license: LicenseInfo;
  domains: string[];
}

export interface PlatformClinicRow extends ClinicInfo {
  members: number;
  clientAccounts: number;
  lastChangeAt: string | null;
  owners: { email: string; name: string }[];
}

export interface PlatformClinicPatch {
  name?: string;
  slug?: string;
  plan?: LicensePlan;
  status?: LicenseStatus;
  /** undefined = beze změny, null = bez omezení */
  validUntil?: string | null;
  note?: string;
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
  /**
   * Zapíše změny, jen pokud je stav pořád ve verzi `expected`. S `commandId` se stejný příkaz zapíše
   * nejvýš jednou (`duplicate` = už byl zapsán dřív).
   */
  applyChanges(clinicId: string, expected: number, changes: ChunkChange[], commandId?: string): Promise<{ ok: boolean; version: number; duplicate?: boolean }>;
  /** Verze, ve které se příkaz zapsal, nebo null. */
  commandApplied(clinicId: string, commandId: string): Promise<number | null>;
  /** Pravidelná údržba (staré záznamy o příkazech). */
  maintenance(): Promise<void>;
  /** Zámek na danou dobu (true = získán). */
  acquireLock(name: string, holder: string, seconds: number): Promise<boolean>;
  releaseLock(name: string, holder: string): Promise<void>;
  whoami(userId: string): Promise<Whoami>;
  createClinic(name: string, ownerId: string, ownerName: string, chunks: { key: string; data: unknown }[], ownerEmail?: string): Promise<string>;
  upsertMember(clinicId: string, userId: string, role: StaffRole, therapistId: string | null, displayName: string, email?: string): Promise<void>;
  removeMember(clinicId: string, userId: string): Promise<void>;
  listMembers(clinicId: string): Promise<MemberRow[]>;
  listClinics(): Promise<ClinicRow[]>;
  /** ID uživatele přihlášení podle e-mailu (null = neexistuje). */
  userIdByEmail(email: string): Promise<string | null>;
  linkClient(clinicId: string, userId: string, clientId: string): Promise<void>;
  unlinkClient(clinicId: string, clientId: string): Promise<void>;
  logCommand(entry: CommandLogEntry): Promise<void>;

  /* ---- platforma: více provozoven, licence, adresy, tajné údaje ---- */
  /** Provozovna podle krátkého identifikátoru nebo vlastní domény (null = nenalezena). */
  resolveTenant(slug: string | null, domain: string | null): Promise<ClinicInfo | null>;
  clinicInfo(clinicId: string): Promise<ClinicInfo | null>;
  platformClinics(): Promise<PlatformClinicRow[]>;
  platformCreateClinic(input: {
    name: string;
    slug: string;
    ownerId: string;
    ownerName: string;
    ownerEmail: string;
    chunks: { key: string; data: unknown }[];
    plan: LicensePlan;
    validUntil: string | null;
  }): Promise<string>;
  platformUpdateClinic(clinicId: string, patch: PlatformClinicPatch): Promise<ClinicInfo | null>;
  platformSetDomains(clinicId: string, domains: string[]): Promise<void>;
  /** Uloží šifrovaný tajný údaj (null = smazat). */
  setClinicSecret(clinicId: string, key: string, value: string | null): Promise<void>;
  getClinicSecrets(clinicId: string): Promise<Record<string, string>>;
  clinicSecretKeys(clinicId: string): Promise<{ key: string; updatedAt: string }[]>;
}
