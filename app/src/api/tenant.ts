import { API_URL, BASE_PATH } from './config';
import type { PublicTenant } from './protocol';

/**
 * Provozovna podle adresy, na které aplikace běží (<base> = podadresář webu z import.meta.env.BASE_URL,
 * v kořeni domény „/“, na GitHub Pages např. „/rezerva-n--system/app/“):
 *   https://platforma.cz<base><slug>/…     krátký identifikátor v cestě (nebo ?provozovna=<slug>)
 *   https://rezervace.klinika.cz<base>     vlastní doména provozovny (pozná server podle hlavičky x-tenant-host)
 *   https://platforma.cz<base>platforma    správa platformy (vlastník)
 * Adresa mimo <base> (GitHub Pages vrací aplikaci místo každé chybějící stránky webu) = provozovna nenalezena.
 */

const SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/;
/** Cesty aplikace, které nejsou provozovnou (shodné se serverem). */
const RESERVED = new Set(['api', 'app', 'admin', 'platforma', 'assets', 'static', 'www', 'login', 'prihlaseni', 'registrace', 'podminky', 'gdpr', 'demo']);

export type AppPath =
  /** <base><slug>/… nebo ?provozovna=<slug> */
  | { kind: 'tenant'; slug: string }
  /** <base>platforma */
  | { kind: 'platform' }
  /** Bez provozovny v adrese – server ji určí podle domény, případně je na platformě jediná. */
  | { kind: 'none' }
  /** Mimo podadresář aplikace (cizí nebo neexistující stránka webu). */
  | { kind: 'outside' };

/** Co je na adrese: provozovna, správa platformy, nic (rozhodne server), nebo stránka mimo aplikaci. */
export function parseAppPath(pathname: string, base = '/', search = ''): AppPath {
  const prefix = (base.endsWith('/') ? base : `${base}/`).toLowerCase();
  const path = (pathname || '/').toLowerCase();
  let rest: string;
  if (path.startsWith(prefix)) rest = path.slice(prefix.length);
  else if (path === prefix.slice(0, -1)) rest = '';
  else return { kind: 'outside' };
  const seg = rest.split('/').filter(Boolean)[0] ?? '';
  if (seg === 'platforma') return { kind: 'platform' };
  if (SLUG_RE.test(seg) && !RESERVED.has(seg)) return { kind: 'tenant', slug: seg };
  const q = (new URLSearchParams(search).get('provozovna') ?? '').trim().toLowerCase();
  return SLUG_RE.test(q) && !RESERVED.has(q) ? { kind: 'tenant', slug: q } : { kind: 'none' };
}

function here(): AppPath {
  if (typeof location === 'undefined') return { kind: 'none' };
  return parseAppPath(location.pathname, BASE_PATH, location.search);
}

const initial = here();
const slug = initial.kind === 'tenant' ? initial.slug : null;

/** Správa platformy (<base>platforma). */
export const isPlatformRoute = (): boolean => here().kind === 'platform';

export function tenantSlug(): string | null {
  return slug;
}

/** Hlavičky, podle kterých server pozná provozovnu. */
export function tenantHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  if (typeof location !== 'undefined') h['x-tenant-host'] = location.host;
  if (slug) h['x-tenant'] = slug;
  return h;
}

/** Adresa provozovny pro odkazy (např. z konzole platformy): původ + podadresář aplikace + slug. */
export function tenantUrl(s: string): string {
  return `${location.origin}${BASE_PATH}${s}`;
}

export class TenantNotFound extends Error {}

const NOT_FOUND = 'Provozovna na této adrese neexistuje. Zkontrolujte prosím odkaz.';

/** Veřejné údaje provozovny (název, vzhled, názvosloví) – bez přihlášení. */
export async function loadPublicTenant(): Promise<PublicTenant> {
  // stránka mimo aplikaci: na serveru se neptat (jinak by se ukázala výchozí provozovna)
  if (here().kind === 'outside') throw new TenantNotFound(NOT_FOUND);
  let res: Response;
  try {
    res = await fetch(`${API_URL}/tenant`, { headers: tenantHeaders() });
  } catch {
    throw new Error('Nelze se spojit se serverem. Zkontrolujte připojení k internetu.');
  }
  if (res.status === 404) throw new TenantNotFound(NOT_FOUND);
  if (!res.ok) throw new Error('Server je dočasně nedostupný. Zkuste to prosím znovu.');
  return (await res.json()) as PublicTenant;
}
