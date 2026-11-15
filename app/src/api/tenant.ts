import { API_URL } from './config';
import type { PublicTenant } from './protocol';

/**
 * Provozovna podle adresy, na které aplikace běží:
 *   https://platforma.cz/<slug>/…      krátký identifikátor v cestě
 *   https://rezervace.klinika.cz/      vlastní doména provozovny (pozná server podle hlavičky x-tenant-host)
 *   https://platforma.cz/platforma     správa platformy (vlastník)
 */

const SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/;
/** Cesty aplikace, které nejsou provozovnou (shodné se serverem). */
const RESERVED = new Set(['api', 'app', 'admin', 'platforma', 'assets', 'static', 'www', 'login', 'prihlaseni', 'registrace', 'podminky', 'gdpr', 'demo']);

function firstSegment(): string {
  if (typeof location === 'undefined') return '';
  return location.pathname.split('/').filter(Boolean)[0]?.toLowerCase() ?? '';
}

function detectSlug(): string | null {
  const seg = firstSegment();
  if (seg && SLUG_RE.test(seg) && !RESERVED.has(seg)) return seg;
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('provozovna') : null;
  return q && SLUG_RE.test(q) ? q : null;
}

const slug = detectSlug();

/** Správa platformy (/platforma). */
export const isPlatformRoute = (): boolean => firstSegment() === 'platforma';

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

/** Adresa provozovny pro odkazy (např. z konzole platformy). */
export function tenantUrl(s: string): string {
  return `${location.origin}/${s}`;
}

export class TenantNotFound extends Error {}

/** Veřejné údaje provozovny (název, vzhled, názvosloví) – bez přihlášení. */
export async function loadPublicTenant(): Promise<PublicTenant> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/tenant`, { headers: tenantHeaders() });
  } catch {
    throw new Error('Nelze se spojit se serverem. Zkontrolujte připojení k internetu.');
  }
  if (res.status === 404) throw new TenantNotFound('Provozovna na této adrese neexistuje. Zkontrolujte prosím odkaz.');
  if (!res.ok) throw new Error('Server je dočasně nedostupný. Zkuste to prosím znovu.');
  return (await res.json()) as PublicTenant;
}
