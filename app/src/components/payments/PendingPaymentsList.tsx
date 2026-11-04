import { useMemo, useState } from 'react';
import type { Id, PaymentRequest } from '../../domain/types';
import { cancelPaymentRequest, confirmPaymentRequest } from '../../engine/commands';
import { countLabel, formatDateTimeShort, formatMoney } from '../../engine/format';
import {
  findPaymentRequestsByVs,
  isPaymentRequestOverdue,
  PAYMENT_PURPOSE_LABEL,
  PAYMENT_REQUEST_STATUS_LABEL,
  paymentRequestOutcome,
  paymentRequestTitle,
  pendingPaymentRequests,
} from '../../engine/payments';
import { clientName, getClient } from '../../engine/selectors';
import { combine, dateOf, isValidLocalDate, timeOf } from '../../engine/time';
import { useActor, useClinic, useCommand, useNow } from '../../store/hooks';
import { navigate } from '../../store/session';
import { Badge, Button, ConfirmDialog, cx, EmptyState, Field, IconButton, Input } from '../../ui';
import { QrPaymentDialog } from './QrPaymentDialog';
import './payments.css';

export interface PendingPaymentsListProps {
  /** Jen výzvy jednoho klienta (karta klienta). */
  clientId?: Id | null;
  /** Kolik výzev ukázat najednou (další přes „Zobrazit další“). Výchozí 10. */
  limit?: number;
  /**
   * Odkaz „Zobrazit další (n)“ pod seznamem. Výchozí true; widget s vlastním odkazem na celý seznam ho vypne
   * a ukáže jen prvních `limit` výzev.
   */
  expandable?: boolean;
  /** Skrýt jméno klienta (na kartě klienta). */
  hideClient?: boolean;
  /** Bez potvrzení a zrušení (jen zobrazení QR). Role bez přístupu k financím má jen zobrazení vždy. */
  readOnly?: boolean;
  /**
   * Hledání podle variabilního symbolu z výpisu – najde i zaplacené a zrušené výzvy. Zrušenou výzvu lze potvrdit,
   * když platba přesto přišla (uhradí termín, nebo se připíše na kredit).
   */
  searchable?: boolean;
  /** Text prázdného stavu. */
  emptyText?: string;
  /** Prázdný stav nevykreslovat (widget, který se bez výzev skryje). */
  hideEmpty?: boolean;
  className?: string;
}

/** Co potvrzení výzvy udělá – věta do potvrzovacího dialogu (prázdná u běžného zaplacení čekající výzvy). */
function outcomeText(clinic: ReturnType<typeof useClinic>, r: PaymentRequest): string {
  const o = paymentRequestOutcome(clinic, r);
  if (o.kind === 'credit') return `${o.reason} – přijatá částka se připíše klientovi na kredit.`;
  if (r.status !== 'cancelled') return '';
  if (r.purpose === 'credit_topup') return 'Výzva je zrušená, platba ale kredit dobije.';
  return `Výzva je zrušená, ${r.purpose === 'storno_fee' ? 'poplatek' : 'termín'} ale pořád čeká na úhradu – platba ho zaplatí.`;
}

/**
 * Čekající QR platby: klient, účel, částka, VS a splatnost (po splatnosti zvýrazněné), akce „Zobrazit QR“,
 * „Potvrdit“ (s datem připsání podle výpisu) a „Zrušit“. S `searchable` navíc hledání podle VS i mezi
 * zaplacenými a zrušenými výzvami.
 */
