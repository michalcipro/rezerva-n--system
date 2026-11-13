import { serviceHeaders } from './store/rest';
import type { StateStore } from './store/types';

/**
 * Přihlášení. V ostrém provozu ověřuje přístupové tokeny Supabase Auth (přihlášení kódem z e-mailu),
 * při lokálním vývoji podepisuje vlastní tokeny (HS256) bez odesílání e-mailů.
 */

export interface AuthUser {
  id: string;
  email: string;
  /** E-mail je ověřený (přihlášení kódem z e-mailu ho ověřuje vždy). */
  emailVerified: boolean;
}

export interface AuthService {
  /** Ověří přístupový token z hlavičky Authorization. */
  verify(token: string): Promise<AuthUser | null>;
  /** Vrátí ID uživatele s daným e-mailem; když neexistuje, založí ho (bez odeslání e-mailu). */
  ensureUser(email: string): Promise<string>;
}

/* ------------------------------------------------------------------ */
/* Supabase Auth                                                       */
/* ------------------------------------------------------------------ */

export interface SupabaseAuthConfig {
  url: string;
  /** Veřejný klíč projektu (anon / publishable) – stačí k ověření tokenu. */
  anonKey: string;
  /** Služební klíč (service_role / secret) – zakládání uživatelů. */
  serviceKey: string;
  store: StateStore;
  fetchImpl?: typeof fetch;
}

/** Ověřené tokeny na krátkou dobu v paměti – aplikace se ptá na změny každých 15 s. */
const VERIFY_TTL_MS = 60_000;

export function supabaseAuth(cfg: SupabaseAuthConfig): AuthService {
  const f = cfg.fetchImpl ?? fetch;
  const base = cfg.url.replace(/\/$/, '');
  const verified = new Map<string, { user: AuthUser; until: number }>();
  return {
    async verify(token) {
      if (!token) return null;
      const now = Date.now();
      const hit = verified.get(token);
      if (hit && hit.until > now) return hit.user;
      const res = await f(`${base}/auth/v1/user`, { headers: { apikey: cfg.anonKey, Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        verified.delete(token);
        return null;
      }
      const u = (await res.json()) as { id?: string; email?: string; email_confirmed_at?: string | null; confirmed_at?: string | null };
      if (!u.id || !u.email) return null;
      const user: AuthUser = { id: u.id, email: u.email.toLowerCase(), emailVerified: !!(u.email_confirmed_at ?? u.confirmed_at) };
      if (verified.size > 2000) verified.clear();
      verified.set(token, { user, until: now + VERIFY_TTL_MS });
      return user;
    },
    async ensureUser(email) {
      const normalized = email.trim().toLowerCase();
      const existing = await cfg.store.userIdByEmail(normalized);
      if (existing) return existing;
      const res = await f(`${base}/auth/v1/admin/users`, {
        method: 'POST',
        headers: serviceHeaders(cfg.serviceKey),
        body: JSON.stringify({ email: normalized, email_confirm: true }),
      });
      if (!res.ok) {
        // souběžné založení – uživatel mezitím vznikl
        const again = await cfg.store.userIdByEmail(normalized);
        if (again) return again;
        throw new Error(`Uživatele se nepodařilo založit (${res.status}).`);
      }
      const created = (await res.json()) as { id?: string; user?: { id?: string } };
      const id = created.id ?? created.user?.id;
      if (!id) throw new Error('Přihlašovací služba nevrátila ID uživatele.');
      return id;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Vývojové přihlášení (jen lokálně)                                    */
/* ------------------------------------------------------------------ */

const enc = new TextEncoder();

function b64url(bytes: Uint8Array | string): string {
  const data = typeof bytes === 'string' ? enc.encode(bytes) : bytes;
  let bin = '';
  for (const b of data) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): string {
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data))));
}

/** Porovnání bez předčasného ukončení (podpisy tokenů). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Deterministické UUID z e-mailu (vývojoví uživatelé mají stále stejné ID). */
export async function devUserId(email: string): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode('dev-user:' + email.toLowerCase())));
  const h = [...hash.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export interface DevAuth extends AuthService {
  /** Vydá token pro e-mail (platnost 12 h). */
  issue(email: string): Promise<{ token: string; user: AuthUser }>;
}

export function devAuth(secret: string, nowSec: () => number = () => Math.floor(Date.now() / 1000)): DevAuth {
  if (secret.length < 16) throw new Error('Vývojový klíč musí mít aspoň 16 znaků.');
  return {
    async issue(email) {
      const normalized = email.trim().toLowerCase();
      const user: AuthUser = { id: await devUserId(normalized), email: normalized, emailVerified: true };
      const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const payload = b64url(JSON.stringify({ sub: user.id, email: user.email, exp: nowSec() + 12 * 3600 }));
      const token = `${header}.${payload}.${await hmac(secret, `${header}.${payload}`)}`;
      return { token, user };
    },
    async verify(token) {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const expected = await hmac(secret, `${parts[0]}.${parts[1]}`);
      if (!safeEqual(expected, parts[2])) return null;
      try {
        const p = JSON.parse(fromB64url(parts[1])) as { sub?: string; email?: string; exp?: number };
        if (!p.sub || !p.email || !p.exp || p.exp < nowSec()) return null;
        return { id: p.sub, email: p.email, emailVerified: true };
      } catch {
        return null;
      }
    },
    async ensureUser(email) {
      return devUserId(email.trim().toLowerCase());
    },
  };
}
