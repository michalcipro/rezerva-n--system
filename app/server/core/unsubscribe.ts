import { safeEqual } from '../auth';

/**
 * Podepsané odkazy pro odhlášení z obchodních sdělení (jedním kliknutím, bez přihlášení).
 * Podpis = HMAC-SHA256 z ID kliniky a klienta; odkaz nejde podvrhnout pro jiného klienta.
 */

const enc = new TextEncoder();

async function sign(secret: string, clinicId: string, clientId: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`unsubscribe:${clinicId}:${clientId}`)));
  let bin = '';
  for (const b of mac.slice(0, 18)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function unsubscribeUrl(apiUrl: string, secret: string, clinicId: string, clientId: string): Promise<string> {
  const sig = await sign(secret, clinicId, clientId);
  const q = new URLSearchParams({ c: clinicId, k: clientId, s: sig });
  return `${apiUrl.replace(/\/$/, '')}/unsubscribe?${q.toString()}`;
}

export async function verifyUnsubscribe(secret: string, clinicId: string, clientId: string, sig: string): Promise<boolean> {
  if (!secret || !clinicId || !clientId || !sig) return false;
  return safeEqual(await sign(secret, clinicId, clientId), sig);
}