export function PendingPaymentsList({
  clientId,
  limit = 10,
  expandable = true,
  hideClient,
  readOnly,
  searchable,
  emptyText,
  hideEmpty,
  className,
}: PendingPaymentsListProps): JSX.Element | null {
  const clinic = useClinic();
  const now = useNow();
  const actor = useActor();
  const run = useCommand();
  const [shown, setShown] = useState(limit);
  const [view, setView] = useState<Id | null>(null);
  const [confirming, setConfirming] = useState<PaymentRequest | null>(null);
  const [paidOn, setPaidOn] = useState('');
  const [cancelling, setCancelling] = useState<PaymentRequest | null>(null);
  const [query, setQuery] = useState('');
  const canManage = !readOnly && (actor.role === 'owner' || actor.role === 'reception');
  const today = dateOf(now);

  const list = useMemo(() => pendingPaymentRequests(clinic, clientId ?? null), [clinic, clientId]);
  const overdueCount = useMemo(() => list.filter((r) => isPaymentRequestOverdue(r, now)).length, [list, now]);
  const searching = !!searchable && query.trim() !== '';
  const found = useMemo(
    () => (searching ? findPaymentRequestsByVs(clinic, query).filter((r) => !clientId || r.clientId === clientId) : []),
    [clinic, query, searching, clientId],
  );

  if (!list.length && !searchable) {
    if (hideEmpty) return null;
    return (
      <EmptyState
        compact
        icon="qr"
        className={className}
        title="Žádné čekající QR platby"
        text={
          emptyText ??
          'Když klient zvolí platbu QR převodem nebo ji vystavíte na recepci, objeví se tady, dokud platbu nepotvrdíte podle výpisu z účtu.'
        }
      />
    );
  }

  // datum připsání: ne v budoucnu ani před dnem vystavení výzvy
  const minPaidOn = confirming ? dateOf(confirming.createdAt) : '';
  const openConfirm = (r: PaymentRequest): void => {
    setPaidOn(today);
    setConfirming(r);
  };
  const doConfirm = (): void => {
    if (!confirming) return;
    // starší den z výpisu = poledne (příkaz ho u dne vystavení posune na okamžik vystavení)
    const at = paidOn && paidOn !== today && isValidLocalDate(paidOn) ? combine(paidOn, '12:00') : combine(today, timeOf(now));
    const r = run(confirmPaymentRequest, { requestId: confirming.id, at }, { success: `Platba ${formatMoney(confirming.amount)} přijata` });
    if (!r.ok) throw new Error(r.error);
  };
  const doCancel = (): void => {
    if (!cancelling) return;
    const r = run(cancelPaymentRequest, { requestId: cancelling.id }, { success: 'QR platba zrušena' });
    if (!r.ok) throw new Error(r.error);
  };

  const row = (r: PaymentRequest): JSX.Element => {
    const c = getClient(clinic, r.clientId);
    const pending = r.status === 'pending';
    const overdue = isPaymentRequestOverdue(r, now);
    return (
      <li key={r.id} className={cx('pay-list__item', overdue && 'is-overdue', !pending && 'is-closed')}>
        <div className="pay-list__main">
          {!hideClient && (
            <button type="button" className="link pay-list__client" onClick={() => navigate({ name: 'klient', clientId: r.clientId })}>
              {clientName(c)}
            </button>
          )}
          <span className="pay-list__what">{paymentRequestTitle(clinic, r)}</span>
          <span className="pay-list__meta tnum">
            {PAYMENT_PURPOSE_LABEL[r.purpose]} · VS {r.vs} · {r.createdBy === 'client' ? 'z portálu' : 'z recepce'}
          </span>
        </div>
        <div className="pay-list__money">
          <span className="pay-list__amount tnum">{formatMoney(r.amount)}</span>
          {pending ? (
            <span className={cx('pay-list__due tnum', overdue && 'text-warning')}>
              {overdue ? 'po splatnosti od ' : 'splatnost '}
              {formatDateTimeShort(r.dueAt)}
            </span>
          ) : (
            <span className="pay-list__due tnum">
              <Badge tone={r.status === 'paid' ? 'success' : 'neutral'} dot={r.status === 'paid' ? true : 'ring'}>
                {PAYMENT_REQUEST_STATUS_LABEL[r.status]}
              </Badge>
              {r.status === 'paid' && r.paidAt ? ` ${formatDateTimeShort(r.paidAt)}` : ''}
            </span>
          )}
        </div>
        <div className="pay-list__actions">
          {pending && <IconButton icon="qr" size="sm" variant="secondary" label={`Zobrazit QR kód (VS ${r.vs})`} onClick={() => setView(r.id)} />}
          {canManage && pending && (
            <>
              <Button size="sm" variant="soft" icon="check" onClick={() => openConfirm(r)}>
                Potvrdit
              </Button>
              <IconButton icon="x" size="sm" label={`Zrušit QR platbu (VS ${r.vs})`} onClick={() => setCancelling(r)} />
            </>
          )}
          {canManage && r.status === 'cancelled' && (
            <Button size="sm" variant="soft" icon="check" onClick={() => openConfirm(r)}>
              Platba přišla
            </Button>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className={cx('pay-pending', className)}>
      {searchable && (
        <div className="pay-pending__search">
          <Input
            type="search"
            inputMode="numeric"
            prefixIcon="search"
            value={query}
            onValueChange={setQuery}
            placeholder="Najít platbu podle VS"
            aria-label="Najít platbu podle variabilního symbolu (i zaplacené a zrušené)"
          />
          <p className="pay-pending__searchhint">
            Najde i zaplacené a zrušené výzvy. Když platba přišla podle už zrušené výzvy, potvrďte ji – uhradí termín, nebo se připíše
            klientovi na kredit.
          </p>
        </div>
      )}

      {searching ? (
        found.length ? (
          <ul className="pay-list" aria-label="Nalezené platby">
            {found.map(row)}
          </ul>
        ) : (
          <EmptyState
            compact
            icon="search"
            title="Žádná platba s tímto VS"
            text="Zkontrolujte variabilní symbol na výpisu. Platby bez výzvy (např. převod bez VS) zapište na kartě klienta jako dobití kreditu."
          />
        )
      ) : list.length === 0 ? (
        hideEmpty ? null : (
          <EmptyState
            compact
            icon="qr"
            title="Žádné čekající QR platby"
            text={
              emptyText ??
              'Když klient zvolí platbu QR převodem nebo ji vystavíte na recepci, objeví se tady, dokud platbu nepotvrdíte podle výpisu z účtu.'
            }
          />
        )
      ) : (
        <>
          {overdueCount > 0 && (
            <p className="pay-pending__summary">
              <Badge tone="warning" dot="square">
                {countLabel(overdueCount, ['platba', 'platby', 'plateb'])} po splatnosti
              </Badge>
            </p>
          )}
          <ul className="pay-list">{list.slice(0, shown).map(row)}</ul>
          {expandable && list.length > shown && (
            <button type="button" className="link pay-pending__more" onClick={() => setShown((n) => n + limit)}>
              Zobrazit další ({list.length - shown})
            </button>
          )}
        </>
      )}

      <QrPaymentDialog open={!!view} onClose={() => setView(null)} requestId={view} readOnly={!canManage} />
      <ConfirmDialog
        open={!!confirming}
        onClose={() => setConfirming(null)}
        title="Potvrdit přijetí platby?"
        message={
          confirming
            ? [
                `${formatMoney(confirming.amount)} · VS ${confirming.vs} · ${clientName(getClient(clinic, confirming.clientId))}.`,
                outcomeText(clinic, confirming),
                'Zkontrolujte, že platba s tímto variabilním symbolem je na výpisu z účtu.',
              ]
                .filter(Boolean)
                .join(' ')
            : undefined
        }
        confirmLabel="Platba přijata"
        onConfirm={doConfirm}
        confirmDisabled={!paidOn || !isValidLocalDate(paidOn) || paidOn > today || paidOn < minPaidOn}
      >
        <Field
          label="Datum připsání"
          hint="Podle výpisu z účtu."
          error={paidOn && isValidLocalDate(paidOn) && paidOn < minPaidOn ? 'Platba nemohla přijít před vystavením výzvy.' : undefined}
        >
          <Input type="date" value={paidOn} min={minPaidOn || undefined} max={today} onValueChange={setPaidOn} />
        </Field>
      </ConfirmDialog>
      <ConfirmDialog
        open={!!cancelling}
        onClose={() => setCancelling(null)}
        title="Zrušit QR platbu?"
        message={
          cancelling
            ? `Výzva VS ${cancelling.vs} na ${formatMoney(cancelling.amount)} se zruší. Platbu lze pak přijmout jinak. Když podle ní peníze přesto přijdou, najdete ji na Vstupech podle VS a potvrdíte.`
            : undefined
        }
        confirmLabel="Zrušit QR platbu"
        tone="danger"
        onConfirm={doCancel}
      />
    </div>
  );
}
