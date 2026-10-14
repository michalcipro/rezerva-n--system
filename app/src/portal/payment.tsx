import { useEffect, useRef, useState } from 'react';
import { useClinic } from '../store/hooks';
import { Badge, Button, Callout, Icon, RadioCards } from '../ui';
import { clinicPolicy, type PayOption, type TermsInfo } from './logic';
import { Sheet } from './parts';

/** Výběr platby jako karty s volbou (permanentka, náhrada, kredit, kartou online, na místě). */
export function PaymentPicker({
  options,
  value,
  onChange,
  legend = 'Platba',
}: {
  options: PayOption[];
  value: string | null;
  onChange: (key: string) => void;
  legend?: string;
}): JSX.Element {
  return (
    <RadioCards
      legend={legend}
      value={value}
      onChange={onChange}
      className="por-pay"
      options={options.map((o) => ({
        value: o.key,
        title: (
          <span className="por-pay__title">
            <Icon name={o.icon} size={16} />
            {o.title}
          </span>
        ),
        badge:
          o.payment.method === 'makeup' ? (
            <Badge tone="accent" size="sm">
              Náhrada
            </Badge>
          ) : undefined,
        description: o.description,
        aside: o.aside,
        disabled: o.disabled,
      }))}
    />
  );
}

/** Upozornění, že platba kartou je v ukázce jen simulovaná. */
export function SimulatedPaymentNote({ amount }: { amount?: string }): JSX.Element {
  return (
    <Callout tone="info" icon="card" title="Platba kartou (simulace)">
      {amount ? `Po potvrzení zaplatíte ${amount}. ` : ''}V této ukázce se karta nezadává a nic se nestrhne – v ostrém provozu vás
      přesměrujeme na platební bránu.
    </Callout>
  );
}

/**
 * Simulace platební brány: krátké „zpracování“ před provedením akce.
 * `run(true, akce)` ukáže načítání a akci spustí po chvíli, `run(false, akce)` hned.
 */
export function useSimulatedPayment(): { paying: boolean; run: (simulate: boolean, action: () => void) => void } {
  const [paying, setPaying] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const run = (simulate: boolean, action: () => void): void => {
    if (!simulate) {
      action();
      return;
    }
    setPaying(true);
    timer.current = window.setTimeout(() => {
      setPaying(false);
      action();
    }, 1100);
  };
  return { paying, run };
}

/** Srozumitelné storno podmínky konkrétního termínu. */
export function TermsBox({ terms, onShowPolicy, title = 'Storno podmínky' }: { terms: TermsInfo; onShowPolicy?: () => void; title?: string }): JSX.Element {
  return (
    <section className="por-terms" aria-label={title}>
      <div className="por-terms__head">
        <Icon name="shieldCheck" size={16} />
        <span>{title}</span>
      </div>
      <ul className="por-terms__list">
        {terms.lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {onShowPolicy && (
        <button type="button" className="link por-terms__link" onClick={onShowPolicy}>
          Celé podmínky kliniky
        </button>
      )}
    </section>
  );
}

/** Seznam pravidel kliniky (z nastavení). */
export function PolicyList(): JSX.Element {
  const clinic = useClinic();
  const items = clinicPolicy(clinic.settings);
  return (
    <ul className="por-policy">
      {items.map((it) => (
        <li key={it.title} className="por-policy__item">
          <span className="por-policy__icon" aria-hidden="true">
            <Icon name={it.icon} size={18} />
          </span>
          <span className="por-policy__body">
            <span className="por-policy__title">{it.title}</span>
            <span className="por-policy__text">{it.text}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function PolicySheet({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Storno podmínky kliniky"
      footer={
        <Button variant="secondary" size="lg" full onClick={onClose}>
          Rozumím
        </Button>
      }
    >
      <PolicyList />
    </Sheet>
  );
}
