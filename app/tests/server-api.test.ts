import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ApiError, AresCompany, CommandResponse, CreateTenantResponse, InviteResponse, MemberView, PlatformTenant, PublicTenant, SessionInfo, StatePayload } from '../src/api/protocol';
import type { ClinicState } from '../src/domain/types';
import { availableSlots } from '../src/engine/availability';
import { devAuth } from '../server/auth';
import { createApi, type LicenseDigestItem } from '../server/api';
import { licenseDigestText } from '../server/digest';
import { chunksToState } from '../server/core/state';
import { decryptSecret } from '../server/core/secrets';
import { createEdgeHandler } from '../server/edge';
import { tenantAppUrl, tenantInviteEmail } from '../server/invite';
import { createAresClient } from '../server/providers/ares';
import type { Messenger, OutgoingEmail } from '../server/providers/types';
import { MIGRATIONS } from '../server/store/migrations';
import { SUPABASE_ROLES_SQL, createSqlStore } from '../server/store/sql';
import aresNotFound from './fixtures/ares-not-found.json';
import aresSro from './fixtures/ares-sro.json';
import aresSroVr from './fixtures/ares-sro-vr.json';

const CRON = 'cron-secret-for-tests-0001';
const SECRETS_KEY = 'klic-pro-sifrovani-tajnych-udaju-v-testech-0001';
// pevný čas: úterý 17. 11. 2026 9:00 v Praze
const CLOCK = new Date('2026-11-17T08:00:00Z');
const NOW = '2026-11-17T09:00';
const A = 'klinika-test';

let handle: (req: Request) => Promise<Response>;
let auth: ReturnType<typeof devAuth>;
let db: PGlite;
const tokens: Record<string, string> = {};
let n = 0;
let tenantA: PlatformTenant;
const digests: LicenseDigestItem[][] = [];
let store: ReturnType<typeof createSqlStore>;
const logs: { message: string; detail?: Record<string, unknown> }[] = [];

/** Adresa aplikace v podadresáři (provizorní hosting na GitHub Pages) – odkazy v pozvánkách. */
const APP_URL = 'https://michalcipro.github.io/rezerva-n--system/app';
/** Falešný messenger: e-maily jen zapíše; `mailMode` určí, zda odeslání projde, selže, nebo spadne. */
const mails: OutgoingEmail[] = [];
let mailMode: 'ok' | 'fail' | 'throw' = 'ok';
const messenger: Messenger = {
  async sendEmail(m) {
    mails.push(m);
    if (mailMode === 'throw') throw new TypeError(`fetch failed (${m.to})`);
    return mailMode === 'ok' ? { ok: true, providerId: `m${mails.length}` } : { ok: false, permanent: true, error: `Brevo e-mail odmítlo: neplatná adresa ${m.to} (HTTP 400).`, httpStatus: 400 };
  },
  async sendSms() {
    return { ok: false, error: 'SMS se neposílají.' };
  },
};

