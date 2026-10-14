// Snímek obrazovky běžící aplikace (vývojová kontrola vzhledu).
// Použití:
//   node scripts/shot.mjs --url http://localhost:5173 --role owner --route kalendar --out /tmp/x.png [--width 1440 --height 1000] [--theme dark] [--full]
//   --role client --portal domu|rezervace|moje|ucet  (klientský portál)
//   --eval "JS kód" spustí se po načtení (např. kliknutí), --wait ms
// Při prázdných datech klikne na „Načíst ukázková data". Data žijí v profilu prohlížeče (IndexedDB),
// každé spuštění je čisté, proto generování trvá pár sekund.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
    return acc;
  }, []),
);

const url = args.url ?? 'http://localhost:5173';
const width = Number(args.width ?? 1440);
const height = Number(args.height ?? 1000);
const out = args.out ?? '/tmp/shot.png';
const role = args.role ?? 'owner';
const route = args.route ?? 'kalendar';
const portal = args.portal ?? 'domu';
const theme = args.theme ?? 'light';

const session = {
  role,
  clientId: null,
  therapistId: 't_mala',
  route: { name: route, ...(args.clientId ? { clientId: args.clientId } : {}) },
  portalRoute: { name: portal },
  calendarDate: args.date ?? null,
  calendarView: args.view ?? 'day',
  calendarTherapist: 'all',
  theme,
  testBarOpen: args.testbar !== 'false',
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: Number(args.scale ?? 1) });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text());
});
await page.addInitScript((s) => {
  try {
    localStorage.setItem('pohyb.session.v1', JSON.stringify(s));
  } catch {}
}, session);
await page.goto(url, { waitUntil: 'networkidle' });
const demo = page.getByRole('button', { name: 'Načíst ukázková data' });
if (await demo.count()) {
  await demo.click();
  await page.waitForFunction(() => !document.querySelector('.onb'), null, { timeout: 60000 });
}
await page.waitForTimeout(Number(args.wait ?? 800));
if (args.eval) {
  await page.evaluate(args.eval);
  await page.waitForTimeout(600);
}
await page.screenshot({ path: out, fullPage: args.full === 'true' });
console.log('uloženo: ' + out);
if (errors.length) console.log('CHYBY:\n' + errors.slice(0, 15).join('\n'));
await browser.close();
