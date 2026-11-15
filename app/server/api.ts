import { licenseView, licenseWritable, type LicenseView } from '../src/api/license';
import type {
  AddMemberRequest,
  ApiError,
  ChunkData,
  CommandRequest,
  CommandResponse,
  CreateTenantRequest,
  LegalDocument,
  MemberView,
  PlatformTenant,
  PublicTenant,
  RegisterRequest,
  SessionInfo,
  StaffRole,
  StatePayload,
  UpdateTenantRequest,
} from '../src/api/protocol';
import type { Actor, ClinicState } from '../src/domain/types';
import { createClient, setConsent } from '../src/engine/commands';
import { createBaseState } from '../src/engine/defaults';
import { createPresetState, isPresetId, OWNER_STAFF_ID, type PresetId, type PresetOptions } from '../src/engine/presets';
import { runProcesses } from '../src/engine/processes';
import { commandFor } from '../src/engine/registry';
import { clientName, getClient } from '../src/engine/selectors';
import { addDays, dateOf } from '../src/engine/time';
import { safeEqual, type AuthService, type AuthUser, type DevAuth } from './auth';
import { ClinicEngine, isValidCommandId } from './core/executor';
import { projectForClient } from './core/projection';
import { encryptSecret } from './core/secrets';
import { stateToChunkJson } from './core/state';
import { pragueNow } from './core/time';
import { verifyUnsubscribe } from './core/unsubscribe';
import { validateInput } from './core/validate';
import type { ClinicInfo, LicensePlan, LicenseStatus, PlatformClinicRow, StateStore } from './store/types';

/**
 * HTTP API univerzální rezervační platformy. Jedna instalace obsluhuje mnoho provozoven (klinika, studio,
 * salon…); provozovnu pozná podle adresy (/<slug> → hlavička x-tenant, vlastní doména → x-tenant-host).
 * Používá jen standardní Request/Response – stejný kód běží v Supabase Edge Function i v Node.
 *
 *   GET  /api/health                     stav služby
 *   GET  /api/tenant                     veřejné údaje provozovny (název, vzhled, názvosloví) – bez přihlášení
 *   GET  /api/legal?doc=terms|privacy    obchodní podmínky / zásady ochrany údajů provozovny – bez přihlášení
 *   GET  /api/session                    kdo je přihlášený (personál / klient / registrace / vlastník platformy)
 *   POST /api/register                   registrace klienta po prvním přihlášení
 *   GET  /api/state, /api/changes        stav provozovny (personál po částech, klient svůj pohled)
 *   POST /api/command                    příkaz enginu (role, tvar vstupu, licence)
 *   GET|POST|DELETE /api/members         přístupy personálu (majitel)
 *   /api/platform/tenants…               správa provozoven a licencí (vlastník platformy)
 *   POST /api/cron                       automatika (hlavička x-cron-secret)
 *   GET|POST /api/unsubscribe            odhlášení z novinek (podepsaný odkaz)
 *   POST /api/dev/login                  přihlášení bez e-mailu – jen lokální vývoj
 */

