import { PGlite } from '@electric-sql/pglite';
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { Actor, ClinicState, Ctx } from '../src/domain/types';
import { availableSlots } from '../src/engine/availability';
import { createBooking, createClient } from '../src/engine/commands';
import { createBaseState } from '../src/engine/defaults';
import { generateDemoState } from '../src/engine/seed';
import { ClinicEngine } from '../server/core/executor';
import { projectForClient } from '../server/core/projection';
import { commandFor } from '../server/core/registry';
import { chunksToState, computeChanges, stateToChunkJson } from '../server/core/state';
import { pragueNow } from '../server/core/time';
import { SUPABASE_ROLES_SQL, createSqlStore } from '../server/store/sql';
import { normalizeState } from '../src/store/persistence';

import MIGRATION from '../../supabase/migrations/20261113000000_init.sql?raw';
const OWNER_ID = '00000000-0000-4000-8000-000000000001';
const reception: Actor = { role: 'reception', name: 'Recepce' };

async function freshDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_ROLES_SQL);
  await db.exec(MIGRATION);
  return db;
}

function chunksOf(state: ClinicState): { key: string; data: unknown }[] {
  return [...stateToChunkJson(state)].map(([key, json]) => ({ key, data: JSON.parse(json) }));
}

function baseWithClients(n: number): ClinicState {
  let s = createBaseState('2026-01-01');
  for (let i = 0; i < n; i++) {
    s = produce(s, (d) => {
      createClient(d, { firstName: 'Klient', lastName: `Číslo${i}`, email: `k${i}@example.com`, phone: '', consents: { gdpr: true, health: false, marketingEmail: false, sms: false } }, { now: '2026-11-01T09:00', actor: reception });
    });
  }
  return s;
}

describe('stav po částech', () => {
  it('převede stav na části a zpět beze ztráty', () => {
    const s = generateDemoState('2026-11-13T10:00', { clients: 60, weeksBack: 2, daysAhead: 7 });
    const json = stateToChunkJson(s);
    expect(json.has('meta')).toBe(true);
    expect([...json.keys()].some((k) => k.startsWith('bookings/2026-W'))).toBe(true);
    const back = chunksToState(new Map([...json].map(([k, v]) => [k, JSON.parse(v)])));
    // obsah stejný; kolekce se při načtení jen seřadí (normalizeState) a pořadí klíčů nehraje roli
    expect(back).toEqual(normalizeState(JSON.parse(JSON.stringify(s)) as ClinicState));
  });

  it('pozná změněné a smazané části', () => {
    const s = baseWithClients(2);
    const prev = { state: s, chunkJson: stateToChunkJson(s) };
    const booked = produce(s, (d) => {
      createBooking(d, { clientId: s.clients[0].id, serviceId: 's_fyzio45', therapistId: 't_mala', start: '2026-11-18T09:00', payment: { method: 'onsite' } }, { now: '2026-11-13T10:00', actor: reception });
    });
    const a = computeChanges(prev, booked);
    expect(a.changes.map((c) => c.key).sort()).toEqual(['audit/2026-11', 'bookings/2026-W47', 'messages/2026-W46']);
    const emptied = produce(booked, (d) => {
      d.bookings = [];
    });
    const b = computeChanges({ state: booked, chunkJson: a.chunkJson }, emptied);
    expect(b.changes).toContainEqual({ key: 'bookings/2026-W47', data: null });
  });

  it('čas kliniky je v pražském pásmu', () => {
    expect(pragueNow(new Date('2026-07-01T10:30:00Z'))).toBe('2026-07-01T12:30');
    expect(pragueNow(new Date('2026-12-01T23:30:00Z'))).toBe('2026-12-02T00:30');
  });
});

