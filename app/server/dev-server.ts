/**
 * Lokální vývojový server: celé API nad databází PGlite (Postgres v procesu, data v app/.local),
 * přihlášení bez e-mailu a zprávy jen vypsané do konzole. Ostrá data ani e-maily se nepoužívají.
 *
 *   npm run dev:server     API na http://localhost:8787
 *   npm run dev:live       aplikace na http://localhost:5173 (požadavky /api přesměruje sem)
 *
 * Přihlášení: majitelka@pohyb.local, recepce@pohyb.local, terapeut@pohyb.local, martin.dvorak@example.com
 * (klient z ukázkových dat), libovolný jiný e-mail = nový klient.
 * DEV_DB=memory spustí databázi jen v paměti (každé spuštění čistá data).
 */
import { PGlite } from '@electric-sql/pglite';
import { mkdirSync } from 'node:fs';
import { createServer, type IncomingMessage } from 'node:http';
import { fileURLToPath } from 'node:url';
import { DEMO_ACCOUNT } from '../src/engine/defaults';
import { generateDemoState } from '../src/engine/seed';
import { createApi } from './api';
import { devAuth } from './auth';
import { stateToChunkJson } from './core/state';
import { pragueNow } from './core/time';
import { deliveryJob } from './cron';
import { createConsoleMessenger } from './providers';
import { SUPABASE_ROLES_SQL, createSqlStore } from './store/sql';

import MIGRATION from '../../supabase/migrations/20261113000000_init.sql?raw';

const PORT = Number(process.env.PORT ?? 8787);
const CRON_SECRET = 'dev-cron-secret-only-for-localhost';
const DEV_SECRET = 'dev-auth-secret-only-for-localhost';

async function openDb(): Promise<PGlite> {
  if (process.env.DEV_DB === 'memory') return new PGlite();
  const dir = fileURLToPath(new URL('../.local/pgdata', import.meta.url));
  mkdirSync(dir, { recursive: true });
  return new PGlite(dir);
}

async function main(): Promise<void> {
  const db = await openDb();
  const migrated = await db.query<{ ok: boolean }>("select to_regclass('app.clinics') is not null as ok");
  if (!migrated.rows[0]?.ok) {
    console.log('Zakládám lokální databázi…');
    await db.exec(SUPABASE_ROLES_SQL);
    await db.exec(MIGRATION);
  }
  const store = createSqlStore((sql, params) => db.query(sql, params));
  const auth = devAuth(DEV_SECRET);

  if (!(await store.listClinics()).length) {
    console.log('Generuji ukázkovou kliniku…');
    const state = generateDemoState(pragueNow(), { clients: 150, weeksBack: 4, daysAhead: 21 });
    // stejné pojistky jako v ostrém provozu: bez simulovaných plateb kartou, zprávy jdou přes frontu
    state.settings.features = { clinicalNotes: false, cardPayments: false };
    state.settings.messaging = { deliver: true };
    state.settings.payments = { ...state.settings.payments, qrEnabled: true, ...DEMO_ACCOUNT, demoAccount: true };
    const chunks = [...stateToChunkJson(state)].map(([key, data]) => ({ key, data: JSON.parse(data) as unknown }));
    const owner = await auth.ensureUser('majitelka@pohyb.local');
    const clinicId = await store.createClinic(state.settings.clinicName, owner, 'Tereza Malá', chunks, 'majitelka@pohyb.local');
    await store.upsertMember(clinicId, owner, 'owner', 't_mala', 'Tereza Malá', 'majitelka@pohyb.local');
    await store.upsertMember(clinicId, await auth.ensureUser('recepce@pohyb.local'), 'reception', null, 'Recepce', 'recepce@pohyb.local');
    await store.upsertMember(clinicId, await auth.ensureUser('terapeut@pohyb.local'), 'therapist', 't_kos', 'Marek Kos', 'terapeut@pohyb.local');
  }

  const handle = createApi({
    store,
    auth,
    devAuth: auth,
    cronSecret: CRON_SECRET,
    unsubscribeSecret: 'dev-unsubscribe-secret',
    cronJobs: [deliveryJob({ messenger: createConsoleMessenger((line) => console.log(line)), publicApiUrl: `http://localhost:${PORT}/api`, unsubscribeSecret: 'dev-unsubscribe-secret' })],
    log: (message, detail) => console.log(message, detail ?? ''),
  });

  const toRequest = async (req: IncomingMessage): Promise<Request> => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
      else if (v !== undefined) headers.set(k, v);
    }
    const method = req.method ?? 'GET';
    return new Request(`http://localhost:${PORT}${req.url ?? '/'}`, {
      method,
      headers,
      body: method === 'GET' || method === 'HEAD' || !chunks.length ? undefined : Buffer.concat(chunks),
    });
  };

  createServer((req, res) => {
    void (async () => {
      try {
        const response = await handle(await toRequest(req));
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
      } catch (e) {
        console.error(e);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Chyba vývojového serveru.' }));
      }
    })();
  }).listen(PORT, () => console.log(`API běží na http://localhost:${PORT}/api (vývojové přihlášení zapnuté)`));

  // automatika jako v ostrém provozu (tam ji spouští plánovač v databázi každých 5 minut)
  const tick = async (): Promise<void> => {
    const r = await handle(new Request(`http://localhost:${PORT}/api/cron`, { method: 'POST', headers: { 'x-cron-secret': CRON_SECRET } }));
    if (!r.ok) console.warn('Automatika selhala', r.status);
  };
  setInterval(() => void tick(), 60_000);
  void tick();
}

void main();