async function call<T = unknown>(
  method: string,
  path: string,
  opts: { as?: string; body?: unknown; headers?: Record<string, string>; tenant?: string | null; handler?: (req: Request) => Promise<Response> } = {},
): Promise<{ status: number; body: T }> {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...opts.headers };
  const tenant = opts.tenant === undefined ? A : opts.tenant;
  if (tenant) headers['x-tenant'] = tenant;
  if (opts.as) headers.authorization = `Bearer ${tokens[opts.as]}`;
  const res = await (opts.handler ?? handle)(new Request(`http://localhost/api${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) }));
  return { status: res.status, body: (await res.json()) as T };
}

async function login(name: string, email: string): Promise<void> {
  tokens[name] = (await auth.issue(email)).token;
}

const cmd = (as: string, name: string, input: unknown, commandId = `t${String(++n).padStart(7, '0')}`, retry = false, tenant?: string) =>
  call<CommandResponse & { duplicate?: boolean }>('POST', '/command', { as, body: { name, input, commandId, retry }, tenant });

async function staffState(as: string, tenant?: string): Promise<{ version: number; state: ClinicState }> {
  const r = await call<StatePayload>('GET', '/state', { as, tenant });
  if (r.body.kind !== 'chunks') throw new Error('čekal jsem části stavu');
  const state = chunksToState(new Map(r.body.chunks.map((c) => [c.key, c.data])));
  return { version: r.body.version, state: state! };
}

/** Podstrčený ARES (síť se v testech nepoužívá): vzorový subjekt, 87654326 = výpadek, jinak 404. */
const aresJson = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const aresFetch: typeof fetch = async (input) => {
  const url = String(input);
  if (url.endsWith('/ekonomicke-subjekty/12345679')) return aresJson(200, aresSro);
  if (url.endsWith('/ekonomicke-subjekty-vr/12345679')) return aresJson(200, aresSroVr);
  if (url.endsWith('/ekonomicke-subjekty/87654326')) throw new TypeError('fetch failed');
  return aresJson(404, aresNotFound);
};

/** Volný online termín 1:1 služby u majitele (šablona oboru určuje katalog). */
function freeSlot(s: ClinicState, clientId: string, date: string, skip = 0): { serviceId: string; therapistId: string; start: string } {
  const svc = s.services.find((x) => x.active && x.onlineBookable && x.kind !== 'group' && !x.newClientsOnly)!;
  const therapistId = s.therapists[0].id;
  const slots = availableSlots(s, { serviceId: svc.id, therapistId, date, now: NOW, mode: 'client', clientId });
  const slot = slots[skip];
  if (!slot) throw new Error('žádný volný termín');
  return { serviceId: svc.id, therapistId, start: slot.start };
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_ROLES_SQL);
  for (const m of MIGRATIONS) await db.exec(m);
  store = createSqlStore((sql, params) => db.query(sql, params));
  auth = devAuth('vyvojovy-klic-pro-testy-0001');
  handle = createApi({
    store,
    auth,
    devAuth: auth,
    clock: () => CLOCK,
    cronSecret: CRON,
    platformAdmins: ['platforma@example.cz'],
    secretsKey: SECRETS_KEY,
    allowedOrigins: ['https://rezervace.example.cz'],
    licenseDigest: async (items) => {
      digests.push(items);
    },
    ares: createAresClient({ fetchImpl: aresFetch }),
    messenger,
    publicAppUrl: APP_URL,
    supportEmail: 'podpora@example.cz',
    platformName: 'Testovací platforma',
    log: (message, detail) => {
      logs.push({ message, detail });
    },
  });
  await login('platforma', 'platforma@example.cz');
  await login('owner', 'majitelka@example.cz');
  await login('ownerB', 'majitel-b@example.cz');
  await login('recepce', 'recepce@example.cz');
  await login('jana', 'jana@example.cz');
  await login('petr', 'petr@example.cz');
  await login('cizi', 'nekdo@example.cz');
}, 60_000);

describe('API platformy', () => {
  it('provozovnu zakládá jen vlastník platformy; adresa musí být volná a nevyhrazená', async () => {
    const body = { name: 'Klinika Test', slug: A, preset: 'fyzio', ownerName: 'Tereza Testová', ownerEmail: 'majitelka@example.cz', plan: 'trial', validUntil: '2026-12-17' };
    expect((await call('POST', '/platform/tenants', { as: 'cizi', body, tenant: null })).status).toBe(403);
    const ok = await call<PlatformTenant>('POST', '/platform/tenants', { as: 'platforma', body, tenant: null });
    expect(ok.status).toBe(200);
    tenantA = ok.body;
    expect(ok.body).toMatchObject({ slug: A, name: 'Klinika Test', license: { plan: 'trial', status: 'active', validUntil: '2026-12-17' }, members: 1 });
    expect(ok.body.licenseView.state).toBe('ok');
    expect((await call('POST', '/platform/tenants', { as: 'platforma', body, tenant: null })).status).toBe(409);
    expect((await call('POST', '/platform/tenants', { as: 'platforma', body: { ...body, slug: 'api' }, tenant: null })).status).toBe(400);
    expect((await call('POST', '/platform/tenants', { as: 'platforma', body: { ...body, slug: 'Špatně' }, tenant: null })).status).toBe(400);
    const list = await call<PlatformTenant[]>('GET', '/platform/tenants', { as: 'platforma', tenant: null });
    expect(list.body.map((t) => t.slug)).toEqual([A]);
  });

  it('majitel je personál provozovny; nová provozovna má ostré nastavení a tým = majitel', async () => {
    const s = await call<SessionInfo>('GET', '/session', { as: 'owner' });
    expect(s.body).toMatchObject({ role: 'owner', name: 'Tereza Testová', clinicName: 'Klinika Test', tenant: { slug: A }, platformAdmin: false, needsRegistration: false });
    expect(s.body.license?.state).toBe('ok');
    const { state } = await staffState('owner');
    expect(state.settings.features).toEqual({ clinicalNotes: false, cardPayments: false });
    expect(state.settings.messaging.deliver).toBe(true);
    expect(state.settings.preset).toBe('fyzio');
    // online rezervace začínají nespuštěné, kontakt a faktury na e-mail majitele
    expect(state.settings.bookingRules.onlineOpen).toBe(false);
    expect(state.settings.business).toMatchObject({ ico: '', email: 'majitelka@example.cz', invoiceEmail: 'majitelka@example.cz' });
    expect(state.clients).toEqual([]);
    expect(state.therapists.map((t) => `${t.firstName} ${t.lastName}`)).toEqual(['Tereza Testová']);
  });

  it('vlastník platformy má v provozovně přístup majitele (podpora)', async () => {
    const s = await call<SessionInfo>('GET', '/session', { as: 'platforma' });
    expect(s.body).toMatchObject({ platformAdmin: true, role: 'owner', tenant: { slug: A } });
    expect(s.body.name).toContain('podpora platformy');
  });

  it('bez přihlášení nic nevrátí', async () => {
    expect((await call('GET', '/state')).status).toBe(401);
    const bad = await handle(new Request('http://localhost/api/session', { headers: { authorization: 'Bearer nesmysl', 'x-tenant': A } }));
    expect(bad.status).toBe(401);
  });

  it('majitel přidá recepci; recepce přístupy spravovat nesmí', async () => {
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
      // starší verze aplikace může poslat i souhlas se SMS – SMS jsou vypnuté, souhlas nevznikne
      body: { firstName: 'Petr', lastName: 'Svoboda', phone: '+420 602 000 111', consents: { gdpr: true, health: false, marketingEmail: true, sms: true } },
    });
    expect(reg.status).toBe(200);
    expect(reg.body).toMatchObject({ role: 'client', name: 'Petr Svoboda' });
    const { state } = await staffState('owner');
    const petr = state.clients.find((c) => c.email === 'petr@example.cz')!;
    expect(petr.source).toBe('online');
    expect(petr.consents.marketingEmail).not.toBeNull();
    expect(petr.consents.sms).toBeNull();
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

  it('před spuštěním si klient online nerezervuje; majitel projde kontrolní seznam a spustí', async () => {
    const view = await call<StatePayload>('GET', '/state', { as: 'jana' });
    if (view.body.kind !== 'client') throw new Error('čekal jsem pohled klienta');
    const jana = view.body.state.clients[0];
    expect(view.body.state.settings.bookingRules.onlineOpen).toBe(false);
    // e-mail pro faktury od platformy klient nevidí
    expect(view.body.state.settings.business.invoiceEmail).toBe('');
    const { state } = await staffState('owner');
    const early = await cmd('jana', 'createBooking', { ...freeSlot(state, jana.id, '2026-11-19'), clientId: jana.id, payment: { method: 'onsite' } });
    expect(early.body).toMatchObject({ ok: false, error: 'Online rezervace připravujeme. Termín si zatím domluvte přímo s klinikou.' });

    // spouští jen majitel (recepce nastavení nemění vůbec) a až po povinných krocích
    expect((await cmd('recepce', 'updateSettings', { bookingRules: { onlineOpen: true } })).status).toBe(403);
    const notYet = await cmd('owner', 'updateSettings', { bookingRules: { onlineOpen: true } });
    expect(notYet.body).toMatchObject({
      ok: false,
      error: 'Online rezervace zatím nelze spustit – chybí: fakturační údaje, e-mail odesílatele, číslo účtu pro QR platby, obchodní podmínky a informace o zpracování údajů.',
    });
    const filled = await cmd('owner', 'updateSettings', {
      senderEmail: 'recepce@klinika-test.cz',
      business: { legalName: 'Klinika Test s.r.o.', legalForm: 'company', ico: '12345679', registeredAddress: { street: 'Ukázková 299/12', city: 'Brno', zip: '602 00' } },
      payments: { accountNumber: '19-2000145399/0800' },
      legal: { terms: '# Obchodní podmínky\n\nText podmínek.', privacy: '# Informace o zpracování osobních údajů\n\nText informací.' },
    });
    expect(filled.body.ok).toBe(true);
    expect((await cmd('owner', 'updateSettings', { bookingRules: { onlineOpen: true } })).body.ok).toBe(true);
    const after = await staffState('owner');
    expect(after.state.settings.bookingRules.onlineOpen).toBe(true);
    expect(after.state.settings.business).toMatchObject({ ico: '12345679', registeredAddress: { zip: '60200' } });
  });

  it('ARES: personál provozovny načte údaje podle IČO, chyby jsou česky', async () => {
    const found = await call<AresCompany>('GET', '/ares?ico=12345679', { as: 'owner' });
    expect(found.status).toBe(200);
    expect(found.body).toEqual({
      ico: '12345679',
      legalName: 'Pohybové studio Test s.r.o.',
      legalForm: 'company',
      dic: 'CZ12345679',
      vatPayer: true,
      registeredAddress: { street: 'Ukázková 299/12', city: 'Brno', zip: '60200' },
      registryNote: 'Společnost zapsaná v obchodním rejstříku vedeném Krajským soudem v Brně, oddíl C, vložka 12345',
    });
    expect((await call('GET', '/ares?ico=12345679', { as: 'recepce' })).status).toBe(200);
    expect((await call('GET', '/ares?ico=12345679', { as: 'jana' })).status).toBe(403);
    expect((await call('GET', '/ares?ico=12345679')).status).toBe(401);
    expect(await call<ApiError>('GET', '/ares?ico=12345678', { as: 'owner' })).toEqual({ status: 400, body: { error: 'IČO není platné – zkontrolujte číslice.', code: 'bad_request' } });
    const missing = await call<ApiError>('GET', '/ares?ico=45244782', { as: 'owner' });
    expect(missing).toMatchObject({ status: 404, body: { code: 'not_found', error: expect.stringContaining('v ARES neexistuje') } });
    const down = await call<ApiError>('GET', '/ares?ico=87654326', { as: 'owner' });
    expect(down).toMatchObject({ status: 503, body: { error: expect.stringContaining('ARES je teď nedostupný') } });
  });

  it('klient rezervuje za sebe, ne za jiné; cizí pole ani platba kartou neprojdou', async () => {
    const view = await call<StatePayload>('GET', '/state', { as: 'jana' });
    if (view.body.kind !== 'client') throw new Error('čekal jsem pohled klienta');
    const jana = view.body.state.clients[0];
    const { state } = await staffState('owner');
    const petr = state.clients.find((c) => c.email === 'petr@example.cz')!;
    const s1 = freeSlot(state, jana.id, '2026-11-19');
    const s2 = freeSlot(state, jana.id, '2026-11-19', 12);
    const pay = { payment: { method: 'onsite' } };

    const own = await cmd('jana', 'createBooking', { ...s1, ...pay, clientId: jana.id }, 'janabook01');
    expect(own.body).toMatchObject({ ok: true, value: 'b_janabook01-0' });
    expect(own.body.ok && 'changes' in own.body && own.body.changes).toBeFalsy(); // klient nedostává části stavu

    const foreign = await cmd('jana', 'createBooking', { ...s2, ...pay, clientId: petr.id });
    expect(foreign.body).toMatchObject({ ok: false });
    const extra = await cmd('jana', 'createBooking', { ...s2, ...pay, clientId: jana.id, override: true });
    expect(extra.status).toBe(400);
    const card = await cmd('jana', 'createBooking', { ...s2, clientId: jana.id, payment: { method: 'online' } });
    expect(card.status).toBe(400);

    expect((await cmd('jana', 'updateSettings', { patch: {} })).status).toBe(403);
    expect((await cmd('jana', 'updateClient', { clientId: jana.id, patch: { internalNote: 'x' } })).status).toBe(400);
    expect((await cmd('jana', 'neexistuje', {})).status).toBe(400);
    expect((await call('POST', '/command', { as: 'jana', body: { name: 'createBooking', input: { ...s1, ...pay, clientId: jana.id }, commandId: 'x' } })).status).toBe(400);
  });

  it('opakované odeslání stejného příkazu se neprovede dvakrát', async () => {
    const view = await call<StatePayload>('GET', '/state', { as: 'jana' });
    if (view.body.kind !== 'client') throw new Error('čekal jsem pohled klienta');
    const jana = view.body.state.clients[0];
    const { state } = await staffState('owner');
    const input = { ...freeSlot(state, jana.id, '2026-11-20'), clientId: jana.id, payment: { method: 'onsite' } };
    const first = await cmd('jana', 'createBooking', input, 'dupl000001');
    expect(first.body.ok).toBe(true);
    const retry = await cmd('jana', 'createBooking', input, 'dupl000001', true);
    expect(retry.body).toMatchObject({ ok: true, duplicate: true });
    const after = await staffState('owner');
    expect(after.state.bookings.filter((b) => b.id === 'b_dupl000001-0')).toHaveLength(1);
  });

  it('personál dostane změněné části a dočte jen rozdíl', async () => {
    const before = await staffState('recepce');
    const jana = before.state.clients.find((c) => c.email === 'jana@example.cz')!;
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

  it('ostrý provoz nedovolí zapnout simulované platby kartou ani vypnout odesílání zpráv', async () => {
    expect((await cmd('owner', 'updateSettings', { features: { cardPayments: true } })).status).toBe(400);
    expect((await cmd('owner', 'updateSettings', { messaging: { deliver: false } })).status).toBe(400);
    const ok = await cmd('owner', 'updateSettings', { modules: { marketing: false }, branding: { accent: '#7c3aed' } });
    expect(ok.body.ok).toBe(true);
  });

  it('veřejné údaje provozovny (bez přihlášení): název, vzhled, názvosloví, právní texty', async () => {
    const t = await call<PublicTenant>('GET', '/tenant');
    expect(t.status).toBe(200);
    // právní texty majitel uložil před spuštěním online rezervací
    expect(t.body).toMatchObject({ slug: A, name: 'Klinika Test', branding: { accent: '#7c3aed', logo: null }, legal: { terms: true, privacy: true }, license: { state: 'ok' } });
    // identifikace podnikatele pro web (§ 435 OZ) z fakturačních údajů
    expect(t.body.identity).toEqual(['Klinika Test s.r.o., Ukázková 299/12, 602 00 Brno, IČO 12345679']);
    expect(t.body.terms.staff.sg[0]).toBeTruthy();
    expect((await call('GET', '/tenant', { tenant: 'neexistuje' })).status).toBe(404);
    expect((await call<{ text: string }>('GET', '/legal?doc=privacy')).body.text).toContain('Text informací.');
    await cmd('owner', 'updateSettings', { legal: { terms: '# Obchodní podmínky\n\nText.' } });
    const legal = await call<{ title: string; text: string }>('GET', '/legal?doc=terms');
    expect(legal.body).toMatchObject({ title: 'Obchodní podmínky', text: '# Obchodní podmínky\n\nText.' });
  });

  it('provozovny jsou oddělené – data, přístupy i klienti', async () => {
    const b = await call<PlatformTenant>('POST', '/platform/tenants', {
      as: 'platforma',
      tenant: null,
      body: { name: 'Studio B', slug: 'studio-b', preset: 'prazdna', ownerName: 'Bořek Béčko', ownerEmail: 'majitel-b@example.cz', plan: 'lifetime', validUntil: '2027-11-17' },
    });
    expect(b.status).toBe(200);
    // doživotní licence nese datum konce zaplaceného provozu a podpory
    expect(b.body.license).toMatchObject({ plan: 'lifetime', validUntil: '2027-11-17' });
    expect(b.body.licenseView.state).toBe('ok');
    // majitel A v provozovně B nic nemá
    expect((await call('GET', '/state', { as: 'owner', tenant: 'studio-b' })).status).toBe(403);
    // klientka A je v B nová – musela by se zaregistrovat
    expect((await call<SessionInfo>('GET', '/session', { as: 'jana', tenant: 'studio-b' })).body).toMatchObject({ role: null, needsRegistration: true });
    const sb = await staffState('ownerB', 'studio-b');
    expect(sb.state.clients).toEqual([]);
    expect(sb.state.services).toEqual([]);
    expect(sb.state.settings.bookingRules.onlineOpen).toBe(false);
    // bez vlastních právních textů zatím nic nezveřejňuje
    expect((await call('GET', '/legal?doc=terms', { tenant: 'studio-b' })).status).toBe(404);
    // adresa bez provozovny už nevede nikam (na platformě jsou dvě)
    expect((await call('GET', '/tenant', { tenant: null })).status).toBe(404);
    expect((await call<SessionInfo>('GET', '/session', { as: 'platforma', tenant: null })).body).toMatchObject({ platformAdmin: true, tenant: null, role: null });
    expect((await call('GET', '/session', { as: 'owner', tenant: null })).status).toBe(404);
    // vlastní doména provozovny
    const d = await call<PlatformTenant>('PUT', `/platform/tenants/${b.body.id}/domains`, { as: 'platforma', tenant: null, body: { domains: ['rezervace.studio-b.cz'] } });
    expect(d.body.domains).toEqual(['rezervace.studio-b.cz']);
    const byHost = await call<PublicTenant>('GET', '/tenant', { tenant: null, headers: { 'x-tenant-host': 'rezervace.studio-b.cz' } });
    expect(byHost.body.slug).toBe('studio-b');
    expect((await call('PUT', `/platform/tenants/${tenantA.id}/domains`, { as: 'platforma', tenant: null, body: { domains: ['rezervace.studio-b.cz'] } })).status).toBe(409);
  });

  it('licence: po vypršení lhůty jen čtení, pozastavení zavře přístup; podpora platformy může vždy', async () => {
    const path = `/platform/tenants/${tenantA.id}`;
    // platnost skončila před měsícem → po 14denní lhůtě jen čtení
    const ro = await call<PlatformTenant>('PATCH', path, { as: 'platforma', tenant: null, body: { plan: 'monthly', validUntil: '2026-10-17' } });
    expect(ro.body.licenseView.state).toBe('readonly');
    expect((await call('GET', '/state', { as: 'owner' })).status).toBe(200);
    const blockedWrite = await cmd('owner', 'createClient', { firstName: 'X', lastName: 'Y', email: 'x@example.cz', phone: '', consents: { gdpr: true, health: false, marketingEmail: false, sms: false } });
    expect(blockedWrite.status).toBe(423);
    expect((await call<SessionInfo>('GET', '/session', { as: 'owner' })).body.license?.state).toBe('readonly');
    // klient: nové rezervace ne, ale souhlas odvolat může
    const view = await call<StatePayload>('GET', '/state', { as: 'jana' });
    if (view.body.kind !== 'client') throw new Error('čekal jsem pohled klienta');
    const jana = view.body.state.clients[0];
    expect((await cmd('jana', 'setConsent', { clientId: jana.id, key: 'sms', value: false })).body.ok).toBe(true);

    // v lhůtě po konci platnosti vše funguje
    const grace = await call<PlatformTenant>('PATCH', path, { as: 'platforma', tenant: null, body: { validUntil: '2026-11-10' } });
    expect(grace.body.licenseView.state).toBe('grace');
    expect((await cmd('owner', 'updateSettings', { clinicTagline: 'v lhůtě' })).body.ok).toBe(true);

    // pozastavení: tým ani klienti se nedostanou, majitel data jen prohlédne a vyexportuje
    await call('PATCH', path, { as: 'platforma', tenant: null, body: { status: 'suspended' } });
    expect((await call('GET', '/state', { as: 'owner' })).status).toBe(200);
    expect((await cmd('owner', 'logClientDataExport', { clientId: jana.id })).body.ok).toBe(true);
    expect((await cmd('owner', 'updateSettings', { clinicTagline: 'pozastaveno' })).status).toBe(423);
    expect((await call('GET', '/state', { as: 'recepce' })).status).toBe(423);
    expect((await call('GET', '/state', { as: 'jana' })).status).toBe(423);
    expect((await call<PublicTenant>('GET', '/tenant')).body.license.state).toBe('blocked');
    expect((await call('GET', '/state', { as: 'platforma' })).status).toBe(200);
    const cronRun = await call<{ clinics: { slug: string; license: string; processes?: unknown }[] }>('POST', '/cron', { headers: { 'x-cron-secret': CRON }, tenant: null });
    const a = cronRun.body.clinics.find((c) => c.slug === A)!;
    expect(a.license).toBe('blocked');
    expect(a.processes).toBeUndefined();

    // obnovení – doživotní licence; bez zaplaceného provozu se chová jako předplatné po konci platnosti
    const due = await call<PlatformTenant>('PATCH', path, { as: 'platforma', tenant: null, body: { status: 'active', plan: 'lifetime', validUntil: '2026-11-25' } });
    expect(due.body.licenseView.state).toBe('expiring');
    const unpaid = await call<PlatformTenant>('PATCH', path, { as: 'platforma', tenant: null, body: { validUntil: '2026-10-01' } });
    expect(unpaid.body.licenseView.state).toBe('readonly');
    expect((await cmd('owner', 'updateSettings', { clinicTagline: 'nezaplaceno' })).status).toBe(423);
    const back = await call<PlatformTenant>('PATCH', path, { as: 'platforma', tenant: null, body: { validUntil: null } });
    expect(back.body.licenseView.state).toBe('ok');
    expect((await call('GET', '/state', { as: 'owner' })).status).toBe(200);
  });

  it('tajné údaje provozovny (token Fio) se ukládají šifrovaně', async () => {
    const token = 'AbCdEf0123456789AbCdEf0123456789AbCdEf0123456789';
    expect((await call('PUT', `/platform/tenants/${tenantA.id}/secrets`, { as: 'owner', tenant: null, body: { fioToken: token } })).status).toBe(403);
    const r = await call<{ key: string }[]>('PUT', `/platform/tenants/${tenantA.id}/secrets`, { as: 'platforma', tenant: null, body: { fioToken: token } });
    expect(r.body.map((x) => x.key)).toEqual(['fio_token']);
    const raw = await db.query<{ value: string }>('select value from app.clinic_secrets where key = $1', ['fio_token']);
    expect(raw.rows[0].value).not.toContain(token);
    expect(await decryptSecret(SECRETS_KEY, raw.rows[0].value)).toBe(token);
    const cleared = await call<{ key: string }[]>('PUT', `/platform/tenants/${tenantA.id}/secrets`, { as: 'platforma', tenant: null, body: { fioToken: null } });
    expect(cleared.body).toEqual([]);
  });

  it('vlastník platformy dostane jednou denně přehled končících licencí', async () => {
    const list = await call<PlatformTenant[]>('GET', '/platform/tenants', { as: 'platforma', tenant: null });
    const b = list.body.find((t) => t.slug === 'studio-b')!;
    await call('PATCH', `/platform/tenants/${b.id}`, { as: 'platforma', tenant: null, body: { plan: 'monthly', validUntil: '2026-11-24' } });
    const before = digests.length;
    const first = await call<{ licenseDigest: string }>('POST', '/cron', { headers: { 'x-cron-secret': CRON }, tenant: null });
    expect(first.body.licenseDigest).toBe('odesláno (1)');
    expect(digests.length).toBe(before + 1);
    expect(digests.at(-1)![0]).toMatchObject({ slug: 'studio-b', state: 'expiring', daysLeft: 7 });
    const second = await call<{ licenseDigest: string }>('POST', '/cron', { headers: { 'x-cron-secret': CRON }, tenant: null });
    expect(second.body.licenseDigest).toBe('dnes už odesláno');
    const mail = licenseDigestText(digests.at(-1)!, 'https://app.example.cz');
    expect(mail.subject).toBe('Licence ke kontrole: 1 provozovna');
    expect(mail.text).toContain('Studio B (/studio-b): Měsíční licence do 24. 11. 2026 – končí – zbývá 7 d.');
    expect(mail.text).toContain('https://app.example.cz/platforma');
    await call('PATCH', `/platform/tenants/${b.id}`, { as: 'platforma', tenant: null, body: { plan: 'lifetime', validUntil: null } });
  });

  it('automatika běží jen s tajným klíčem a pro všechny provozovny', async () => {
    expect((await call('POST', '/cron', { tenant: null })).status).toBe(401);
    const r = await call<{ ok: boolean; clinics: { slug: string }[] }>('POST', '/cron', { headers: { 'x-cron-secret': CRON }, tenant: null });
    expect(r.status).toBe(200);
    expect(r.body.clinics.map((c) => c.slug).sort()).toEqual([A, 'studio-b']);
  });

  it('CORS jen pro povolený původ (včetně hlaviček provozovny)', async () => {
    const pre = await handle(new Request('http://localhost/api/command', { method: 'OPTIONS', headers: { origin: 'https://rezervace.example.cz' } }));
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe('https://rezervace.example.cz');
    expect(pre.headers.get('access-control-allow-headers')).toContain('x-tenant');
    const other = await handle(new Request('http://localhost/api/health', { headers: { origin: 'https://zly.example.com' } }));
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('CORS pro aplikaci v podadresáři (GitHub Pages): v ALLOWED_ORIGINS se počítá jen původ', async () => {
    const env = { SUPABASE_URL: 'https://projekt.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service' };
    const preflight = (origin: string) => new Request('https://projekt.supabase.co/functions/v1/api/command', { method: 'OPTIONS', headers: { origin } });
    for (const allowed of ['https://michalcipro.github.io', 'https://michalcipro.github.io/rezerva-n--system/app/']) {
      const edge = createEdgeHandler({ ...env, ALLOWED_ORIGINS: `${allowed}, https://rezervace.example.cz` });
      expect((await edge(preflight('https://michalcipro.github.io'))).headers.get('access-control-allow-origin')).toBe('https://michalcipro.github.io');
      expect((await edge(preflight('https://rezervace.example.cz'))).headers.get('access-control-allow-origin')).toBe('https://rezervace.example.cz');
      expect((await edge(preflight('https://jiny.github.io'))).headers.get('access-control-allow-origin')).toBeNull();
    }
  });

  it('anonymizace klienta (jen majitel) zruší i propojení jeho přihlášení', async () => {
    const { state } = await staffState('owner');
    const petr = state.clients.find((c) => c.email === 'petr@example.cz')!;
    expect((await call<SessionInfo>('GET', '/session', { as: 'petr' })).body.role).toBe('client');
    expect((await cmd('recepce', 'anonymizeClient', { clientId: petr.id })).status).toBe(403);
    const r = await cmd('owner', 'anonymizeClient', { clientId: petr.id });
    expect(r.body.ok).toBe(true);
    const after = await call<SessionInfo>('GET', '/session', { as: 'petr' });
    expect(after.body).toMatchObject({ role: null, needsRegistration: true });
    expect((await call('GET', '/state', { as: 'petr' })).status).toBe(403);
  });

  it('cesta funguje i s předponou Supabase Edge Function', async () => {
    const res = await handle(new Request('http://localhost/functions/v1/api/health'));
    expect(res.status).toBe(200);
  });
});

