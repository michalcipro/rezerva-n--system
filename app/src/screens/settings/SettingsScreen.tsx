import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { BookingRules, CancellationPolicy, ClinicState, LocalDateTime, ReminderSettings, WaitlistSettings } from '../../domain/types';
import { availableSlots } from '../../engine/availability';
import { updateSettings } from '../../engine/commands';
import { countLabel, formatDayShort, formatDuration, formatNumber, formatTime } from '../../engine/format';
import { therapistName } from '../../engine/selectors';
import { addDays, dateOf } from '../../engine/time';
import { useClinic, useCommand, useNow } from '../../store/hooks';
import { navigate } from '../../store/session';
import {
  Badge,
  Button,
  Callout,
  Card,
  ChoiceChips,
  Icon,
  IconButton,
  Input,
  NumberInput,
  PageHeader,
  RadioCards,
  Select,
  Switch,
  toast,
  type IconName,
} from '../../ui';
import {
  byOrder,
  cx,
  dirtySections,
  firstStageFee,
  lockedTierIndex,
  normalizeDraft,
  settingsDraftOf,
  tierWarning,
  validateSettings,
  type SectionId,
  type SettingsDraft,
  type SettingsErrors,
} from './helpers';
import { PolicyClientText, PolicyPreview } from './PolicyPreview';
import { SettingRow, useSyncedDraft } from './shared';
import './set-settings.css';

type SettingsPatch = Parameters<typeof updateSettings>[1];

const SECTIONS: { id: SectionId; label: string; icon: IconName }[] = [
  { id: 'booking', label: 'Rezervace online', icon: 'calendarPlus' },
  { id: 'policy', label: 'Storno podmínky', icon: 'shield' },
  { id: 'excuses', label: 'Omluvenky a náhrady', icon: 'refresh' },
  { id: 'waitlist', label: 'Čekací listina', icon: 'hourglass' },
  { id: 'reminders', label: 'Připomínky', icon: 'bell' },
  { id: 'clinic', label: 'Klinika', icon: 'building' },
];

const SECTION_OF_ERROR = (key: string): SectionId => {
  if (key.startsWith('booking.')) return 'booking';
  if (key.startsWith('excuses.')) return 'excuses';
  if (key.startsWith('clinic.')) return 'clinic';
  return 'policy';
};

const sectionLabel = (id: SectionId): string => SECTIONS.find((s) => s.id === id)?.label ?? id;

const NOTICE_OPTIONS = [0, 30, 60, 120, 180, 240, 360, 720, 1440, 2880];
const OFFER_OPTIONS = [15, 30, 60, 120, 180, 240, 360, 720, 1440];
const REMINDER_OPTIONS = [2, 3, 4, 6, 12, 24, 48, 72];
const HORIZON_PRESETS = [14, 30, 60, 90, 180];

const withCurrent = (list: number[], current: number): number[] => (list.includes(current) ? list : [...list, current].sort((a, b) => a - b));

