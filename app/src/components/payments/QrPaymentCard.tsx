import type { ReactNode } from 'react';
import type { PaymentRequest } from '../../domain/types';
import { formatDateTimeShort, formatMoney } from '../../engine/format';
import { paymentRequestSpayd, qrAvailable } from '../../engine/payments';
import { formatIban } from '../../engine/qr';
import { useActor, useClinic, useNow } from '../../store/hooks';
import { Badge, Callout, cx, IconButton } from '../../ui';
import { copyToClipboard } from './copy';
import { QrCode } from './QrCode';
import './payments.css';

export interface QrPaymentCardProps {
  /** Platební výzva (stačí částka, VS a zpráva; se splatností a stavem se ukáže i „po splatnosti“ / „zaplaceno“). */
  request: Pick<PaymentRequest, 'amount' | 'vs' | 'message'> & Partial<Pick<PaymentRequest, 'dueAt' | 'status'>>;
  /** Nadpis nad údaji, např. „Platba za termín · St 14. 10. 9:00“. */
  title?: ReactNode;
  /** Menší QR kód (seznamy, úzké panely). */
  compact?: boolean;
  className?: string;
}

interface Row {
  term: string;
  value: string;
  /** Text do schránky (jinak `value`). */
  copy?: string;
  /** Hláška po zkopírování (rod podle pole). */
  copied: string;
  copyLabel: string;
  mono?: boolean;
  /** Údaj potřebný jen k zaplacení (účet, IBAN) – u zaplacené nebo zrušené výzvy se neukazuje. */
  payOnly?: boolean;
}

/**
 * QR Platba: QR kód, částka, číslo účtu, IBAN, VS, zpráva pro příjemce a tlačítka kopírovat. Zaplacená nebo
 * zrušená výzva se už nedá zaplatit: bez QR kódu, účtu a kopírování – jen částka, VS a zpráva pro přehled.
 */
export function QrPaymentCard({ request, title, compact, className }: QrPaymentCardProps): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const actor = useActor();
  const pay = clinic.settings.payments;
  const payable = request.status === undefined || request.status === 'pending';
  const available = qrAvailable(clinic);
  const spayd = available && payable ? paymentRequestSpayd(clinic, request) : '';
  const overdue = request.status === 'pending' && !!request.dueAt && request.dueAt < now;
  const rows: Row[] = [
    { term: 'Částka', value: formatMoney(request.amount), copy: String(Math.round(request.amount)), copied: 'Částka zkopírována', copyLabel: 'Kopírovat částku' },
    { term: 'Číslo účtu', value: pay?.accountNumber ?? '', copied: 'Číslo účtu zkopírováno', copyLabel: 'Kopírovat číslo účtu', mono: true, payOnly: true },
    { term: 'IBAN', value: formatIban(pay?.iban ?? ''), copy: pay?.iban ?? '', copied: 'IBAN zkopírován', copyLabel: 'Kopírovat IBAN', mono: true, payOnly: true },
    { term: 'Variabilní symbol', value: request.vs, copied: 'Variabilní symbol zkopírován', copyLabel: 'Kopírovat variabilní symbol', mono: true },
    { term: 'Zpráva pro příjemce', value: request.message, copied: 'Zpráva zkopírována', copyLabel: 'Kopírovat zprávu pro příjemce' },
  ];

  return (
    <section className={cx('pay-card', compact && 'pay-card--compact', className)} aria-label="Platební údaje pro QR platbu">
      {payable &&
        (available ? (
          <figure className="pay-card__qr">
            <QrCode value={spayd} size={compact ? 152 : 208} label={`QR Platba ${formatMoney(request.amount)}, variabilní symbol ${request.vs}`} />
            <figcaption className="pay-card__caption">
              <span className="pay-card__brand">QR Platba</span>
              <span>Naskenujte v aplikaci své banky</span>
            </figcaption>
          </figure>
        ) : (
          <Callout tone="warning" title="QR kód nelze zobrazit" className="pay-card__missing">
            {actor.role !== 'client'
              ? pay?.accountNumber
                ? 'V Nastavení → Platby je QR platba vypnutá. Platební údaje níže lze zadat ručně.'
                : 'V Nastavení → Platby chybí číslo účtu – bez něj klient nemá kam zaplatit. Doplňte ho, nebo platbu přijměte jinak.'
              : pay?.accountNumber
                ? 'QR kód teď nejde zobrazit. Zaplatit můžete převodem podle údajů níže, nebo se domluvte na recepci.'
                : 'QR kód teď nejde zobrazit. Domluvte se prosím na recepci, jak platbu dokončit.'}
          </Callout>
        ))}
      <div className="pay-card__body">
        {title != null && <p className="pay-card__title">{title}</p>}
        <p className="pay-card__amount tnum">{formatMoney(request.amount)}</p>
        {request.status === 'paid' && (
          <Badge tone="success" dot>
            Zaplaceno
          </Badge>
        )}
        {request.status === 'cancelled' && (
          <Badge tone="neutral" dot="ring">
            Platba zrušena
          </Badge>
        )}
        <dl className="pay-card__rows">
          {rows
            .filter((r) => r.value && (payable || !r.payOnly))
            .map((r) => (
              <div key={r.term} className="pay-card__row">
                <dt className="pay-card__term">{r.term}</dt>
                <dd className="pay-card__value">
                  <span className={cx('pay-card__text', r.mono && 'tnum')}>{r.value}</span>
                  {payable && <IconButton icon="copy" size="sm" label={r.copyLabel} onClick={() => copyToClipboard(r.copy ?? r.value, r.copied)} />}
                </dd>
              </div>
            ))}
          {request.dueAt && request.status !== 'paid' && request.status !== 'cancelled' && (
            <div className="pay-card__row">
              <dt className="pay-card__term">Splatnost</dt>
              <dd className="pay-card__value">
                <span className="pay-card__text tnum">{formatDateTimeShort(request.dueAt)}</span>
                {overdue && (
                  <Badge tone="warning" dot="square">
                    po splatnosti
                  </Badge>
                )}
              </dd>
            </div>
          )}
        </dl>
      </div>
    </section>
  );
}
