import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import type { CommandResponse, SessionInfo, StatePayload } from '../src/api/protocol';
import type { ClinicState } from '../src/domain/types';
import { devAuth } from '../server/auth';
import { createApi } from '../server/api';
import { chunksToState } from '../server/core/state';
import { SUPABASE_ROLES_SQL, createSqlStore } from '../server/store/sql';

import MIGRATION from '../../supabase/migrations/20261113000000_init.sql?raw';

const CRON = 'cron-secret-for-tests-0001';
const ADMIN = 'admin-secret-for-tests-0001';
// pevný čas: úterý 17. 11. 2026 9:00 v Praze
const CLOCK = new Date('2026-11-17T08:00:00Z');

let handle: (req: Request) => Promise<Response>;
let auth: ReturnType<typeof devAuth>;
let db: PGlite;
const tokens: Record<string, string> = {};
let n = 0;

async function call<T = unknown>(method: string, path: string, opts: { as?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<{ status: number; body: T }> {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...opts.headers };
  if (opts.as) headers.authorization = `Bearer ${tokens[opts.as]}`;
  const res = await handle(new Request(`http://localhost/api${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) }));
  return { status: res.status, body: (await res.json()) as T };
}

async function login(name: string, email: string): Promise<void> {
  tokens[name] = (await auth.issue(email)).token;
}

const cmd = (as: string, name: string, input: unknown, commandId = `t${String(++n).padStart(7, '0')}`, retry = false) =>
  call<CommandResponse & { duplicate?: boolean }>('POST', '/command', { as, body: { name, input, commandId, retry } });

async function staffState(as: string): Promise<{ version: number; state: ClinicState }> {
  const r = await call<StatePayload>('GET', '/state', { as });
  if (r.body.kind !== 'chunks') throw new Error('čekal jsem části stavu');
  const state = chunksToState(new Map(r.body.chunks.map((c) => [c.key, c.data])));
  return { version: r.body.version, state: state! };
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_ROLES_SQL);
  await db.exec(MIGRATION);
  const store = createSqlStore((sql, params) => db.query(sql, params));
  auth = devAuth('vyvojovy-klic-pro-testy-0001');
  handle = createApi({ store, auth, devAuth: auth, clock: () => CLOCK, cronSecret: CRON, adminSecret: ADMIN, allowedOrigins: ['https://rezervace.example.cz'], log: () => undefined });
  await login('owner', 'majitelka@example.cz');
  await login('recepce', 'recepce@example.cz');
  await login('jana', 'jana@example.cz');
  await login('petr', 'petr@example.cz');
  await login('cizi', 'nekdo@example.cz');
}, 60_000);

describe('API', () => {
  it('založí kliniku jen jednou a jen s klíčem', async () => {
    const body = { clinicName: 'Klinika Test', ownerEmail: 'majitelka@example.cz', ownerName: 'Tereza Testová' };
    expect((await call('POST', '/admin/bootstrap', { body })).status).toBe(401);
    const ok = await call<{ clinicId: string }>('POST', '/admin/bootstrap', { body, headers: { 'x-admin-secret': ADMIN } });
    expect(ok.status).toBe(200);
    expect(ok.body.clinicId).toMatch(/^[0-9a-f-]{36}$/);
    expect((await call('POST', '/admin/bootstrap', { body, headers: { 'x-admin-secret': ADMIN } })).status).toBe(409);
  });

  it('majitelka je personál; nová klinika má vypnuté simulované platby kartou', async () => {
    const s = await call<SessionInfo>('GET', '/session', { as: 'owner' });
    expect(s.body).toMatchObject({ role: 'owner', name: 'Tereza Testová', clinicName: 'Klinika Test', needsRegistration: false });
    const { state } = await staffState('owner');
    expect(state.settings.features).toEqual({ clinicalNotes: false, cardPayments: false });
    expect(state.settings.messaging.deliver).toBe(true);
    expect(state.clients).toEqual([]);
  });

  it('bez přihlášení nic nevrátí', async () => {
    expect((await call('GET', '/state')).status).toBe(401);
    const bad = await handle(new Request('http://localhost/api/session', { headers: { authorization: 'Bearer nesmysl' } }));
    expect(bad.status).toBe(401);
  });

  it('majitelka přidá recepci; recepce přístupy spravovat nesmí', async () => {
    const r = await call<{ email: string; role: string }[]>('POST', '/members', {
      as: 'owner',
      body: { email: 'Recepce@Example.cz', role: 'reception', displayName: 'Recepce Anna' },
    });
    expect(r.status).toBe(200);
    expect(r.body.map((m) => [m.email, m.role])).toEqual([
      ['majitelka@example.cz', 'owner'],
      ['recepce@example.cz', 'reception'],
    ]);
    const s = await call<SessionInfo>('GET', '/session', { as: 'recepce' });
    expect(s.body.role).toBe('reception');
    expect((await call('GET', '/members', { as: 'recepce' })).status).toBe(403);
  });

  it('recepce založí klientku; ta se po přihlášení sama propojí podle e-mailu', async () => {
    const created = await cmd('recepce', 'createClient', {
      firstName: 'Jana',
      lastName: 'Nováková',
      email: 'jana@example.cz',
      phone: '777 111 222',
      consents: { gdpr: true, health: false, marketingEmail: false, sms: true },
    });
    expect(created.body.ok).toBe(true);
    const s = await call<SessionInfo>('GET', '/session', { as: 'jana' });
    expect(s.body).toMatchObject({ role: 'client', name: 'Jana Nováková', needsRegistration: false });
  });

  it('neznámý e-mail se musí zaregistrovat a dostane vlastní kartu', async () => {
    const s = await call<SessionInfo>('GET', '/session', { as: 'petr' });
    expect(s.body).toMatchObject({ role: null, needsRegistration: true });
    expect((await call('GET', '/state', { as: 'petr' })).status).toBe(403);
    const bad = await call('POST', '/register', { as: 'petr', body: { firstName: 'Petr', lastName: 'Svoboda', phone: '', consents: { gdpr: false } } });
    expect(bad.status).toBe(400);
    const reg = await call<SessionInfo>('POST', '/register', {
      as: 'petr',
      body: { firstName: 'Petr', lastName: 'Svoboda', phone: '+420 602 000 111', consents: { gdpr: true, health: false, marketingEmail: true, sms: false } },
    });
    expect(reg.status).toBe(200);
    expect(reg.body).toMatchObject({ role: 'client', name: 'Petr Svoboda' });
    const { state } = await staffState('owner');
    const petr = state.clients.find((c) => c.email === 'petr@example.cz')!;
    expect(petr.source).toBe('online');
    expect(petr.consents.marketingEmail).not.toBeNull();
  });

  it('klient vidí jen svůj pohled bez cizích údajů', async () => {
    const r = await call<StatePayload>('GET', '/state', { as: 'petr' });
    expect(r.body.kind).toBe('client');
    if (r.body.kind !== 'client') return;
    expect(r.body.state.clients.map((c) => c.email)).toEqual(['petr@example.cz']);
    expect(JSON.stringify(r.body.state)).not.toContain('jana@example.cz');
    const again = await call<StatePayload>('GET', `/changes?since=${r.body.version}&hash=${r.body.hash}`, { as: 'petr' });
    expect(again.body.kind).toBe('unchanged');
  });

  it('klient rezervuje za sebe, ne za jiné; cizí pole ani platba kartou neprojdou', async () => {
    const view = await call<StatePayload>('GET', '/state', { as: 'jana' });
    if (view.body.kind !== 'client') throw new Error('čekal jsem pohled klienta');
    const jana = view.body.state.clients[0];
    const { state } = await staffState('owner');
    const petr = state.clients.find((c) => c.email === 'petr@example.cz')!;
    const slot = { serviceId: 's_fyzio45', therapistId: 't_mala', start: '2026-11-19T09:00', payment: { method: 'onsite' } };

    const own = await cmd('jana', 'createBooking', { ...slot, clientId: jana.id }, 'janabook01');
    expect(own.body).toMatchObject({ ok: true, value: 'b_janabook01-0' });
    expect(own.body.ok && 'changes' in own.body && own.body.changes).toBeFalsy(); // klient nedostává části stavu

    const foreign = await cmd('jana', 'createBooking', { ...slot, start: '2026-11-19T11:00', clientId: petr.id });
    expect(foreign.body).toMatchObject({ ok: false });

    const extra = await cmd('jana', 'createBooking', { ...slot, start: '2026-11-19T11:00', clientId: jana.id, override: true });
    expect(extra.status).toBe(400);

    const card = await cmd('jana', 'createBooking', { ...slot, start: '2026-11-19T11:00', clientId: jana.id, payment: { method: 'online' } });
    expect(card.status).toBe(400);

    expect((await cmd('jana', 'updateSettings', { patch: {} })).status).toBe(403);
    expect((await cmd('jana', 'updateClient', { clientId: jana.id, patch: { internalNote: 'x' } })).status).toBe(400);
    expect((await cmd('jana', 'neexistuje', {})).status).toBe(400);
    expect((await call('POST', '/command', { as: 'jana', body: { name: 'createBooking', input: { ...slot, clientId: jana.id }, commandId: 'x' } })).status).toBe(400);
  });

  it('opakované odeslání stejného příkazu se neprovede dvakrát', async () => {
    const view = await call<StatePayload>('GET', '/state', { as: 'jana' });
    if (view.body.kind !== 'client') throw new Error('čekal jsem pohled klienta');
    const jana = view.body.state.clients[0];
    const input = { clientId: jana.id, serviceId: 's_fyzio45', therapistId: 't_mala', start: '2026-11-20T10:00', payment: { method: 'onsite' } };
    const first = await cmd('jana', 'createBooking', input, 'dupl000001');
    expect(first.body.ok).toBe(true);
    const retry = await cmd('jana', 'createBooking', input, 'dupl000001', true);
    expect(retry.body).toMatchObject({ ok: true, duplicate: true });
    const { state } = await staffState('owner');
    expect(state.bookings.filter((b) => b.id === 'b_dupl000001-0')).toHaveLength(1);
  });

  it('personál dostane změněné části a dočte jen rozdíl', async () => {
    const before = await staffState('recepce');
    const { state } = before;
    const jana = state.clients.find((c) => c.email === 'jana@example.cz')!;
    const r = await cmd('recepce', 'updateClient', { clientId: jana.id, patch: { tags: ['VIP'] } });
    expect(r.body.ok).toBe(true);
    if (!r.body.ok) return;
    expect(r.body.changes?.map((c) => c.key)).toContain('clients/c0');
    const delta = await call<StatePayload & { partial?: boolean }>('GET', `/changes?since=${before.version}`, { as: 'owner' });
    expect(delta.body.kind).toBe('chunks');
    if (delta.body.kind !== 'chunks') return;
    expect(delta.body.partial).toBe(true);
    expect(delta.body.version).toBe(r.body.version);
    expect(delta.body.chunks.map((c) => c.key).sort()).toEqual(r.body.changes!.map((c) => c.key).sort());
  });

  it('automatika běží jen s tajným klíčem', async () => {
    expect((await call('POST', '/cron')).status).toBe(401);
    const r = await call<{ ok: boolean; clinics: { processes: unknown }[] }>('POST', '/cron', { headers: { 'x-cron-secret': CRON } });
    expect(r.status).toBe(200);
    expect(r.body.clinics).toHaveLength(1);
  });

  it('CORS jen pro povolený původ', async () => {
    const pre = await handle(new Request('http://localhost/api/command', { method: 'OPTIONS', headers: { origin: 'https://rezervace.example.cz' } }));
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe('https://rezervace.example.cz');
    const other = await handle(new Request('http://localhost/api/health', { headers: { origin: 'https://zly.example.com' } }));
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('cesta funguje i s předponou Supabase Edge Function', async () => {
    const res = await handle(new Request('http://localhost/functions/v1/api/health'));
    expect(res.status).toBe(200);
  });
});
