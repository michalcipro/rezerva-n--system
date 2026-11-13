import type {
  AddMemberRequest,
  ApiError,
  ChunkData,
  CommandRequest,
  CommandResponse,
  MemberView,
  RegisterRequest,
  SessionInfo,
  StaffRole,
  StatePayload,
} from '../src/api/protocol';
import type { Actor, ClinicState } from '../src/domain/types';
import { createClient, setConsent } from '../src/engine/commands';
import { createBaseState } from '../src/engine/defaults';
import { runProcesses } from '../src/engine/processes';
import { commandFor } from '../src/engine/registry';
import { clientName, getClient } from '../src/engine/selectors';
import { dateOf } from '../src/engine/time';
import { safeEqual, type AuthService, type AuthUser, type DevAuth } from './auth';
import { ClinicEngine, isValidCommandId } from './core/executor';
import { projectForClient } from './core/projection';
import { stateToChunkJson } from './core/state';
import { pragueNow } from './core/time';
import { verifyUnsubscribe } from './core/unsubscribe';
import { validateInput } from './core/validate';
import type { StateStore } from './store/types';

/**
 * HTTP API rezervačního systému. Používá jen standardní Request/Response, takže stejný kód běží
 * v Supabase Edge Function (Deno) i v lokálním vývojovém serveru (Node).
 *
 *   GET  /api/health                stav služby
 *   GET  /api/session               kdo je přihlášený (personál / klient / čeká na registraci)
 *   POST /api/register              registrace klienta po prvním přihlášení
 *   GET  /api/state                 celý stav (personál po částech, klient svůj pohled)
 *   GET  /api/changes?since=&hash=  změny od verze
 *   POST /api/command               provedení příkazu enginu
 *   GET|POST|DELETE /api/members    přístupy personálu (jen majitel)
 *   POST /api/cron                  automatika (hlavička x-cron-secret)
 *   POST /api/admin/bootstrap       první založení kliniky (hlavička x-admin-secret)
 *   GET|POST /api/unsubscribe       odhlášení z novinek odkazem z e-mailu (podepsaný odkaz)
 *   POST /api/dev/login             přihlášení bez e-mailu – jen při lokálním vývoji
 */

export interface CronContext {
  clinicId: string;
  engine: ClinicEngine;
  store: StateStore;
  now: () => string;
}

export interface ApiDeps {
  store: StateStore;
  auth: AuthService;
  engine?: ClinicEngine;
  /** Skutečný čas (testy ho mohou podstrčit). */
  clock?: () => Date;
  /** Tajemství pro /api/cron (bez něj je automatika přes API vypnutá). */
  cronSecret?: string;
  /** Tajemství pro /api/admin/bootstrap (bez něj je zakládání kliniky vypnuté). */
  adminSecret?: string;
  /** Povolené původy pro CORS (např. https://rezervace.klinika.cz). */
  allowedOrigins?: string[];
  /** Klinika, ke které se registrují klienti (jinak první založená). */
  defaultClinicId?: string;
  /** Lokální vývoj: přihlášení bez e-mailu. */
  devAuth?: DevAuth;
  /** Platby kartou online – jen s napojenou platební bránou (zatím žádná). */
  cardPayments?: boolean;
  /** Další práce automatiky po spuštění procesů (odeslání zpráv, párování plateb). */
  cronJobs?: ((ctx: CronContext) => Promise<Record<string, unknown>>)[];
  /** Tajemství pro podpis odkazů na odhlášení z novinek. */
  unsubscribeSecret?: string;
  /** Akce po úspěšném příkazu (např. zrušení propojení účtu po anonymizaci klienta). */
  afterCommand?: Record<string, (ctx: { clinicId: string; input: unknown; store: StateStore }) => Promise<void>>;
  log?: (message: string, detail?: Record<string, unknown>) => void;
}

type Json = Record<string, unknown> | unknown[];

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: ApiError['code'] = 'bad_request',
  ) {
    super(message);
  }
}

const SYSTEM_ACTOR: Actor = { role: 'owner', name: 'Systém' };
const REGISTRATION_ACTOR: Actor = { role: 'reception', name: 'Online registrace' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STAFF_ROLES: readonly StaffRole[] = ['owner', 'reception', 'therapist'];

/** FNV-1a – krátký otisk pohledu klienta (zda se od minula něco změnilo). */
function hashText(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995);
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36) + text.length.toString(36);
}

