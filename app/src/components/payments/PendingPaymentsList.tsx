import { useState } from 'react';
import type { Id, PaymentRequest } from '../../domain/types';
import { confirmPaymentRequest } from '../../engine/commands';
import { formatDateTimeShort, formatMoney } from '../../engine/format';
import { PAYMENT_PURPOSE_LABEL } from '../../engine/qr';
import { clientName, getClient } from '../../engine/selectors';
import { useClinic, useCommand, useNow } from '../../store/hooks';
import { navigate } from '../../store/session';
import { Badge, Button } from '../../ui';
import { QrPaymentDialog } from './QrPaymentDialog';

export interface PendingPaymentsListProps {
  requests: PaymentRequest[];
  /** Jméno klienta s odkazem na kartu (v přehledech; na kartě klienta ne). */
  showClient?: boolean;
  /** Kolik řádků ukázat; zbytek shrnout. */
  limit?: number;
  emptyText?: string;
}

/** Čekající QR platby: potvrzení přijetí podle VS z výpisu, zobrazení QR, zrušení výzvy (v dialogu). */
export function PendingPaymentsList({ requests, showClient, limit, emptyText = 'Žádné platby nečekají na připsání.' }: PendingPaymentsListProps): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const run = useCommand();
  const [openId, setOpenId] = useState<Id | null>(null);
  const [expanded, setExpanded] = useState(false);
  const collapsible = !!limit && requests.length > limit;
  const shown = collapsible && !expanded ? requests.slice(0, limit) : requests;

  if (!requests.length) return <p className="pqr__empty">{emptyText}</p>;

  return (
    <div className="pqr-wrap">
      <ul className="pqr">
        {shown.map((r) => {
          const c = getClient(clinic, r.clientId);
          const overdue = r.dueAt < now;
          return (
            <li key={r.id} className="pqr__row">
              <div className="pqr__main">
                <div className="pqr__title">
                  {showClient && (
                    <button type="button" className="pqr__client" onClick={() => navigate({ name: 'klient', clientId: r.clientId })}>
                      {c ? clientName(c) : 'Klient'}
                    </button>
                  )}
                  <span className="pqr__label">{r.label}</span>
                </div>
                <div className="pqr__meta">
                  <span className="tnum">VS {r.vs}</span>
                  <span aria-hidden="true">·</span>
                  <span>{PAYMENT_PURPOSE_LABEL[r.purpose]}</span>
                  <span aria-hidden="true">·</span>
                  <span className={overdue ? 'pqr__overdue' : undefined}>{overdue ? `po splatnosti (${formatDateTimeShort(r.dueAt)})` : `splatné do ${formatDateTimeShort(r.dueAt)}`}</span>
                  {r.clientNotifiedAt && (
                    <Badge tone="info" size="sm" dot="ring">
                      Klient hlásí odeslání
                    </Badge>
                  )}
                </div>
              </div>
              <span className="pqr__amount tnum">{formatMoney(r.amount)}</span>
              <div className="pqr__actions">
                <Button size="sm" variant="ghost" onClick={() => setOpenId(r.id)}>
                  Detail a QR
                </Button>
                <Button size="sm" variant="secondary" icon="check" onClick={() => run(confirmPaymentRequest, { requestId: r.id }, { success: (v) => v.message })}>
                  Přijato
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {collapsible && (
        <p className="pqr__more">
          <button type="button" className="link" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Zobrazit méně' : `Zobrazit všechny (${requests.length})`}
          </button>
        </p>
      )}
      <QrPaymentDialog open={!!openId} requestId={openId ?? undefined} onClose={() => setOpenId(null)} />
    </div>
  );
}
