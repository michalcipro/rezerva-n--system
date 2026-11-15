import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { ClinicState, Ctx } from '../src/domain/types';
import { availableSlots } from '../src/engine/availability';
import {
  createBooking,
  createClient,
  sellPackage,
  updateSettings,
  upsertCategory,
  upsertGroupTemplate,
  upsertPackageTemplate,
  upsertService,
  upsertTherapist,
  withdrawalInfo,
} from '../src/engine/commands';
import { createBaseState, DEFAULT_SERVICES, DEFAULT_TERMS } from '../src/engine/defaults';
import { MODULE_OFF } from '../src/engine/modules';
import { createPresetState, isPresetId, OWNER_STAFF_ID, PRESET_MODULES, PRESET_TERMS, PRESETS, type PresetId } from '../src/engine/presets';
import { getService, sessionsOnDate } from '../src/engine/selectors';
import { addDays } from '../src/engine/time';
import { normalizeState } from '../src/store/persistence';
import { legalDraftProblems } from '../src/engine/legalDraft';

const owner: Ctx = { now: '2026-11-15T10:00', actor: { role: 'owner', name: 'Majitel' } };

function tryUpdate(s: ClinicState, patch: Parameters<typeof updateSettings>[1]): { s: ClinicState; error: string | null } {
  let error: string | null = null;
  const next = produce(s, (d) => {
    const r = updateSettings(d as ClinicState, patch, owner);
    if (!r.ok) error = r.error;
  });
  return { s: error ? s : next, error };
}

