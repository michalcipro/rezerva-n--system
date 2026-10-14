/** Generátor identifikátorů. V testech a generátoru ukázkových dat jde nahradit deterministickým. */

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

function randomChunk(len: number): string {
  let out = '';
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.getRandomValues === 'function') {
    const bytes = new Uint8Array(len);
    c.getRandomValues(bytes);
    for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % 36];
    return out;
  }
  for (let i = 0; i < len; i++) out += ALPHABET[Math.floor(Math.random() * 36)];
  return out;
}

let generator: (prefix: string) => string = (prefix) => prefix + '_' + randomChunk(10);

export function newId(prefix: string): string {
  return generator(prefix);
}

/** Nastaví vlastní generátor; vrací funkci, která obnoví původní. */
export function withIdGenerator(gen: (prefix: string) => string): () => void {
  const previous = generator;
  generator = gen;
  return () => {
    generator = previous;
  };
}

export function sequentialIds(seed = 'x'): (prefix: string) => string {
  let n = 0;
  return (prefix) => prefix + '_' + seed + (n++).toString(36);
}
