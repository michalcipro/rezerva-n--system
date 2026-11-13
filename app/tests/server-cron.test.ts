import { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Actor, ClinicState } from '../src/domain/types';
import { createBooking, createClient, saveCampaign, sendCampaign } from '../src/engine/commands';
import { DEMO_ACCOUNT } from '../src/engine/defaults';
import { createApi, productionBaseState } from '../server/api';
import { devAuth } from '../server/auth';
import { ClinicEngine } from '../server/core/executor';
import { stateToChunkJson } from '../server/core/state';
import { bankJob, deliveryJob } from '../server/cron';
import type { Messenger, OutgoingEmail, OutgoingSms, SendResult } from '../server/providers';
import { SUPABASE_ROLES_SQL, createSqlStore } from '../server/store/sql';
import type { StateStore } from '../server/store/types';

import MIGRATION from '../../supabase/migrations/20261113000000_init.sql?raw';

const CRON = 'cron-secret-for-tests-0002';
const UNSUB = 'unsubscribe-secret-for-tests';
const OWNER = '00000000-0000-4000-8000-0000000000f1';
const NOW = '2026-11-17T09:00';
const CLOCK = new Date('2026-11-17T08:00:00Z');
const reception: Actor = { role: 'reception', name: 'Recepce' };

interface Sent {
  emails: OutgoingEmail[];
  sms: OutgoingSms[];
}

function fakeMessenger(result: (kind: 'email' | 'sms') => SendResult = () => ({ ok: true, providerId: 'x' })): Messenger & { sent: Sent } {
  const sent: Sent = { emails: [], sms: [] };
  return {
    sent,
    async sendEmail(m) {
      sent.emails.push(m);
      return result('email');
    },
    async sendSms(m) {
      sent.sms.push(m);
      return result('sms');
    },
  };
}