describe('nastavení univerzální platformy', () => {
  it('moduly, vzhled, názvosloví a právní texty se ukládají s kontrolou', () => {
    const s = createBaseState('2026-01-01');
    expect(s.settings.modules).toEqual({ groups: true, packages: true, credit: true, marketing: true });
    let r = tryUpdate(s, { modules: { groups: false } });
    expect(r.error).toBeNull();
    expect(r.s.settings.modules).toEqual({ groups: false, packages: true, credit: true, marketing: true });

    expect(tryUpdate(s, { branding: { accent: 'red' } }).error).toMatch(/#RRGGBB/);
    expect(tryUpdate(s, { branding: { logo: 'data:text/html;base64,PHNjcmlwdD4=' } }).error).toMatch(/Logo/);
    r = tryUpdate(s, { branding: { accent: '#7C3AED', logo: 'data:image/png;base64,iVBORw0KGgo=' } });
    expect(r.s.settings.branding).toEqual({ accent: '#7C3AED', logo: 'data:image/png;base64,iVBORw0KGgo=' });

    const trener = {
      sg: ['trenér', 'trenéra', 'trenérovi', 'trenéra', 'trenérovi', 'trenérem'] as [string, string, string, string, string, string],
      pl: ['trenéři', 'trenérů', 'trenérům', 'trenéry', 'trenérech', 'trenéry'] as [string, string, string, string, string, string],
      gender: 'm' as const,
    };
    r = tryUpdate(s, { terms: { staff: trener } });
    expect(r.s.settings.terms.staff.sg[0]).toBe('trenér');
    expect(r.s.settings.terms.business.sg[0]).toBe('klinika');
    expect(tryUpdate(s, { terms: { staff: { ...trener, sg: ['', '', '', '', '', ''] } } }).error).toMatch(/Názvosloví/);

    r = tryUpdate(s, { legal: { terms: '# Obchodní podmínky' } });
    expect(r.s.settings.legal).toEqual({ terms: '# Obchodní podmínky', privacy: '', updatedAt: '2026-11-15T10:00' });
  });

  it('starší data bez nových částí nastavení dostanou výchozí hodnoty', () => {
    const s = JSON.parse(JSON.stringify(createBaseState('2026-01-01'))) as ClinicState;
    const raw = s.settings as unknown as Record<string, unknown>;
    delete raw.terms;
    delete raw.modules;
    delete raw.branding;
    delete raw.legal;
    const n = normalizeState(s);
    expect(n.settings.terms.staff.sg[0]).toBe('terapeut');
    expect(n.settings.modules.groups).toBe(true);
    expect(n.settings.branding).toEqual({ accent: null, logo: null });
  });

  it('každá šablona oboru založí provozovnu s majitelem jako jediným členem týmu', () => {
    for (const p of PRESETS) {
      const s = createPresetState(p.id, { businessName: 'Studio Test', ownerName: 'Jana Nováková', ownerEmail: 'Jana@Example.cz', today: '2026-11-15' });
      expect(s.settings.clinicName).toBe('Studio Test');
      expect(s.settings.preset).toBe(p.id);
      expect(s.therapists.map((t) => [t.id, t.firstName, t.lastName, t.email])).toEqual([[OWNER_STAFF_ID, 'Jana', 'Nováková', 'jana@example.cz']]);
      for (const svc of s.services) expect(svc.therapistIds).toEqual([OWNER_STAFF_ID]);
      expect(s.clients).toEqual([]);
    }
  });
});

describe('kontrola konceptu právních textů', () => {
  it('pozná poznámky a nevyplněné údaje, ne běžné odkazy a čísla', () => {
    expect(legalDraftProblems('# Obchodní podmínky\n\nProvozovatel: Studio Lotos s.r.o., IČO 12345678. Dozor: [ÚOOÚ](https://uoou.gov.cz), viz bod [1].')).toEqual([]);
    const draft = legalDraftProblems('> PRACOVNÍ NÁVRH – K ověření právníkem\n\nProvozovatel [NÁZEV PROVOZOVNY], IČO [IČO]. [VARIANTA A] ...');
    expect(draft).toHaveLength(2);
    expect(draft[1]).toContain('[NÁZEV PROVOZOVNY]');
  });
});

/* ------------------------------------------------------------------ */
/* Šablony oborů                                                       */
/* ------------------------------------------------------------------ */

type Result = { ok: true; value: unknown; notices: string[] } | { ok: false; error: string };

/** Spustí příkaz nad kopií stavu; chyba příkazu shodí test s jejím textem. */
function apply<I, R = unknown>(s: ClinicState, cmd: (d: ClinicState, i: I, c: Ctx) => Result, input: I, ctx: Ctx): { s: ClinicState; value: R } {
  let r = { ok: false, error: '' } as Result;
  const next = produce(s, (d) => {
    r = cmd(d as ClinicState, input, ctx);
  });
  if (!r.ok) throw new Error(r.error);
  return { s: next, value: r.value as R };
}

const TODAY = '2026-11-16'; // pondělí
const NOW = `${TODAY}T08:00`;
const desk: Ctx = { now: NOW, actor: { role: 'owner', name: 'Jana Nováková' } };
const asClient = (clientId: string): Ctx => ({ now: NOW, actor: { role: 'client', name: 'Klient', clientId } });
const tenant = (id: PresetId): ClinicState => createPresetState(id, { businessName: 'Provozovna Test', ownerName: 'Jana Nováková', ownerEmail: 'jana@example.cz', today: TODAY });
const ALL = PRESETS.map((p) => p.id);
/** Termíny skupinových lekcí od zítřka na týden. */
const nextWeekSessions = (s: ClinicState) => Array.from({ length: 7 }, (_, i) => sessionsOnDate(s, addDays(TODAY, i + 1))).flat();

function newClient(s: ClinicState): { s: ClinicState; clientId: string } {
  const r = apply<Parameters<typeof createClient>[1], string>(
    s,
    createClient,
    { firstName: 'Petra', lastName: 'Klientová', email: 'petra@example.cz', phone: '+420 600 100 200', consents: { gdpr: true, health: false, marketingEmail: false, sms: false } },
    desk,
  );
  return { s: r.s, clientId: r.value };
}

/** Majitel doplní povinné kroky kontrolního seznamu a spustí online rezervace (nová provozovna je nespuštěná). */
function launched(s: ClinicState): ClinicState {
  return apply(
    s,
    updateSettings,
    {
      business: { legalName: 'Provozovna Test s.r.o.', legalForm: 'company', ico: '12345679', registeredAddress: { street: 'Hlavní 1', city: 'Brno', zip: '60200' } },
      payments: { qrEnabled: false },
      legal: { terms: '# Obchodní podmínky\n\nText.', privacy: '# Informace o zpracování osobních údajů\n\nText.' },
      bookingRules: { onlineOpen: true },
    },
    desk,
  ).s;
}

/** První volný online termín služby v příštích 14 dnech (jak ho nabídne portál). */
function firstSlot(s: ClinicState, serviceId: string, clientId: string): string {
  for (let i = 1; i <= 14; i++) {
    const slots = availableSlots(s, { serviceId, therapistId: OWNER_STAFF_ID, date: addDays(TODAY, i), now: NOW, mode: 'client', clientId });
    if (slots.length) return slots[0].start;
  }
  throw new Error(`Služba ${serviceId} nemá volný termín.`);
}

describe('šablony oborů – obsah', () => {
  it.each(ALL)('%s: katalog odkazuje na existující záznamy a projde kontrolami enginu', (id) => {
    let s = tenant(id);
    expect(isPresetId(id)).toBe(true);
    const ids = (list: { id: string }[]): string[] => list.map((x) => x.id);
    for (const list of [s.categories, s.services, s.rooms, s.packageTemplates, s.groupTemplates]) expect(new Set(ids(list)).size).toBe(list.length);
    // majitel: platná pracovní doba, existující místnost
    const owner = s.therapists[0];
    expect(s.rooms.some((r) => r.id === owner.roomId)).toBe(true);
    expect(Object.values(owner.workingHours).flat().length).toBeGreaterThan(0);
    s = apply(s, upsertTherapist, owner, desk).s;
    for (const svc of s.services) {
      expect(svc.therapistIds).toEqual([OWNER_STAFF_ID]);
      expect(s.categories.some((c) => c.id === svc.categoryId)).toBe(true);
      s = apply(s, upsertService, svc, desk).s;
    }
    for (const tpl of s.packageTemplates) {
      for (const sid of tpl.serviceIds) expect(getService(s, sid), `${tpl.id} → ${sid}`).toBeDefined();
      s = apply(s, upsertPackageTemplate, tpl, desk).s;
    }
    for (const g of s.groupTemplates) {
      expect(getService(s, g.serviceId)?.kind).toBe('group');
      expect(g.therapistId).toBe(OWNER_STAFF_ID);
      expect(s.rooms.some((r) => r.id === g.roomId)).toBe(true);
      s = apply(s, upsertGroupTemplate, g, desk).s;
    }
    // storno podmínky, pravidla rezervací a názvosloví projdou kontrolou nastavení
    s = apply(s, updateSettings, { terms: s.settings.terms, modules: s.settings.modules }, desk).s;
    expect(s.settings.policyHistory ?? []).toEqual([]);
  });

  it.each(ALL)('%s: názvosloví má všech 6 + 6 tvarů a platný rod', (id) => {
    const { business, staff } = tenant(id).settings.terms;
    for (const n of [business, staff]) {
      expect(n.sg).toHaveLength(6);
      expect(n.pl).toHaveLength(6);
      for (const f of [...n.sg, ...n.pl]) expect(f.trim()).not.toBe('');
      expect(['m', 'i', 'f', 'n']).toContain(n.gender);
    }
  });

  it('názvosloví a moduly podle oboru', () => {
    const label = (id: PresetId): string => {
      const { business, staff } = tenant(id).settings.terms;
      return `${business.sg[0]} / ${staff.sg[0]}`;
    };
    expect(ALL.map(label)).toEqual(['klinika / terapeut', 'studio / masér', 'studio / trenér', 'salon / kosmetička', 'provozovna / specialista']);
    expect(tenant('fyzio').settings.terms).toEqual(DEFAULT_TERMS);
    expect(PRESET_TERMS.beauty.staff.pl).toEqual(['kosmetičky', 'kosmetiček', 'kosmetičkám', 'kosmetičky', 'kosmetičkách', 'kosmetičkami']);
    expect(PRESET_TERMS.masaze.business.pl[1]).toBe('studií');
    expect(PRESET_TERMS.prazdna.staff.sg[3]).toBe('specialistu');
    for (const id of ALL) expect(tenant(id).settings.modules).toEqual(PRESET_MODULES[id]);
    expect(PRESET_MODULES.beauty.groups).toBe(false);
    expect(PRESET_MODULES.masaze.groups).toBe(false);
    expect(PRESET_MODULES.fyzio).toEqual({ groups: true, packages: true, credit: true, marketing: true });
    expect(PRESET_MODULES.fitness).toEqual({ groups: true, packages: true, credit: true, marketing: true });
    expect(PRESET_MODULES.prazdna).toEqual({ groups: true, packages: true, credit: true, marketing: false });
    // obory bez skupinových lekcí nemají skupinové služby ani rozvrh
    for (const id of ['masaze', 'beauty'] as const) {
      const s = tenant(id);
      expect(s.groupTemplates).toEqual([]);
      expect(s.services.some((x) => x.kind === 'group')).toBe(false);
    }
  });

  it('fyzio zůstává u výchozího katalogu kliniky, zdravotní permanentky bez odstoupení', () => {
    const s = tenant('fyzio');
    expect(s.services.map((x) => x.id)).toEqual(DEFAULT_SERVICES.map((x) => x.id));
    expect(s.packageTemplates.filter((t) => t.withdrawalAllowed === false).map((t) => t.id)).toEqual(['pt_fyzio10', 'pt_fyzio5']);
    // ostatní obory nejsou zdravotní služby – odstoupit do 14 dnů lze
    for (const id of ['masaze', 'fitness', 'beauty'] as const) for (const t of tenant(id).packageTemplates) expect(t.withdrawalAllowed).not.toBe(false);
    // kosmetika: 24 h zdarma, potom 50 %, bez omluvenek
    const b = tenant('beauty').settings.policy;
    expect([b.freeCancelHours, b.lateTiers, b.excuses.enabled, b.graceFirstLateCancel]).toEqual([24, [{ hoursBefore: 24, feePct: 50 }], false, true]);
  });

  it('název provozovny je v odesílateli i v QR platbě, texty zpráv mluví jazykem oboru', () => {
    const s = createPresetState('beauty', { businessName: '  Salon Lili  ', ownerName: 'Lili', today: TODAY });
    expect([s.settings.clinicName, s.settings.senderName, s.settings.payments.recipientName]).toEqual(['Salon Lili', 'Salon Lili', 'Salon Lili']);
    expect(s.therapists[0]).toMatchObject({ firstName: 'Lili', lastName: '' });
    expect(tenant('fyzio').settings.senderEmail).toBe('jana@example.cz');
    for (const id of ['masaze', 'fitness', 'beauty', 'prazdna'] as const) {
      const after = tenant(id).templates.find((t) => t.key === 'after_visit');
      expect(after?.body).not.toMatch(/cvičení/);
      expect(after?.body).toMatch(/\[jméno\]/);
    }
  });
});

describe('šablony oborů – provoz', () => {
  it.each(ALL)('%s: klient se zaregistruje a rezervuje online', (id) => {
    let s = tenant(id);
    if (id === 'prazdna') {
      // prázdná provozovna nemá katalog – první službu přidá majitel
      const cat = apply<Parameters<typeof upsertCategory>[1], string>(s, upsertCategory, { id: '', name: 'Konzultace', tone: 'teal', order: 0 }, desk);
      s = apply(cat.s, upsertService, { ...DEFAULT_SERVICES[1], id: '', categoryId: cat.value, therapistIds: [OWNER_STAFF_ID] }, desk).s;
    }
    const c = newClient(launched(s));
    s = c.s;
    const svc = s.services.find((x) => x.active && x.onlineBookable && x.kind === 'individual');
    expect(svc).toBeDefined();
    const start = firstSlot(s, svc!.id, c.clientId);
    const booked = apply<Parameters<typeof createBooking>[1], string>(
      s,
      createBooking,
      { clientId: c.clientId, serviceId: svc!.id, therapistId: OWNER_STAFF_ID, start, payment: { method: 'onsite' } },
      asClient(c.clientId),
    );
    const b = booked.s.bookings.find((x) => x.id === booked.value);
    expect(b).toMatchObject({ status: 'confirmed', therapistId: OWNER_STAFF_ID, roomId: s.therapists[0].roomId, price: svc!.priceCzk });
    expect(booked.s.messages.some((m) => m.kind === 'booking_confirmation' && m.clientId === c.clientId)).toBe(true);
  });

  it.each(['fyzio', 'fitness'] as const)('%s: rozvrh vytváří skupinové lekce v pracovní době a klient se přihlásí', (id) => {
    const c = newClient(launched(tenant(id)));
    const s = c.s;
    const week = nextWeekSessions(s);
    expect(s.groupTemplates.length).toBeGreaterThan(0);
    expect(week.length).toBe(s.groupTemplates.length);
    const owner = s.therapists[0];
    for (const ses of week) {
      const wd = s.groupTemplates.find((g) => g.id === ses.templateId)!.weekday;
      const inShift = owner.workingHours[wd].some((r) => r.start <= ses.start.slice(11) && ses.end.slice(11) <= r.end);
      expect(inShift, `${ses.title} ${ses.start}`).toBe(true);
    }
    const ses = week[0];
    const booked = apply<Parameters<typeof createBooking>[1], string>(
      s,
      createBooking,
      { clientId: c.clientId, serviceId: ses.serviceId, therapistId: ses.therapistId, start: ses.start, sessionId: ses.id, payment: { method: 'onsite' } },
      asClient(c.clientId),
    );
    expect(booked.s.bookings.find((b) => b.id === booked.value)?.sessionId).toBe(ses.id);
  });

  it.each(['masaze', 'beauty'] as const)('%s: skupinové lekce jsou vypnuté', (id) => {
    const s = tenant(id);
    expect(nextWeekSessions(s)).toEqual([]);
    const group = { ...DEFAULT_SERVICES.find((x) => x.kind === 'group')!, id: '', categoryId: s.categories[0].id, therapistIds: [OWNER_STAFF_ID] };
    let error = '';
    produce(s, (d) => {
      const r = upsertService(d as ClinicState, group, desk);
      if (!r.ok) error = r.error;
    });
    expect(error).toBe(MODULE_OFF.groups);
  });

  it.each(['fyzio', 'masaze', 'fitness', 'beauty'] as const)('%s: každá permanentka se prodá a zaplatí se z ní termín', (id) => {
    const c = newClient(tenant(id));
    for (const tpl of c.s.packageTemplates) {
      const sold = apply<Parameters<typeof sellPackage>[1], string>(c.s, sellPackage, { clientId: c.clientId, templateId: tpl.id, paidBy: 'cash' }, desk);
      const pkg = sold.s.packages.find((p) => p.id === sold.value)!;
      expect(withdrawalInfo(sold.s, { ...pkg, onlinePurchase: true }, NOW).allowed).toBe(tpl.withdrawalAllowed !== false);
      const svc = getService(sold.s, tpl.serviceIds[0])!;
      const ses = svc.kind === 'group' ? nextWeekSessions(sold.s).find((x) => x.serviceId === svc.id) : undefined;
      if (svc.kind === 'group') expect(ses, `${tpl.id}: lekce v rozvrhu`).toBeDefined();
      const start = ses ? ses.start : firstSlot(sold.s, svc.id, c.clientId);
      const booked = apply<Parameters<typeof createBooking>[1], string>(
        sold.s,
        createBooking,
        { clientId: c.clientId, serviceId: svc.id, therapistId: OWNER_STAFF_ID, start, sessionId: ses?.id, payment: { method: 'package', packageId: pkg.id } },
        desk,
      );
      expect(booked.s.bookings.find((b) => b.id === booked.value)?.payment).toMatchObject({ method: 'package', packageId: pkg.id, paid: true });
    }
  });
});
