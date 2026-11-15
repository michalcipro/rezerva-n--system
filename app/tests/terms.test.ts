import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { Campaign, ClinicState, Ctx, NounForms } from '../src/domain/types';
import { checkBookingSlot } from '../src/engine/availability';
import { cancelBooking, createBooking, createClient, updateSettings } from '../src/engine/commands';
import { DEFAULT_TERMS, createBaseState } from '../src/engine/defaults';
import { NBSP, countLabel } from '../src/engine/format';
import { evaluateCancellation } from '../src/engine/policy';
import { DEFAULT_TEMPLATES, templateDescription, templateName } from '../src/engine/messages';
import { campaignPlainText } from '../src/engine/segments';
import {
  BUSINESS_NOUNS,
  BUSINESS_NOUN_IDS,
  CASES,
  STAFF_NOUNS,
  STAFF_NOUN_IDS,
  businessNounId,
  cap,
  copyNoun,
  countForms,
  makeTerms,
  nounForm,
  prep,
  staffNounId,
  termsFor,
  termsOf,
} from '../src/engine/terms';

const owner: Ctx = { now: '2026-11-15T10:00', actor: { role: 'owner', name: 'Majitel' } };

const ALL: [string, NounForms][] = [...Object.entries(BUSINESS_NOUNS), ...Object.entries(STAFF_NOUNS)];

