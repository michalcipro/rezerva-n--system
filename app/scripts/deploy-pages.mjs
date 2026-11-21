// Provizorní hosting ostrého provozu na GitHub Pages projektu (větev gh-pages), viz docs/DEPLOY.md:
//   https://<účet>.github.io/rezerva-n--system/app/<slug>      provozovna
//   https://<účet>.github.io/rezerva-n--system/app/platforma   správa platformy
// V kořeni větve zůstává testovací verze (index.html). GitHub Pages neumí přesměrování pro SPA – pro každou
// neexistující cestu vrací 404.html z kořene webu. Proto je 404.html kopií app/index.html ostré verze
// (odkazy na assety jsou absolutní i s podadresářem, fungují tedy z libovolné hloubky adresy).
//
// Použití (v adresáři app/):
//   node scripts/deploy-pages.mjs                    sestaví, připraví pracovní kopii gh-pages, vypíše, co by nahrál
//   node scripts/deploy-pages.mjs --push             … a nahraje na origin gh-pages
//   node scripts/deploy-pages.mjs --base /rezerva-n--system/beta/    jiný podadresář (výchozí /rezerva-n--system/app/)
//
// VITE_API_URL, VITE_SUPABASE_URL a VITE_SUPABASE_ANON_KEY se berou z prostředí nebo z app/.env.prod.local.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_BASE = '/rezerva-n--system/app/';
const TRAILER = ['Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>', 'Claude-Session: https://claude.ai/code/session_01KEVDW3zVswovxaJ3Rf4JSr'];
/** Dočasná pracovní kopie větve gh-pages (git worktree). */
let work = null;

function fail(message) {
  console.error(`✗ ${message}`);
  if (work) console.error(`  Pracovní kopie gh-pages zůstala v ${work} – uklidit: git worktree remove --force ${work}`);
  process.exit(1);
}

function usage() {
  console.log(`Ostrý provoz na GitHub Pages (větev gh-pages, podadresář s aplikací).

  node scripts/deploy-pages.mjs [--base <cesta>] [--push]

  --base <cesta>  podadresář webu (VITE_BASE), výchozí ${DEFAULT_BASE}
  --push          nahrát na origin gh-pages (bez něj jen připraví pracovní kopii a vypíše změny)

VITE_API_URL, VITE_SUPABASE_URL a VITE_SUPABASE_ANON_KEY: z prostředí nebo z app/.env.prod.local.`);
}

/* ---------------------------- parametry ---------------------------- */

let base = DEFAULT_BASE;
let push = false;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--push') push = true;
  else if (a === '--base') base = args[++i] ?? fail('Za --base chybí cesta, např. --base /rezerva-n--system/app/.');
  else if (a.startsWith('--base=')) base = a.slice('--base='.length);
  else if (a === '--help' || a === '-h') {
    usage();
    process.exit(0);
  } else fail(`Neznámý parametr ${a} (nápověda: --help).`);
}

const segments = base.split('/').filter(Boolean);
if (segments.some((s) => !/^[A-Za-z0-9_~-][A-Za-z0-9._~-]*$/.test(s))) fail(`Neplatná cesta --base ${base} (písmena, číslice, - _ ~ a tečka uvnitř názvu).`);
if (segments.length < 2) fail(`--base musí mít podadresář pod adresou projektu, např. ${DEFAULT_BASE} – kořen webu patří testovací verzi.`);
base = `/${segments.join('/')}/`;
/** Adresář ve větvi gh-pages: base bez názvu projektu (/rezerva-n--system/app/ → app). */
const dir = segments.slice(1).join('/');

/* ---------------------------- git ---------------------------- */

function git(gitArgs, { cwd = repoRoot, inherit = false } = {}) {
  const r = spawnSync('git', gitArgs, { cwd, encoding: 'utf8', stdio: inherit ? 'inherit' : 'pipe' });
  if (r.status !== 0) fail(`git ${gitArgs.join(' ')} selhal${inherit ? '' : `: ${(r.stderr || r.stdout || '').trim()}`}`);
  return (r.stdout ?? '').trim();
}

const repoRoot = git(['rev-parse', '--show-toplevel'], { cwd: appDir });
const remote = git(['remote', 'get-url', 'origin']);
const gh = /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(remote);
if (gh && gh[2] !== segments[0]) fail(`--base musí začínat názvem repozitáře /${gh[2]}/ – GitHub Pages projektu běží na https://${gh[1]}.github.io/${gh[2]}/.`);
const publicUrl = gh ? `https://${gh[1].toLowerCase()}.github.io${base}` : base;
const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
const commit = git(['rev-parse', '--short', 'HEAD']);
const dirty = git(['status', '--porcelain', '--', relative(repoRoot, appDir) || '.']) !== '';
if (dirty && push) fail('V app/ jsou necommitnuté změny – commitněte je, nebo spusťte bez --push (jen příprava).');
if (dirty) console.warn('! V app/ jsou necommitnuté změny – sestavení je obsahuje, commit na gh-pages to uvede.');

