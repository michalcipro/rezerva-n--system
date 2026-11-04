import { useMemo } from 'react';
import { PendingPaymentsList } from '../../components/payments';
import { countLabel, formatMoney, formatNumber } from '../../engine/format';
import { pendingPaymentRequests } from '../../engine/qr';
import { useActor, useClinic, useNow } from '../../store/hooks';
import { navigate } from '../../store/session';
import { Card, CardHeader, Icon, cx } from '../../ui';
import { qrUnavailableReason } from './qrStaff';
import './payments.css';

export interface PendingPaymentsCardProps {
  /** Kolik výzev ukázat, než se seznam rozbalí (výchozí 5). */
  limit?: number;
  className?: string;
}

/**
 * Přehled pro recepci a majitelku: QR platby, které čekají na připsání na účet – počet, celková
 * částka a kolik je po splatnosti. Přijetí se potvrzuje podle variabilního symbolu na výpisu.
 * Rolím bez přístupu k financím (terapeut) se karta nezobrazí.
 */
export function PendingPaymentsCard({ limit = 5, className }: PendingPaymentsCardProps): JSX.Element | null {
  const clinic = useClinic();
  const now = useNow();
  const actor = useActor();
  const requests = useMemo(() => pendingPaymentRequests(clinic), [clinic]);
  if (actor.role !== 'owner' && actor.role !== 'reception') return null;

  const total = requests.reduce((sum, r) => sum + r.amount, 0);
  const overdue = requests.filter((r) => r.dueAt < now).length;
  const notified = requests.filter((r) => r.clientNotifiedAt).length;
  const unavailable = qrUnavailableReason(clinic.settings.payments);

  return (
    <Card as="section" aria-label="Čekající QR platby" className={cx('pay-card', className)}>
      <CardHeader title="Čekající QR platby" meta={requests.length ? countLabel(requests.length, ['platba', 'platby', 'plateb']) : undefined} />
      {requests.length === 0 ? (
        <p className="pay-card__empty">
          {unavailable ? (
            <>
              <Icon name="info" size={16} />
              <span>
                {unavailable}{' '}
                {actor.role === 'owner' && (
                  <button type="button" className="link" onClick={() => navigate({ name: 'nastaveni' })}>
                    Otevřít nastavení
                  </button>
                )}
              </span>
            </>
          ) : (
            <>
              <Icon name="checkCircle" size={16} />
              <span>Žádná QR platba nečeká na připsání.</span>
            </>
          )}
        </p>
      ) : (
        <>
          <p className="statline pay-card__stats">
            <span>
              <strong>{formatMoney(total)}</strong> celkem
            </span>
            {overdue > 0 && (
              <span className="pay-card__overdue">
                <strong>{formatNumber(overdue)}</strong> po splatnosti
              </span>
            )}
            {notified > 0 && (
              <span>
                <strong>{formatNumber(notified)}</strong> {notified === 1 ? 'klient hlásí' : notified < 5 ? 'klienti hlásí' : 'klientů hlásí'} odeslání
              </span>
            )}
          </p>
          <PendingPaymentsList requests={requests} showClient limit={limit} />
          <p className="pay-card__foot">Přijetí potvrďte podle variabilního symbolu na výpisu z účtu.</p>
        </>
      )}
    </Card>
  );
}