describe('katalog názvosloví', () => {
  it('obsahuje všechna slova ze zadání s úplnými tvary', () => {
    expect(BUSINESS_NOUN_IDS).toEqual(['klinika', 'studio', 'salon', 'centrum', 'provozovna', 'ordinace', 'praxe']);
    expect(STAFF_NOUNS.terapeut.sg[0]).toBe('terapeut');
    expect(STAFF_NOUN_IDS.map((id) => STAFF_NOUNS[id].sg[0])).toEqual([
      'terapeut',
      'fyzioterapeut',
      'masér',
      'trenér',
      'lektor',
      'instruktor',
      'specialista',
      'kosmetička',
      'kadeřník',
      'kadeřnice',
    ]);
    for (const [id, n] of ALL) {
      expect(n.sg, id).toHaveLength(6);
      expect(n.pl, id).toHaveLength(6);
      for (const f of [...n.sg, ...n.pl]) {
        expect(f.trim().length, id).toBeGreaterThan(0);
        expect(f.length, id).toBeLessThanOrEqual(40);
        expect(f, id).toBe(f.toLocaleLowerCase('cs-CZ'));
      }
      expect(['m', 'i', 'f', 'n'], id).toContain(n.gender);
    }
  });

  it('výchozí klinika / terapeut odpovídá DEFAULT_TERMS', () => {
    expect(BUSINESS_NOUNS.klinika).toEqual(DEFAULT_TERMS.business);
    expect(STAFF_NOUNS.terapeut).toEqual(DEFAULT_TERMS.staff);
  });

  it('kontrolní tvary a rody', () => {
    expect(STAFF_NOUNS.specialista).toEqual({
      sg: ['specialista', 'specialisty', 'specialistovi', 'specialistu', 'specialistovi', 'specialistou'],
      pl: ['specialisté', 'specialistů', 'specialistům', 'specialisty', 'specialistech', 'specialisty'],
      gender: 'm',
    });
    expect(STAFF_NOUNS.kosmeticka.sg[2]).toBe('kosmetičce');
    expect(STAFF_NOUNS.kosmeticka.pl[1]).toBe('kosmetiček');
    expect(STAFF_NOUNS.kadernik.pl[0]).toBe('kadeřníci');
    expect(STAFF_NOUNS.kadernik.pl[4]).toBe('kadeřnících');
    expect(STAFF_NOUNS.kadernice.pl[1]).toBe('kadeřnic');
    expect(STAFF_NOUNS.maser.pl[0]).toBe('maséři');
    expect(BUSINESS_NOUNS.studio.pl).toEqual(['studia', 'studií', 'studiím', 'studia', 'studiích', 'studii']);
    expect(BUSINESS_NOUNS.centrum.pl[1]).toBe('center');
    expect(BUSINESS_NOUNS.provozovna.pl[1]).toBe('provozoven');
    expect(BUSINESS_NOUNS.ordinace.sg[5]).toBe('ordinací');
    expect(BUSINESS_NOUNS.praxe.pl[5]).toBe('praxemi');
    expect(Object.fromEntries(BUSINESS_NOUN_IDS.map((id) => [id, BUSINESS_NOUNS[id].gender]))).toEqual({
      klinika: 'f',
      studio: 'n',
      salon: 'i',
      centrum: 'n',
      provozovna: 'f',
      ordinace: 'f',
      praxe: 'f',
    });
    expect(STAFF_NOUN_IDS.filter((id) => STAFF_NOUNS[id].gender === 'f')).toEqual(['kosmeticka', 'kadernice']);
  });

  it('každou dvojici z katalogu přijme uložení nastavení', () => {
    const s = createBaseState('2026-01-01');
    for (const b of BUSINESS_NOUN_IDS) {
      for (const st of STAFF_NOUN_IDS) {
        let error: string | null = null;
        const next = produce(s, (d) => {
          const r = updateSettings(d as ClinicState, { terms: termsFor(b, st) }, owner);
          if (!r.ok) error = r.error;
        });
        expect(error, `${b} + ${st}`).toBeNull();
        expect(next.settings.terms).toEqual({ business: BUSINESS_NOUNS[b], staff: STAFF_NOUNS[st] });
      }
    }
  });

  it('katalog je zmrazený a termsFor vrací nezávislé kopie', () => {
    expect(Object.isFrozen(BUSINESS_NOUNS.studio.sg)).toBe(true);
    const t = termsFor('studio', 'trener');
    t.business.sg[0] = 'změna';
    expect(BUSINESS_NOUNS.studio.sg[0]).toBe('studio');
    expect(copyNoun(STAFF_NOUNS.lektor)).toEqual(STAFF_NOUNS.lektor);
    expect(copyNoun(STAFF_NOUNS.lektor).sg).not.toBe(STAFF_NOUNS.lektor.sg);
  });

  it('pozná slovo z katalogu podle uložených tvarů', () => {
    expect(businessNounId(DEFAULT_TERMS.business)).toBe('klinika');
    expect(staffNounId(copyNoun(STAFF_NOUNS.kadernice))).toBe('kadernice');
    expect(staffNounId({ ...copyNoun(STAFF_NOUNS.trener), gender: 'f' })).toBeNull();
    expect(businessNounId({ ...copyNoun(BUSINESS_NOUNS.salon), sg: ['salón', 'salónu', 'salónu', 'salón', 'salónu', 'salónem'] })).toBeNull();
  });
});

