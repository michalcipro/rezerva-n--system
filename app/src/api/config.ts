/** Konfigurace sestavení: testovací verze (data v prohlížeči) nebo ostrý provoz se serverem. */

const env = (import.meta as { env?: ImportMetaEnv }).env ?? ({} as ImportMetaEnv);

export const SERVER_MODE = env.VITE_BACKEND === 'server';
export const API_URL = (env.VITE_API_URL || '/api').replace(/\/$/, '');
export const SUPABASE_URL = (env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
export const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY || '';
export const DEV_LOGIN = env.VITE_DEV_LOGIN === '1';
export const PRIVACY_URL = env.VITE_PRIVACY_URL || 'ochrana-osobnich-udaju.html';
export const TERMS_URL = env.VITE_TERMS_URL || 'obchodni-podminky.html';
