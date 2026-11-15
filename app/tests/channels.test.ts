import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { Campaign, ClinicState, Ctx } from '../src/domain/types';
import { SMS_ENABLED, SMS_OFF_REASON, activeChannels, channelEnabled } from '../src/engine/channels';
import {
  createBooking,
  createClient,
  recordDeliveries,
  saveCampaign,
  sendCampaign,
  sendManualMessage,
  setConsent,
  updateSettings,
  updateTemplate,
} from '../src/engine/commands';
import { createBaseState } from '../src/engine/defaults';
import { DEFAULT_TEMPLATES } from '../src/engine/messages';
import { runProcesses } from '../src/engine/processes';

const NOW = '2026-11-10T10:00';
const staff = (now = NOW): Ctx => ({ now, actor: { role: 'reception', name: 'Recepce' } });
const owner = (now = NOW): Ctx => ({ now, actor: { role: 'owner', name: 'Tereza Malá', therapistId: 't_mala' } });
const asClient = (clientId: string, now = NOW): Ctx => ({ now, actor: { role: 'client', name: 'Klient', clientId } });

type Cmd<I> = (d: ClinicState, i: I, c: Ctx) => { ok: boolean; value?: unknown; error?: string };

function run<I, R = unknown>(s: ClinicState, cmd: Cmd<I>, input: I, ctx: Ctx): { state: ClinicState; value: R } {
  let value: R | undefined;
  let error: string | undefined;
  const next = produce(s, (d) => {
    const r = cmd(d, input, ctx);
    if (r.ok) value = r.value as R;
    else error = r.error;
  });
  if (error) throw new Error(error);
  return { state: next, value: value as R };
}

function tryRun<I>(s: ClinicState, cmd: Cmd<I>, input: I, ctx: Ctx): string | null {
  let error: string | null = null;
  produce(s, (d) => {
    const r = cmd(d, input, ctx);
    if (!r.ok) error = r.error ?? 'chyba';
  });
  return error;
}

const LEGACY_CONSENT = { at: '2025-03-01T10:00', source: 'online formulář' };

/**
 * Eva (e-mail i telefon) a Petr (jen telefon) – oba „chtějí“ SMS a mají starší souhlas se SMS
 * (jako klienti ze starších dat), Eva i souhlas s obchodními sděleními.
 */
function setup(): { s: ClinicState; eva: string; petr: string } {
  let s = createBaseState('2026-01-01');
  const a = run<Parameters<typeof createClient>[1], string>(
    s,
    createClient,
    { firstName: 'Eva', lastName: 'Testová', email: 'eva@example.cz', phone: '+420 600 000 001', consents: { gdpr: true, health: false, marketingEmail: true, sms: true } },
    staff(),
  );
  const b = run<Parameters<typeof createClient>[1], string>(
    a.state,
    createClient,
    { firstName: 'Petr', lastName: 'Svoboda', email: '', phone: '+420 603 987 654', consents: { gdpr: true, health: false, marketingEmail: true, sms: true } },
    staff(),
  );
  s = produce(b.state, (d) => {
    for (const c of d.clients) c.consents.sms = { ...LEGACY_CONSENT };
  });
  return { s, eva: a.value, petr: b.value };
}

const book = (clientId: string, start: string) => ({ clientId, serviceId: 's_fyzio45', therapistId: 't_mala', start, payment: { method: 'onsite' as const } });
const smsOf = (s: ClinicState) => s.messages.filter((m) => m.channel === 'sms');