function fioStatement(txs: { id: number; date: string; amount: number; vs: string }[]): Response {
  const body = {
    accountStatement: {
      info: { accountId: '1234567020', bankId: '2010', currency: 'CZK' },
      transactionList: {
        transaction: txs.map((t) => ({
          column22: { value: t.id, name: 'ID pohybu', id: 22 },
          column0: { value: `${t.date}+0100`, name: 'Datum', id: 0 },
          column1: { value: t.amount, name: 'Objem', id: 1 },
          column14: { value: 'CZK', name: 'Měna', id: 14 },
          column5: { value: t.vs, name: 'VS', id: 5 },
        })),
      },
    },
  };
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

let db: PGlite;
let store: StateStore;
let engine: ClinicEngine;
let clinicId: string;

async function setup(): Promise<void> {
  db = new PGlite();
  await db.exec(SUPABASE_ROLES_SQL);
  await db.exec(MIGRATION);
  store = createSqlStore((sql, params) => db.query(sql, params));
  const base: ClinicState = productionBaseState('Klinika Test', '2026-11-01');
  base.settings.senderEmail = 'recepce@klinika.example';
  base.settings.payments = { ...base.settings.payments, qrEnabled: true, accountNumber: DEMO_ACCOUNT.accountNumber, iban: DEMO_ACCOUNT.iban };
  const chunks = [...stateToChunkJson(base)].map(([key, data]) => ({ key, data: JSON.parse(data) as unknown }));
  clinicId = await store.createClinic('Klinika Test', OWNER, 'Majitelka', chunks, 'majitelka@example.cz');
  engine = new ClinicEngine(store);
}

async function run<I, R>(cmd: (d: ClinicState, i: I, c: { now: string; actor: Actor }) => { ok: boolean }, input: I, id: string): Promise<R> {
  const r = await engine.execute(clinicId, cmd as never, input, { actor: reception, now: NOW, commandId: id });
  if (!r.ok) throw new Error(r.error);
  return r.value as R;
}

async function client(email: string, sms = true): Promise<string> {
  return run<unknown, string>(
    createClient as never,
    { firstName: 'Eva', lastName: 'Testová', email, phone: '777 123 456', consents: { gdpr: true, health: false, marketingEmail: true, sms } },
    `cl-${email.replace(/[^a-z0-9]/g, '')}`.slice(0, 40),
  );
}

function api(jobs: Parameters<typeof createApi>[0]['cronJobs']) {
  return createApi({ store, engine, auth: devAuth('vyvojovy-klic-pro-testy-0002'), clock: () => CLOCK, cronSecret: CRON, unsubscribeSecret: UNSUB, cronJobs: jobs, log: () => undefined });
}

const cron = (handle: (r: Request) => Promise<Response>) =>
  handle(new Request('http://localhost/api/cron', { method: 'POST', headers: { 'x-cron-secret': CRON } })).then((r) => r.json() as Promise<Record<string, unknown>>);

beforeEach(setup, 60_000);

describe('automatika: odeslání zpráv', () => {
  it('odešle potvrzení rezervace a zapíše ho jako odeslané', async () => {
    const id = await client('eva@example.cz');
    await run(createBooking as never, { clientId: id, serviceId: 's_fyzio45', therapistId: 't_mala', start: '2026-11-19T09:00', payment: { method: 'onsite' } }, 'book000001');
    const queued = (await engine.current(clinicId))!.state.messages.filter((m) => m.status === 'queued');
    expect(queued.length).toBeGreaterThan(0);

    const messenger = fakeMessenger();
    const report = await cron(api([deliveryJob({ messenger })]));
    expect(report.ok).toBe(true);
    expect(messenger.sent.emails[0]).toMatchObject({ to: 'eva@example.cz', toName: 'Eva Testová', replyTo: 'recepce@klinika.example', fromName: 'Klinika Test' });
    expect(messenger.sent.emails[0].html).toContain('<html');

    const after = (await new ClinicEngine(store).current(clinicId))!.state.messages;
    expect(after.filter((m) => m.status === 'queued')).toHaveLength(0);
    expect(after.find((m) => m.id === queued[0].id)).toMatchObject({ status: 'sent', sentAt: NOW, attempts: 1 });
  });

  it('chyba účtu u poskytovatele (401) nechá zprávy ve frontě', async () => {
    const id = await client('eva@example.cz');
    await run(createBooking as never, { clientId: id, serviceId: 's_fyzio45', therapistId: 't_mala', start: '2026-11-19T09:00', payment: { method: 'onsite' } }, 'book000002');
    const messenger = fakeMessenger(() => ({ ok: false, httpStatus: 401, permanent: true, error: 'Neplatný klíč' }));
    const report = await cron(api([deliveryJob({ messenger })]));
    const clinic = (report.clinics as Record<string, { stopped?: string }>[])[0];
    expect(clinic.messages).toMatchObject({ sent: 0, failed: 0 });
    const msgs = (await new ClinicEngine(store).current(clinicId))!.state.messages;
    expect(msgs.some((m) => m.status === 'queued' && !m.attempts)).toBe(true);
  });

  it('dočasná chyba = další pokus, trvalá chyba = neodesláno', async () => {
    const id = await client('eva@example.cz', false);
    await run(createBooking as never, { clientId: id, serviceId: 's_fyzio45', therapistId: 't_mala', start: '2026-11-19T09:00', payment: { method: 'onsite' } }, 'book000003');
    await cron(api([deliveryJob({ messenger: fakeMessenger(() => ({ ok: false, httpStatus: 503, error: 'Nedostupné' })) })]));
    const sendable = (s: ClinicState) => s.messages.filter((m) => m.clientId === id && m.status !== 'skipped');
    let msgs = sendable((await new ClinicEngine(store).current(clinicId))!.state);
    expect(msgs.length).toBeGreaterThan(0);
    expect(msgs.every((m) => m.status === 'queued' && m.attempts === 1 && m.error === 'Nedostupné')).toBe(true);
    await cron(api([deliveryJob({ messenger: fakeMessenger(() => ({ ok: false, permanent: true, error: 'Neplatná adresa' })) })]));
    msgs = sendable((await new ClinicEngine(store).current(clinicId))!.state);
    expect(msgs.every((m) => m.status === 'failed' && m.error === 'Neplatná adresa')).toBe(true);
  });

  it('novinky mají odkaz na odhlášení, který funguje jen s platným podpisem', async () => {
    const id = await client('eva@example.cz');
    const campaignId = await run<unknown, string>(
      saveCampaign as never,
      {
        id: '',
        name: 'Novinky',
        subject: 'Novinky z kliniky',
        preheader: '',
        blocks: [{ type: 'text', text: 'Nové lekce jógy.' }],
        segment: { match: 'all', rules: [], exclude: [] },
        status: 'draft',
        scheduledAt: null,
        sentAt: null,
        recipients: 0,
        createdAt: NOW,
        updatedAt: NOW,
      },
      'camp000001',
    );
    await run(sendCampaign as never, { campaignId }, 'camp000002');
    const messenger = fakeMessenger();
    const handle = api([deliveryJob({ messenger, publicApiUrl: 'https://api.example.cz/api', unsubscribeSecret: UNSUB })]);
    await cron(handle);
    const mail = messenger.sent.emails.find((m) => m.subject === 'Novinky z kliniky');
    expect(mail?.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    const link = /<(https:[^>]+)>/.exec(mail!.headers!['List-Unsubscribe'])![1];
    expect(mail!.text).toContain(link);

    const local = link.replace('https://api.example.cz', 'http://localhost');
    expect((await handle(new Request(local))).status).toBe(200);
    expect((await handle(new Request(local.replace(/s=[^&]+/, 's=podvrh'), { method: 'POST' }))).status).toBe(400);
    expect((await handle(new Request(local, { method: 'POST' }))).status).toBe(200);
    const c = (await new ClinicEngine(store).current(clinicId))!.state.clients.find((x) => x.id === id)!;
    expect(c.consents.marketingEmail).toBeNull();
  });
});

describe('automatika: párování plateb z Fio', () => {
  it('potvrdí QR platbu se shodným VS a částkou, podruhé už ne', async () => {
    const id = await client('eva@example.cz');
    await run(createBooking as never, { clientId: id, serviceId: 's_fyzio45', therapistId: 't_mala', start: '2026-11-19T09:00', payment: { method: 'qr' } }, 'book000004');
    const req = (await engine.current(clinicId))!.state.paymentRequests[0];
    expect(req.status).toBe('pending');

    const urls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      urls.push(String(input));
      return fioStatement([
        { id: 900001, date: '2026-11-17', amount: req.amount, vs: req.vs },
        { id: 900002, date: '2026-11-17', amount: 500, vs: '99999999' },
      ]);
    };
    const handle = api([bankJob({ token: 'tajny-token-fio', fetchImpl })]);
    const report = await cron(handle);
    expect((report.clinics as { bank: unknown }[])[0].bank).toMatchObject({ pending: 1, confirmed: 1 });
    expect(urls[0]).toContain('/periods/tajny-token-fio/2026-11-17/2026-11-17/transactions.json');
    const s = (await new ClinicEngine(store).current(clinicId))!.state;
    expect(s.paymentRequests[0]).toMatchObject({ status: 'paid', resolvedBy: 'Banka (Fio)' });
    expect(s.bookings[0].payment.paid).toBe(true);
    // klient dostane potvrzení o přijaté platbě
    expect(s.messages.find((m) => m.kind === 'payment_received' && m.clientId === id)).toMatchObject({ status: 'queued', channel: 'email' });

    const again = await cron(handle);
    expect((again.clinics as { bank: unknown }[])[0].bank).toMatchObject({ pending: 0 });
  });

  it('platba starší než výzva se nespáruje', async () => {
    const id = await client('eva@example.cz');
    await run(createBooking as never, { clientId: id, serviceId: 's_fyzio45', therapistId: 't_mala', start: '2026-11-19T09:00', payment: { method: 'qr' } }, 'book000005');
    const req = (await engine.current(clinicId))!.state.paymentRequests[0];
    const fetchImpl: typeof fetch = async () => fioStatement([{ id: 900003, date: '2026-11-10', amount: req.amount, vs: req.vs }]);
    const report = await cron(api([bankJob({ token: 'tajny-token-fio', fetchImpl })]));
    expect((report.clinics as { bank: unknown }[])[0].bank).toMatchObject({ confirmed: 0 });
  });
});

describe('automatika: souběh', () => {
  it('druhé souběžné spuštění se přeskočí', async () => {
    expect(await store.acquireLock('cron', 'jiny-proces', 240)).toBe(true);
    const report = await cron(api([]));
    expect(report.skipped).toBeTruthy();
    await store.releaseLock('cron', 'jiny-proces');
    const ok = await cron(api([]));
    expect(ok.clinics).toBeTruthy();
  });
});
