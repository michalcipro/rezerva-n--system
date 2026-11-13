import type { ActorRole, ClinicState } from '../domain/types';

/** Datové tvary API mezi aplikací v prohlížeči a serverem (sdílené oběma stranami). */

export type StaffRole = Exclude<ActorRole, 'client'>;

export interface SessionInfo {
  user: { id: string; email: string };
  clinicId: string | null;
  clinicName: string;
  /** null = přihlášený uživatel zatím nemá roli (klient se musí zaregistrovat). */
  role: ActorRole | null;
  /** Jméno pro záznamy v historii (personál) nebo jméno klienta. */
  name: string;
  therapistId: string | null;
  clientId: string | null;
  needsRegistration: boolean;
}

export interface ChunkData {
  key: string;
  /** null = část byla smazána */
  data: unknown | null;
}

/** Personál dostává stav po částech (dočítá jen změny), klient svůj pohled jako celek. */
export type StatePayload =
  | { kind: 'chunks'; version: number; chunks: ChunkData[] }
  | { kind: 'client'; version: number; state: ClinicState; hash: string }
  | { kind: 'unchanged'; version: number };

export interface CommandRequest {
  name: string;
  input: unknown;
  /** Určuje ID nových záznamů – prohlížeč a server tak vytvoří stejné identifikátory. */
  commandId: string;
}

export type CommandResponse =
  | { ok: true; value: unknown; notices: string[]; version: number; changes?: ChunkData[] }
  | { ok: false; error: string; version: number };

export interface RegisterRequest {
  firstName: string;
  lastName: string;
  phone: string;
  birthDate?: string | null;
  consents: { gdpr: boolean; health: boolean; marketingEmail: boolean; sms: boolean };
}

export interface MemberView {
  userId: string;
  email: string;
  role: StaffRole;
  therapistId: string | null;
  displayName: string;
}

export interface AddMemberRequest {
  email: string;
  role: StaffRole;
  therapistId?: string | null;
  displayName: string;
}

export interface ApiError {
  error: string;
  code?: 'unauthorized' | 'forbidden' | 'not_found' | 'bad_request' | 'conflict' | 'rate_limited' | 'server_error';
}