describe('Pozvánka majitele nové provozovny', () => {
  const tenantBody = (slug: string, ownerEmail: string) => ({ name: `Studio ${slug}`, slug, preset: 'masaze', ownerName: 'Olga Pozvaná', ownerEmail, plan: 'trial', validUntil: '2026-12-17' });
  const tenantId = async (slug: string): Promise<string> =>
    (await call<PlatformTenant[]>('GET', '/platform/tenants', { as: 'platforma', tenant: null })).body.find((t) => t.slug === slug)!.id;

  it('založení pošle majiteli pozvánku: zakladatel, adresa s podadresářem, přihlášení kódem, první kroky', async () => {
    const before = mails.length;
    const r = await call<CreateTenantResponse>('POST', '/platform/tenants', {
      as: 'platforma',
      tenant: null,
      body: { name: 'Masáže U Lípy & spol.', slug: 'masaze-u-lipy', preset: 'masaze', ownerName: 'Olga Lípová', ownerEmail: 'Olga@Example.cz', plan: 'trial', validUntil: '2026-12-17' },
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ slug: 'masaze-u-lipy', name: 'Masáže U Lípy & spol.', invite: 'sent', owners: [{ email: 'olga@example.cz' }] });
    expect(mails.length).toBe(before + 1);
    const m = mails.at(-1)!;
    expect(m).toMatchObject({ to: 'olga@example.cz', toName: 'Olga Lípová', fromName: 'Testovací platforma', replyTo: 'podpora@example.cz' });
    expect(m.subject).toBe('Pozvánka do rezervačního systému: Masáže U Lípy & spol.');
    const url = `${APP_URL}/masaze-u-lipy`;
    for (const part of ['„Masáže U Lípy & spol.“', 'Testovací platforma', url, 'olga@example.cz', 'jednorázový kód', 'Žádné heslo', 'podpora@example.cz'])
      expect(m.text).toContain(part);
    // co nastavit nejdřív – v tomto pořadí, spuštění rezervací nakonec
    const steps = ['Fakturační údaje', 'Služby a ceník', 'Tým a pracovní doby', 'Platby', 'Právní texty', '„Spustit online rezervace“'].map((x) => m.text.indexOf(x));
    expect(steps.every((i) => i > 0)).toBe(true);
    expect(steps).toEqual([...steps].sort((a, b) => a - b));
    // jednoduché HTML jako ostatní e-maily: klikací adresa, escapovaný text
    expect(m.html).toContain(`<a href="${url}"`);
    expect(m.html).toContain('Masáže U Lípy &amp; spol.');
    expect(m.html).not.toContain('Lípy & spol.');
    // majitel se na adrese přihlásí e-mailem z pozvánky
    await login('olga', 'olga@example.cz');
    expect((await call<SessionInfo>('GET', '/session', { as: 'olga', tenant: 'masaze-u-lipy' })).body).toMatchObject({ role: 'owner', tenant: { slug: 'masaze-u-lipy' } });
  });

  it('text pozvánky: adresa i z PUBLIC_APP_URL s lomítkem, bez podpory žádný kontakt ani odpověď', () => {
    expect(tenantAppUrl(`${APP_URL}/`, 'pohyb')).toBe(`${APP_URL}/pohyb`);
    expect(tenantAppUrl('https://app.example.cz', 'pohyb')).toBe('https://app.example.cz/pohyb');
    const m = tenantInviteEmail({ tenantName: 'Pohyb', slug: 'pohyb', owner: { name: '', email: 'a@example.cz' }, appUrl: 'https://app.example.cz/', platformName: 'Platforma' });
    expect(m.text).toContain('https://app.example.cz/pohyb');
    expect(m.text).not.toContain('pomůžeme');
    expect(m.replyTo).toBeUndefined();
    expect(m.toName).toBeUndefined();
  });

  it('nepovedené odeslání založení neshodí – odpověď řekne „failed“, v logu nejsou e-mailové adresy', async () => {
    const logged = logs.length;
    mailMode = 'fail';
    const failed = await call<CreateTenantResponse>('POST', '/platform/tenants', { as: 'platforma', tenant: null, body: tenantBody('studio-chyba', 'chyba@example.cz') });
    mailMode = 'throw';
    const thrown = await call<CreateTenantResponse>('POST', '/platform/tenants', { as: 'platforma', tenant: null, body: tenantBody('studio-vypadek', 'vypadek@example.cz') });
    mailMode = 'ok';
    expect([failed.status, failed.body.invite]).toEqual([200, 'failed']);
    expect([thrown.status, thrown.body.invite]).toEqual([200, 'failed']);
    // provozovny existují a majitel se přihlásí
    const slugs = (await call<PlatformTenant[]>('GET', '/platform/tenants', { as: 'platforma', tenant: null })).body.map((t) => t.slug);
    expect(slugs).toEqual(expect.arrayContaining(['studio-chyba', 'studio-vypadek']));
    await login('chyba', 'chyba@example.cz');
    expect((await call<SessionInfo>('GET', '/session', { as: 'chyba', tenant: 'studio-chyba' })).body.role).toBe('owner');
    const problems = logs.slice(logged).filter((l) => l.message.startsWith('Pozvánku majitele'));
    expect(problems.map((l) => l.detail?.slug)).toEqual(['studio-chyba', 'studio-vypadek']);
    expect(JSON.stringify(problems)).not.toContain('@');
  });

  it('pozvánku znovu pošle jen vlastník platformy, a to všem majitelům provozovny', async () => {
    const path = `/platform/tenants/${await tenantId('studio-chyba')}/invite`;
    expect((await call('POST', path, { tenant: null })).status).toBe(401);
    expect((await call('POST', path, { as: 'chyba', tenant: null })).status).toBe(403);
    expect((await call('POST', path, { as: 'cizi', tenant: null })).status).toBe(403);
    expect((await call('POST', path, { as: 'chyba', tenant: 'studio-chyba' })).status).toBe(403);
    // druhý majitel
    await call('POST', '/members', { as: 'chyba', tenant: 'studio-chyba', body: { email: 'spolumajitel@example.cz', role: 'owner', displayName: 'Spolu Majitel' } });
    const before = mails.length;
    const r = await call<InviteResponse>('POST', path, { as: 'platforma', tenant: null });
    expect(r.status).toBe(200);
    expect(r.body.invite).toBe('sent');
    expect([...r.body.to].sort()).toEqual(['chyba@example.cz', 'spolumajitel@example.cz']);
    expect(mails.slice(before).map((m) => m.to).sort()).toEqual(['chyba@example.cz', 'spolumajitel@example.cz']);
    expect(mails.at(-1)!.text).toContain(`${APP_URL}/studio-chyba`);
    // selhání u opakovaného odeslání
    mailMode = 'fail';
    expect((await call<InviteResponse>('POST', path, { as: 'platforma', tenant: null })).body.invite).toBe('failed');
    mailMode = 'ok';
    // neexistující provozovna, jiná metoda
    expect((await call('POST', '/platform/tenants/00000000-0000-4000-8000-000000000000/invite', { as: 'platforma', tenant: null })).status).toBe(404);
    expect((await call('GET', path, { as: 'platforma', tenant: null })).status).toBe(405);
  });

  it('provozovna bez majitele: pozvánku není komu poslat', async () => {
    const path = `/platform/tenants/${await tenantId('studio-vypadek')}/invite`;
    // podpora platformy odebere jediného majitele
    const members = await call<MemberView[]>('GET', '/members', { as: 'platforma', tenant: 'studio-vypadek' });
    const owner = members.body.find((x) => x.email === 'vypadek@example.cz')!;
    expect((await call('DELETE', `/members?userId=${owner.userId}`, { as: 'platforma', tenant: 'studio-vypadek' })).status).toBe(200);
    const r = await call<ApiError>('POST', path, { as: 'platforma', tenant: null });
    expect(r.status).toBe(409);
    expect(r.body.error).toContain('nemá majitele');
  });

  it('bez odesílání e-mailů nebo adresy aplikace se pozvánka neposílá („not_configured“), založení projde', async () => {
    const base = { store, auth, devAuth: auth, clock: () => CLOCK, platformAdmins: ['platforma@example.cz'], log: () => undefined };
    const withoutMail = createApi({ ...base, publicAppUrl: APP_URL });
    const withoutUrl = createApi({ ...base, messenger });
    const badUrl = createApi({ ...base, messenger, publicAppUrl: 'michalcipro.github.io/rezerva-n--system/app' });
    const before = mails.length;
    const r = await call<CreateTenantResponse>('POST', '/platform/tenants', { handler: withoutMail, as: 'platforma', tenant: null, body: tenantBody('studio-bez-posty', 'bez-posty@example.cz') });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ slug: 'studio-bez-posty', invite: 'not_configured' });
    const path = `/platform/tenants/${r.body.id}/invite`;
    for (const handler of [withoutMail, withoutUrl, badUrl])
      expect((await call<InviteResponse>('POST', path, { handler, as: 'platforma', tenant: null })).body).toEqual({ invite: 'not_configured', to: ['bez-posty@example.cz'] });
    // oprávnění platí i bez nastavení e-mailů
    expect((await call('POST', path, { handler: withoutMail, as: 'owner', tenant: null })).status).toBe(403);
    expect(mails.length).toBe(before);
    // s úplným nastavením odejde
    expect((await call<InviteResponse>('POST', path, { as: 'platforma', tenant: null })).body.invite).toBe('sent');
    expect(mails.length).toBe(before + 1);
  });
});
