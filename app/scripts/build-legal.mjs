// Vytvoří stránky s právními dokumenty pro ostrý provoz (dist-prod/*.html) ze schválených textů
// v docs/legal/zverejnit/. Koncepty (s [doplněním] nebo „PRACOVNÍ NÁVRH“) zveřejnit nedovolí.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist-prod');
const DOCS = [
  { file: 'ochrana-osobnich-udaju', title: 'Ochrana osobních údajů' },
  { file: 'obchodni-podminky', title: 'Obchodní podmínky' },
];

const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const page = (title, body) => `<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{--bg:#f4f6f6;--text:#16262b;--muted:#5b6b70;--border:#dfe5e6;--accent:#0b6e6e}
@media (prefers-color-scheme:dark){:root{--bg:#0d181b;--text:#e6eeef;--muted:#9fb0b4;--border:#24363a;--accent:#5cc8c0}}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:760px;margin:0 auto;padding:32px 16px 64px}
h1{font-size:1.8rem;line-height:1.2}h2{margin-top:2em;font-size:1.25rem}h3{font-size:1.05rem}
a{color:var(--accent)}table{border-collapse:collapse;width:100%;display:block;overflow-x:auto}
th,td{border:1px solid var(--border);padding:6px 10px;text-align:left;vertical-align:top}
blockquote{margin:1em 0;padding:.5em 1em;border-left:3px solid var(--border);color:var(--muted)}
.back{display:inline-block;margin-bottom:16px}
</style>
</head>
<body><main><a class="back" href="/">← Zpět na rezervace</a>
${body}
</main></body>
</html>
`;

let missing = 0;
for (const d of DOCS) {
  const src = join(root, 'docs/legal/zverejnit', `${d.file}.md`);
  if (!existsSync(src)) {
    missing++;
    writeFileSync(
      join(out, `${d.file}.html`),
      page(d.title, `<h1>${esc(d.title)}</h1><p>Dokument se připravuje. Informace vám rádi poskytneme na recepci nebo e-mailem.</p>`),
    );
    continue;
  }
  const md = readFileSync(src, 'utf8');
  const problems = [];
  if (/PRACOVNÍ NÁVRH|K ověření právníkem|Pro kliniku:/i.test(md)) problems.push('obsahuje poznámky konceptu');
  const placeholders = md.match(/\[[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ0-9 …,./-]{2,}\]/g);
  if (placeholders) problems.push(`nevyplněné údaje: ${[...new Set(placeholders)].slice(0, 5).join(', ')}`);
  if (problems.length) {
    console.error(`✗ ${d.file}.md nejde zveřejnit – ${problems.join('; ')}.`);
    process.exit(1);
  }
  writeFileSync(join(out, `${d.file}.html`), page(d.title, marked.parse(md)));
  console.log(`✓ ${d.file}.html`);
}
if (missing) console.warn(`! ${missing} právní dokument(y) zatím nejsou schválené – stránky ukazují „Dokument se připravuje“. Viz docs/legal/README.md.`);