describe('pomůcky pro texty', () => {
  it('termsOf: tvary podle pádu a čísla, velké písmeno, výchozí hodnoty', () => {
    const t = termsOf(createBaseState('2026-01-01'));
    expect(CASES.map((c) => t.staff[c])).toEqual(DEFAULT_TERMS.staff.sg);
    expect(t.staff.acc).toBe('terapeuta');
    expect(t.staffPl.gen).toBe('terapeutů');
    expect(t.Staff.nom).toBe('Terapeut');
    expect(t.StaffPl.nom).toBe('Terapeuti');
    expect(t.business.loc).toBe('klinice');
    expect(t.Business.ins).toBe('Klinikou');
    expect(t.BusinessPl.gen).toBe('Klinik');
    expect(t.staff.form('dat')).toBe('terapeutovi');
    expect(nounForm(STAFF_NOUNS.trener, 'gen', 'pl')).toBe('trenérů');
    expect(nounForm(BUSINESS_NOUNS.studio, 'ins')).toBe('studiem');
    // stav bez názvosloví (starší data, testy) = výchozí klinika / terapeut
    expect(termsOf(null).Staff.nom).toBe('Terapeut');
    expect(termsOf({ settings: {} }).business.nom).toBe('klinika');
    expect(cap('úprava')).toBe('Úprava');
    expect(cap('')).toBe('');
  });

  it('termsOf funguje s konceptem uvnitř příkazu a zmrazený stav se cachuje', () => {
    const s = produce(createBaseState('2026-01-01'), (d) => {
      d.settings.terms = termsFor('salon', 'kosmeticka');
    });
    expect(termsOf(s)).toBe(termsOf(s));
    expect(makeTerms(s.settings.terms).Staff.nom).toBe('Kosmetička');
    let inside = '';
    produce(s, (d) => {
      inside = termsOf(d).business.gen;
    });
    expect(inside).toBe('salonu');
  });

  it('shoda přídavných jmen, příčestí a zájmen podle rodu a čísla', () => {
    const terapeut = makeTerms(termsFor('klinika', 'terapeut'));
    const kosmeticka = makeTerms(termsFor('salon', 'kosmeticka'));
    const studio = makeTerms(termsFor('studio', 'trener'));

    expect(`${terapeut.staff.adj('Vybraný')} ${terapeut.staff.nom}`).toBe('Vybraný terapeut');
    expect(`${kosmeticka.staff.adj('Vybraný')} ${kosmeticka.staff.nom}`).toBe('Vybraná kosmetička');
    expect(`${studio.Business.nom} je ${studio.business.adj('zavřený')}`).toBe('Studio je zavřené');
    expect(`${kosmeticka.Business.nom} je ${kosmeticka.business.adj('zavřený')}`).toBe('Salon je zavřený');
    expect(terapeut.staff.adj('aktivní')).toBe('aktivní');
    expect(kosmeticka.staff.adj('který')).toBe('která');
    expect(terapeut.staffPl.adj('který')).toBe('kteří');
    expect(terapeut.staffPl.adj('nový')).toBe('noví');
    expect(terapeut.staffPl.adj('velký')).toBe('velcí');
    expect(terapeut.staffPl.adj('český')).toBe('čeští');
    expect(kosmeticka.staffPl.adj('nový')).toBe('nové');
    expect(kosmeticka.businessPl.adj('nový')).toBe('nové');
    expect(studio.businessPl.adj('nový')).toBe('nová');

    expect(`${terapeut.Business.nom} platbu ${terapeut.business.past('potvrdil')}`).toBe('Klinika platbu potvrdila');
    expect(`${kosmeticka.Business.nom} platbu ${kosmeticka.business.past('potvrdil')}`).toBe('Salon platbu potvrdil');
    expect(`${studio.Business.nom} platbu ${studio.business.past('potvrdil')}`).toBe('Studio platbu potvrdilo');
    expect(terapeut.staff.past('byl')).toBe('byl');
    expect(kosmeticka.staff.past('byl')).toBe('byla');
    expect(terapeut.staffPl.past('byl')).toBe('byli');
    expect(kosmeticka.staffPl.past('byl')).toBe('byly');
    expect(kosmeticka.businessPl.past('byl')).toBe('byly');
    expect(studio.businessPl.past('byl')).toBe('byla');
    expect(studio.business.past('zavřen')).toBe('zavřeno');

    expect(terapeut.staff.agree('ho', 'ji', 'ho')).toBe('ho');
    expect(kosmeticka.staff.agree('ho', 'ji', 'ho')).toBe('ji');
    expect(studio.business.agree('ten', 'ta', 'to')).toBe('to');
    expect(kosmeticka.business.agree('ten', 'ta', 'to')).toBe('ten');
    expect(kosmeticka.business.agree('jeho', 'její', 'jeho', 'jeho (salonu)')).toBe('jeho (salonu)');
  });

  it('předložky s vokalizací', () => {
    expect(prep('s', 'klinikou')).toBe('s klinikou');
    expect(prep('s', 'studiem')).toBe('se studiem');
    expect(prep('s', 'salonem')).toBe('se salonem');
    expect(prep('s', 'specialistou')).toBe('se specialistou');
    expect(prep('s', 'centrem')).toBe('s centrem');
    expect(prep('z', 'kliniky')).toBe('z kliniky');
    expect(prep('z', 'studia')).toBe('ze studia');
    expect(prep('z', 'salonu')).toBe('ze salonu');
    expect(prep('z', 'specialistů')).toBe('ze specialistů');
    expect(prep('z', 'trenérů')).toBe('z trenérů');
    expect(prep('v', 'studiu')).toBe('ve studiu');
    expect(prep('v', 'salonu')).toBe('v salonu');
    expect(prep('v', 'centru')).toBe('v centru');
    expect(prep('v', 'praxi')).toBe('v praxi');
    expect(prep('v', 'fitness')).toBe('ve fitness');
    expect(prep('k', 'klinice')).toBe('ke klinice');
    expect(prep('k', 'specialistovi')).toBe('ke specialistovi');
    expect(prep('k', 'trenérovi')).toBe('k trenérovi');
    expect(prep('k', 'Studiu')).toBe('ke Studiu');
  });

  it('tvary pro počet', () => {
    const t = makeTerms(termsFor('studio', 'kosmeticka'));
    expect(countForms(STAFF_NOUNS.terapeut)).toEqual(['terapeut', 'terapeuti', 'terapeutů']);
    expect([1, 3, 5].map((n) => countLabel(n, t.counts.staff).replace(NBSP, ' '))).toEqual(['1 kosmetička', '3 kosmetičky', '5 kosmetiček']);
    expect(countLabel(2, t.counts.business)).toBe(`2${NBSP}studia`);
  });
});

