import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { Booking, ClinicState, Ctx } from '../src/domain/types';
import { createBooking, createClient } from '../src/engine/commands';
import { stagesSorted } from '../src/engine/crm';
import { createBaseState } from '../src/engine/defaults';
import { buildPipelineCards, coachOf, daysInStageLabel, groupColumns, NONE, normalizeText, showMoreLabel } from '../src/screens/pipeline/model';

const staff = (now: string): Ctx => ({ now, actor: { role: 'reception', name: 'Recepce' } });

function run<I>(s: ClinicState, cmd: (d: ClinicState, i: I, c: Ctx) => { ok: boolean; value?: unknown; error?: string }, input: I, ctx: Ctx): { state: ClinicState; value: string } {
  let value: unknown;
  let error: string | undefined;
  const next = produce(s, (d) => {
    const r = cmd(d, input, ctx);
    if (r.ok) value = r.value;
    else error = r.error;
  });
  if (error) throw new Error(error);
  return { state: next, value: value as string };
}

const consents = { gdpr: true, health: true, marketingEmail: false, sms: false };

const booking = (therapistId: string, start: string, status: Booking['status']): Booking => ({ therapistId, start, status }) as Booking;

describe('pipeline – pomocné funkce', () => {
  it('kouč = terapeut posledního nezrušeného sezení, jinak příštího, jinak poslední rezervace', () => {
    const now = '2026-10-14T10:00';
    expect(coachOf([booking('t_mala', '2026-10-01T09:00', 'completed'), booking('t_riha', '2026-10-10T09:00', 'cancelled'), booking('t_kos', '2026-10-20T09:00', 'confirmed')], now)).toBe('t_mala');
    expect(coachOf([booking('t_riha', '2026-10-10T09:00', 'cancelled'), booking('t_kos', '2026-10-20T09:00', 'confirmed'), booking('t_mala', '2026-10-27T09:00', 'confirmed')], now)).toBe('t_kos');
    expect(coachOf([booking('t_riha', '2026-10-10T09:00', 'cancelled')], now)).toBe('t_riha');
    expect(coachOf([], now)).toBeNull();
  });

  it('popisky jsou česky a správně skloňované', () => {
    expect(normalizeText('  Říha   Václav ')).toBe('riha vaclav');
    expect(daysInStageLabel(0)).toBe('Ve fázi od dneška');
    expect(daysInStageLabel(3).replace(/ /g, ' ')).toBe('Ve fázi 3 dny');
    expect(showMoreLabel(6, 30)).toBe('Zobrazit zbývající (6)');
    expect(showMoreLabel(328, 30).replace(/ /g, ' ')).toBe('Zobrazit dalších 30 ze 328');
  });

  it('karty se rozdělí do sloupců podle fáze, hledání ignoruje diakritiku a filtr „bez kouče“ funguje', () => {
    let s = createBaseState('2026-01-01');
    const now = '2026-10-14T10:00';
    const a = run(s, createClient, { firstName: 'Šárka', lastName: 'Dvořáková', email: 'sarka@example.com', phone: '', consents, stageId: 'st_freetalk' }, staff('2026-10-01T09:00'));
    s = a.state;
    const b = run(s, createClient, { firstName: 'Jan', lastName: 'Novák', email: 'jan@example.com', phone: '', consents }, staff('2026-10-02T09:00'));
    s = b.state;
    s = run(s, createBooking, { clientId: a.value, serviceId: 's_freetalk', therapistId: 't_mala', start: '2026-10-21T09:00', payment: { method: 'free' } }, staff('2026-10-05T09:00')).state;
    // klient s fází, která v nastavení neexistuje, spadne do první fáze (stejně jako clientStage)
    s = produce(s, (d) => {
      d.clients.find((c) => c.id === b.value)!.stageId = 'st_neexistuje';
    });

    const stages = stagesSorted(s);
    const cards = buildPipelineCards(s, now);
    const all = groupColumns(stages, cards, { query: '', coach: '' }, 'name');
    expect(all.map((c) => c.stage.id)).toEqual(stages.map((st) => st.id));
    expect(all.find((c) => c.stage.id === 'st_freetalk')!.cards.map((c) => c.client.id)).toEqual([a.value]);
    expect(all[0].cards.map((c) => c.client.id)).toEqual([b.value]);
    expect(cards.find((c) => c.client.id === a.value)!.coachId).toBe('t_mala');
    expect(cards.find((c) => c.client.id === a.value)!.nextSessionAt).toBe('2026-10-21T09:00');

    const found = groupColumns(stages, cards, { query: 'sarka dvorak', coach: '' }, 'name');
    expect(found.flatMap((c) => c.cards).map((c) => c.client.id)).toEqual([a.value]);
    expect(found.find((c) => c.stage.id === 'st_freetalk')!.total).toBe(1);

    const noCoach = groupColumns(stages, cards, { query: '', coach: NONE }, 'name');
    expect(noCoach.flatMap((c) => c.cards).map((c) => c.client.id)).toEqual([b.value]);
  });
});
