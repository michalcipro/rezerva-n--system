import type { ReactNode } from 'react';
import { copyText } from '../../app/clipboard';
import type { ClinicState, Id, LocalDateTime, PaymentRequestStatus } from '../../domain/types';
import { formatDateTimeShort, formatMoney } from '../../engine/format';
import { formatIban, paymentMessage, paymentSpayd } from '../../engine/qr';
import { Badge, Callout, DescriptionList, IconButton, toast } from '../../ui';
import { QrCode } from './QrCode';

export interface QrPaymentCardProps {
  clinic: ClinicState;
  clientId: Id;
  amount: number;
  vs: string;
  /** Co se platí, např. „Permanentka Fyzio 10“. */
  label: string;
  dueAt?: LocalDateTime;
  /** Pro vyznačení „po splatnosti“. */
  now?: LocalDateTime;
  status?: PaymentRequestStatus;
  /** Velikost QR v px. */
  qrSize?: number;
  /** Text pod údaji (např. co se stane po zaplacení). */
  hint?: ReactNode;
  /** Tlačítka pod údaji. */
  actions?: ReactNode;
  className?: string;
}

function Copyable({ value, copyValue, what }: { value: string; copyValue?: string; what: string }): JSX.Element {
  return (
    <span className="qrpay__copy">
      <span className="qrpay__value tnum">{value}</span>
      <IconButton
        icon="copy"
        size="sm"
        label={`Zkopírovat ${what}`}
        onClick={async () => {
          if (await copyText(copyValue ?? value)) toast.success(`${what.charAt(0).toUpperCase()}${what.slice(1)} zkopírován`);
          else toast.error('Kopírování se nepovedlo');
        }}
      />
    </span>
  );
}

/** QR Platba s platebními údaji – pro recepci (ukázat klientovi) i pro klienta v portálu. */
export function QrPaymentCard({ clinic, clientId, amount, vs, label, dueAt, now, status, qrSize = 196, hint, actions, className }: QrPaymentCardProps): JSX.Element {
  const p = clinic.settings.payments;
  const spayd = paymentSpayd(clinic, { clientId, amount, vs, label });
  const overdue = status === 'pending' && !!dueAt && !!now && dueAt < now;
  const items = [
    { term: 'Částka', detail: <span className="qrpay__value tnum">{formatMoney(amount)}</span> },
    { term: 'Účet', detail: <Copyable value={p.accountNumber || formatIban(p.iban)} what="číslo účtu" /> },
    { term: 'IBAN', detail: <Copyable value={formatIban(p.iban)} copyValue={p.iban} what="IBAN" /> },
    { term: 'VS', detail: <Copyable value={vs} what="variabilní symbol" /> },
    { term: 'Zpráva', detail: <span className="qrpay__msg">{paymentMessage(clinic, { clientId, label })}</span> },
  ];
  if (dueAt && status !== 'paid' && status !== 'cancelled')
    items.push({
      term: 'Splatnost',
      detail: (
        <span className={overdue ? 'qrpay__overdue' : undefined}>
          {formatDateTimeShort(dueAt)}
          {overdue ? ' · po splatnosti' : ''}
        </span>
      ),
    });

  return (
    <section className={['qrpay', className].filter(Boolean).join(' ')} aria-label={`QR Platba ${formatMoney(amount)}`}>
      <div className="qrpay__code">
        <QrCode value={spayd} size={qrSize} label={`QR Platba ${formatMoney(amount)}, variabilní symbol ${vs}`} />
        <span className="qrpay__brand">QR Platba</span>
      </div>
      <div className="qrpay__body">
        <div className="qrpay__head">
          <span className="qrpay__amount tnum">{formatMoney(amount)}</span>
          {status === 'pending' && (
            <Badge tone={overdue ? 'danger' : 'warning'} size="sm" dot="ring">
              {overdue ? 'Po splatnosti' : 'Čeká na připsání'}
            </Badge>
          )}
          {status === 'paid' && (
            <Badge tone="success" size="sm" dot>
              Zaplaceno
            </Badge>
          )}
          {status === 'cancelled' && (
            <Badge tone="neutral" size="sm">
              Zrušeno
            </Badge>
          )}
        </div>
        <p className="qrpay__label">{label}</p>
        <DescriptionList items={items} termWidth={84} plain />
        {p.demoAccount && (
          <Callout tone="warning" title="Ukázkový účet">
            Účet je smyšlený z testovacích dat – platbu neodesílejte. Skutečný účet kliniky se nastaví v Nastavení → Platby.
          </Callout>
        )}
        {hint && <div className="qrpay__hint">{hint}</div>}
        {actions && <div className="qrpay__actions">{actions}</div>}
      </div>
    </section>
  );
}