describe('texty enginu podle názvosloví', () => {
  const NOW = '2026-10-14T10:00';
  const staff: Ctx = { now: NOW, actor: { role: 'reception', name: 'Recepce' } };

  function run<I, R>(s: ClinicState, cmd: (d: ClinicState, i: I, c: Ctx) => { ok: boolean; value?: R; error?: string }, input: I): { s: ClinicState; value: R } {
    let value: R | undefined;
    let error: string | undefined;
    const next = produce(s, (d) => {
      const r = cmd(d as ClinicState, input, staff);
      if (r.ok) value = r.value as R;
      else error = r.error;
    });
    if (error) throw new Error(error);
    return { s: next, value: value as R };
  }

  /** Stav s klientem a rezervací u Mgr. Malé ve středu 21. 10. 2026 v 9:00. */
  function setup(terms?: ReturnType<typeof termsFor>): { s: ClinicState; clientId: string; bookingId: string } {
    let s = createBaseState('2026-01-01');
    if (terms) s = produce(s, (d) => void (d.settings.terms = terms));
    const c = run(s, createClient, { firstName: 'Eva', lastName: 'Testová', email: 'eva@example.com', phone: '+420 600 000 001', consents: { gdpr: true, health: true, marketingEmail: true, sms: true } });
    const clientId = c.value as unknown as string;
    const b = run(c.s, createBooking, { clientId, serviceId: 's_fyzio45', therapistId: 't_mala', start: '2026-10-21T09:00', payment: { method: 'onsite' } });
    return { s: b.s, clientId, bookingId: b.value as unknown as string };
  }

  const slot = (s: ClinicState, clientId: string, therapistId: string, start: string) =>
    checkBookingSlot(s, { serviceId: 's_fyzio45', therapistId, start, clientId, now: NOW, mode: 'staff' });

  it('výchozí názvosloví zachová dnešní texty', () => {
    const { s, clientId, bookingId } = setup();
    expect(slot(s, clientId, 't_neni', '2026-10-21T10:00').errors).toEqual(['Terapeut neexistuje.']);
    expect(slot(s, clientId, 't_mala', '2026-10-21T09:00').errors).toContain('Terapeut má v tomto čase jinou rezervaci.');
    expect(slot(s, clientId, 't_mala', '2026-10-21T20:00').warnings).toContain('Termín je mimo pracovní dobu terapeuta.');
    const booking = s.bookings.find((b) => b.id === bookingId)!;
    expect(evaluateCancellation(s, booking, NOW, 'staff').options.find((o) => o.kind === 'clinic')?.title).toBe('Zrušeno ze strany kliniky');
    const r = run(s, cancelBooking, { bookingId, option: 'clinic', reason: '' });
    expect(r.value).toEqual({ message: 'Termín zrušen klinikou.' });
  });

  it('studio a trenér: chyby, volby zrušení i zprávy mluví jazykem oboru', () => {
    const { s, clientId, bookingId } = setup(termsFor('studio', 'trener'));
    expect(slot(s, clientId, 't_neni', '2026-10-21T10:00').errors).toEqual(['Trenér neexistuje.']);
    expect(slot(s, clientId, 't_mala', '2026-10-21T09:00').errors).toContain('Trenér má v tomto čase jinou rezervaci.');
    expect(slot(s, clientId, 't_mala', '2026-10-21T20:00').warnings).toContain('Termín je mimo pracovní dobu trenéra.');
    const booking = s.bookings.find((b) => b.id === bookingId)!;
    expect(evaluateCancellation(s, booking, NOW, 'staff').options.find((o) => o.kind === 'clinic')?.title).toBe('Zrušeno ze strany studia');
    const r = run(s, cancelBooking, { bookingId, option: 'clinic', reason: '' });
    expect(r.value).toEqual({ message: 'Termín zrušen studiem.' });
    // omluvná zpráva klientovi dostane větu o zrušení podle názvosloví
    const sent = r.s.messages.filter((m) => m.bookingId === bookingId && m.kind === 'clinic_cancel');
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.every((m) => !m.body.includes('klinikou'))).toBe(true);
  });

  it('výchozí název šablony „Zrušení ze strany kliniky“ se zobrazí podle názvosloví, upravený zůstane', () => {
    const tpl = DEFAULT_TEMPLATES.find((t) => t.key === 'clinic_cancel')!;
    const studio = makeTerms(termsFor('studio', 'trener'));
    expect(templateName(tpl, makeTerms(DEFAULT_TERMS))).toBe('Zrušení ze strany kliniky');
    expect(templateName(tpl, studio)).toBe('Zrušení ze strany studia');
    expect(templateDescription(tpl, studio)).toBe('Když termín ruší studio.');
    expect(templateName({ ...tpl, name: 'Rušíme termín' }, studio)).toBe('Rušíme termín');
    const reminder = DEFAULT_TEMPLATES.find((t) => t.key === 'reminder')!;
    expect(templateName(reminder, studio)).toBe(reminder.name);
    expect(templateName(undefined, studio)).toBeUndefined();
  });

  it('salon a kosmetička: shoda rodu v textech enginu', () => {
    const { s, clientId } = setup(termsFor('salon', 'kosmeticka'));
    expect(slot(s, clientId, 't_mala', '2026-10-21T09:00').errors).toContain('Kosmetička má v tomto čase jinou rezervaci.');
    expect(slot(s, clientId, 't_mala', '2026-10-21T20:00').warnings).toContain('Termín je mimo pracovní dobu kosmetičky.');
    const campaign: Campaign = {
      id: 'cmp_test',
      name: 'Test',
      subject: 'Novinky',
      preheader: '',
      blocks: [{ type: 'text', text: 'Dobrý den, [jméno]' }],
      segment: { match: 'all', rules: [], exclude: [] },
      status: 'draft',
      scheduledAt: null,
      sentAt: null,
      recipients: 0,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const text = campaignPlainText(campaign, { jméno: 'Eva', klinika: 'Krása' }, termsOf(s));
    expect(text).toContain('Toto je obchodní sdělení salonu Krása.');
    expect(campaignPlainText(campaign, { jméno: 'Eva', klinika: 'Krása' })).toContain('Toto je obchodní sdělení kliniky Krása.');
  });
});