/** Jednoduché omezení počtu požadavků v paměti instance (ochrana před zahlcením, ne přesná kvóta). */
class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}
  allow(key: string, now: number): boolean {
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (list.length >= this.limit) {
      this.hits.set(key, list);
      return false;
    }
    list.push(now);
    this.hits.set(key, list);
    if (this.hits.size > 5000) this.hits.clear();
    return true;
  }
}

type Resolved =
  | { kind: 'staff'; clinicId: string; role: StaffRole; name: string; therapistId: string | null }
  | { kind: 'client'; clinicId: string; clientId: string }
  | { kind: 'none'; clinicId: string | null };

export function createApi(deps: ApiDeps): (req: Request) => Promise<Response> {
  const store = deps.store;
  const engine = deps.engine ?? new ClinicEngine(store);
  const clock = deps.clock ?? (() => new Date());
  const now = (): string => pragueNow(clock());
  const log = deps.log ?? ((m: string, d?: Record<string, unknown>) => console.log(m, d ?? ''));
  const commandLimiter = new RateLimiter(120, 60_000);
  const requestLimiter = new RateLimiter(600, 60_000);
  const openLimiter = new RateLimiter(20, 60_000);
  const registering = new Set<string>();
  let defaultClinicCache: { id: string | null; at: number } | null = null;

  /* ---------------------------- pomocné ---------------------------- */

  function corsHeaders(req: Request): Record<string, string> {
    const origin = req.headers.get('origin');
    if (!origin) return {};
    const allowed =
      (deps.allowedOrigins ?? []).includes(origin) || (!!deps.devAuth && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
    if (!allowed) return {};
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
    };
  }

  function json(req: Request, status: number, body: Json | string): Response {
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...corsHeaders(req) },
    });
  }

  async function readJson<T>(req: Request, maxBytes: number): Promise<T> {
    const declared = Number(req.headers.get('content-length') ?? '0');
    if (declared > maxBytes) throw new HttpError(413, 'Požadavek je příliš velký.');
    const text = await req.text();
    if (text.length > maxBytes) throw new HttpError(413, 'Požadavek je příliš velký.');
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new HttpError(400, 'Neplatný formát požadavku.');
    }
  }

  async function authenticate(req: Request): Promise<AuthUser> {
    const header = req.headers.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const user = token ? await deps.auth.verify(token) : null;
    if (!user) throw new HttpError(401, 'Přihlaste se prosím znovu.', 'unauthorized');
    if (!requestLimiter.allow('u:' + user.id, Date.now())) throw new HttpError(429, 'Příliš mnoho požadavků. Zkuste to za chvíli.', 'rate_limited');
    return user;
  }

  async function defaultClinic(): Promise<string | null> {
    if (deps.defaultClinicId) return deps.defaultClinicId;
    if (defaultClinicCache && Date.now() - defaultClinicCache.at < 60_000) return defaultClinicCache.id;
    const clinics = await store.listClinics();
    defaultClinicCache = { id: clinics[0]?.id ?? null, at: Date.now() };
    return defaultClinicCache.id;
  }

  async function resolve(user: AuthUser): Promise<Resolved> {
    const who = await store.whoami(user.id);
    const preferred = deps.defaultClinicId;
    const member = who.members.find((m) => !preferred || m.clinicId === preferred) ?? who.members[0];
    if (member) {
      return { kind: 'staff', clinicId: member.clinicId, role: member.role, name: member.displayName || user.email, therapistId: member.therapistId };
    }
    const link = who.clients.find((c) => !preferred || c.clinicId === preferred) ?? who.clients[0];
    if (link) return { kind: 'client', clinicId: link.clinicId, clientId: link.clientId };
    return { kind: 'none', clinicId: await defaultClinic() };
  }

  async function loadState(clinicId: string): Promise<{ version: number; state: ClinicState; chunkJson: Map<string, string> }> {
    const loaded = await engine.current(clinicId);
    if (!loaded) throw new HttpError(404, 'Klinika nemá založená data.', 'not_found');
    return loaded;
  }

  /** Klienta s ověřeným e-mailem propojí s existující kartou v kartotéce. */
  async function linkByEmail(user: AuthUser, clinicId: string): Promise<string | null> {
    if (!user.emailVerified) return null;
    const { state } = await loadState(clinicId);
    const match = state.clients
      .filter((c) => c.email === user.email && !(c as { anonymizedAt?: string }).anonymizedAt)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    if (!match) return null;
    try {
      await store.linkClient(clinicId, user.id, match.id);
    } catch {
      throw new HttpError(409, 'Karta s tímto e-mailem je už propojená s jiným přihlášením. Ozvěte se prosím klinice.', 'conflict');
    }
    return match.id;
  }

  async function sessionInfo(user: AuthUser, r: Resolved): Promise<SessionInfo> {
    const base = { user: { id: user.id, email: user.email }, clinicId: r.clinicId };
    if (r.kind === 'staff') {
      const { state } = await loadState(r.clinicId);
      return { ...base, clinicName: state.settings.clinicName, role: r.role, name: r.name, therapistId: r.therapistId, clientId: null, needsRegistration: false };
    }
    if (r.kind === 'client') {
      const { state } = await loadState(r.clinicId);
      const c = getClient(state, r.clientId);
      return {
        ...base,
        clinicName: state.settings.clinicName,
        role: 'client',
        name: c ? clientName(c) : user.email,
        therapistId: null,
        clientId: r.clientId,
        needsRegistration: false,
      };
    }
    let clinicName = '';
    if (r.clinicId) clinicName = (await loadState(r.clinicId)).state.settings.clinicName;
    return { ...base, clinicName, role: null, name: user.email, therapistId: null, clientId: null, needsRegistration: !!r.clinicId };
  }

  function actorOf(r: Resolved, state: ClinicState): Actor {
    if (r.kind === 'staff') return { role: r.role, name: r.name, therapistId: r.therapistId ?? undefined };
    if (r.kind === 'client') {
      const c = getClient(state, r.clientId);
      return { role: 'client', name: c ? clientName(c) : 'Klient', clientId: r.clientId };
    }
    throw new HttpError(403, 'Nemáte přístup.', 'forbidden');
  }

  /** Bez platební brány nesmí projít žádná „platba kartou online“ (v enginu je to jen simulace). */
  function violatesPaymentPolicy(name: string, input: Record<string, unknown>): boolean {
    if (deps.cardPayments) return false;
    const method = (input.payment as { method?: unknown } | undefined)?.method;
    if ((name === 'createBooking' || name === 'acceptWaitlistOffer') && method === 'online') return true;
    if (name === 'sellPackage' && input.paidBy === 'online') return true;
    if (name === 'topUpCredit' && input.method === 'online') return true;
    if (name === 'updateSettings') {
      const features = (input.patch as { features?: { cardPayments?: unknown } } | undefined)?.features;
      if (features?.cardPayments === true) return true;
    }
    return false;
  }

  function newCommandId(prefix: string): string {
    return `${prefix}-${crypto.randomUUID()}`.slice(0, 40);
  }

  function requireOwner(r: Resolved): asserts r is Extract<Resolved, { kind: 'staff' }> {
    if (r.kind !== 'staff' || r.role !== 'owner') throw new HttpError(403, 'Přístupy spravuje jen majitel kliniky.', 'forbidden');
  }

  function checkSecret(req: Request, header: string, secret: string | undefined): void {
    const given = req.headers.get(header) ?? '';
    if (!secret || !given || !safeEqual(given, secret)) throw new HttpError(401, 'Neplatný klíč.', 'unauthorized');
  }

  /* ---------------------------- trasy ---------------------------- */

  async function getSession(req: Request): Promise<Response> {
    const user = await authenticate(req);
    let r = await resolve(user);
    if (r.kind === 'none' && r.clinicId) {
      const clientId = await linkByEmail(user, r.clinicId);
      if (clientId) r = { kind: 'client', clinicId: r.clinicId, clientId };
    }
    return json(req, 200, (await sessionInfo(user, r)) as unknown as Json);
  }

  async function register(req: Request): Promise<Response> {
    const user = await authenticate(req);
    const body = await readJson<RegisterRequest>(req, 16_000);
    let r = await resolve(user);
    if (r.kind !== 'none') return json(req, 200, (await sessionInfo(user, r)) as unknown as Json);
    if (!r.clinicId) throw new HttpError(404, 'Klinika zatím není založená.', 'not_found');
    if (!user.emailVerified) throw new HttpError(403, 'Nejdřív prosím ověřte e-mail.', 'forbidden');
    const existing = await linkByEmail(user, r.clinicId);
    if (existing) return json(req, 200, (await sessionInfo(user, { kind: 'client', clinicId: r.clinicId, clientId: existing })) as unknown as Json);

    const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
    const consents = body?.consents ?? ({} as RegisterRequest['consents']);
    const birth = typeof body?.birthDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.birthDate) ? body.birthDate : null;
    if (registering.has(user.id)) throw new HttpError(409, 'Registrace už probíhá.', 'conflict');
    registering.add(user.id);
    try {
      const result = await engine.execute(
        r.clinicId,
        createClient,
        {
          firstName: str(body?.firstName, 80),
          lastName: str(body?.lastName, 80),
          email: user.email,
          phone: str(body?.phone, 40),
          birthDate: birth,
          source: 'online',
          consents: { gdpr: consents.gdpr === true, health: consents.health === true, marketingEmail: consents.marketingEmail === true, sms: consents.sms === true },
        },
        { actor: REGISTRATION_ACTOR, now: now(), commandId: newCommandId('reg') },
      );
      if (!result.ok) throw new HttpError(400, result.error);
      const clientId = String(result.value);
      await store.linkClient(r.clinicId, user.id, clientId);
      r = { kind: 'client', clinicId: r.clinicId, clientId };
      void store.logCommand({ clinicId: r.clinicId, userId: user.id, role: 'client', command: 'register', ok: true, version: result.version }).catch(() => undefined);
      return json(req, 200, (await sessionInfo(user, r)) as unknown as Json);
    } finally {
      registering.delete(user.id);
    }
  }

  function staffChunksPayload(version: number, chunkJson: Map<string, string>): string {
    // části posíláme rovnou jako uložený JSON (bez opětovného převodu)
    const parts: string[] = [];
    for (const [key, data] of chunkJson) parts.push(`{"key":${JSON.stringify(key)},"data":${data}}`);
    return `{"kind":"chunks","version":${version},"chunks":[${parts.join(',')}]}`;
  }

  function clientPayload(state: ClinicState, version: number, clientId: string): { body: StatePayload; hash: string } {
    const view = projectForClient(state, clientId, now());
    const text = JSON.stringify(view);
    const hash = hashText(text);
    return { body: { kind: 'client', version, state: view, hash }, hash };
  }

  async function getState(req: Request): Promise<Response> {
    const user = await authenticate(req);
    const r = await resolve(user);
    if (r.kind === 'none') throw new HttpError(403, 'Účet zatím není propojený s klinikou.', 'forbidden');
    const loaded = await loadState(r.clinicId);
    if (r.kind === 'staff') return json(req, 200, staffChunksPayload(loaded.version, loaded.chunkJson));
    return json(req, 200, clientPayload(loaded.state, loaded.version, r.clientId).body as unknown as Json);
  }

  async function getChanges(req: Request, url: URL): Promise<Response> {
    const user = await authenticate(req);
    const r = await resolve(user);
    if (r.kind === 'none') throw new HttpError(403, 'Účet zatím není propojený s klinikou.', 'forbidden');
    const since = Number(url.searchParams.get('since') ?? '0');
    if (!Number.isInteger(since) || since < 0) throw new HttpError(400, 'Neplatná verze.');
    if (r.kind === 'staff') {
      const delta = await store.getChunks(r.clinicId, since);
      if (delta.version === null) throw new HttpError(404, 'Klinika neexistuje.', 'not_found');
      if (delta.version === since) return json(req, 200, { kind: 'unchanged', version: since });
      if (delta.version < since) {
        // databáze je ve starší verzi (obnova zálohy) – poslat vše znovu
        const loaded = await loadState(r.clinicId);
        return json(req, 200, staffChunksPayload(loaded.version, loaded.chunkJson));
      }
      const chunks: ChunkData[] = delta.chunks.map((c) => ({ key: c.key, data: c.data }));
      return json(req, 200, { kind: 'chunks', version: delta.version, chunks, partial: true });
    }
    const loaded = await loadState(r.clinicId);
    if (loaded.version === since && url.searchParams.get('hash')) return json(req, 200, { kind: 'unchanged', version: since });
    const p = clientPayload(loaded.state, loaded.version, r.clientId);
    if (p.hash === url.searchParams.get('hash')) return json(req, 200, { kind: 'unchanged', version: loaded.version });
    return json(req, 200, p.body as unknown as Json);
  }

  async function postCommand(req: Request): Promise<Response> {
    const user = await authenticate(req);
    const r = await resolve(user);
    if (r.kind === 'none') throw new HttpError(403, 'Účet zatím není propojený s klinikou.', 'forbidden');
    if (!commandLimiter.allow('c:' + user.id, Date.now())) throw new HttpError(429, 'Příliš mnoho akcí za krátkou dobu. Zkuste to za chvíli.', 'rate_limited');
    const isOwner = r.kind === 'staff' && r.role === 'owner';
    const body = await readJson<CommandRequest & { retry?: boolean }>(req, isOwner ? 8_000_000 : r.kind === 'staff' ? 1_000_000 : 64_000);
    const name = typeof body?.name === 'string' ? body.name : '';
    const role = r.kind === 'staff' ? r.role : 'client';
    const entry = commandFor(name, role);
    if (entry === 'unknown') throw new HttpError(400, 'Neznámá akce.');
    if (entry === 'forbidden') throw new HttpError(403, 'K této akci nemáte oprávnění.', 'forbidden');
    if (!isValidCommandId(body.commandId)) throw new HttpError(400, 'Neplatné ID akce.');
    const invalid = validateInput(name, role, body.input);
    if (invalid) throw new HttpError(400, invalid);
    const input = body.input as Record<string, unknown>;
    if (violatesPaymentPolicy(name, input)) throw new HttpError(400, 'Platba kartou online zatím není k dispozici. Zvolte prosím QR platbu nebo platbu na místě.');

    if (body.retry) {
      const appliedAt = await store.commandApplied(r.clinicId, body.commandId);
      if (appliedAt !== null) {
        const current = await store.getChunks(r.clinicId, Number.MAX_SAFE_INTEGER);
        return json(req, 200, { ok: true, value: null, notices: [], version: current.version ?? appliedAt, duplicate: true });
      }
    }

    const loaded = await loadState(r.clinicId);
    const actor = actorOf(r, loaded.state);
    const result = await engine.execute(r.clinicId, entry.run, input, { actor, now: now(), commandId: body.commandId });
    void store
      .logCommand({ clinicId: r.clinicId, userId: user.id, role, command: name, ok: result.ok, error: result.ok ? null : result.error, version: result.version })
      .catch(() => undefined);
    if (!result.ok) return json(req, 200, { ok: false, error: result.error, version: result.version } satisfies CommandResponse);
    if (!result.duplicate && deps.afterCommand?.[name]) {
      try {
        await deps.afterCommand[name]({ clinicId: r.clinicId, input, store });
      } catch (e) {
        log('Dokončení akce selhalo', { command: name, error: String(e) });
      }
    }
    const response: CommandResponse = {
      ok: true,
      value: result.value ?? null,
      notices: result.notices,
      version: result.version,
      ...(r.kind === 'staff' && !result.duplicate ? { changes: result.changes.map((c) => ({ key: c.key, data: c.data })) } : {}),
    };
    return json(req, 200, response as unknown as Json);
  }

  async function members(req: Request, url: URL): Promise<Response> {
    const user = await authenticate(req);
    const r = await resolve(user);
    requireOwner(r);
    const list = async (): Promise<MemberView[]> => (await store.listMembers(r.clinicId)) as MemberView[];
    if (req.method === 'GET') return json(req, 200, await list());
    if (req.method === 'POST') {
      const body = await readJson<AddMemberRequest>(req, 4_000);
      const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (!EMAIL_RE.test(email) || email.length > 254) throw new HttpError(400, 'Zadejte platný e-mail.');
      if (!STAFF_ROLES.includes(body.role)) throw new HttpError(400, 'Neplatná role.');
      const displayName = typeof body.displayName === 'string' ? body.displayName.trim().slice(0, 80) : '';
      if (!displayName) throw new HttpError(400, 'Vyplňte jméno.');
      let therapistId: string | null = null;
      if (body.therapistId) {
        const { state } = await loadState(r.clinicId);
        if (!state.therapists.some((t) => t.id === body.therapistId)) throw new HttpError(400, 'Terapeut neexistuje.');
        therapistId = body.therapistId;
      }
      if (body.role === 'therapist' && !therapistId) throw new HttpError(400, 'Terapeutovi vyberte jeho kalendář.');
      const userId = await deps.auth.ensureUser(email);
      const current = await list();
      if (userId === user.id && body.role !== 'owner' && current.filter((m) => m.role === 'owner').length <= 1)
        throw new HttpError(400, 'Klinika musí mít aspoň jednoho majitele.');
      await store.upsertMember(r.clinicId, userId, body.role, therapistId, displayName, email);
      return json(req, 200, await list());
    }
    if (req.method === 'DELETE') {
      const userId = url.searchParams.get('userId') ?? '';
      if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new HttpError(400, 'Neplatný uživatel.');
      if (userId === user.id) throw new HttpError(400, 'Sami sebe odebrat nemůžete.');
      await store.removeMember(r.clinicId, userId);
      return json(req, 200, await list());
    }
    throw new HttpError(405, 'Nepodporovaná metoda.');
  }

  async function cron(req: Request): Promise<Response> {
    checkSecret(req, 'x-cron-secret', deps.cronSecret);
    const holder = crypto.randomUUID();
    if (!(await store.acquireLock('cron', holder, 240))) return json(req, 200, { ok: true, skipped: 'Automatika už běží.' });
    try {
      return json(req, 200, await runCron());
    } finally {
      await store.releaseLock('cron', holder).catch(() => undefined);
    }
  }

  async function runCron(): Promise<Record<string, unknown>> {
    const report: Record<string, unknown>[] = [];
    for (const clinic of await store.listClinics()) {
      const item: Record<string, unknown> = { clinicId: clinic.id };
      const minute = now().replace(/[^0-9]/g, '');
      const processes = await engine.execute(clinic.id, runProcesses, {}, { actor: SYSTEM_ACTOR, now: now(), commandId: `cron-${minute}` });
      item.processes = processes.ok ? { version: processes.version, changed: processes.changes.length } : { error: processes.error };
      for (const job of deps.cronJobs ?? []) {
        try {
          Object.assign(item, await job({ clinicId: clinic.id, engine, store, now }));
        } catch (e) {
          log('Úloha automatiky selhala', { clinicId: clinic.id, error: String(e) });
          item.jobError = 'Úloha selhala – podrobnosti jsou v logu serveru.';
        }
      }
      report.push(item);
    }
    await store.maintenance().catch((e: unknown) => log('Údržba databáze selhala', { error: String(e) }));
    return { ok: true, at: now(), clinics: report };
  }

  async function bootstrap(req: Request): Promise<Response> {
    checkSecret(req, 'x-admin-secret', deps.adminSecret);
    const body = await readJson<{ clinicName?: string; ownerEmail?: string; ownerName?: string }>(req, 4_000);
    const clinicName = (body.clinicName ?? '').trim().slice(0, 80);
    const ownerEmail = (body.ownerEmail ?? '').trim().toLowerCase();
    const ownerName = (body.ownerName ?? '').trim().slice(0, 80);
    if (!clinicName || !ownerName || !EMAIL_RE.test(ownerEmail)) throw new HttpError(400, 'Vyplňte název kliniky, jméno a e-mail majitele.');
    if ((await store.listClinics()).length) throw new HttpError(409, 'Klinika už je založená.', 'conflict');
    const ownerId = await deps.auth.ensureUser(ownerEmail);
    const state = productionBaseState(clinicName, dateOf(now()));
    const chunks = [...stateToChunkJson(state)].map(([key, data]) => ({ key, data: JSON.parse(data) as unknown }));
    const clinicId = await store.createClinic(clinicName, ownerId, ownerName, chunks, ownerEmail);
    defaultClinicCache = null;
    return json(req, 200, { ok: true, clinicId });
  }

  function page(req: Request, status: number, title: string, body: string): Response {
    const esc = (t: string): string => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    const html = `<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>body{font-family:system-ui,sans-serif;max-width:520px;margin:12vh auto;padding:0 16px;color:#16262b;line-height:1.55}button{font:inherit;padding:10px 18px;border-radius:8px;border:0;background:#0f766e;color:#fff;cursor:pointer}@media (prefers-color-scheme:dark){body{background:#0d181b;color:#e6eeef}}</style></head><body><h1>${esc(title)}</h1>${body}</body></html>`;
    return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', ...corsHeaders(req) } });
  }

  /** Odhlášení z obchodních sdělení: GET ukáže potvrzení, POST odhlásí (i jedním kliknutím z poštovního programu). */
  async function unsubscribe(req: Request, url: URL): Promise<Response> {
    const c = url.searchParams.get('c') ?? '';
    const k = url.searchParams.get('k') ?? '';
    const sig = url.searchParams.get('s') ?? '';
    if (!deps.unsubscribeSecret || !(await verifyUnsubscribe(deps.unsubscribeSecret, c, k, sig)))
      return page(req, 400, 'Odkaz není platný', '<p>Odkaz pro odhlášení je neplatný nebo neúplný. Odběr můžete vypnout i ve svém účtu v sekci Souhlasy.</p>');
    if (req.method === 'GET') {
      const action = `?${url.searchParams.toString()}`;
      return page(
        req,
        200,
        'Odhlášení z novinek',
        `<p>Opravdu už nechcete dostávat novinky a nabídky e-mailem? Zprávy k vašim rezervacím (potvrzení, připomínky) budou chodit dál.</p><form method="post" action="${action.replace(/"/g, '&quot;')}"><button type="submit">Odhlásit odběr</button></form>`,
      );
    }
    const r = await engine.execute(c, setConsent, { clientId: k, key: 'marketingEmail', value: false }, { actor: { role: 'reception', name: 'Odhlášení z e-mailu' }, now: now(), commandId: newCommandId('unsub') });
    if (!r.ok && r.error !== 'Klient neexistuje.') return page(req, 500, 'Odhlášení se nepovedlo', '<p>Zkuste to prosím později, nebo odběr vypněte ve svém účtu v sekci Souhlasy.</p>');
    return page(req, 200, 'Odhlášeno', '<p>Novinky a nabídky vám už posílat nebudeme. Souhlas můžete kdykoli znovu zapnout ve svém účtu.</p>');
  }

  async function devLogin(req: Request): Promise<Response> {
    if (!deps.devAuth) throw new HttpError(404, 'Nenalezeno.', 'not_found');
    const body = await readJson<{ email?: string }>(req, 2_000);
    const email = (body.email ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Zadejte e-mail.');
    const issued = await deps.devAuth.issue(email);
    return json(req, 200, { token: issued.token, user: issued.user });
  }

  /* ---------------------------- směrování ---------------------------- */

  return async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    // cesta za „/api“ (Supabase přidává /functions/v1/<název funkce>)
    const i = url.pathname.lastIndexOf('/api');
    const path = i >= 0 ? url.pathname.slice(i + 4) || '/' : url.pathname;
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
    try {
      const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'local';
      if ((path === '/dev/login' || path === '/admin/bootstrap' || path === '/unsubscribe') && !openLimiter.allow('ip:' + ip, Date.now()))
        throw new HttpError(429, 'Příliš mnoho pokusů.', 'rate_limited');
      const route = `${req.method} ${path}`;
      switch (route) {
        case 'GET /health':
          return json(req, 200, { ok: true, at: now() });
        case 'GET /session':
          return await getSession(req);
        case 'POST /register':
          return await register(req);
        case 'GET /state':
          return await getState(req);
        case 'GET /changes':
          return await getChanges(req, url);
        case 'POST /command':
          return await postCommand(req);
        case 'GET /members':
        case 'POST /members':
        case 'DELETE /members':
          return await members(req, url);
        case 'POST /cron':
          return await cron(req);
        case 'POST /admin/bootstrap':
          return await bootstrap(req);
        case 'POST /dev/login':
          return await devLogin(req);
        case 'GET /unsubscribe':
        case 'POST /unsubscribe':
          return await unsubscribe(req, url);
        default:
          return json(req, 404, { error: 'Nenalezeno.', code: 'not_found' } satisfies ApiError);
      }
    } catch (e) {
      if (e instanceof HttpError) return json(req, e.status, { error: e.message, code: e.code } satisfies ApiError);
      log('Chyba serveru', { path, error: e instanceof Error ? e.message : String(e) });
      return json(req, 500, { error: 'Na serveru došlo k chybě. Zkuste to prosím znovu.', code: 'server_error' } satisfies ApiError);
    }
  };
}

/** Výchozí stav nové kliniky pro ostrý provoz: bez ukázkových dat, bez simulovaných plateb kartou. */
export function productionBaseState(clinicName: string, today: string): ClinicState {
  const s = createBaseState(today);
  s.settings.clinicName = clinicName;
  s.settings.senderName = clinicName;
  s.settings.senderEmail = '';
  s.settings.features = { clinicalNotes: false, cardPayments: false };
  s.settings.messaging = { deliver: true };
  s.settings.payments = { ...s.settings.payments, recipientName: clinicName, accountNumber: '', iban: '', demoAccount: false };
  s.settings.simulatedNow = null;
  return s;
}