export interface CronContext {
  clinicId: string;
  tenant: ClinicInfo;
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
  /** Povolené původy pro CORS (adresy aplikace, vlastní domény provozoven). */
  allowedOrigins?: string[];
  /** Provozovna pro adresu bez určení provozovny (jinak jen když je na platformě jediná). */
  defaultClinicId?: string;
  /** E-maily vlastníků platformy: správa provozoven a licencí, podpora v provozovnách. */
  platformAdmins?: string[];
  /** Klíč pro šifrování tajných údajů provozoven (token Fio…). */
  secretsKey?: string;
  /** Lokální vývoj: přihlášení bez e-mailu. */
  devAuth?: DevAuth;
  /** Platby kartou online – jen s napojenou platební bránou (zatím žádná). */
  cardPayments?: boolean;
  /** Další práce automatiky po spuštění procesů (odeslání zpráv, párování plateb). */
  cronJobs?: ((ctx: CronContext) => Promise<Record<string, unknown>>)[];
  /** Tajemství pro podpis odkazů na odhlášení z novinek. */
  unsubscribeSecret?: string;
  /** Akce po úspěšném příkazu. */
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
const SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/;
const DOMAIN_RE = /^(?=.{4,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Adresy, které nemohou být identifikátorem provozovny (cesty aplikace). */
export const RESERVED_SLUGS = new Set(['api', 'app', 'admin', 'platforma', 'assets', 'static', 'www', 'login', 'prihlaseni', 'registrace', 'podminky', 'gdpr', 'demo']);
const PLANS: readonly LicensePlan[] = ['trial', 'monthly', 'yearly', 'lifetime'];
const STATUSES: readonly LicenseStatus[] = ['active', 'suspended', 'cancelled'];
/** Co jde i v režimu jen pro čtení (po vypršení licence): práva klientů a export údajů. */
const READONLY_COMMANDS = new Set(['cancelBooking', 'setConsent', 'updateClient', 'leaveWaitlist', 'declineWaitlistOffer', 'withdrawFromPackage', 'markWithdrawalRefunded', 'logClientDataExport', 'anonymizeClient', 'cancelPaymentRequest']);

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
  | { kind: 'staff'; clinicId: string; role: StaffRole; name: string; therapistId: string | null; support: boolean }
  | { kind: 'client'; clinicId: string; clientId: string }
  | { kind: 'none'; clinicId: string };

export function createApi(deps: ApiDeps): (req: Request) => Promise<Response> {
  const store = deps.store;
  const engine = deps.engine ?? new ClinicEngine(store);
  const clock = deps.clock ?? (() => new Date());
  const now = (): string => pragueNow(clock());
  const today = (): string => dateOf(now());
  const log = deps.log ?? ((m: string, d?: Record<string, unknown>) => console.log(m, d ?? ''));
  const platformAdmins = new Set((deps.platformAdmins ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean));
  const commandLimiter = new RateLimiter(120, 60_000);
  const requestLimiter = new RateLimiter(600, 60_000);
  const openLimiter = new RateLimiter(20, 60_000);
  const publicLimiter = new RateLimiter(120, 60_000);
  const registering = new Set<string>();
  const tenantCache = new Map<string, { t: ClinicInfo | null; until: number }>();
  const TENANT_TTL_MS = 30_000;
  let defaultClinicCache: { id: string | null; at: number } | null = null;
  /** Role uživatelů v provozovně na krátkou dobu (změna přístupu se projeví nejpozději do minuty). */
  const roleCache = new Map<string, { r: Resolved; until: number }>();
  const ROLE_TTL_MS = 60_000;
  const forgetRole = (userId: string): void => {
    for (const key of roleCache.keys()) if (key.startsWith(userId + ':')) roleCache.delete(key);
  };
  const forgetTenants = (): void => {
    tenantCache.clear();
    defaultClinicCache = null;
  };

  /* ---------------------------- pomocné ---------------------------- */

  function corsHeaders(req: Request): Record<string, string> {
    const origin = req.headers.get('origin');
    if (!origin) return {};
    const allowed =
      (deps.allowedOrigins ?? []).includes(origin) || (!!deps.devAuth && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
    if (!allowed) return {};
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info, x-tenant, x-tenant-host',
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

  const isPlatformAdmin = (user: AuthUser): boolean => user.emailVerified && platformAdmins.has(user.email);

  /** Provozovna bez určení v adrese: nastavená, nebo jediná na platformě. */
  async function defaultClinic(): Promise<string | null> {
    if (deps.defaultClinicId) return deps.defaultClinicId;
    if (defaultClinicCache && Date.now() - defaultClinicCache.at < 60_000) return defaultClinicCache.id;
    const clinics = await store.listClinics();
    defaultClinicCache = { id: clinics.length === 1 ? clinics[0].id : null, at: Date.now() };
    return defaultClinicCache.id;
  }

  /** Provozovna podle adresy: /<slug> (hlavička x-tenant), vlastní doména (x-tenant-host), jinak výchozí. */
  async function tenantOf(req: Request, url: URL): Promise<ClinicInfo | null> {
    const slug = (req.headers.get('x-tenant') ?? url.searchParams.get('tenant') ?? '').trim().toLowerCase();
    const host = (req.headers.get('x-tenant-host') ?? '').trim().toLowerCase().replace(/:\d+$/, '');
    const key = slug ? `s:${slug}` : host ? `h:${host}` : '-';
    const hit = tenantCache.get(key);
    if (hit && hit.until > Date.now()) return hit.t;
    let t: ClinicInfo | null = null;
    if (slug) {
      if (SLUG_RE.test(slug)) t = await store.resolveTenant(slug, null);
    } else {
      if (host && DOMAIN_RE.test(host)) t = await store.resolveTenant(null, host);
      if (!t) {
        const id = await defaultClinic();
        if (id) t = await store.clinicInfo(id);
      }
    }
    if (tenantCache.size > 1000) tenantCache.clear();
    tenantCache.set(key, { t, until: Date.now() + TENANT_TTL_MS });
    return t;
  }

  async function requireTenant(req: Request, url: URL): Promise<ClinicInfo> {
    const t = await tenantOf(req, url);
    if (!t) throw new HttpError(404, 'Provozovna nenalezena. Zkontrolujte prosím adresu.', 'not_found');
    return t;
  }

  const licenseOf = (t: ClinicInfo): LicenseView => licenseView(t.license, today());

  /** Licence provozovny: pozastavená = žádný přístup, po lhůtě = jen čtení (podpora platformy vždy). */
  function ensureLicense(t: ClinicInfo, r: Resolved | null, command?: string): LicenseView {
    const lv = licenseOf(t);
    if (r?.kind === 'staff' && r.support) return lv;
    const staff = r?.kind === 'staff';
    if (lv.state === 'blocked')
      throw new HttpError(
        423,
        staff ? 'Licence provozovny je pozastavená. Kontaktujte prosím dodavatele systému.' : 'Online rezervace jsou dočasně nedostupné. Kontaktujte prosím provozovnu.',
        'license',
      );
    if (command !== undefined && !licenseWritable(lv.state) && !READONLY_COMMANDS.has(command))
      throw new HttpError(
        423,
        staff
          ? 'Licence vypršela – systém je jen pro čtení. Data můžete prohlížet a exportovat; po prodloužení licence vše funguje dál.'
          : 'Online rezervace jsou dočasně nedostupné. Kontaktujte prosím provozovnu.',
        'license',
      );
    return lv;
  }

  async function resolve(user: AuthUser, t: ClinicInfo): Promise<Resolved> {
    const key = `${user.id}:${t.id}`;
    const hit = roleCache.get(key);
    if (hit && hit.until > Date.now()) return hit.r;
    const r = await resolveFresh(user, t);
    // nepropojeného uživatele si nepamatujeme – po registraci musí hned dostat roli
    if (r.kind !== 'none') {
      if (roleCache.size > 5000) roleCache.clear();
      roleCache.set(key, { r, until: Date.now() + ROLE_TTL_MS });
    }
    return r;
  }

  async function resolveFresh(user: AuthUser, t: ClinicInfo): Promise<Resolved> {
    const who = await store.whoami(user.id);
    const member = who.members.find((m) => m.clinicId === t.id);
    if (member) return { kind: 'staff', clinicId: t.id, role: member.role, name: member.displayName || user.email, therapistId: member.therapistId, support: false };
    const link = who.clients.find((c) => c.clinicId === t.id);
    if (link) return { kind: 'client', clinicId: t.id, clientId: link.clientId };
    // vlastník platformy má v každé provozovně přístup majitele (podpora, nastavení na míru)
    if (isPlatformAdmin(user)) return { kind: 'staff', clinicId: t.id, role: 'owner', name: `${user.email} (podpora platformy)`, therapistId: null, support: true };
    return { kind: 'none', clinicId: t.id };
  }

  async function loadState(clinicId: string): Promise<{ version: number; state: ClinicState; chunkJson: Map<string, string> }> {
    const loaded = await engine.current(clinicId);
    if (!loaded) throw new HttpError(404, 'Provozovna nemá založená data.', 'not_found');
    return loaded;
  }

  /** Klienta s ověřeným e-mailem propojí s existující kartou v kartotéce provozovny. */
  async function linkByEmail(user: AuthUser, clinicId: string): Promise<string | null> {
    if (!user.emailVerified) return null;
    const { state } = await loadState(clinicId);
    const match = state.clients.filter((c) => c.email === user.email && !c.anonymizedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    if (!match) return null;
    try {
      await store.linkClient(clinicId, user.id, match.id);
    } catch {
      throw new HttpError(409, 'Karta s tímto e-mailem je už propojená s jiným přihlášením. Ozvěte se prosím provozovně.', 'conflict');
    }
    return match.id;
  }

  async function sessionInfo(user: AuthUser, t: ClinicInfo | null, r: Resolved | null): Promise<SessionInfo> {
    const platformAdmin = isPlatformAdmin(user);
    const base = { user: { id: user.id, email: user.email }, platformAdmin };
    if (!t || !r) {
      return { ...base, clinicId: null, clinicName: '', tenant: null, license: null, role: null, name: user.email, therapistId: null, clientId: null, needsRegistration: false };
    }
    const { state } = await loadState(t.id);
    const tenant = { slug: t.slug, name: state.settings.clinicName || t.name };
    const lv = licenseOf(t);
    const common = { ...base, clinicId: t.id, clinicName: tenant.name, tenant };
    if (r.kind === 'staff') {
      return { ...common, license: lv, role: r.role, name: r.name, therapistId: r.therapistId, clientId: null, needsRegistration: false };
    }
    const clientLicense: LicenseView = { ...lv, plan: 'monthly', validUntil: null, daysLeft: null, graceUntil: null };
    if (r.kind === 'client') {
      const c = getClient(state, r.clientId);
      return { ...common, license: clientLicense, role: 'client', name: c ? clientName(c) : user.email, therapistId: null, clientId: r.clientId, needsRegistration: false };
    }
    return { ...common, license: clientLicense, role: null, name: user.email, therapistId: null, clientId: null, needsRegistration: true };
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
      const features = input.features as { cardPayments?: unknown } | undefined;
      if (features?.cardPayments === true) return true;
    }
    return false;
  }

  /** Nastavení, která v ostrém provozu nedávají smysl (simulace odesílání, testovací hodiny). */
  function violatesServerPolicy(name: string, input: Record<string, unknown>): string | null {
    if (name !== 'updateSettings') return null;
    const messaging = input.messaging as { deliver?: unknown } | undefined;
    if (messaging && messaging.deliver === false) return 'V ostrém provozu se zprávy vždy skutečně odesílají – jednotlivé zprávy vypnete v Komunikace → Šablony.';
    if (input.simulatedNow !== undefined && input.simulatedNow !== null) return 'Testovací hodiny jsou jen v testovací verzi.';
    if (input.policyHistory !== undefined) return 'Historii storno podmínek nelze měnit.';
    return null;
  }

  function newCommandId(prefix: string): string {
    return `${prefix}-${crypto.randomUUID()}`.slice(0, 40);
  }

  function requireOwner(r: Resolved): asserts r is Extract<Resolved, { kind: 'staff' }> {
    if (r.kind !== 'staff' || r.role !== 'owner') throw new HttpError(403, 'Přístupy spravuje jen majitel provozovny.', 'forbidden');
  }

  function checkSecret(req: Request, header: string, secret: string | undefined): void {
    const given = req.headers.get(header) ?? '';
    if (!secret || !given || !safeEqual(given, secret)) throw new HttpError(401, 'Neplatný klíč.', 'unauthorized');
  }

  /* ---------------------------- veřejné ---------------------------- */

  async function getTenant(req: Request, url: URL): Promise<Response> {
    const t = await requireTenant(req, url);
    const { state } = await loadState(t.id);
    const s = state.settings;
    const body: PublicTenant = {
      slug: t.slug,
      name: s.clinicName || t.name,
      tagline: s.clinicTagline,
      branding: s.branding,
      terms: s.terms,
      legal: { terms: !!s.legal.terms.trim(), privacy: !!s.legal.privacy.trim() },
      license: { state: licenseOf(t).state },
    };
    return json(req, 200, body as unknown as Json);
  }

  async function getLegal(req: Request, url: URL): Promise<Response> {
    const t = await requireTenant(req, url);
    const doc = url.searchParams.get('doc') === 'privacy' ? 'privacy' : 'terms';
    const { state } = await loadState(t.id);
    const text = doc === 'privacy' ? state.settings.legal.privacy : state.settings.legal.terms;
    if (!text.trim()) throw new HttpError(404, 'Dokument zatím není zveřejněný.', 'not_found');
    const body: LegalDocument = {
      doc,
      title: doc === 'privacy' ? 'Informace o zpracování osobních údajů' : 'Obchodní podmínky',
      text,
      updatedAt: state.settings.legal.updatedAt,
    };
    return json(req, 200, body as unknown as Json);
  }

  /* ---------------------------- přihlášení a data ---------------------------- */

  async function getSession(req: Request, url: URL): Promise<Response> {
    const user = await authenticate(req);
    const t = await tenantOf(req, url);
    if (!t) {
      // adresa bez provozovny: správa platformy (jen vlastník platformy)
      if (!isPlatformAdmin(user)) throw new HttpError(404, 'Provozovna nenalezena. Zkontrolujte prosím adresu.', 'not_found');
      return json(req, 200, (await sessionInfo(user, null, null)) as unknown as Json);
    }
    let r = await resolve(user, t);
    if (r.kind === 'none') {
      const clientId = await linkByEmail(user, t.id);
      if (clientId) r = { kind: 'client', clinicId: t.id, clientId };
    }
    return json(req, 200, (await sessionInfo(user, t, r)) as unknown as Json);
  }

  async function register(req: Request, url: URL): Promise<Response> {
    const user = await authenticate(req);
    const t = await requireTenant(req, url);
    const body = await readJson<RegisterRequest>(req, 16_000);
    let r = await resolve(user, t);
    if (r.kind !== 'none') return json(req, 200, (await sessionInfo(user, t, r)) as unknown as Json);
    ensureLicense(t, null, 'register');
    if (!user.emailVerified) throw new HttpError(403, 'Nejdřív prosím ověřte e-mail.', 'forbidden');
    const existing = await linkByEmail(user, t.id);
    if (existing) return json(req, 200, (await sessionInfo(user, t, { kind: 'client', clinicId: t.id, clientId: existing })) as unknown as Json);

    const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
    const consents = body?.consents ?? ({} as RegisterRequest['consents']);
    const birth = typeof body?.birthDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.birthDate) ? body.birthDate : null;
    const lock = `${user.id}:${t.id}`;
    if (registering.has(lock)) throw new HttpError(409, 'Registrace už probíhá.', 'conflict');
    registering.add(lock);
    try {
      const result = await engine.execute(
        t.id,
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
      await store.linkClient(t.id, user.id, clientId);
      r = { kind: 'client', clinicId: t.id, clientId };
      void store.logCommand({ clinicId: t.id, userId: user.id, role: 'client', command: 'register', ok: true, version: result.version }).catch(() => undefined);
      return json(req, 200, (await sessionInfo(user, t, r)) as unknown as Json);
    } finally {
      registering.delete(lock);
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

  async function memberOrClient(req: Request, url: URL): Promise<{ user: AuthUser; t: ClinicInfo; r: Exclude<Resolved, { kind: 'none' }> }> {
    const user = await authenticate(req);
    const t = await requireTenant(req, url);
    const r = await resolve(user, t);
    if (r.kind === 'none') throw new HttpError(403, 'Účet zatím není propojený s provozovnou.', 'forbidden');
    ensureLicense(t, r);
    return { user, t, r };
  }

  async function getState(req: Request, url: URL): Promise<Response> {
    const { r } = await memberOrClient(req, url);
    const loaded = await loadState(r.clinicId);
    if (r.kind === 'staff') return json(req, 200, staffChunksPayload(loaded.version, loaded.chunkJson));
    return json(req, 200, clientPayload(loaded.state, loaded.version, r.clientId).body as unknown as Json);
  }

  async function getChanges(req: Request, url: URL): Promise<Response> {
    const { r } = await memberOrClient(req, url);
    const since = Number(url.searchParams.get('since') ?? '0');
    if (!Number.isInteger(since) || since < 0) throw new HttpError(400, 'Neplatná verze.');
    if (r.kind === 'staff') {
      const delta = await store.getChunks(r.clinicId, since);
      if (delta.version === null) throw new HttpError(404, 'Provozovna neexistuje.', 'not_found');
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

  async function postCommand(req: Request, url: URL): Promise<Response> {
    const user = await authenticate(req);
    const t = await requireTenant(req, url);
    const r = await resolve(user, t);
    if (r.kind === 'none') throw new HttpError(403, 'Účet zatím není propojený s provozovnou.', 'forbidden');
    if (!commandLimiter.allow('c:' + user.id, Date.now())) throw new HttpError(429, 'Příliš mnoho akcí za krátkou dobu. Zkuste to za chvíli.', 'rate_limited');
    // import dat posílá i tisíce řádků (majitel a recepce); terapeut a klient jen malé vstupy
    const front = r.kind === 'staff' && (r.role === 'owner' || r.role === 'reception');
    const body = await readJson<CommandRequest & { retry?: boolean }>(req, front ? 8_000_000 : r.kind === 'staff' ? 1_000_000 : 64_000);
    const name = typeof body?.name === 'string' ? body.name : '';
    ensureLicense(t, r, name);
    const role = r.kind === 'staff' ? r.role : 'client';
    const entry = commandFor(name, role);
    if (entry === 'unknown') throw new HttpError(400, 'Neznámá akce.');
    if (entry === 'forbidden') throw new HttpError(403, 'K této akci nemáte oprávnění.', 'forbidden');
    if (!isValidCommandId(body.commandId)) throw new HttpError(400, 'Neplatné ID akce.');
    const invalid = validateInput(name, role, body.input);
    if (invalid) throw new HttpError(400, invalid);
    const input = body.input as Record<string, unknown>;
    if (violatesPaymentPolicy(name, input)) throw new HttpError(400, 'Platba kartou online zatím není k dispozici. Zvolte prosím QR platbu nebo platbu na místě.');
    const policyError = violatesServerPolicy(name, input);
    if (policyError) throw new HttpError(400, policyError);

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
      .logCommand({ clinicId: r.clinicId, userId: user.id, role: r.kind === 'staff' && r.support ? 'support' : role, command: name, ok: result.ok, error: result.ok ? null : result.error, version: result.version })
      .catch(() => undefined);
    if (!result.ok) return json(req, 200, { ok: false, error: result.error, version: result.version } satisfies CommandResponse);
    if (!result.duplicate && name === 'anonymizeClient') {
      // anonymizovaný klient se už nepřihlásí ke své (prázdné) kartě
      const clientId = String(input.clientId ?? '');
      await store.unlinkClient(r.clinicId, clientId).catch((e: unknown) => log('Zrušení propojení účtu selhalo', { error: String(e) }));
      for (const [key, cached] of roleCache) if (cached.r.kind === 'client' && cached.r.clientId === clientId) roleCache.delete(key);
    }
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
    const t = await requireTenant(req, url);
    const r = await resolve(user, t);
    requireOwner(r);
    ensureLicense(t, r, req.method === 'GET' ? undefined : 'members');
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
        if (!state.therapists.some((x) => x.id === body.therapistId)) throw new HttpError(400, 'Vybraný člen týmu neexistuje.');
        therapistId = body.therapistId;
      }
      if (body.role === 'therapist' && !therapistId) throw new HttpError(400, 'Vyberte, čí kalendář bude člen týmu vidět.');
      const userId = await deps.auth.ensureUser(email);
      const current = await list();
      if (userId === user.id && body.role !== 'owner' && current.filter((m) => m.role === 'owner').length <= 1)
        throw new HttpError(400, 'Provozovna musí mít aspoň jednoho majitele.');
      await store.upsertMember(r.clinicId, userId, body.role, therapistId, displayName, email);
      forgetRole(userId);
      return json(req, 200, await list());
    }
    if (req.method === 'DELETE') {
      const userId = url.searchParams.get('userId') ?? '';
      if (!UUID_RE.test(userId)) throw new HttpError(400, 'Neplatný uživatel.');
      if (userId === user.id) throw new HttpError(400, 'Sami sebe odebrat nemůžete.');
      await store.removeMember(r.clinicId, userId);
      forgetRole(userId);
      return json(req, 200, await list());
    }
    throw new HttpError(405, 'Nepodporovaná metoda.');
  }

  /* ---------------------------- správa platformy ---------------------------- */

  async function platformUser(req: Request): Promise<AuthUser> {
    const user = await authenticate(req);
    if (!isPlatformAdmin(user)) throw new HttpError(403, 'Správa platformy je jen pro jejího vlastníka.', 'forbidden');
    return user;
  }

  const tenantView = (row: PlatformClinicRow): PlatformTenant => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    createdAt: row.createdAt,
    license: row.license,
    licenseView: licenseOf(row),
    domains: row.domains,
    members: row.members,
    clientAccounts: row.clientAccounts,
    lastChangeAt: row.lastChangeAt,
    owners: row.owners,
  });

  async function tenantRow(id: string): Promise<PlatformTenant> {
    const row = (await store.platformClinics()).find((c) => c.id === id);
    if (!row) throw new HttpError(404, 'Provozovna neexistuje.', 'not_found');
    return tenantView(row);
  }

  function validDate(v: unknown): v is string {
    return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00Z'));
  }

  function checkSlug(slug: string): void {
    if (!SLUG_RE.test(slug)) throw new HttpError(400, 'Adresa smí obsahovat malá písmena bez diakritiky, číslice a pomlčky (2–40 znaků).');
    if (RESERVED_SLUGS.has(slug)) throw new HttpError(400, 'Tato adresa je vyhrazená pro aplikaci – zvolte jinou.');
  }

  async function platformTenants(req: Request, path: string): Promise<Response> {
    await platformUser(req);
    const m = /^\/platform\/tenants(?:\/([0-9a-f-]{36})(?:\/(domains|secrets))?)?$/.exec(path);
    if (!m) throw new HttpError(404, 'Nenalezeno.', 'not_found');
    const [, id, sub] = m;

    if (!id && req.method === 'GET') return json(req, 200, (await store.platformClinics()).map(tenantView));

    if (!id && req.method === 'POST') {
      const b = await readJson<CreateTenantRequest>(req, 8_000);
      const name = typeof b.name === 'string' ? b.name.trim().slice(0, 80) : '';
      const slug = typeof b.slug === 'string' ? b.slug.trim().toLowerCase() : '';
      const ownerName = typeof b.ownerName === 'string' ? b.ownerName.trim().slice(0, 80) : '';
      const ownerEmail = typeof b.ownerEmail === 'string' ? b.ownerEmail.trim().toLowerCase() : '';
      if (!name || !ownerName) throw new HttpError(400, 'Vyplňte název provozovny a jméno majitele.');
      if (!EMAIL_RE.test(ownerEmail)) throw new HttpError(400, 'Zadejte platný e-mail majitele.');
      checkSlug(slug);
      if (!isPresetId(b.preset)) throw new HttpError(400, 'Vyberte obor (šablonu).');
      if (!PLANS.includes(b.plan)) throw new HttpError(400, 'Neplatný druh licence.');
      const validUntil = b.plan === 'lifetime' ? null : b.validUntil === null ? null : b.validUntil;
      if (validUntil !== null && !validDate(validUntil)) throw new HttpError(400, 'Neplatné datum konce licence.');
      if (await store.resolveTenant(slug, null)) throw new HttpError(409, 'Adresa je už obsazená jinou provozovnou.', 'conflict');
      const ownerId = await deps.auth.ensureUser(ownerEmail);
      const state = productionState(b.preset, { businessName: name, ownerName, ownerEmail, today: today() });
      const chunks = [...stateToChunkJson(state)].map(([key, data]) => ({ key, data: JSON.parse(data) as unknown }));
      let clinicId: string;
      try {
        clinicId = await store.platformCreateClinic({ name, slug, ownerId, ownerName, ownerEmail, chunks, plan: b.plan, validUntil });
      } catch (e) {
        log('Založení provozovny selhalo', { error: String(e) });
        throw new HttpError(409, 'Provozovnu se nepodařilo založit – adresa je možná obsazená.', 'conflict');
      }
      // majitel = první člen týmu (jeho kalendář)
      await store.upsertMember(clinicId, ownerId, 'owner', OWNER_STAFF_ID, ownerName, ownerEmail);
      forgetTenants();
      return json(req, 200, (await tenantRow(clinicId)) as unknown as Json);
    }

    if (id && !sub && req.method === 'PATCH') {
      const b = await readJson<UpdateTenantRequest>(req, 8_000);
      const patch: UpdateTenantRequest = {};
      if (b.name !== undefined) {
        const n = String(b.name).trim().slice(0, 80);
        if (!n) throw new HttpError(400, 'Název nesmí být prázdný.');
        patch.name = n;
      }
      if (b.slug !== undefined) {
        const s = String(b.slug).trim().toLowerCase();
        checkSlug(s);
        const other = await store.resolveTenant(s, null);
        if (other && other.id !== id) throw new HttpError(409, 'Adresa je už obsazená jinou provozovnou.', 'conflict');
        patch.slug = s;
      }
      if (b.plan !== undefined) {
        if (!PLANS.includes(b.plan)) throw new HttpError(400, 'Neplatný druh licence.');
        patch.plan = b.plan;
      }
      if (b.status !== undefined) {
        if (!STATUSES.includes(b.status)) throw new HttpError(400, 'Neplatný stav licence.');
        patch.status = b.status;
      }
      if (b.validUntil !== undefined) {
        if (b.validUntil !== null && !validDate(b.validUntil)) throw new HttpError(400, 'Neplatné datum konce licence.');
        patch.validUntil = b.validUntil;
      }
      if (b.note !== undefined) patch.note = String(b.note).slice(0, 1000);
      const updated = await store.platformUpdateClinic(id, patch);
      if (!updated) throw new HttpError(404, 'Provozovna neexistuje.', 'not_found');
      forgetTenants();
      return json(req, 200, (await tenantRow(id)) as unknown as Json);
    }

    if (id && sub === 'domains' && req.method === 'PUT') {
      const b = await readJson<{ domains?: unknown }>(req, 8_000);
      const list = Array.isArray(b.domains) ? b.domains.map((d) => String(d).trim().toLowerCase()).filter(Boolean) : [];
      if (list.length > 10) throw new HttpError(400, 'Nejvýše 10 domén.');
      for (const d of list) if (!DOMAIN_RE.test(d)) throw new HttpError(400, `Neplatná doména: ${d}`);
      for (const d of list) {
        const other = await store.resolveTenant(null, d);
        if (other && other.id !== id) throw new HttpError(409, `Doména ${d} patří jiné provozovně.`, 'conflict');
      }
      await store.platformSetDomains(id, list);
      forgetTenants();
      return json(req, 200, (await tenantRow(id)) as unknown as Json);
    }

    if (id && sub === 'secrets' && req.method === 'GET') return json(req, 200, await store.clinicSecretKeys(id));

    if (id && sub === 'secrets' && req.method === 'PUT') {
      const b = await readJson<{ fioToken?: unknown }>(req, 4_000);
      if (b.fioToken === undefined) throw new HttpError(400, 'Chybí údaj k uložení.');
      if (b.fioToken !== null) {
        const token = String(b.fioToken).trim();
        if (!/^[A-Za-z0-9]{20,200}$/.test(token)) throw new HttpError(400, 'Token Fio má tvar dlouhého řetězce písmen a číslic.');
        if (!deps.secretsKey) throw new HttpError(500, 'Na serveru chybí klíč pro šifrování (SECRETS_KEY).', 'server_error');
        await store.setClinicSecret(id, 'fio_token', await encryptSecret(deps.secretsKey, token));
      } else {
        await store.setClinicSecret(id, 'fio_token', null);
      }
      return json(req, 200, await store.clinicSecretKeys(id));
    }

    throw new HttpError(405, 'Nepodporovaná metoda.');
  }

  /* ---------------------------- automatika ---------------------------- */

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
    for (const clinic of await store.platformClinics()) {
      const item: Record<string, unknown> = { clinicId: clinic.id, slug: clinic.slug };
      const lv = licenseOf(clinic);
      item.license = lv.state;
      // pozastavená provozovna: žádná automatika ani zprávy
      if (lv.state === 'blocked') {
        report.push(item);
        continue;
      }
      const minute = now().replace(/[^0-9]/g, '');
      const processes = await engine.execute(clinic.id, runProcesses, {}, { actor: SYSTEM_ACTOR, now: now(), commandId: `cron-${minute}` });
      item.processes = processes.ok ? { version: processes.version, changed: processes.changes.length } : { error: processes.error };
      for (const job of deps.cronJobs ?? []) {
        try {
          Object.assign(item, await job({ clinicId: clinic.id, tenant: clinic, engine, store, now }));
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
      if ((path === '/dev/login' || path === '/unsubscribe') && !openLimiter.allow('ip:' + ip, Date.now()))
        throw new HttpError(429, 'Příliš mnoho pokusů.', 'rate_limited');
      if ((path === '/tenant' || path === '/legal') && !publicLimiter.allow('ip:' + ip, Date.now()))
        throw new HttpError(429, 'Příliš mnoho požadavků.', 'rate_limited');
      if (path.startsWith('/platform/')) return await platformTenants(req, path);
      const route = `${req.method} ${path}`;
      switch (route) {
        case 'GET /health':
          return json(req, 200, { ok: true, at: now() });
        case 'GET /tenant':
          return await getTenant(req, url);
        case 'GET /legal':
          return await getLegal(req, url);
        case 'GET /session':
          return await getSession(req, url);
        case 'POST /register':
          return await register(req, url);
        case 'GET /state':
          return await getState(req, url);
        case 'GET /changes':
          return await getChanges(req, url);
        case 'POST /command':
          return await postCommand(req, url);
        case 'GET /members':
        case 'POST /members':
        case 'DELETE /members':
          return await members(req, url);
        case 'POST /cron':
          return await cron(req);
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

/** Ostrý provoz: bez simulovaných plateb kartou a klinických poznámek, zprávy se skutečně odesílají. */
function productionOverrides(s: ClinicState, name: string): ClinicState {
  s.settings.clinicName = name;
  s.settings.senderName = name;
  s.settings.senderEmail = '';
  s.settings.features = { clinicalNotes: false, cardPayments: false };
  s.settings.messaging = { deliver: true };
  s.settings.payments = { ...s.settings.payments, recipientName: name.slice(0, 35), accountNumber: '', iban: '', demoAccount: false };
  s.settings.simulatedNow = null;
  return s;
}

/** Nová provozovna na platformě podle oboru (šablony) – připravená pro ostrý provoz. */
export function productionState(preset: PresetId, o: PresetOptions): ClinicState {
  return productionOverrides(createPresetState(preset, o), o.businessName.trim());
}

/** Výchozí katalog s ukázkovým týmem v ostrém nastavení (testy a jednoprovozovnové instalace). */
export function productionBaseState(clinicName: string, today: string): ClinicState {
  return productionOverrides(createBaseState(today), clinicName);
}

/** Výchozí platnost zkušební licence. */
export const TRIAL_DAYS = 30;
export const trialUntil = (today: string): string => addDays(today, TRIAL_DAYS);
