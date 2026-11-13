import { API_URL, DEV_LOGIN, SUPABASE_ANON_KEY, SUPABASE_URL } from './config';

/**
 * Přihlášení v prohlížeči. Ostrý provoz: Supabase Auth – jednorázový kód z e-mailu (bez hesel).
 * Lokální vývoj: přihlášení e-mailem bez kódu přes vývojový server.
 * Volá jen pár koncových bodů Auth API přímo přes fetch (bez knihovny supabase-js).
 */

export interface StoredAuth {
  accessToken: string;
  refreshToken: string;
  /** Konec platnosti přístupového tokenu (ms od 1970). */
  expiresAt: number;
  email: string;
  provider: 'supabase' | 'dev';
}

const KEY = 'pohyb.auth.v1';
const listeners = new Set<() => void>();
let current: StoredAuth | null = read();
let refreshing: Promise<StoredAuth | null> | null = null;

function read(): StoredAuth | null {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    return raw ? (JSON.parse(raw) as StoredAuth) : null;
  } catch {
    return null;
  }
}

function write(a: StoredAuth | null): void {
  current = a;
  try {
    if (a) localStorage.setItem(KEY, JSON.stringify(a));
    else localStorage.removeItem(KEY);
  } catch {
    /* prohlížeč bez úložiště – přihlášení vydrží do zavření stránky */
  }
  listeners.forEach((l) => l());
}

// přihlášení / odhlášení v jiné záložce
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      current = read();
      listeners.forEach((l) => l());
    }
  });
}

export function getAuth(): StoredAuth | null {
  return current;
}

export function subscribeAuth(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export class AuthError extends Error {}

async function authFetch<T>(path: string, body: unknown, bearer?: string): Promise<T> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new AuthError('Přihlášení není nastavené (chybí adresa Supabase).');
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/auth/v1${path}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AuthError('Nepodařilo se spojit s přihlašovací službou. Zkontrolujte připojení.');
  }
  const text = await res.text().catch(() => '');
  let parsed: unknown = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = {};
  }
  const data = parsed as T & { error_code?: string };
  if (!res.ok) {
    if (res.status === 429) throw new AuthError('Příliš mnoho pokusů. Počkejte prosím chvíli a zkuste to znovu.');
    if (data.error_code === 'otp_expired') throw new AuthError('Kód je neplatný nebo vypršel. Nechte si poslat nový.');
    throw new AuthError(path.startsWith('/verify') ? 'Kód je neplatný nebo vypršel. Nechte si poslat nový.' : 'Přihlášení se nepodařilo. Zkuste to prosím znovu.');
  }
  return data;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  user?: { email?: string };
}

function fromTokens(t: TokenResponse, email: string): StoredAuth {
  const expiresAt = t.expires_at ? t.expires_at * 1000 : Date.now() + t.expires_in * 1000;
  return { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt, email: (t.user?.email ?? email).toLowerCase(), provider: 'supabase' };
}

/** Pošle na e-mail jednorázový přihlašovací kód (nový e-mail = nový účet). */
export async function requestCode(email: string): Promise<void> {
  await authFetch('/otp', { email: email.trim().toLowerCase(), create_user: true });
}

/** Ověří kód z e-mailu a přihlásí. */
export async function verifyCode(email: string, code: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const t = await authFetch<TokenResponse>('/verify', { type: 'email', email: normalized, token: code.replace(/\s/g, '') });
  write(fromTokens(t, normalized));
}

/** Vývojové přihlášení (jen lokální server s VITE_DEV_LOGIN=1). */
export async function devLogin(email: string): Promise<void> {
  if (!DEV_LOGIN) throw new AuthError('Vývojové přihlášení je vypnuté.');
  const res = await fetch(`${API_URL}/dev/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
  if (!res.ok) throw new AuthError('Vývojové přihlášení se nepodařilo.');
  const data = (await res.json()) as { token: string; user: { email: string } };
  write({ accessToken: data.token, refreshToken: '', expiresAt: Date.now() + 12 * 3600_000, email: data.user.email, provider: 'dev' });
}

async function refresh(a: StoredAuth): Promise<StoredAuth | null> {
  if (a.provider !== 'supabase' || !a.refreshToken) return null;
  try {
    const t = await authFetch<TokenResponse>('/token?grant_type=refresh_token', { refresh_token: a.refreshToken });
    const next = fromTokens(t, a.email);
    write(next);
    return next;
  } catch (e) {
    // jiná záložka mohla token mezitím obnovit
    const latest = read();
    if (latest && latest.refreshToken !== a.refreshToken && latest.expiresAt > Date.now() + 30_000) {
      current = latest;
      return latest;
    }
    if (e instanceof AuthError) write(null);
    return null;
  }
}

/** Platný přístupový token (podle potřeby ho obnoví), nebo null = nepřihlášeno. */
export async function accessToken(): Promise<string | null> {
  const a = current;
  if (!a) return null;
  if (a.expiresAt - Date.now() > 60_000) return a.accessToken;
  if (a.provider === 'dev') {
    write(null);
    return null;
  }
  refreshing ??= refresh(a).finally(() => {
    refreshing = null;
  });
  const next = await refreshing;
  return next?.accessToken ?? null;
}

/** Odhlásí (a zneplatní obnovovací token na serveru, pokud to jde). */
export async function signOut(): Promise<void> {
  const a = current;
  write(null);
  if (a?.provider === 'supabase') {
    await authFetch('/logout', {}, a.accessToken).catch(() => undefined);
  }
}

/** Server odmítl token (vypršel nebo byl zneplatněn) – zapomenout přihlášení. */
export function forgetAuth(): void {
  write(null);
}
