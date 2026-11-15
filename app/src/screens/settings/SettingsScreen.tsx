import { ExportSection } from './ExportSection';
import { BrandingSection, LegalTextsSection } from './BrandingLegal';
import { BusinessSection } from './BusinessSection';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CancellationPolicy, ClinicState, FeatureSettings, LocalDateTime, ModuleSettings, PaymentSettings, ReminderSettings, TermsSettings, WaitlistSettings } from '../../domain/types';
import { availableSlots } from '../../engine/availability';
import { updateSettings } from '../../engine/commands';
import { launchMissing, onlineOpen } from '../../engine/launch';
import { countLabel, formatDayShort, formatDuration, formatNumber, formatTime } from '../../engine/format';
import { formatIban, nextVs, parseAccount, qrReady } from '../../engine/qr';
import { therapistName } from '../../engine/selectors';
import {
  BUSINESS_NOUNS,
  BUSINESS_NOUN_IDS,
  STAFF_NOUNS,
  STAFF_NOUN_IDS,
  businessNounId,
  cap,
  copyNoun,
  makeTerms,
  prep,
  staffNounId,
  type BusinessNounId,
  type StaffNounId,
} from '../../engine/terms';
import { addDays, dateOf } from '../../engine/time';
import { QrPaymentCard } from '../../components/payments';
import { useClinic, useCommand, useNow, useTerms } from '../../store/hooks';
import { useSession, navigate, setSession } from '../../store/session';
import {
  Badge,
  Button,
  Callout,
  Card,
  ChoiceChips,
  ConfirmDialog,
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
  PREVIEW_CLIENT_ID,
  RECIPIENT_MAX,
  byOrder,
  cx,
  dirtySections,
  firstStageFee,
  lockedTierIndex,
  normalizeDraft,
  settingsDraftOf,
  tierWarning,
  validateSettings,
  type BookingRulesDraft,
  type PaymentsDraft,
  type SectionId,
  type SettingsDraft,
  type SettingsErrors,
} from './helpers';
import { ImportSection } from './ImportSection';
import { ModulesSection } from './ModulesSection';
import { PolicyClientText, PolicyPreview } from './PolicyPreview';
import { SettingRow, useSyncedDraft } from './shared';
import './set-settings.css';

type SettingsPatch = Parameters<typeof updateSettings>[1];

/** Kotvy v levém sloupci: sekce konceptu + sekce s vlastním uložením (fakturační údaje, vzhled, právní texty, import, export). */
type AnchorId = SectionId | 'business' | 'import' | 'branding' | 'legal' | 'export';

const SECTIONS: { id: AnchorId; label: string; icon: IconName }[] = [
  { id: 'booking', label: 'Rezervace online', icon: 'calendarPlus' },
  { id: 'policy', label: 'Storno podmínky', icon: 'shield' },
  { id: 'excuses', label: 'Omluvenky a náhrady', icon: 'refresh' },
  { id: 'waitlist', label: 'Čekací listina', icon: 'hourglass' },
  { id: 'reminders', label: 'Připomínky', icon: 'bell' },
  { id: 'payments', label: 'Platby', icon: 'card' },
  { id: 'modules', label: 'Moduly', icon: 'layers' },
  { id: 'features', label: 'Funkce', icon: 'sliders' },
  { id: 'clinic', label: 'Klinika', icon: 'building' },
  { id: 'business', label: 'Fakturační údaje', icon: 'receipt' },
  { id: 'terms', label: 'Názvosloví', icon: 'message' },
  { id: 'branding', label: 'Vzhled', icon: 'sun' },
  { id: 'legal', label: 'Právní texty', icon: 'file' },
  { id: 'import', label: 'Import dat', icon: 'upload' },
  { id: 'export', label: 'Export dat', icon: 'download' },
];

const SECTION_OF_ERROR = (key: string): SectionId => {
  if (key.startsWith('booking.')) return 'booking';
  if (key.startsWith('excuses.')) return 'excuses';
  if (key.startsWith('payments.')) return 'payments';
  if (key.startsWith('clinic.')) return 'clinic';
  return 'policy';
};

const sectionLabel = (id: AnchorId): string => SECTIONS.find((s) => s.id === id)?.label ?? id;

/** Sekce jen pro majitele (fakturační údaje, export dat) – ostatním rolím se neukazují. */
const OWNER_SECTIONS: readonly AnchorId[] = ['business', 'export'];

