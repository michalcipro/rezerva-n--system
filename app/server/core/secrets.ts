/**
 * Šifrování tajných údajů provozoven (např. token Fio) před uložením do databáze.
 * AES-GCM s klíčem odvozeným z proměnné SECRETS_KEY (mimo databázi). Formát: v1.<iv>.<šifra> (base64url).
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array {
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad), (c) => c.charCodeAt(0));
}

async function keyFrom(material: string): Promise<CryptoKey> {
  if (material.length < 32) throw new Error('Klíč pro šifrování (SECRETS_KEY) musí mít aspoň 32 znaků.');
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(material));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptSecret(material: string, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFrom(material), enc.encode(plaintext)));
  return `v1.${b64url(iv)}.${b64url(data)}`;
}

export async function decryptSecret(material: string, ciphertext: string): Promise<string> {
  const [v, iv, data] = ciphertext.split('.');
  if (v !== 'v1' || !iv || !data) throw new Error('Neznámý formát tajného údaje.');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(iv) }, await keyFrom(material), fromB64url(data));
  return dec.decode(plain);
}