export function SettingsScreen(): JSX.Element {
  const clinic = useClinic();
  const run = useCommand();
  const base = useMemo(() => settingsDraftOf(clinic.settings), [clinic.settings]);
  const { draft, setDraft, reset, dirty } = useSyncedDraft<SettingsDraft>(base);
  const [active, setActive] = useState<SectionId>('booking');
  const [showErrors, setShowErrors] = useState(false);

  const errors = validateSettings(draft);
  const errorKeys = Object.keys(errors);
  const changed = dirtySections(draft, base);
  // údaje kliniky kontrolujeme až při pokusu o uložení, ostatní pravidla hned
  const visibleErrors: SettingsErrors = showErrors ? errors : Object.fromEntries(Object.entries(errors).filter(([k]) => !k.startsWith('clinic.')));

  /* ---- sledování aktivní sekce (scroll spy) ---- */
  const visibleRef = useRef(new Set<string>());
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visibleRef.current.add(e.target.id);
          else visibleRef.current.delete(e.target.id);
        }
        const first = SECTIONS.find((s) => visibleRef.current.has(`set-sec-${s.id}`));
        if (first) setActive(first.id);
      },
      { rootMargin: '-96px 0px -55% 0px', threshold: 0 },
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(`set-sec-${s.id}`);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  const goTo = (id: SectionId): void => {
    const el = document.getElementById(`set-sec-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
    setActive(id);
  };

  /* ---- úpravy konceptu ---- */
  const setRules = (patch: Partial<BookingRules>): void => setDraft((d) => ({ ...d, bookingRules: { ...d.bookingRules, ...patch } }));
  const setPolicy = (patch: Partial<CancellationPolicy>): void => setDraft((d) => ({ ...d, policy: { ...d.policy, ...patch } }));
  const setExcuses = (patch: Partial<CancellationPolicy['excuses']>): void =>
    setDraft((d) => ({ ...d, policy: { ...d.policy, excuses: { ...d.policy.excuses, ...patch } } }));
  const setWaitlist = (patch: Partial<WaitlistSettings>): void => setDraft((d) => ({ ...d, waitlist: { ...d.waitlist, ...patch } }));
  const setReminders = (patch: Partial<ReminderSettings>): void => setDraft((d) => ({ ...d, reminders: { ...d.reminders, ...patch } }));
  const setText = (key: 'clinicName' | 'clinicTagline' | 'senderName' | 'senderEmail', value: string): void =>
    setDraft((d) => ({ ...d, [key]: value }));

  const save = (): void => {
    if (errorKeys.length) {
      setShowErrors(true);
      const section = SECTION_OF_ERROR(errorKeys[0]);
      toast.error('Nastavení nelze uložit', { description: `Opravte zvýrazněná pole (${sectionLabel(section)}).` });
      goTo(section);
      return;
    }
    const n = normalizeDraft(draft);
    const patch: SettingsPatch = {};
    if (changed.includes('booking')) patch.bookingRules = n.bookingRules;
    if (changed.includes('policy') || changed.includes('excuses')) patch.policy = n.policy;
    if (changed.includes('waitlist')) patch.waitlist = n.waitlist;
    if (changed.includes('reminders')) patch.reminders = n.reminders;
    if (changed.includes('clinic')) {
      patch.clinicName = n.clinicName;
      patch.clinicTagline = n.clinicTagline;
      patch.senderName = n.senderName;
      patch.senderEmail = n.senderEmail;
    }
    const r = run(updateSettings, patch, { quiet: true });
    if (r.ok) {
      setDraft(n);
      setShowErrors(false);
      toast.success('Nastavení uloženo', { description: `Upraveno: ${changed.map(sectionLabel).join(', ')}.` });
    }
  };

  return (
    <div className="page set-page set-settings-page">
      <PageHeader title="Nastavení" subtitle="Pravidla online rezervací, storno podmínky, omluvenky a údaje kliniky" />

      <div className="set-settings">
        <nav className="set-anchors" aria-label="Sekce nastavení">
          <ul className="set-anchors__list">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#set-sec-${s.id}`}
                  className={cx('set-anchors__link', active === s.id && 'is-active')}
                  aria-current={active === s.id ? 'location' : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    goTo(s.id);
                  }}
                >
                  <Icon name={s.icon} size={16} />
                  <span className="set-anchors__label">{s.label}</span>
                  {changed.includes(s.id) && (
                    <span className="set-anchors__dot" title="Neuložené změny">
                      <span className="visually-hidden">(neuloženo)</span>
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="set-settings__body">
          <Section id="booking" title="Rezervace online" subtitle="Kdy a jak daleko dopředu si klienti mohou sami rezervovat.">
            <BookingSection rules={draft.bookingRules} onChange={setRules} errors={visibleErrors} />
          </Section>

          <section id="set-sec-policy" className="set-section" aria-labelledby="set-sec-policy-h">
            <div className="set-policy-grid">
              <Card className="set-section-card set-policy-grid__form">
                <SectionHeading id="policy" title="Storno podmínky" subtitle="Kdy lze zrušit zdarma a kolik stojí pozdní zrušení nebo nedostavení." />
                <PolicySection policy={draft.policy} onChange={setPolicy} errors={visibleErrors} />
              </Card>
              <aside className="set-policy-grid__preview" aria-label="Živý náhled storno podmínek">
                <PolicyPreview policy={draft.policy} />
              </aside>
              <div className="set-policy-grid__text">
                <PolicyClientText policy={draft.policy} />
              </div>
            </div>
          </section>

          <Section id="excuses" title="Omluvenky a náhrady" subtitle="Omluvenka ruší poplatek za pozdní zrušení; u předplaceného termínu vznikne náhrada.">
            <ExcusesSection excuses={draft.policy.excuses} onChange={setExcuses} errors={visibleErrors} />
          </Section>

          <Section id="waitlist" title="Čekací listina" subtitle="Uvolněný termín automaticky nabídneme klientům, kteří na něj čekají.">
            <WaitlistSection waitlist={draft.waitlist} onChange={setWaitlist} clinic={clinic} />
          </Section>

          <Section id="reminders" title="Připomínky" subtitle="Automatická zpráva klientovi před termínem snižuje počet nedostavení.">
            <RemindersSection reminders={draft.reminders} onChange={setReminders} clinic={clinic} />
          </Section>

          <Section id="clinic" title="Klinika" subtitle="Název a odesílatel e-mailů, které klienti dostávají.">
            <ClinicSection draft={draft} onChange={setText} errors={visibleErrors} />
          </Section>
        </div>
      </div>

      <div className={cx('set-savebar', dirty && 'is-dirty')} role="region" aria-label="Uložení nastavení">
        <span className="set-savebar__status" aria-live="polite">
          {dirty ? (
            <>
              <span className="set-savebar__dot" aria-hidden="true" />
              <span>
                Neuložené změny: <strong>{changed.map(sectionLabel).join(', ')}</strong>
              </span>
            </>
          ) : (
            <>
              <Icon name="checkCircle" size={16} className="text-success" />
              <span>Všechny změny jsou uložené</span>
            </>
          )}
        </span>
        <span className="spacer" />
        {dirty && (
          <Button variant="ghost" onClick={reset}>
            Zahodit změny
          </Button>
        )}
        <Button variant="primary" icon="check" onClick={save} disabled={!dirty}>
          Uložit změny
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Rámec sekce                                                         */
/* ------------------------------------------------------------------ */

function SectionHeading({ id, title, subtitle }: { id: SectionId; title: string; subtitle: string }): JSX.Element {
  return (
    <div className="set-section-heading">
      <h2 id={`set-sec-${id}-h`} className="set-section-heading__title" tabIndex={-1}>
        {title}
      </h2>
      <p className="set-section-heading__subtitle">{subtitle}</p>
    </div>
  );
}

function Section({ id, title, subtitle, children }: { id: SectionId; title: string; subtitle: string; children: ReactNode }): JSX.Element {
  return (
    <section id={`set-sec-${id}`} className="set-section" aria-labelledby={`set-sec-${id}-h`}>
      <Card className="set-section-card">
        <SectionHeading id={id} title={title} subtitle={subtitle} />
        {children}
      </Card>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Rezervace online                                                    */
/* ------------------------------------------------------------------ */

interface CompactExample {
  date: string;
  service: string;
  therapist: string;
  all: string[];
  compact: string[];
}

function compactExample(clinic: ClinicState, rules: BookingRules, now: LocalDateTime): CompactExample | null {
  const svc = clinic.services
    .filter((s) => s.active && s.kind === 'individual' && s.onlineBookable && !s.newClientsOnly && s.durationMin >= 30)
    .sort(byOrder)
    .find((s) => s.therapistIds.some((id) => clinic.therapists.find((t) => t.id === id && t.active)));
  if (!svc) return null;
  const therapist = clinic.therapists.filter((t) => t.active && svc.therapistIds.includes(t.id)).sort(byOrder)[0];
  if (!therapist) return null;
  const variant = (compactSlots: boolean): ClinicState => ({
    ...clinic,
    settings: { ...clinic.settings, bookingRules: { ...rules, compactSlots } },
  });
  const sAll = variant(false);
  const sCompact = variant(true);
  for (let i = 1; i <= 14; i++) {
    const date = addDays(dateOf(now), i);
    const q = { serviceId: svc.id, therapistId: therapist.id, date, now, mode: 'client' as const };
    const all = availableSlots(sAll, q);
    if (all.length < 6) continue;
    const compact = availableSlots(sCompact, q);
    return {
      date,
      service: svc.name,
      therapist: therapistName(therapist),
      all: all.map((x) => formatTime(x.start)),
      compact: compact.map((x) => formatTime(x.start)),
    };
  }
  return null;
}

function SlotChips({ times, max = 14 }: { times: string[]; max?: number }): JSX.Element {
  const shown = times.slice(0, max);
  return (
    <span className="set-slots">
      {shown.map((t) => (
        <span key={t} className="set-slot tnum">
          {t}
        </span>
      ))}
      {times.length > max && <span className="set-slot set-slot--more">+{times.length - max}</span>}
    </span>
  );
}

function BookingSection({
  rules,
  onChange,
  errors,
}: {
  rules: BookingRules;
  onChange: (patch: Partial<BookingRules>) => void;
  errors: SettingsErrors;
}): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const example = useMemo(() => compactExample(clinic, rules, now), [clinic, rules, now]);

  return (
    <div className="set-rows">
      <SettingRow label="Minimální předstih" hint="Jak nejpozději před začátkem si klient může termín rezervovat online. Recepce může kdykoli.">
        <Select
          className="set-ctl-md"
          value={String(rules.minNoticeMin)}
          onValueChange={(v) => onChange({ minNoticeMin: Number(v) })}
          options={withCurrent(NOTICE_OPTIONS, rules.minNoticeMin).map((m) => ({ value: String(m), label: m === 0 ? 'Bez omezení' : `${formatDuration(m)} předem` }))}
        />
      </SettingRow>
      <SettingRow
        label="Horizont rezervací"
        hint="Jak daleko dopředu online rezervace nabízí termíny."
        error={errors['booking.horizonDays']}
        group
      >
        <div className="set-inline">
          <NumberInput
            className="set-ctl-sm"
            value={rules.horizonDays}
            min={1}
            max={365}
            suffix="dní"
            aria-label="Horizont rezervací ve dnech"
            onChange={(v) => onChange({ horizonDays: v })}
          />
          <ChoiceChips
            aria-label="Rychlá volba horizontu"
            value={HORIZON_PRESETS.includes(rules.horizonDays) ? String(rules.horizonDays) : null}
            onChange={(v) => onChange({ horizonDays: Number(v) })}
            options={HORIZON_PRESETS.map((d) => ({ value: String(d), label: `${d} dní`, ariaLabel: `${d} dní dopředu` }))}
          />
        </div>
      </SettingRow>
      <SettingRow label="Krok nabídky časů" hint="Termíny začínají vždy v celou, ve čtvrt, v půl nebo ve tři čtvrtě." group>
        <span className="set-fixed">
          <Icon name="lock" size={14} /> 15 minut <span className="muted">· pevně</span>
        </span>
      </SettingRow>
      <SettingRow
        label="Maximum nadcházejících rezervací"
        hint="Kolik budoucích termínů může mít jeden klient najednou rezervovaných online."
        error={errors['booking.maxUpcomingPerClient']}
      >
        <NumberInput
          className="set-ctl-sm"
          value={rules.maxUpcomingPerClient}
          min={1}
          max={50}
          suffix={rules.maxUpcomingPerClient === 1 ? 'termín' : rules.maxUpcomingPerClient < 5 ? 'termíny' : 'termínů'}
          onChange={(v) => onChange({ maxUpcomingPerClient: v })}
        />
      </SettingRow>

      <div className="set-row set-row--switch">
        <Switch
          checked={rules.compactSlots}
          onChange={(v) => onChange({ compactSlots: v })}
          label="Kompaktní nabídka termínů"
          description="Klientům nabídneme jen časy, které navazují na jiné rezervace nebo na začátek či konec směny. V rozvrhu tak nevznikají krátké mezery, které by nikdo neobsadil."
        />
      </div>
      {example && (
        <div className="set-example" aria-live="polite">
          <p className="set-example__title">
            Ukázka: {example.therapist} · {example.service} · {formatDayShort(example.date)}
          </p>
          <div className={cx('set-example__row', !rules.compactSlots && 'is-current')}>
            <span className="set-example__label">
              Všechny volné časy <span className="tnum">({example.all.length})</span>
              {!rules.compactSlots && <Badge size="sm" tone="accent">teď</Badge>}
            </span>
            <SlotChips times={example.all} />
          </div>
          <div className={cx('set-example__row', rules.compactSlots && 'is-current')}>
            <span className="set-example__label">
              Kompaktní nabídka <span className="tnum">({example.compact.length})</span>
              {rules.compactSlots && <Badge size="sm" tone="accent">teď</Badge>}
            </span>
            <SlotChips times={example.compact} />
          </div>
        </div>
      )}
      <div className="set-row set-row--switch">
        <Switch
          checked={rules.allowAnyTherapist}
          onChange={(v) => onChange({ allowAnyTherapist: v })}
          label="Volba „Kdokoli z terapeutů“"
          description="Klient nemusí vybírat konkrétního terapeuta – přidělíme toho, kdo je ten den méně vytížený."
        />
      </div>
      <div className="set-row set-row--switch">
        <Switch
          checked={rules.autoCompletePast}
          onChange={(v) => onChange({ autoCompletePast: v })}
          label="Automatická docházka"
          description="Potvrzené termíny se po skončení samy označí jako proběhlé (platba na místě kartou). Nedostavení zapisuje recepce ručně."
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Storno podmínky                                                     */
/* ------------------------------------------------------------------ */

function PolicySection({
  policy,
  onChange,
  errors,
}: {
  policy: CancellationPolicy;
  onChange: (patch: Partial<CancellationPolicy>) => void;
  errors: SettingsErrors;
}): JSX.Element {
  const lastBlock = useRef(policy.blockAfterNoShows || 3);
  if (policy.blockAfterNoShows > 0) lastBlock.current = policy.blockAfterNoShows;
  const tiers = policy.lateTiers;
  const free = policy.freeCancelHours;
  const locked = lockedTierIndex(policy);
  const firstFee = firstStageFee(policy);
  const extras = tiers.map((t, i) => ({ t, i })).filter(({ i }) => i !== locked);
  const warning = free > 0 ? tierWarning(locked >= 0 ? tiers : [{ hoursBefore: free, feePct: firstFee }, ...tiers]) : null;

  /* První stupeň vždy začíná koncem bezplatné lhůty – při změně lhůty se posune s ní. */
  const setFree = (v: number): void => {
    if (locked < 0) {
      onChange({ freeCancelHours: v });
      return;
    }
    onChange({
      freeCancelHours: v,
      lateTiers: [{ hoursBefore: v, feePct: tiers[locked].feePct }, ...tiers.filter((_, i) => i !== locked)],
    });
  };
  const setFirstFee = (fee: number): void =>
    onChange({
      lateTiers: locked >= 0 ? tiers.map((t, i) => (i === locked ? { ...t, feePct: fee } : t)) : [{ hoursBefore: free, feePct: fee }, ...tiers],
    });
  const setTier = (i: number, patch: Partial<{ hoursBefore: number; feePct: number }>): void =>
    onChange({ lateTiers: tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const addTier = (): void => {
    const lowest = Math.min(free, ...extras.map(({ t }) => t.hoursBefore));
    const maxFee = Math.max(firstFee, ...extras.map(({ t }) => t.feePct));
    const base = locked >= 0 ? tiers : [{ hoursBefore: free, feePct: firstFee }, ...tiers];
    onChange({ lateTiers: [...base, { hoursBefore: Math.max(1, Math.floor(lowest / 2)), feePct: Math.min(100, maxFee + 25) }] });
  };

  return (
    <div className="set-rows">
      <SettingRow
        label="Zrušení zdarma"
        hint="Do kolika hodin před začátkem může klient zrušit nebo přesunout termín bez poplatku."
        error={errors['policy.freeCancelHours']}
      >
        <NumberInput className="set-ctl-sm" value={free} min={0} max={168} suffix="h předem" onChange={setFree} />
      </SettingRow>

      <SettingRow
        label="Stupně storno poplatku"
        hint={
          free > 0
            ? 'Platí po skončení bezplatné lhůty. Čím blíž začátku, tím vyšší poplatek – další stupně přidáte tlačítkem.'
            : 'S nulovou bezplatnou lhůtou se pozdní zrušení nepočítá – platí jen poplatek za nedostavení.'
        }
        group
        wide
      >
        {free > 0 && (
          <ol className="set-tiers">
            <li className={cx('set-tier set-tier--first', errors[`tier.${locked}.pct`] && 'has-error')}>
              <span className="set-tier__text">
                Po skončení lhůty <span className="set-tier__text--muted">(méně než {formatNumber(free)} h předem)</span>
              </span>
              <Icon name="arrowRight" size={14} className="set-tier__arrow" />
              <NumberInput
                size="sm"
                className="set-tier__pct"
                value={firstFee}
                min={0}
                max={100}
                step={5}
                suffix="%"
                aria-label={`Poplatek po skončení bezplatné lhůty (méně než ${free} h předem) v procentech ceny`}
                onChange={setFirstFee}
              />
              <span className="set-tier__text set-tier__text--muted">ceny</span>
            </li>
            {extras.map(({ t, i }, n) => {
              const hoursError = errors[`tier.${i}.hours`];
              const pctError = errors[`tier.${i}.pct`];
              return (
                <li key={i} className={cx('set-tier', (hoursError || pctError) && 'has-error')}>
                  <span className="set-tier__text">Méně než</span>
                  <NumberInput
                    size="sm"
                    className="set-tier__hours"
                    value={t.hoursBefore}
                    min={0}
                    max={168}
                    suffix="h"
                    aria-label={`Stupeň ${n + 2}: méně než kolik hodin před začátkem`}
                    invalid={!!hoursError}
                    onChange={(v) => setTier(i, { hoursBefore: v })}
                  />
                  <span className="set-tier__text">předem</span>
                  <Icon name="arrowRight" size={14} className="set-tier__arrow" />
                  <NumberInput
                    size="sm"
                    className="set-tier__pct"
                    value={t.feePct}
                    min={0}
                    max={100}
                    step={5}
                    suffix="%"
                    aria-label={`Stupeň ${n + 2}: poplatek v procentech ceny`}
                    invalid={!!pctError}
                    onChange={(v) => setTier(i, { feePct: v })}
                  />
                  <span className="set-tier__text set-tier__text--muted">ceny</span>
                  <IconButton
                    icon="trash"
                    size="sm"
                    label={`Odebrat stupeň ${n + 2} (méně než ${t.hoursBefore} h)`}
                    onClick={() => onChange({ lateTiers: tiers.filter((_, j) => j !== i) })}
                  />
                  {(hoursError || pctError) && (
                    <span className="field__error set-tier__error" role="alert">
                      <Icon name="alertCircle" size={14} />
                      <span>{hoursError ?? pctError}</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        {warning && (
          <p className="set-warn-text">
            <Icon name="alert" size={14} /> {warning}
          </p>
        )}
        {free > 0 && (
          <div>
            <Button size="sm" variant="ghost" icon="plus" onClick={addTier} disabled={extras.length >= 4 || free <= 1}>
              Přidat stupeň
            </Button>
          </div>
        )}
      </SettingRow>

      <SettingRow label="Nedostavení" hint="Klient nepřišel a termín předem nezrušil." error={errors['policy.noShowFeePct']}>
        <NumberInput className="set-ctl-sm" value={policy.noShowFeePct} min={0} max={100} step={5} suffix="% ceny" onChange={(v) => onChange({ noShowFeePct: v })} />
      </SettingRow>

      <SettingRow label="Permanentka při pozdním zrušení" hint="Termíny placené permanentkou nemají cenu v penězích – vyberte, co se stane." group wide>
        <RadioCards
          aria-label="Permanentka při pozdním zrušení"
          columns={2}
          value={policy.packageLateHandling}
          onChange={(v) => onChange({ packageLateHandling: v })}
          options={[
            {
              value: 'forfeit_entry',
              title: 'Vstup propadá',
              description: 'Pozdně zrušený termín se odečte z permanentky jako vyčerpaný. Nejjednodušší pro klienty i recepci.',
            },
            {
              value: 'charge_fee',
              title: 'Účtuje se poplatek',
              description: 'Vstup se vrátí na permanentku a klient zaplatí storno poplatek podle stupňů z hodnoty vstupu.',
            },
          ]}
        />
      </SettingRow>

      <SettingRow
        label="Skupinové lekce"
        hint="Odhlášení zdarma nejpozději tolik hodin před začátkem lekce, potom místo propadá (100 %)."
        error={errors['policy.groupCancelHours']}
      >
        <NumberInput className="set-ctl-sm" value={policy.groupCancelHours} min={0} max={168} suffix="h předem" onChange={(v) => onChange({ groupCancelHours: v })} />
      </SettingRow>

      <div className="set-row set-row--switch">
        <Switch
          checked={policy.graceFirstLateCancel}
          onChange={(v) => onChange({ graceFirstLateCancel: v })}
          label="První pozdní storno zdarma"
          description="Jednou za 12 měsíců může klient zrušit pozdě bez poplatku – vstřícné gesto pro stálé klienty."
        />
      </div>

      <div className="set-row set-row--switch">
        <Switch
          checked={policy.blockAfterNoShows > 0}
          onChange={(v) => onChange({ blockAfterNoShows: v ? lastBlock.current : 0 })}
          label="Pozastavit online rezervace po opakovaném nedostavení"
          description="Klient pak rezervuje jen přes recepci. Odblokovat ho můžete v jeho detailu."
        />
      </div>
      {policy.blockAfterNoShows > 0 && (
        <SettingRow label="Počet nedostavení" hint="Za posledních 90 dní." error={errors['policy.blockAfterNoShows']} className="set-row--nested">
          <NumberInput
            className="set-ctl-sm"
            value={policy.blockAfterNoShows}
            min={1}
            max={20}
            suffix="nedostavení"
            onChange={(v) => onChange({ blockAfterNoShows: v })}
          />
        </SettingRow>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Omluvenky a náhrady                                                 */
/* ------------------------------------------------------------------ */

function ExcusesSection({
  excuses,
  onChange,
  errors,
}: {
  excuses: CancellationPolicy['excuses'];
  onChange: (patch: Partial<CancellationPolicy['excuses']>) => void;
  errors: SettingsErrors;
}): JSX.Element {
  return (
    <div className="set-rows">
      <div className="set-row set-row--switch">
        <Switch
          checked={excuses.enabled}
          onChange={(v) => onChange({ enabled: v })}
          label="Omluvenky zapnuté"
          description="Po skončení bezplatné lhůty může klient termín omluvit bez poplatku – v omezeném počtu."
        />
      </div>
      <fieldset className={cx('set-fieldset', !excuses.enabled && 'is-disabled')} disabled={!excuses.enabled}>
        <legend className="visually-hidden">Pravidla omluvenek</legend>
        <SettingRow label="Na permanentku (výchozí)" hint="Předvyplní se u nové permanentky; každá permanentka může mít vlastní počet.">
          <NumberInput
            className="set-ctl-sm"
            value={excuses.perPackage}
            min={0}
            max={20}
            suffix={excuses.perPackage === 1 ? 'omluvenka' : excuses.perPackage > 1 && excuses.perPackage < 5 ? 'omluvenky' : 'omluvenek'}
            onChange={(v) => onChange({ perPackage: v })}
          />
        </SettingRow>
        <SettingRow label="Klienti bez permanentky" hint="Počet omluvenek za klouzavé období." error={errors['excuses.perClientMonths']} group>
          <div className="set-inline">
            <NumberInput
              className="set-ctl-xs"
              value={excuses.perClientCount}
              min={0}
              max={20}
              aria-label="Počet omluvenek pro klienty bez permanentky"
              onChange={(v) => onChange({ perClientCount: v })}
            />
            <span className="set-inline__text">{excuses.perClientCount === 1 ? 'omluvenka' : excuses.perClientCount > 1 && excuses.perClientCount < 5 ? 'omluvenky' : 'omluvenek'} za</span>
            <NumberInput
              className="set-ctl-xs"
              value={excuses.perClientMonths}
              min={1}
              max={24}
              aria-label="Období v měsících"
              onChange={(v) => onChange({ perClientMonths: v })}
            />
            <span className="set-inline__text">{excuses.perClientMonths === 1 ? 'měsíc' : excuses.perClientMonths < 5 ? 'měsíce' : 'měsíců'}</span>
          </div>
        </SettingRow>
        <SettingRow label="Omluvit nejpozději" hint="0 = až do začátku termínu." error={errors['excuses.deadlineHoursBefore']}>
          <NumberInput
            className="set-ctl-sm"
            value={excuses.deadlineHoursBefore}
            min={0}
            max={168}
            suffix="h předem"
            onChange={(v) => onChange({ deadlineHoursBefore: v })}
          />
        </SettingRow>
        <SettingRow
          label="Náhradní termín do"
          hint="U předplaceného termínu (permanentka, platba předem) si klient vybere náhradu, která musí proběhnout do této doby. Potom propadá."
          error={errors['excuses.makeupDays']}
        >
          <NumberInput className="set-ctl-sm" value={excuses.makeupDays} min={1} max={180} suffix="dní" onChange={(v) => onChange({ makeupDays: v })} />
        </SettingRow>
      </fieldset>
      {!excuses.enabled && (
        <Callout tone="neutral">Omluvenky jsou vypnuté – po bezplatné lhůtě platí jen storno poplatky (případně první pozdní storno zdarma).</Callout>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Čekací listina                                                      */
/* ------------------------------------------------------------------ */

function WaitlistSection({
  waitlist,
  onChange,
  clinic,
}: {
  waitlist: WaitlistSettings;
  onChange: (patch: Partial<WaitlistSettings>) => void;
  clinic: ClinicState;
}): JSX.Element {
  const waiting = clinic.waitlist.filter((w) => w.status === 'waiting' || w.status === 'offered').length;
  return (
    <div className="set-rows">
      <div className="set-row set-row--switch">
        <Switch
          checked={waitlist.enabled}
          onChange={(v) => onChange({ enabled: v })}
          label="Čekací listina zapnutá"
          description={
            waiting
              ? `Právě čeká ${countLabel(waiting, ['klient', 'klienti', 'klientů'])}.`
              : 'Klienti se mohou přihlásit k hlídání plného dne nebo lekce.'
          }
        />
      </div>
      <fieldset className={cx('set-fieldset', !waitlist.enabled && 'is-disabled')} disabled={!waitlist.enabled}>
        <legend className="visually-hidden">Pravidla čekací listiny</legend>
        <SettingRow label="Platnost nabídky" hint="Jak dlouho má klient na potvrzení uvolněného termínu (nejpozději 15 minut před jeho začátkem).">
          <Select
            className="set-ctl-md"
            value={String(waitlist.offerMinutes)}
            onValueChange={(v) => onChange({ offerMinutes: Number(v) })}
            options={withCurrent(OFFER_OPTIONS, waitlist.offerMinutes).map((m) => ({ value: String(m), label: formatDuration(m) }))}
          />
        </SettingRow>
        <SettingRow label="Nabídnout současně" hint="Termín dostane tolik čekajících najednou – potvrdí ho ten, kdo bude nejrychlejší.">
          <NumberInput
            className="set-ctl-sm"
            value={waitlist.offerTo}
            min={1}
            max={10}
            suffix={waitlist.offerTo === 1 ? 'klientovi' : 'klientům'}
            onChange={(v) => onChange({ offerTo: v })}
          />
        </SettingRow>
      </fieldset>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Připomínky                                                          */
/* ------------------------------------------------------------------ */

function RemindersSection({
  reminders,
  onChange,
  clinic,
}: {
  reminders: ReminderSettings;
  onChange: (patch: Partial<ReminderSettings>) => void;
  clinic: ClinicState;
}): JSX.Element {
  const tpl = clinic.templates.find((t) => t.key === 'reminder');
  const channels = tpl ? tpl.channels.map((c) => (c === 'email' ? 'e-mail' : 'SMS')).join(' + ') : '';
  return (
    <div className="set-rows">
      <div className="set-row set-row--switch">
        <Switch
          checked={reminders.enabled}
          onChange={(v) => onChange({ enabled: v })}
          label="Posílat připomínky"
          description={tpl ? `Šablona „${tpl.name}" · ${channels}${tpl.enabled ? '' : ' · šablona je v komunikaci vypnutá'}` : 'Zpráva klientovi před termínem.'}
        />
      </div>
      <fieldset className={cx('set-fieldset', !reminders.enabled && 'is-disabled')} disabled={!reminders.enabled}>
        <legend className="visually-hidden">Načasování připomínek</legend>
        <SettingRow label="Kdy poslat" hint="Kolik hodin před začátkem termínu.">
          <Select
            className="set-ctl-md"
            value={String(reminders.hoursBefore)}
            onValueChange={(v) => onChange({ hoursBefore: Number(v) })}
            options={withCurrent(REMINDER_OPTIONS, reminders.hoursBefore).map((h) => ({ value: String(h), label: `${h} h předem` }))}
          />
        </SettingRow>
      </fieldset>
      <div className="set-row">
        <div className="set-row__text">
          <span className="set-row__label">Text připomínky</span>
          <span className="set-row__hint">Předmět, text e-mailu a SMS upravíte v Komunikaci → Automatické zprávy.</span>
        </div>
        <div className="set-row__control">
          <Button variant="secondary" size="sm" iconRight="arrowRight" onClick={() => navigate({ name: 'komunikace' })}>
            Upravit text
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Klinika                                                             */
/* ------------------------------------------------------------------ */

function ClinicSection({
  draft,
  onChange,
  errors,
}: {
  draft: SettingsDraft;
  onChange: (key: 'clinicName' | 'clinicTagline' | 'senderName' | 'senderEmail', value: string) => void;
  errors: SettingsErrors;
}): JSX.Element {
  return (
    <div className="set-rows">
      <SettingRow label="Název kliniky" hint="Zobrazuje se v aplikaci, klientském portálu a v e-mailech." error={errors['clinic.clinicName']}>
        <Input className="set-ctl-lg" value={draft.clinicName} maxLength={40} onValueChange={(v) => onChange('clinicName', v)} />
      </SettingRow>
      <SettingRow label="Podtitul" hint="Krátce, čemu se věnujete.">
        <Input className="set-ctl-lg" value={draft.clinicTagline} maxLength={80} onValueChange={(v) => onChange('clinicTagline', v)} />
      </SettingRow>
      <SettingRow label="Odesílatel e-mailů" hint="Jméno, které klient uvidí ve schránce." error={errors['clinic.senderName']}>
        <Input className="set-ctl-lg" value={draft.senderName} maxLength={60} onValueChange={(v) => onChange('senderName', v)} />
      </SettingRow>
      <SettingRow label="E-mail odesílatele" hint="Na tuto adresu mohou klienti odpovídat." error={errors['clinic.senderEmail']}>
        <Input className="set-ctl-lg" type="email" value={draft.senderEmail} maxLength={80} onValueChange={(v) => onChange('senderEmail', v)} />
      </SettingRow>
      <div className="set-mailpreview" aria-label="Náhled hlavičky e-mailu">
        <span className="set-mailpreview__label">Náhled v e-mailové schránce</span>
        <div className="set-mailpreview__box">
          <span className="set-mailpreview__avatar" aria-hidden="true">
            {(draft.senderName.trim() || draft.clinicName.trim() || '?').charAt(0).toUpperCase()}
          </span>
          <span className="set-mailpreview__text">
            <span className="set-mailpreview__from">
              <strong>{draft.senderName.trim() || 'Odesílatel'}</strong> <span className="muted">&lt;{draft.senderEmail.trim() || 'e-mail'}&gt;</span>
            </span>
            <span className="set-mailpreview__subject">Připomínka: zítra v 9:00 · {draft.clinicName.trim() || 'Klinika'}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
