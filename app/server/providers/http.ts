/** Interní pomůcky pro volání HTTP API poskytovatelů (jen standardní webová API). */

/** Signál, který požadavek přeruší po `ms` milisekundách (Node 18+, Deno, prohlížeče). */
export function timeoutSignal(ms: number | undefined): AbortSignal | undefined {
  if (!ms || ms <= 0 || typeof AbortSignal === 'undefined' || typeof AbortSignal.timeout !== 'function') return undefined;
  return AbortSignal.timeout(ms);
}

function errorName(e: unknown): string {
  return e && typeof e === 'object' && 'name' in e && typeof e.name === 'string' ? e.name : '';
}

function errorMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e && typeof e.message === 'string') return e.message;
  return typeof e === 'string' ? e : '';
}

/** Vypršel časový limit (AbortSignal.timeout) nebo byl požadavek přerušen. */
export function isTimeoutError(e: unknown): boolean {
  const name = errorName(e);
  return name === 'TimeoutError' || name === 'AbortError';
}

/** Nahradí tajný údaj (klíč, token) hvězdičkami – i v zakódované podobě z URL. */
export function scrub(text: string, secret: string): string {
  if (!secret) return text;
  let out = text.split(secret).join('***');
  const encoded = encodeURIComponent(secret);
  if (encoded !== secret) out = out.split(encoded).join('***');
  return out;
}

/** Text na jeden řádek, nejvýše `max` znaků. */
export function oneLine(text: string, max: number): string {
  const chars = Array.from(text.replace(/\s+/gu, ' ').trim()); // po znacích, aby se nerozdělilo emoji
  return chars.length > max ? chars.slice(0, max - 1).join('').trimEnd() + '…' : chars.join('');
}

/** Krátký popis výjimky bez tajného údaje (síťové chyby v Deno obsahují celou URL). */
export function describeError(e: unknown, secret: string): string {
  const text = [errorName(e), errorMessage(e)].filter(Boolean).join(': ') || 'neznámá chyba';
  return oneLine(scrub(text, secret), 120);
}

/** Přečte tělo odpovědi; když to nejde, vrátí prázdný text. */
export async function readText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

/** Výchozí fetch daného prostředí (volaný až v okamžiku požadavku, aby šel v testech podvrhnout). */
export const defaultFetch: typeof fetch = (input, init) => fetch(input, init);
