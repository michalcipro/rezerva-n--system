/** Konfigurace sestavení: testovací verze (data v prohlížeči) nebo ostrý provoz se serverem. */

const env = (import.meta as { env?: ImportMetaEnv }).env ?? ({} as ImportMetaEnv);

export const SERVER_MODE = env.VITE_BACKEND === 'server';
export const API_URL = (env.VITE_API_URL || '/api').replace(/\/$/, '');
export const SUPABASE_URL = (env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
export const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY || '';
export const DEV_LOGIN = env.VITE_DEV_LOGIN === '1';
/**
 * Podadresář webu z Vite `base` (import.meta.env.BASE_URL, v ostrém provozu z VITE_BASE): „/“ v kořeni domény,
 * na GitHub Pages např. „/rezerva-n--system/app/“. Začíná i končí lomítkem. Relativní base („./“ – testovací
 * verze v jednom souboru) znamená kořen, adresy se tam počítají jako dřív.
 */
export function basePathOf(baseUrl: string | undefined): string {
  const base = baseUrl?.startsWith('/') ? baseUrl : '/';
  return base.endsWith('/') ? base : `${base}/`;
}
export const BASE_PATH = basePathOf(env.BASE_URL);
/** Adresa statického souboru aplikace (právní stránky…) v podadresáři aplikace; plné adresy (https://…) zůstanou. */
export function staticUrl(path: string, base = BASE_PATH): string {
  return /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(path) ? path : base + path.replace(/^\/+/, '');
}
/** Obecné stránky platformy – provozovna může mít vlastní texty (Nastavení → Právní texty). */
export const PRIVACY_URL = staticUrl(env.VITE_PRIVACY_URL || 'ochrana-osobnich-udaju.html');
export const TERMS_URL = staticUrl(env.VITE_TERMS_URL || 'obchodni-podminky.html');
/** Název platformy (správa platformy, stránky bez provozovny). */
export const PLATFORM_NAME = env.VITE_PLATFORM_NAME || 'Rezervační platforma';