/* ---------------------------- proměnné VITE_* ---------------------------- */

// stejné pořadí jako Vite: .env, .env.local, .env.prod, .env.prod.local; proměnné prostředí mají přednost
const env = loadEnv('prod', appDir, 'VITE_');
const missing = ['VITE_API_URL', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'].filter((k) => !env[k]?.trim());
if (missing.length) fail(`Chybí ${missing.join(', ')} – zadejte je do prostředí nebo do app/.env.prod.local (viz docs/DEPLOY.md).`);
for (const k of ['VITE_API_URL', 'VITE_SUPABASE_URL'])
  if (!/^https:\/\//.test(env[k].trim())) fail(`${k} musí začínat https:// – stránka na GitHub Pages běží na https a jiné požadavky prohlížeč zablokuje.`);
if (env.VITE_BACKEND !== 'server') fail('VITE_BACKEND musí být „server“ (nastavuje ho app/.env.prod).');
if (env.VITE_DEV_LOGIN === '1') fail('VITE_DEV_LOGIN=1 je jen pro lokální vývoj – odstraňte ho z prostředí i z app/.env.prod.local.');

/* ---------------------------- sestavení ---------------------------- */

console.log(`▸ Sestavuji ostrou verzi s VITE_BASE=${base} (API ${env.VITE_API_URL})`);
const windows = process.platform === 'win32';
const build = spawnSync(windows ? 'npm.cmd' : 'npm', ['run', 'build:prod'], { cwd: appDir, stdio: 'inherit', shell: windows, env: { ...process.env, VITE_BASE: base } });
if (build.status !== 0) fail('Sestavení selhalo.');
const dist = join(appDir, 'dist-prod');
const indexHtml = readFileSync(join(dist, 'index.html'), 'utf8');
if (!indexHtml.includes(`src="${base}assets/`)) fail(`dist-prod/index.html neodkazuje na ${base}assets/ – sestavení nemá podadresář.`);

/* ---------------------------- pracovní kopie gh-pages ---------------------------- */

console.log('▸ Stahuji větev gh-pages z origin');
git(['fetch', 'origin', '+refs/heads/gh-pages:refs/remotes/origin/gh-pages'], { inherit: true });
git(['worktree', 'prune']);
const tmp = mkdtempSync(join(tmpdir(), 'rezervace-gh-pages-'));
git(['worktree', 'add', '--detach', tmp, 'refs/remotes/origin/gh-pages']);
work = tmp;
const cleanup = () => {
  git(['worktree', 'remove', '--force', tmp]);
  work = null;
};

const target = join(work, ...segments.slice(1));
if (existsSync(target) && !statSync(target).isDirectory()) fail(`Ve větvi gh-pages je ${dir} soubor, ne adresář – zvolte jiné --base.`);
if (!existsSync(join(work, 'index.html'))) console.warn('! V kořeni gh-pages chybí index.html (testovací verze).');
// celý adresář znovu (staré assety s jiným otiskem zmizí); _headers GitHub Pages nepoužívá
rmSync(target, { recursive: true, force: true });
cpSync(dist, target, { recursive: true, filter: (src) => relative(dist, src) !== '_headers' });
writeFileSync(join(work, '404.html'), indexHtml);
if (!existsSync(join(work, '.nojekyll'))) writeFileSync(join(work, '.nojekyll'), '');

git(['add', '-A'], { cwd: work });
if (!git(['status', '--porcelain'], { cwd: work })) {
  console.log('✓ Na gh-pages je už stejné sestavení – není co nahrát.');
  cleanup();
  process.exit(0);
}
const message = [
  `Ostrý provoz v ${dir}/: build z ${branch} @ ${commit}${dirty ? ' (s necommitnutými změnami)' : ''}`,
  '',
  `Sestaveno s VITE_BASE=${base}. 404.html je kopie ${dir}/index.html – GitHub Pages tak`,
  'vrací aplikaci i pro hluboké odkazy. Testovací verze v kořeni zůstává beze změny.',
  '',
  ...TRAILER,
].join('\n');
git(['commit', '-q', '-m', message], { cwd: work });

console.log('\n' + git(['show', '--stat=120', '--format=%h %s%n', 'HEAD'], { cwd: work }) + '\n');
if (push) {
  console.log('▸ Nahrávám na origin gh-pages');
  git(['push', 'origin', 'HEAD:refs/heads/gh-pages'], { cwd: work, inherit: true });
  cleanup();
  console.log(`✓ Nahráno. GitHub Pages stránku obnoví zhruba do minuty: ${publicUrl}platforma`);
} else {
  console.log(`Připraveno (commit jen lokálně) v pracovní kopii: ${work}`);
  console.log(`Nahrát:  node scripts/deploy-pages.mjs --push   (nebo git -C ${work} push origin HEAD:refs/heads/gh-pages)`);
  console.log(`Uklidit: git worktree remove --force ${work}`);
  console.log(`Adresa po nahrání: ${publicUrl}<slug>, správa platformy ${publicUrl}platforma`);
}
