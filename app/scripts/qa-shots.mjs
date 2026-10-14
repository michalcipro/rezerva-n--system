// Jedna kontrolní sada snímků celé aplikace (admin + klientský portál, světlý i tmavý motiv).
// Použití: node scripts/qa-shots.mjs --url http://localhost:5191 --out /cesta/ke/slozce
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 ? process.argv[i + 1] : def;
};
const url = arg('url', 'http://localhost:5191');
const out = arg('out', '/tmp/qa');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('404')) errors.push('console: ' + m.text());
});

const setSession = async (session) => {
  await page.evaluate((s) => localStorage.setItem('pohyb.session.v1', JSON.stringify(s)), session);
};
const base = {
  role: 'owner', clientId: null, therapistId: 't_mala', route: { name: 'kalendar' }, portalRoute: { name: 'domu' },
  calendarDate: null, calendarView: 'day', calendarTherapist: 'all', theme: 'light', testBarOpen: true,
};

await page.goto(url, { waitUntil: 'networkidle' });
const demo = page.getByRole('button', { name: 'Načíst ukázková data' });
if (await demo.count()) {
  await demo.click();
  await page.waitForFunction(() => !document.querySelector('.onb'), null, { timeout: 90000 });
  await page.waitForTimeout(1500);
}
const martinId = await page.evaluate(async () => {
  // najde id Martina Dvořáka přes globální hledání v DOM není spolehlivé – vezmeme ho z IndexedDB
  const db = await new Promise((res) => {
    const r = indexedDB.open('pohyb-rezervace', 1);
    r.onsuccess = () => res(r.result);
    r.onerror = () => res(null);
  });
  if (!db) return null;
  const raw = await new Promise((res) => {
    const t = db.transaction('state', 'readonly').objectStore('state').get('clinic');
    t.onsuccess = () => res(t.result);
    t.onerror = () => res(null);
  });
  if (!raw) return null;
  const s = JSON.parse(raw);
  return s.clients.find((c) => c.firstName === 'Martin' && c.lastName === 'Dvořák')?.id ?? null;
});

const shots = [
  { name: '01-prehled', session: { route: { name: 'prehled' } } },
  { name: '02-kalendar-den', session: { route: { name: 'kalendar' } } },
  { name: '03-kalendar-tyden', session: { route: { name: 'kalendar' }, calendarView: 'week', calendarTherapist: 't_mala' } },
  { name: '04-klienti', session: { route: { name: 'klienti' } } },
  { name: '05-klient-detail', session: { route: { name: 'klient', clientId: martinId } } },
  { name: '06-permanentky', session: { route: { name: 'permanentky' } } },
  { name: '07-sluzby', session: { route: { name: 'sluzby' } } },
  { name: '08-tym', session: { route: { name: 'tym' } } },
  { name: '09-komunikace', session: { route: { name: 'komunikace' } } },
  { name: '10-statistiky', session: { route: { name: 'statistiky' } } },
  { name: '11-nastaveni', session: { route: { name: 'nastaveni' } } },
  { name: '12-kalendar-tmavy', session: { route: { name: 'kalendar' }, theme: 'dark' } },
  { name: '13-portal-domu', session: { role: 'client', clientId: martinId, portalRoute: { name: 'domu' } }, viewport: { width: 390, height: 844 } },
  { name: '14-portal-rezervace', session: { role: 'client', clientId: martinId, portalRoute: { name: 'rezervace' } }, viewport: { width: 390, height: 844 } },
  { name: '15-portal-moje', session: { role: 'client', clientId: martinId, portalRoute: { name: 'moje' } }, viewport: { width: 390, height: 844 } },
  { name: '16-portal-ucet-tmavy', session: { role: 'client', clientId: martinId, portalRoute: { name: 'ucet' }, theme: 'dark' }, viewport: { width: 390, height: 844 } },
  { name: '17-kalendar-mobil', session: { route: { name: 'kalendar' } }, viewport: { width: 390, height: 844 } },
];

for (const s of shots) {
  await page.setViewportSize(s.viewport ?? { width: 1440, height: 1000 });
  await setSession({ ...base, ...s.session });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.screenshot({ path: `${out}/${s.name}.png` });
  console.log(`${s.name}${overflow > 1 ? `  ⚠ vodorovné přetečení ${overflow}px` : ''}`);
}
if (errors.length) console.log('CHYBY:\n' + [...new Set(errors)].slice(0, 20).join('\n'));
await browser.close();