describe('server nad Postgresem', () => {
  it('provede příkaz, zapíše jen změněné části a přidělí stejná ID jako prohlížeč', async () => {
    const db = await freshDb();
    const store = createSqlStore((sql, params) => db.query(sql, params));
    const base = baseWithClients(1);
    const clinicId = await store.createClinic('Klinika', OWNER_ID, 'Majitelka', chunksOf(base));
    const engine = new ClinicEngine(store);
    const input = { clientId: base.clients[0].id, serviceId: 's_fyzio45', therapistId: 't_mala', start: '2026-11-18T09:00', payment: { method: 'onsite' as const } };
    const r = await engine.execute(clinicId, createBooking, input, { actor: reception, now: '2026-11-13T10:00', commandId: 'cmd0000001' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBe('b_cmd0000001-0');
    expect(r.version).toBe(2);
    expect(r.changes.map((c) => c.key)).toContain('bookings/2026-W47');
    // nový server (prázdná cache) načte stejný stav z databáze
    const other = new ClinicEngine(store);
    const loaded = await other.current(clinicId);
    expect(loaded?.state.bookings.map((b) => b.id)).toEqual(['b_cmd0000001-0']);
    // deterministická ID: stejný příkaz v prohlížeči dá stejné ID
    const { withIdGenerator, sequentialIds } = await import('../src/engine/ids');
    const restore = withIdGenerator(sequentialIds('cmd0000001-'));
    let localId = '';
    produce(base, (d) => {
      const x = createBooking(d, input, { now: '2026-11-13T10:00', actor: reception } as Ctx);
      if (x.ok) localId = x.value;
    });
    restore();
    expect(localId).toBe('b_cmd0000001-0');
  });

  it('dva souběžné pokusy o stejný termín: druhý je odmítnut', async () => {
    const db = await freshDb();
    const store = createSqlStore((sql, params) => db.query(sql, params));
    const base = baseWithClients(2);
    const clinicId = await store.createClinic('Klinika', OWNER_ID, 'Majitelka', chunksOf(base));
    const a = new ClinicEngine(store);
    const b = new ClinicEngine(store);
    await a.current(clinicId);
    await b.current(clinicId); // obě instance mají stejnou (brzy zastaralou) verzi
    const slot = { serviceId: 's_fyzio45', therapistId: 't_mala', start: '2026-11-18T09:00', payment: { method: 'onsite' as const } };
    const first = await a.execute(clinicId, createBooking, { ...slot, clientId: base.clients[0].id }, { actor: reception, now: '2026-11-13T10:00', commandId: 'aaaaaaaa1' });
    const second = await b.execute(clinicId, createBooking, { ...slot, clientId: base.clients[1].id }, { actor: reception, now: '2026-11-13T10:00', commandId: 'bbbbbbbb1' });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    const final = await new ClinicEngine(store).current(clinicId);
    expect(final?.state.bookings).toHaveLength(1);
    expect(final?.state.bookings[0].clientId).toBe(base.clients[0].id);
  });

  it('role mimo server se k datům ani funkcím nedostanou', async () => {
    const db = await freshDb();
    const store = createSqlStore((sql, params) => db.query(sql, params));
    const clinicId = await store.createClinic('Klinika', OWNER_ID, 'Majitelka', chunksOf(baseWithClients(1)));
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      await expect(db.query('select count(*) from app.state_chunks')).rejects.toThrow(/permission denied/);
      await expect(db.query('select public.app_get_chunks($1::uuid, 0)', [clinicId])).rejects.toThrow(/permission denied/);
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    const ok = await db.query('select public.app_get_chunks($1::uuid, 0) as r', [clinicId]);
    expect((ok.rows[0] as { r: { version: number } }).r.version).toBe(1);
    await db.exec('reset role');
  });

  it('whoami vrátí roli personálu a propojeného klienta', async () => {
    const db = await freshDb();
    const store = createSqlStore((sql, params) => db.query(sql, params));
    const base = baseWithClients(1);
    const clinicId = await store.createClinic('Klinika', OWNER_ID, 'Tereza', chunksOf(base));
    const userId = '00000000-0000-4000-8000-0000000000c1';
    await store.linkClient(clinicId, userId, base.clients[0].id);
    await store.upsertMember(clinicId, '00000000-0000-4000-8000-0000000000a2', 'therapist', 't_kos', 'Marek');
    expect(await store.whoami(OWNER_ID)).toEqual({ members: [{ clinicId, role: 'owner', therapistId: null, displayName: 'Tereza' }], clients: [] });
    expect((await store.whoami(userId)).clients).toEqual([{ clinicId, clientId: base.clients[0].id }]);
    expect((await store.listMembers(clinicId)).map((m) => m.role)).toEqual(['owner', 'therapist']);
    await store.logCommand({ clinicId, userId: OWNER_ID, role: 'owner', command: 'createBooking', ok: true, version: 2 });
  });
});

describe('pohled klienta', () => {
  const now = '2026-11-13T10:00';
  const s = generateDemoState(now, { clients: 120, weeksBack: 2, daysAhead: 14 });
  const martin = s.clients.find((c) => c.firstName === 'Martin' && c.lastName === 'Dvořák')!;
  const view = projectForClient(s, martin.id, now);

  it('neobsahuje cizí osobní údaje', () => {
    expect(view.clients.map((c) => c.id)).toEqual([martin.id]);
    const foreign = view.bookings.filter((b) => b.clientId !== martin.id);
    expect(foreign.length).toBeGreaterThan(50);
    expect(foreign.every((b) => b.clientId === '' && b.price === 0 && b.note === '' && !b.fee && !b.cancel)).toBe(true);
    for (const list of [view.packages, view.ledger, view.payments, view.paymentRequests, view.messages, view.waitlist, view.makeups]) {
      expect(list.every((x) => x.clientId === martin.id)).toBe(true);
    }
    expect(view.audit).toEqual([]);
    expect(view.therapists.every((t) => t.email === '')).toBe(true);
    const json = JSON.stringify(view);
    const someoneElse = s.clients.find((c) => c.id !== martin.id)!;
    expect(json).not.toContain(someoneElse.email);
  });

  it('volné termíny vycházejí stejně jako z celého stavu', () => {
    for (const [serviceId, therapistId, date] of [
      ['s_fyzio45', 't_mala', '2026-11-16'],
      ['s_sport60', 't_vavrova', '2026-11-17'],
      ['s_g_kruhovy', 't_kos', '2026-11-17'],
    ] as const) {
      const q = { serviceId, therapistId, date, now, mode: 'client' as const, clientId: martin.id };
      expect(availableSlots(view, q)).toEqual(availableSlots(s, q));
    }
  });
});

describe('oprávnění příkazů', () => {
  it('klient smí rezervovat, ale ne měnit nastavení; testovací hodiny nejsou dostupné', () => {
    expect(typeof commandFor('createBooking', 'client')).toBe('object');
    expect(commandFor('updateSettings', 'reception')).toBe('forbidden');
    expect(commandFor('confirmPaymentRequest', 'client')).toBe('forbidden');
    expect(commandFor('setSimulatedNow', 'owner')).toBe('unknown');
    expect(commandFor('recordDeliveries', 'owner')).toBe('unknown');
    expect(commandFor('__proto__', 'owner')).toBe('unknown');
  });
});
