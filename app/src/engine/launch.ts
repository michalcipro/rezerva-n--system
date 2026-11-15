import type { ClinicState } from '../domain/types';
import { businessMissing, isEmailAddress } from './business';
import { countLabel } from './format';
import { legalDraftProblems } from './legalDraft';
import { formatIban, qrReady } from './qr';
import { prep, termsOf } from './terms';

/**
 * Spuštění online rezervací. Nová provozovna začíná nespuštěná: klienti si v portálu zatím
 * nerezervují (engine to odmítne), personál rezervuje normálně. Majitel projde kontrolní seznam
 * na Přehledu a online rezervace spustí; v Nastavení → Rezervace online je může zase pozastavit.
 */

export type LaunchStepId = 'business' | 'sender' | 'account' | 'services' | 'hours' | 'legal' | 'branding';

/** Kde se krok doplní: obrazovka administrace a případně sekce Nastavení. */
export interface LaunchTarget {
  screen: 'nastaveni' | 'sluzby' | 'tym';
  section?: 'clinic' | 'business' | 'payments' | 'legal' | 'branding';
}

export interface LaunchStep {
  id: LaunchStepId;
  title: string;
  /** Název do věty („Chybí: fakturační údaje, e-mail odesílatele“). */
  label: string;
  /** Co je hotové, nebo co chybí a proč. */
  hint: string;
  done: boolean;
  /** Nepovinný krok – spuštění neblokuje. */
  optional: boolean;
  target: LaunchTarget;
}

/** Jsou online rezervace spuštěné? Chybějící údaj (starší data) znamená spuštěné. */
export const onlineOpen = (s: Pick<ClinicState, 'settings'>): boolean => s.settings.bookingRules?.onlineOpen !== false;

/** Hláška pro klienta, dokud online rezervace nejsou spuštěné. */
export function onlineClosedMessage(s: Pick<ClinicState, 'settings'>): string {
  return `Online rezervace připravujeme. Termín si zatím domluvte přímo ${prep('s', termsOf(s).business.ins)}.`;
}

/** Kroky před spuštěním online rezervací se stavem hotovo / chybí. */
export function launchChecklist(s: ClinicState): LaunchStep[] {
  const w = termsOf(s);
  const st = s.settings;
  const steps: LaunchStep[] = [];

  const missing = businessMissing(st.business);
  steps.push({
    id: 'business',
    title: 'Fakturační údaje',
    label: 'fakturační údaje',
    hint: missing.length
      ? `Chybí: ${missing.join(', ')}. Identifikace ${w.business.gen} patří do patičky e-mailů a do portálu.`
      : `${st.business.legalName} · IČO ${st.business.ico}`,
    done: missing.length === 0,
    optional: false,
    target: { screen: 'nastaveni', section: 'business' },
  });

  const sender = isEmailAddress(st.senderEmail) && !!st.senderName.trim();
  steps.push({
    id: 'sender',
    title: 'E-mail odesílatele',
    label: 'e-mail odesílatele',
    hint: sender ? `${st.senderName} <${st.senderEmail.trim()}>` : 'Adresa, na kterou klienti odpovídají na potvrzení a připomínky.',
    done: sender,
    optional: false,
    target: { screen: 'nastaveni', section: 'clinic' },
  });

  // číslo účtu jen se zapnutou QR platbou; ukázkový účet z testovacích dat nestačí
  if (st.payments.qrEnabled) {
    const account = qrReady(st.payments) && !st.payments.demoAccount;
    steps.push({
      id: 'account',
      title: 'Číslo účtu pro QR platby',
      label: 'číslo účtu pro QR platby',
      hint: account
        ? `IBAN ${formatIban(st.payments.iban)}`
        : st.payments.demoAccount
          ? `Je nastavený ukázkový účet – nahraďte ho skutečným účtem ${w.business.gen}, nebo QR platby vypněte.`
          : 'Bez čísla účtu se QR platba klientům nenabízí. Doplňte účet, nebo QR platby vypněte.',
      done: account,
      optional: false,
      target: { screen: 'nastaveni', section: 'payments' },
    });
  }

  const services = s.services.filter((x) => x.active && x.onlineBookable).length;
  steps.push({
    id: 'services',
    title: 'Aspoň jedna aktivní služba',
    label: 'aktivní služba s online rezervací',
    hint: services ? `${countLabel(services, ['služba', 'služby', 'služeb'])} s online rezervací` : 'Přidejte službu a povolte u ní online rezervaci.',
    done: services > 0,
    optional: false,
    target: { screen: 'sluzby' },
  });

  const working = s.therapists.filter((t) => t.active && Object.values(t.workingHours).some((ranges) => ranges.some((r) => r.start < r.end))).length;
  steps.push({
    id: 'hours',
    title: 'Pracovní doby týmu',
    label: 'pracovní doby týmu',
    hint: working ? `${countLabel(working, w.counts.staff)} s pracovní dobou` : 'Podle pracovní doby se klientům nabízejí volné termíny.',
    done: working > 0,
    optional: false,
    target: { screen: 'tym' },
  });

  const legal = st.legal ?? { terms: '', privacy: '', updatedAt: null };
  const textMissing = (text: string): boolean => !text.trim() || legalDraftProblems(text).length > 0;
  const legalGaps = [textMissing(legal.terms) && 'obchodní podmínky', textMissing(legal.privacy) && 'informace o zpracování osobních údajů'].filter(Boolean);
  steps.push({
    id: 'legal',
    title: 'Obchodní podmínky a zpracování osobních údajů',
    label: 'obchodní podmínky a informace o zpracování údajů',
    hint: legalGaps.length
      ? `Chybí: ${legalGaps.join(', ')}. Klienti je uvidí při registraci a v účtu.`
      : 'Oba texty jsou uložené – klienti je uvidí při registraci a v účtu.',
    done: legalGaps.length === 0,
    optional: false,
    target: { screen: 'nastaveni', section: 'legal' },
  });

  const brand = st.branding ?? { accent: null, logo: null };
  steps.push({
    id: 'branding',
    title: 'Vzhled',
    label: 'vzhled',
    hint:
      brand.logo && brand.accent
        ? 'Logo i barva značky jsou nastavené.'
        : brand.logo
          ? 'Logo je nastavené.'
          : brand.accent
            ? 'Barva značky je nastavená.'
            : `Logo a barva ${w.business.gen} v portálu a na přihlášení. Nepovinné.`,
    done: !!(brand.logo || brand.accent),
    optional: true,
    target: { screen: 'nastaveni', section: 'branding' },
  });

  return steps;
}

/** Povinné kroky, které ještě chybí. */
export const launchMissing = (s: ClinicState): LaunchStep[] => launchChecklist(s).filter((x) => !x.optional && !x.done);

/** Lze online rezervace spustit (všechny povinné kroky hotové)? */
export const launchReady = (s: ClinicState): boolean => launchMissing(s).length === 0;
