// Převede vite build (dist/index.html, vše vložené do jednoho souboru) na stránku pro claude.ai artefakt:
// bez <!doctype>/<html>/<head>/<body> (ty doplní platforma), s <title> na začátku souboru.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'dist/index.html'), 'utf8');

const pick = (re) => [...html.matchAll(re)].map((m) => m[0]);

const title = pick(/<title>[\s\S]*?<\/title>/g)[0] ?? '<title>Rezervační systém Pohyb</title>';
const fitMeta = pick(/<meta name="claude:viewport-fit-sides"[^>]*>/g)[0] ?? '<meta name="claude:viewport-fit-sides" content="cover">';
const fontLinks = pick(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/g);
const styles = pick(/<style[^>]*>[\s\S]*?<\/style>/g);
const scripts = pick(/<script type="module"[^>]*>[\s\S]*?<\/script>/g).map((s) => s.replace(/<script type="module"[^>]*>/, '<script type="module">'));

if (!scripts.length) throw new Error('V buildu chybí vložený skript.');

const out = [
  title,
  fitMeta,
  ...fontLinks,
  ...styles,
  '<div id="root"></div>',
  ...scripts,
  '',
].join('\n');

writeFileSync(join(root, 'dist/artifact.html'), out);
const kb = Math.round(Buffer.byteLength(out) / 1024);
console.log(`dist/artifact.html: ${kb} kB`);