describe('SMS vypnuté přepínačem platformy', () => {
  it('přepínač je vypnutý; šablony mají SMS jen „uspané“ ve výchozích datech', () => {
    expect(SMS_ENABLED).toBe(false);
    expect(channelEnabled('sms')).toBe(false);
    expect(channelEnabled('email')).toBe(true);
    expect(activeChannels(['sms', 'email'])).toEqual(['email']);
    // výchozí šablony SMS kanál pořád uvádějí (pro případné zapnutí) – o odeslání rozhoduje přepínač
    expect(DEFAULT_TEMPLATES.find((t) => t.key === 'reminder')?.channels).toContain('sms');
  });

  it('šablony nezařadí žádnou SMS – potvrzení, připomínka ani šablona přepnutá jen na SMS', () => {
    const { s: base, eva, petr } = setup();
    let s = run(base, createBooking, book(eva, '2026-11-20T09:00'), staff()).state;
    // potvrzení rezervace má kanály e-mail + SMS → jen e-mail
    expect(s.messages.filter((m) => m.kind === 'booking_confirmation').map((m) => [m.clientId, m.channel, m.status])).toEqual([[eva, 'email', 'sent']]);
    // klient jen s telefonem: e-mail se neodešle (chybí adresa) a SMS se vůbec nezařadí
    s = run(s, createBooking, book(petr, '2026-11-19T09:00'), staff()).state;
    expect(s.messages.filter((m) => m.clientId === petr).map((m) => [m.channel, m.status, m.skipReason])).toEqual([['email', 'skipped', 'Klient nemá e-mail.']]);
    // připomínka (kanály SMS + e-mail) z automatiky
    s = run(s, runProcesses, {}, owner('2026-11-19T10:00')).state;
    expect(s.messages.filter((m) => m.kind === 'reminder' && m.clientId === eva).map((m) => m.channel)).toEqual(['email']);
    // šablona, která má ze starších dat zapnutou jen SMS, nepošle nic
    s = run(s, updateTemplate, { key: 'booking_confirmation', patch: { channels: ['sms'] } }, owner()).state;
    const before = s.messages.length;
    s = run(s, createBooking, book(eva, '2026-11-24T09:00'), staff()).state;
    expect(s.messages.slice(before).filter((m) => m.kind === 'booking_confirmation')).toEqual([]);
    expect(smsOf(s)).toEqual([]);
  });

  it('kampaně posílají jen e-mail – klient se starším souhlasem se SMS a bez e-mailu nedostane nic', () => {
    const { s: base, eva, petr } = setup();
    const campaign: Campaign = {
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
    };
    const saved = run<Campaign, string>(base, saveCampaign, campaign, owner());
    const sent = run<{ campaignId: string }, number>(saved.state, sendCampaign, { campaignId: saved.value }, owner());
    expect(sent.value).toBe(1);
    const msgs = sent.state.messages.filter((m) => m.kind === 'campaign');
    expect(msgs.map((m) => [m.clientId, m.channel])).toEqual([[eva, 'email']]);
    expect(msgs.some((m) => m.clientId === petr)).toBe(false);
    expect(smsOf(sent.state)).toEqual([]);
  });

  it('nový souhlas se SMS nevznikne; starší zůstává a klient ho může odvolat', () => {
    let s = createBaseState('2026-01-01');
    const c = run<Parameters<typeof createClient>[1], string>(
      s,
      createClient,
      { firstName: 'Jana', lastName: 'Nová', email: 'jana@example.cz', phone: '777 111 222', consents: { gdpr: true, health: false, marketingEmail: false, sms: true } },
      asClient('x'),
    );
    s = c.state;
    expect(s.clients[0].consents.sms).toBeNull();
    expect(tryRun(s, setConsent, { clientId: c.value, key: 'sms', value: true }, staff())).toBe(SMS_OFF_REASON);
    expect(tryRun(s, setConsent, { clientId: c.value, key: 'sms', value: true }, asClient(c.value))).toBe(SMS_OFF_REASON);

    const { s: legacy, eva } = setup();
    expect(legacy.clients.find((x) => x.id === eva)?.consents.sms).toEqual(LEGACY_CONSENT);
    const revoked = run(legacy, setConsent, { clientId: eva, key: 'sms', value: false }, asClient(eva)).state;
    expect(revoked.clients.find((x) => x.id === eva)?.consents.sms).toBeNull();
    expect(revoked.audit[revoked.audit.length - 1]).toMatchObject({ action: 'Souhlas odvolán', clientId: eva });
  });

  it('ruční zprávu jde poslat jen e-mailem', () => {
    const { s, eva } = setup();
    expect(tryRun(s, sendManualMessage, { clientId: eva, channel: 'sms', subject: '', body: 'Dobrý den' }, staff())).toBe(SMS_OFF_REASON);
    const r = run(s, sendManualMessage, { clientId: eva, channel: 'email', subject: 'Změna', body: 'Dobrý den' }, staff()).state;
    expect(r.messages.map((m) => m.channel)).toEqual(['email']);
  });

  it('SMS, která čeká ve frontě ze starších dat, server označí jako neodeslanou s důvodem', () => {
    const { s: base, eva } = setup();
    let s = run(base, updateSettings, { messaging: { deliver: true } }, owner()).state;
    s = produce(s, (d) => {
      d.messages.push({ id: 'm_sms_fronta', clientId: eva, channel: 'sms', kind: 'reminder', subject: '', body: 'Připomínka termínu.', at: NOW, status: 'queued' });
    });
    const r = run(s, recordDeliveries, { results: [{ messageId: 'm_sms_fronta', ok: false, skipReason: SMS_OFF_REASON }] }, owner());
    expect(r.value).toEqual({ sent: 0, failed: 0, skipped: 1 });
    const m = r.state.messages.find((x) => x.id === 'm_sms_fronta')!;
    expect(m).toMatchObject({ status: 'skipped', skipReason: SMS_OFF_REASON });
    expect(m.attempts).toBeUndefined();
  });
});
