import { Fragment, forwardRef, type ReactNode, type TextareaHTMLAttributes } from 'react';
import type { Campaign, ClinicState } from '../../domain/types';
import type { TemplateVars } from '../../engine/messages';
import { Badge, cx, type BadgeTone, type DotShape } from '../../ui';
import { splitTokens } from './lib';

/* ------------------------------------------------------------------ */
/* Personalizovaný text                                                */
/* ------------------------------------------------------------------ */

/**
 * Text s proměnnými [jméno] nahrazenými ukázkovou hodnotou. Dosazené hodnoty
 * jsou jemně zvýrazněné, neznámé proměnné výrazně (v e-mailu by zůstaly doslova).
 */
export function Personalized({ text, vars }: { text: string; vars: TemplateVars }): JSX.Element {
  return (
    <>
      {splitTokens(text).map((part, i) => {
        if (!part.token) return <Fragment key={i}>{part.text}</Fragment>;
        if (part.token in vars) {
          return (
            <mark key={i} className="com-var" title={`Proměnná ${part.text}`}>
              {vars[part.token]}
            </mark>
          );
        }
        return (
          <mark key={i} className="com-var com-var--unknown" title="Tuto proměnnou systém nevyplní – klient ji uvidí doslova.">
            {part.text}
          </mark>
        );
      })}
    </>
  );
}

/** Odstavce oddělené prázdným řádkem, jednotlivé řádky zalomené. */
export function Paragraphs({ text, vars, className }: { text: string; vars: TemplateVars; className?: string }): JSX.Element {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.replace(/^\n+|\n+$/g, ''))
    .filter((p) => p.trim() !== '');
  return (
    <>
      {paragraphs.map((p, i) => (
        <p key={i} className={className}>
          {p.split('\n').map((line, j) => (
            <Fragment key={j}>
              {j > 0 && <br />}
              <Personalized text={line} vars={vars} />
            </Fragment>
          ))}
        </p>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Rostoucí textové pole                                               */
/* ------------------------------------------------------------------ */

export interface AutoTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  value: string;
  /** Třída obalu – nese typografii (pole ji dědí), např. styl nadpisu e-mailu. */
  className?: string;
}

/**
 * Textarea, která roste s obsahem. Výška se odvozuje čistě v CSS (skrytá kopie
 * textu ve stejné buňce mřížky), takže funguje i při změně šířky náhledu.
 */
export const AutoTextarea = forwardRef<HTMLTextAreaElement, AutoTextareaProps>(function AutoTextarea(
  { value, className, ...rest },
  ref,
) {
  return (
    <div className={cx('com-grow', className)} data-value={value}>
      <textarea ref={ref} rows={1} value={value} {...rest} />
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* E-mailové plátno                                                    */
/* ------------------------------------------------------------------ */

export type Device = 'desktop' | 'mobile';

interface EmailFrameProps {
  clinic: ClinicState;
  device: Device;
  /** Dekorativní pás pod hlavičkou (newsletter). */
  hero?: boolean;
  footer: ReactNode;
  children: ReactNode;
  label: string;
  className?: string;
}

/** Kostra e-mailu ve stylu kliniky: logo, volitelný pás, obsah, patička. */
export function EmailFrame({ clinic, device, hero, footer, children, label, className }: EmailFrameProps): JSX.Element {
  return (
    <article className={cx('com-email', device === 'mobile' && 'com-email--mobile', className)} aria-label={label}>
      <div className="com-email__brand">
        <span className="com-email__logo">
          {clinic.settings.clinicName}
          <span className="com-email__dot">.</span>
        </span>
        {clinic.settings.clinicTagline && <span className="com-email__tagline">{clinic.settings.clinicTagline}</span>}
      </div>
      {hero && (
        <div className="com-email__hero" aria-hidden="true">
          <span className="com-email__hero-sun" />
          <span className="com-email__hero-line" />
          <span className="com-email__hero-steps">
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
        </div>
      )}
      <div className="com-email__body">{children}</div>
      <footer className="com-email__footer">{footer}</footer>
    </article>
  );
}

/** Patička obchodního sdělení – odkaz na odhlášení je povinný. */
export function MarketingFooter({ clinic }: { clinic: ClinicState }): JSX.Element {
  return (
    <>
      <p>
        Tento e-mail dostáváte, protože jste nám udělili souhlas se zasíláním novinek.{' '}
        <span className="com-email__link">Odhlásit odběr</span> · <span className="com-email__link">Nastavení preferencí</span>
      </p>
      <p className="com-email__legal">
        {clinic.settings.senderName} · {clinic.settings.senderEmail}
      </p>
    </>
  );
}

/** Patička provozní zprávy (rezervace, storna). */
export function ServiceFooter({ clinic }: { clinic: ClinicState }): JSX.Element {
  return (
    <>
      <p>Tuto zprávu dostáváte, protože u nás máte rezervaci nebo účet. Termíny spravujete v aplikaci kliniky.</p>
      <p className="com-email__legal">
        {clinic.settings.senderName} · {clinic.settings.senderEmail}
      </p>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Stav kampaně                                                        */
/* ------------------------------------------------------------------ */

export const CAMPAIGN_STATUS: Record<Campaign['status'], { label: string; tone: BadgeTone; dot: DotShape }> = {
  draft: { label: 'Koncept', tone: 'warning', dot: 'ring' },
  scheduled: { label: 'Naplánováno', tone: 'info', dot: 'circle' },
  sent: { label: 'Odesláno', tone: 'success', dot: 'circle' },
};

export function CampaignStatusBadge({ status, plain }: { status: Campaign['status']; plain?: boolean }): JSX.Element {
  const meta = CAMPAIGN_STATUS[status];
  return (
    <Badge tone={meta.tone} dot={meta.dot} plain={plain}>
      {meta.label}
    </Badge>
  );
}

/** Po vložení proměnné vrátí fokus do pole a kurzor za vložený text. */
export function focusCaret(el: HTMLInputElement | HTMLTextAreaElement | null, caret: number): void {
  if (!el) return;
  requestAnimationFrame(() => {
    el.focus();
    try {
      el.setSelectionRange(caret, caret);
    } catch {
      /* některé typy polí výběr nepodporují */
    }
  });
}

/** Nejbližší předek, který se opravdu posouvá (overflow auto/scroll). */
function scrollParentOf(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return null;
}

/**
 * Posune nejbližší posuvný kontejner tak, aby byl prvek vidět (start = nahoru,
 * nearest = jen když je nad viditelnou oblastí). Na rozdíl od scrollIntoView
 * nehýbe s kostrou aplikace (overflow: hidden).
 */
export function revealElement(el: HTMLElement | null | undefined, mode: 'start' | 'nearest' = 'start'): void {
  if (!el) return;
  const parent = scrollParentOf(el);
  if (!parent) return;
  const offset = el.getBoundingClientRect().top - parent.getBoundingClientRect().top;
  if (mode === 'nearest' && offset >= 0) return;
  parent.scrollTo({ top: Math.max(0, parent.scrollTop + offset - 8) });
}