const NOTICE_OPTIONS = [0, 30, 60, 120, 180, 240, 360, 720, 1440, 2880];
const OFFER_OPTIONS = [15, 30, 60, 120, 180, 240, 360, 720, 1440];
const REMINDER_OPTIONS = [2, 3, 4, 6, 12, 24, 48, 72];
const HORIZON_PRESETS = [14, 30, 60, 90, 180];

const withCurrent = (list: number[], current: number): number[] => (list.includes(current) ? list : [...list, current].sort((a, b) => a - b));

/**
 * Neuložený koncept, když uživatel odejde na jinou obrazovku (navigace se nedá zastavit).
 * Po návratu se obnoví, aby se rozpracované změny neztratily.
 */
let parkedDraft: SettingsDraft | null = null;

export function SettingsScreen(): JSX.Element {
  const clinic = useClinic();
  const { role, route } = useSession();
  const run = useCommand();
  const words = useTerms();
  // název sekce s údaji provozovny podle uloženého názvosloví („Klinika“, „Studio“…)
  const labelOf = (id: AnchorId): string => (id === 'clinic' ? words.Business.nom : sectionLabel(id));
  const base = useMemo(() => settingsDraftOf(clinic.settings), [clinic.settings]);
  const [restored] = useState(() => parkedDraft !== null);
  const { draft, setDraft, reset, dirty } = useSyncedDraft<SettingsDraft>(base, parkedDraft);

  // Odchod z obrazovky: rozpracované změny si podržíme; zavření stránky: upozorníme prohlížečem.
  const latest = useRef({ draft, dirty });
  latest.current = { draft, dirty };
  useEffect(() => {
    parkedDraft = null;
    return () => {
      parkedDraft = latest.current.dirty ? latest.current.draft : null;
    };
  }, []);
  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (e: BeforeUnloadEvent): void => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);
  const [active, setActive] = useState<AnchorId>('booking');
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

  const goTo = (id: AnchorId): void => {
    const el = document.getElementById(`set-sec-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
    setActive(id);
  };

  // odkaz na konkrétní sekci (kontrolní seznam spuštění na Přehledu)
  const target = route.name === 'nastaveni' ? SECTIONS.find((s) => s.id === route.section)?.id : undefined;
  useEffect(() => {
    if (!target) return undefined;
    // po vykreslení sekcí; trasu bez sekce uložíme až potom (jinak by úklid efektu posun zrušil)
    const timer = window.setTimeout(() => {
      goTo(target);
      setSession({ route: { name: 'nastaveni' } });
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  /* ---- úpravy konceptu ---- */
  const setRules = (patch: Partial<BookingRulesDraft>): void => setDraft((d) => ({ ...d, bookingRules: { ...d.bookingRules, ...patch } }));
  const setPolicy = (patch: Partial<CancellationPolicy>): void => setDraft((d) => ({ ...d, policy: { ...d.policy, ...patch } }));
  const setExcuses = (patch: Partial<CancellationPolicy['excuses']>): void =>
    setDraft((d) => ({ ...d, policy: { ...d.policy, excuses: { ...d.policy.excuses, ...patch } } }));
  const setWaitlist = (patch: Partial<WaitlistSettings>): void => setDraft((d) => ({ ...d, waitlist: { ...d.waitlist, ...patch } }));
  const setReminders = (patch: Partial<ReminderSettings>): void => setDraft((d) => ({ ...d, reminders: { ...d.reminders, ...patch } }));
  const setPayments = (patch: Partial<PaymentsDraft>): void => setDraft((d) => ({ ...d, payments: { ...d.payments, ...patch } }));
  const setFeatures = (patch: Partial<FeatureSettings>): void => setDraft((d) => ({ ...d, features: { ...d.features, ...patch } }));
  const setModules = (patch: Partial<ModuleSettings>): void => setDraft((d) => ({ ...d, modules: { ...d.modules, ...patch } }));
  const setTerms = (patch: Partial<TermsSettings>): void => setDraft((d) => ({ ...d, terms: { ...d.terms, ...patch } }));
  const setText = (key: 'clinicName' | 'clinicTagline' | 'senderName' | 'senderEmail', value: string): void =>
    setDraft((d) => ({ ...d, [key]: value }));

  const save = (): void => {
    if (errorKeys.length) {
      setShowErrors(true);
      const section = SECTION_OF_ERROR(errorKeys[0]);
      toast.error('Nastavení nelze uložit', { description: `Opravte zvýrazněná pole (${labelOf(section)}).` });
      goTo(section);
      return;
    }
    const n = normalizeDraft(draft);
    const patch: SettingsPatch = {};
    if (changed.includes('booking')) patch.bookingRules = n.bookingRules;
    if (changed.includes('policy') || changed.includes('excuses')) patch.policy = n.policy;
    if (changed.includes('waitlist')) patch.waitlist = n.waitlist;
    if (changed.includes('reminders')) patch.reminders = n.reminders;
    if (changed.includes('payments')) {
      const p = n.payments;
      const payments: NonNullable<SettingsPatch['payments']> = { qrEnabled: p.qrEnabled, recipientName: p.recipientName, qrDueHours: p.qrDueHours };
      // účet posíláme jen při změně – uložení beze změny účtu by zrušilo označení ukázkového účtu
      if (p.accountNumber !== base.payments.accountNumber.trim()) payments.accountNumber = p.accountNumber;
      patch.payments = payments;
    }
    if (changed.includes('modules')) patch.modules = n.modules;
    if (changed.includes('features')) patch.features = { ...clinic.settings.features, ...n.features };
    if (changed.includes('terms')) patch.terms = n.terms;
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
      toast.success('Nastavení uloženo', { description: `Upraveno: ${changed.map(labelOf).join(', ')}.` });
    }
  };

  return (
    <div className="page set-page set-settings-page">
      <PageHeader title="Nastavení" subtitle={`Pravidla online rezervací, storno podmínky, omluvenky, platby, funkce, údaje ${words.business.gen}, názvosloví a import dat`} />
      {restored && dirty && (
        <Callout tone="info" title="Rozpracované změny">
          Při posledním odchodu z Nastavení zůstaly neuložené změny ({changed.map(labelOf).join(', ')}). Uložte je, nebo je zahoďte.
        </Callout>
      )}

      <div className="set-settings">
        <nav className="set-anchors" aria-label="Sekce nastavení">
          <ul className="set-anchors__list">
            {SECTIONS.filter((s) => !OWNER_SECTIONS.includes(s.id) || role === 'owner').map((s) => (
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
                  <span className="set-anchors__label">{labelOf(s.id)}</span>
                  {(changed as AnchorId[]).includes(s.id) && (
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
            <OnlineOpenRow />
            <BookingSection rules={draft.bookingRules} onChange={setRules} errors={visibleErrors} />
          </Section>

          <section id="set-sec-policy" className="set-section" aria-labelledby="set-sec-policy-h">
            <div className="set-policy-grid">
              <Card className="set-section-card set-policy-grid__form">
                <SectionHeading id="policy" title="Storno podmínky" subtitle="Kdy lze zrušit zdarma a kolik stojí pozdní zrušení nebo nedostavení." />
                <PolicySection policy={draft.policy} onChange={setPolicy} errors={visibleErrors} modules={draft.modules} />
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
            <ExcusesSection excuses={draft.policy.excuses} onChange={setExcuses} errors={visibleErrors} modules={draft.modules} />
          </Section>

          <Section id="waitlist" title="Čekací listina" subtitle="Uvolněný termín automaticky nabídneme klientům, kteří na něj čekají.">
            <WaitlistSection waitlist={draft.waitlist} onChange={setWaitlist} clinic={clinic} />
          </Section>

          <Section id="reminders" title="Připomínky" subtitle="Automatická zpráva klientovi před termínem snižuje počet nedostavení.">
            <RemindersSection reminders={draft.reminders} onChange={setReminders} clinic={clinic} />
          </Section>

          <Section id="payments" title="Platby" subtitle="QR Platba: klient naskenuje kód v bankovní aplikaci a převod má předvyplněný – účet, částku i variabilní symbol.">
            <PaymentsSection payments={draft.payments} onChange={setPayments} errors={visibleErrors} saved={clinic.settings.payments} />
          </Section>

          <Section
            id="modules"
            title="Moduly"
            subtitle="Části systému, které provozovna používá. Vypnutý modul zmizí z aplikace i z klientského portálu; data zůstanou a po zapnutí se vrátí."
          >
            <ModulesSection modules={draft.modules} onChange={setModules} clinic={clinic} />
          </Section>

          <Section id="features" title="Funkce" subtitle={`Funkce, které se v ostrém provozu zapínají vědomě – podle toho, co ${words.business.nom} potřebuje a má zajištěné.`}>
            <FeaturesSection features={draft.features} onChange={setFeatures} clinic={clinic} />
          </Section>

          <Section id="clinic" title={words.Business.nom} subtitle="Název a odesílatel e-mailů, které klienti dostávají.">
            <ClinicSection draft={draft} onChange={setText} errors={visibleErrors} />
          </Section>

          {role === 'owner' && (
            <section id="set-sec-business" className="set-section" aria-labelledby="set-sec-business-h">
              <BusinessSection headingId="set-sec-business-h" />
            </section>
          )}

          <Section id="terms" title="Názvosloví" subtitle="Jak aplikace, klientský portál a zprávy říkají vaší provozovně a lidem, kteří poskytují služby.">
            <TermsSection terms={draft.terms} onChange={setTerms} />
          </Section>

          <section id="set-sec-branding" className="set-section" aria-labelledby="set-sec-branding-h">
            <BrandingSection headingId="set-sec-branding-h" />
          </section>

          <section id="set-sec-legal" className="set-section" aria-labelledby="set-sec-legal-h">
            <LegalTextsSection headingId="set-sec-legal-h" />
          </section>

          <section id="set-sec-import" className="set-section" aria-labelledby="set-sec-import-h">
            <Card className="set-section-card">
              <SectionHeading
                id="import"
                title="Import dat"
                subtitle="Převod klientů, permanentek a kreditů ze stávajícího systému. Data připravíte v Excelu a uložíte jako CSV."
              />
              <ImportSection />
            </Card>
          </section>

          {role === 'owner' && (
            <section id="set-sec-export" className="set-section" aria-labelledby="set-sec-export-h">
              <Card className="set-section-card">
                <SectionHeading id="export" title="Export dat" subtitle="Všechna data provozovny v JSON a hlavní evidence v CSV pro Excel." />
                <ExportSection />
              </Card>
            </section>
          )}
        </div>
      </div>

      <div className={cx('set-savebar', dirty && 'is-dirty')} role="region" aria-label="Uložení nastavení">
        <span className="set-savebar__status" aria-live="polite">
          {dirty ? (
            <>
              <span className="set-savebar__dot" aria-hidden="true" />
              <span>
                Neuložené změny: <strong>{changed.map(labelOf).join(', ')}</strong>
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

function SectionHeading({ id, title, subtitle }: { id: AnchorId; title: string; subtitle: string }): JSX.Element {
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

function compactExample(clinic: ClinicState, rules: BookingRulesDraft, now: LocalDateTime): CompactExample | null {
  const svc = clinic.services
    .filter((s) => s.active && s.kind === 'individual' && s.onlineBookable && !s.newClientsOnly && s.durationMin >= 30)
    .sort(byOrder)
    .find((s) => s.therapistIds.some((id) => clinic.therapists.find((t) => t.id === id && t.active)));
  if (!svc) return null;
  const therapist = clinic.therapists.filter((t) => t.active && svc.therapistIds.includes(t.id)).sort(byOrder)[0];
  if (!therapist) return null;
  const variant = (compactSlots: boolean): ClinicState => ({
    ...clinic,
    settings: { ...clinic.settings, bookingRules: { ...clinic.settings.bookingRules, ...rules, compactSlots } },
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

/**
 * Spuštění / pozastavení online rezervací – ukládá se hned (mimo koncept). Spustit lze až po povinných krocích
 * kontrolního seznamu (Přehled); pozastavené rezervace zapisuje jen personál.
 */
function OnlineOpenRow(): JSX.Element {
  const clinic = useClinic();
  const run = useCommand();
  const role = useSession().role;
  const open = onlineOpen(clinic);
  const missing = useMemo(() => launchMissing(clinic), [clinic]);
  const [confirm, setConfirm] = useState(false);
  const owner = role === 'owner';
  const setOpen = (value: boolean) =>
    run(updateSettings, { bookingRules: { onlineOpen: value } }, { success: value ? 'Online rezervace jsou spuštěné' : 'Online rezervace jsou pozastavené' });
  const gaps = missing.map((x) => x.label).join(', ');
  return (
    <div className="set-row set-row--switch">
      <Switch
        checked={open}
        disabled={!owner || (!open && missing.length > 0)}
        onChange={(v) => {
          if (v) setOpen(true);
          else setConfirm(true);
        }}
        label="Online rezervace spuštěné"
        description={
          open
            ? 'Klienti si termíny rezervují, přesouvají a hlídají uvolnění sami v portálu. Po pozastavení je zapisuje jen personál.'
            : 'Klienti si zatím online nerezervují – v portálu vidí „Online rezervace připravujeme“. Termíny zapisuje personál.'
        }
      />
      {!open && missing.length > 0 && (
        <p className="set-footnote set-feature-note">
          <Icon name="info" size={14} />
          <span>
            Spustit je půjde po doplnění: {gaps}.{' '}
            <button type="button" className="link" onClick={() => navigate({ name: 'prehled' })}>
              Kontrolní seznam na Přehledu
            </button>
          </span>
        </p>
      )}
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        tone="danger"
        title="Pozastavit online rezervace?"
        message={
          <>
            Klienti si nové termíny online nezarezervují ani je nepřesunou, v portálu uvidí „Online rezervace připravujeme“. Zrušit nebo omluvit
            termín mohou dál a personál rezervuje normálně.
            {missing.length > 0 && <> Znovu spustit je půjde až po doplnění: {gaps}.</>}
          </>
        }
        confirmLabel="Pozastavit"
        onConfirm={() => {
          const r = setOpen(false);
          if (!r.ok) throw new Error(r.error);
        }}
      />
    </div>
  );
}

function BookingSection({
  rules,
  onChange,
  errors,
}: {
  rules: BookingRulesDraft;
  onChange: (patch: Partial<BookingRulesDraft>) => void;
  errors: SettingsErrors;
}): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const words = useTerms();
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
            options={HORIZON_PRESETS.map((d) => ({ value: String(d), label: countLabel(d, ['den', 'dny', 'dní']), ariaLabel: `${countLabel(d, ['den', 'dny', 'dní'])} dopředu` }))}
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
          label={`Volba „Kdokoli ${prep('z', words.staffPl.gen)}“`}
          description={`Klient nemusí vybírat ${words.staff.agree('konkrétního', 'konkrétní', 'konkrétní', 'konkrétní')} ${words.staff.acc} – přidělíme ${words.staff.agree('toho, kdo', 'tu, která', 'to, které', 'ten, který')} je ten den méně ${words.staff.adj('vytížený')}.`}
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
  modules,
}: {
  policy: CancellationPolicy;
  onChange: (patch: Partial<CancellationPolicy>) => void;
  errors: SettingsErrors;
  /** Vypnuté moduly: pravidla pro permanentky a skupinové lekce se neukazují. */
  modules: ModuleSettings;
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

      {modules.packages && (
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
      )}

      {modules.groups && (
      <SettingRow
        label="Skupinové lekce"
        hint="Odhlášení zdarma nejpozději tolik hodin před začátkem lekce, potom místo propadá (100 %)."
        error={errors['policy.groupCancelHours']}
      >
        <NumberInput className="set-ctl-sm" value={policy.groupCancelHours} min={0} max={168} suffix="h předem" onChange={(v) => onChange({ groupCancelHours: v })} />
      </SettingRow>
      )}

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
  modules,
}: {
  excuses: CancellationPolicy['excuses'];
  onChange: (patch: Partial<CancellationPolicy['excuses']>) => void;
  errors: SettingsErrors;
  modules: ModuleSettings;
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
        {modules.packages && (
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
        )}
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
            options={withCurrent(REMINDER_OPTIONS, reminders.hoursBefore).map((h) => ({ value: String(h), label: `${formatDuration(h * 60)} předem` }))}
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
/* Platby                                                              */
/* ------------------------------------------------------------------ */

const DUE_PRESETS = [24, 48, 72, 168];
const PREVIEW_AMOUNT = 1190;

function PaymentsSection({
  payments,
  onChange,
  errors,
  saved,
}: {
  payments: PaymentsDraft;
  onChange: (patch: Partial<PaymentsDraft>) => void;
  errors: SettingsErrors;
  /** Uložené nastavení (IBAN a ukázkový účet dopočítává engine). */
  saved: PaymentSettings;
}): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const words = useTerms();
  const account = payments.accountNumber.trim();
  const parsed = account ? parseAccount(account) : null;
  const iban = parsed?.ok ? parsed.iban : null;
  // Ukázkový účet z testovacích dat platí, dokud ho nepřepíšete skutečným.
  const demo = saved.demoAccount && account === saved.accountNumber.trim();
  const previewVs = useMemo(() => nextVs(clinic, now), [clinic, now]);
  // Náhled pracuje s rozpracovanými údaji – tak, jak je uvidí klient po uložení.
  const preview: ClinicState | null = iban
    ? {
        ...clinic,
        settings: {
          ...clinic.settings,
          payments: { ...saved, ...payments, accountNumber: account, iban, recipientName: payments.recipientName.trim(), demoAccount: demo },
        },
      }
    : null;

  let accountStatus: ReactNode = null;
  if (iban) {
    accountStatus = (
      <span className="set-iban">
        <Icon name="checkCircle" size={14} />
        <span>
          IBAN <span className="tnum">{formatIban(iban)}</span>
        </span>
      </span>
    );
  } else if (!account && payments.qrEnabled) {
    accountStatus = (
      <span className="set-warn-text">
        <Icon name="alert" size={14} /> Bez čísla účtu se QR platba nenabízí.
      </span>
    );
  }

  return (
    <div className="set-rows">
      <div className="set-row set-row--switch">
        <Switch
          checked={payments.qrEnabled}
          onChange={(v) => onChange({ qrEnabled: v })}
          label="Nabízet platbu QR kódem"
          description="Recepce ukáže QR kód u pultu – za termín, permanentku, dobití kreditu i poplatek. Klienti mohou v portálu zaplatit převodem předem."
        />
      </div>
      <fieldset className={cx('set-fieldset', !payments.qrEnabled && 'is-disabled')} disabled={!payments.qrEnabled}>
        <legend className="visually-hidden">Údaje pro QR platbu</legend>
        <SettingRow
          label="Číslo účtu"
          hint="Ve tvaru 2000145399/0800, s předčíslím 19-2000145399/0800, nebo jako IBAN."
          error={errors['payments.accountNumber']}
          status={accountStatus}
        >
          <Input
            className="set-ctl-lg"
            value={payments.accountNumber}
            maxLength={50}
            placeholder="např. 2000145399/0800"
            autoComplete="off"
            spellCheck={false}
            onValueChange={(v) => onChange({ accountNumber: v })}
          />
        </SettingRow>
        <SettingRow
          label="Příjemce"
          hint={
            <>
              Jméno, které klient uvidí v bankovní aplikaci. Když ho nevyplníte, použije se obchodní firma z fakturačních údajů, případně odesílatel{' '}
              <span className="nowrap">e-mailů</span>.
            </>
          }
          error={errors['payments.recipientName']}
        >
          <Input
            className="set-ctl-lg"
            value={payments.recipientName}
            maxLength={RECIPIENT_MAX}
            placeholder={(clinic.settings.business?.legalName || clinic.settings.senderName).slice(0, RECIPIENT_MAX)}
            suffix={<span className="set-count tnum">{`${payments.recipientName.length}/${RECIPIENT_MAX}`}</span>}
            onValueChange={(v) => onChange({ recipientName: v })}
          />
        </SettingRow>
        <SettingRow
          label="Splatnost QR platby z portálu"
          hint="Kolik času má klient na zaplacení, když v portálu zvolí QR platbu. U termínu nejpozději do jeho začátku."
          error={errors['payments.qrDueHours']}
          group
        >
          <div className="set-inline">
            <NumberInput
              className="set-ctl-sm"
              value={payments.qrDueHours}
              min={1}
              max={720}
              suffix="h"
              aria-label="Splatnost QR platby v hodinách"
              onChange={(v) => onChange({ qrDueHours: v })}
            />
            <ChoiceChips
              aria-label="Rychlá volba splatnosti"
              value={DUE_PRESETS.includes(payments.qrDueHours) ? String(payments.qrDueHours) : null}
              onChange={(v) => onChange({ qrDueHours: Number(v) })}
              options={DUE_PRESETS.map((h) => ({
                value: String(h),
                label: countLabel(h / 24, ['den', 'dny', 'dní']),
                ariaLabel: `${countLabel(h, ['hodina', 'hodiny', 'hodin'])} (${countLabel(h / 24, ['den', 'dny', 'dní'])})`,
              }))}
            />
          </div>
        </SettingRow>
      </fieldset>

      {demo && (
        <Callout tone="warning" title="Ukázkový účet" className="set-pay__demo">
          Ukázkový účet z testovacích dat – nahraďte ho skutečným účtem {words.business.gen}. Do té doby nese QR kód ve zprávě pro příjemce upozornění, aby nikdo neplatil doopravdy.
        </Callout>
      )}

      <div className="set-pay">
        <div className="set-pay__preview">
          <span className="set-pay__label">Náhled QR platby</span>
          {preview ? (
            <QrPaymentCard
              clinic={preview}
              clientId={PREVIEW_CLIENT_ID}
              amount={PREVIEW_AMOUNT}
              vs={previewVs}
              label="Ukázka platby"
              qrSize={164}
              className="set-pay__card"
            />
          ) : (
            <p className="set-pay__empty">
              <Icon name="grid" size={16} />
              {account ? 'Náhled se zobrazí, až bude číslo účtu platné.' : 'Náhled QR kódu se zobrazí po zadání čísla účtu.'}
            </p>
          )}
        </div>
        <div className="set-pay__how">
          <span className="set-pay__label">Jak to funguje</span>
          <ol className="set-pay__steps">
            <li>Klient naskenuje QR kód v bankovní aplikaci – účet, částka i variabilní symbol se vyplní samy.</li>
            <li>
              Kód ukážete u pultu, nebo ho klient dostane <span className="nowrap">e-mailem</span> či v portálu, když platí předem.
            </li>
            <li>Až peníze dorazí, potvrdíte přijetí podle variabilního symbolu na výpisu z účtu – v detailu termínu, na kartě klienta nebo na přehledu.</li>
            <li>Teprve potom je termín zaplacený, permanentka aktivní a kredit připsaný.</li>
          </ol>
          <p className="set-footnote">
            <Icon name="info" size={14} />
            <span>Automatické párování plateb s bankou není součástí testovací verze – platby se potvrzují ručně.</span>
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Funkce                                                              */
/* ------------------------------------------------------------------ */

function FeaturesSection({
  features,
  onChange,
  clinic,
}: {
  features: FeatureSettings;
  onChange: (patch: Partial<FeatureSettings>) => void;
  clinic: ClinicState;
}): JSX.Element {
  const words = useTerms();
  const noteCount = useMemo(() => clinic.clients.reduce((n, c) => n + c.notes.length, 0), [clinic.clients]);
  const qr = qrReady(clinic.settings.payments);
  return (
    <div className="set-rows">
      <div className="set-row set-row--switch">
        <Switch
          checked={features.clinicalNotes}
          onChange={(v) => onChange({ clinicalNotes: v })}
          label="Klinické poznámky"
          description={`${words.StaffPl.nom} zapisují ke klientovi průběh terapie, nález a plán. Jde o zdravotní údaje – zvláštní kategorii osobních údajů podle čl. 9 GDPR. Zapněte je, jen když máte zajištěné zabezpečení a souhlasy klientů. V ostrém provozu jsou výchozí vypnuté.`}
        />
        <p className="set-footnote set-feature-note" aria-live="polite">
          <Icon name={features.clinicalNotes ? 'lock' : 'eyeOff'} size={14} />
          <span>
            {features.clinicalNotes
              ? `Poznámky vidí jen ${words.staffPl.nom} a majitel; recepce ne.`
              : noteCount
                ? `Záložka Dokumentace a karta Klinická poznámka se skryjí. Uložené poznámky (${noteCount}) zůstanou v datech, jen je nikdo neuvidí a nové nepůjde zapsat.`
                : 'Záložka Dokumentace a karta Klinická poznámka se skryjí a nové poznámky nepůjde zapsat.'}
          </span>
        </p>
      </div>
      <div className="set-row set-row--switch">
        <Switch
          checked={features.cardPayments}
          onChange={(v) => onChange({ cardPayments: v })}
          label="Platba kartou online"
          description="Klienti zaplatí kartou hned při rezervaci, nákupu permanentky nebo dobití kreditu. Vyžaduje napojení na platební bránu – v testovací verzi je platba jen simulovaná."
        />
        <p className="set-footnote set-feature-note" aria-live="polite">
          <Icon name="info" size={14} />
          <span>
            {features.cardPayments
              ? 'Volba „Kartou online“ se nabízí v klientském portálu i při rezervaci na recepci.'
              : qr
                ? 'Klienti zaplatí na místě, QR platbou nebo z kreditu.'
                : 'Klienti zaplatí na místě nebo z kreditu. Permanentky a dobití kreditu koupí jen na recepci, dokud nenastavíte QR platbu.'}
          </span>
        </p>
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
  const words = useTerms();
  return (
    <div className="set-rows">
      <SettingRow label={`Název ${words.business.gen}`} hint="Zobrazuje se v aplikaci, klientském portálu a v e-mailech." error={errors['clinic.clinicName']}>
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
            <span className="set-mailpreview__subject">Připomínka: zítra v 9:00 · {draft.clinicName.trim() || words.Business.nom}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Názvosloví                                                          */
/* ------------------------------------------------------------------ */

/** Hodnota výběru pro tvary uložené mimo katalog (např. přes API) – zůstanou, dokud nevyberete slovo z katalogu. */
const CUSTOM_NOUN = 'vlastni';

function TermsSection({ terms, onChange }: { terms: TermsSettings; onChange: (patch: Partial<TermsSettings>) => void }): JSX.Element {
  const clinic = useClinic();
  const businessId = businessNounId(terms.business);
  const staffId = staffNounId(terms.staff);
  const w = makeTerms(terms);
  const name = clinic.settings.clinicName.trim();
  const samples = [
    `Vyberte ${w.staff.acc}`,
    `Kdokoli ${prep('z', w.staffPl.gen)}`,
    `Obsazenost ${w.staffPl.gen}`,
    `${w.staff.adj('Nový')} ${w.staff.nom}`,
    `Storno podmínky ${w.business.gen}`,
    `Zrušeno ${w.business.ins}`,
    `${w.business.adj('Celý')} ${w.business.nom} – zavřeno`,
  ];
  return (
    <div className="set-rows">
      <SettingRow label="Provozovna" hint="Jak se v aplikaci, klientském portálu a zprávách označuje váš podnik.">
        <Select
          className="set-ctl-md"
          value={businessId ?? CUSTOM_NOUN}
          onValueChange={(v) => {
            if (v !== CUSTOM_NOUN) onChange({ business: copyNoun(BUSINESS_NOUNS[v as BusinessNounId]) });
          }}
          options={[
            ...BUSINESS_NOUN_IDS.map((id) => ({ value: id, label: cap(BUSINESS_NOUNS[id].sg[0]) })),
            ...(businessId ? [] : [{ value: CUSTOM_NOUN, label: `${cap(terms.business.sg[0])} (vlastní tvary)` }]),
          ]}
        />
      </SettingRow>
      <SettingRow label="Kdo poskytuje služby" hint="Jak se označuje člen týmu – v kalendáři, při online rezervaci i ve zprávách.">
        <Select
          className="set-ctl-md"
          value={staffId ?? CUSTOM_NOUN}
          onValueChange={(v) => {
            if (v !== CUSTOM_NOUN) onChange({ staff: copyNoun(STAFF_NOUNS[v as StaffNounId]) });
          }}
          options={[
            ...STAFF_NOUN_IDS.map((id) => ({ value: id, label: cap(STAFF_NOUNS[id].sg[0]) })),
            ...(staffId ? [] : [{ value: CUSTOM_NOUN, label: `${cap(terms.staff.sg[0])} (vlastní tvary)` }]),
          ]}
        />
      </SettingRow>
      <div className="set-mailpreview" aria-live="polite">
        <span className="set-mailpreview__label">Náhled</span>
        <p className="set-terms-preview">
          {w.Business.nom}
          {name ? ` ${name}` : ''} {w.business.past('zrušil')} termín, protože {w.staff.nom} je {w.staff.adj('nemocný')}. Vyberte si prosím{' '}
          {w.staff.agree('jiného', 'jinou', 'jiné', 'jiný')} {w.staff.acc}.
        </p>
        <span className="set-slots">
          {samples.map((s) => (
            <span key={s} className="set-slot">
              {s}
            </span>
          ))}
        </span>
        <p className="set-footnote">
          <Icon name="info" size={14} />
          <span>Texty automatických zpráv a kampaní se nemění – upravíte je v Komunikaci (proměnné [klinika] a [terapeut] doplní název a jméno).</span>
        </p>
      </div>
    </div>
  );
}
