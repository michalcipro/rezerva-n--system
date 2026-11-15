import type { ActorRole, BrandingSettings, ClinicState, TermsSettings } from '../domain/types';
import type { LicensePlan, LicenseState, LicenseStatus, LicenseView } from './license';

/** Datové tvary API mezi aplikací v prohlížeči a serverem (sdílené oběma stranami). */

export type StaffRole = Exclude<ActorRole, 'client'>;

export interface SessionInfo {
  user: { id: string; email: string };
  clinicId: string | null;
  clinicName: string;
  /** Provozovna podle adresy (null = správa platformy bez provozovny). */
  tenant: { slug: string; name: string } | null;
  /** Vlastník platformy (správa provozoven a licencí, podpora v provozovnách). */
  platformAdmin: boolean;
  /** Licence provozovny (personál ji vidí celou, klient jen stav). */
  license: LicenseView | null;
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
  code?: 'unauthorized' | 'forbidden' | 'not_found' | 'bad_request' | 'conflict' | 'rate_limited' | 'server_error' | 'license';
}

/* ------------------------------------------------------------------ */
/* Platforma: více provozoven a licence                                */
/* ------------------------------------------------------------------ */

/** Veřejné údaje provozovny pro přihlašovací stránku (bez přihlášení). */
export interface PublicTenant {
  slug: string;
  name: string;
  tagline: string;
  branding: BrandingSettings;
  terms: TermsSettings;
  /** Má provozovna vlastní obchodní podmínky / zásady ochrany údajů? */
  legal: { terms: boolean; privacy: boolean };
  license: { state: LicenseState };
}

export interface LegalDocument {
  doc: 'terms' | 'privacy';
  title: string;
  /** Markdown */
  text: string;
  updatedAt: string | null;
}

export interface TenantLicense {
  plan: LicensePlan;
  status: LicenseStatus;
  validUntil: string | null;
  note: string;
}

/** Provozovna v konzoli vlastníka platformy. */
export interface PlatformTenant {
  id: string;
  slug: string;
  name: string;
  createdAt: string;
  license: TenantLicense;
  licenseView: LicenseView;
  domains: string[];
  members: number;
  clientAccounts: number;
  lastChangeAt: string | null;
  owners: { email: string; name: string }[];
}

export interface CreateTenantRequest {
  name: string;
  slug: string;
  preset: string;
  ownerName: string;
  ownerEmail: string;
  plan: LicensePlan;
  /** YYYY-MM-DD; null = bez omezení */
  validUntil: string | null;
}

export interface UpdateTenantRequest {
  name?: string;
  slug?: string;
  plan?: LicensePlan;
  status?: LicenseStatus;
  validUntil?: string | null;
  note?: string;
}
