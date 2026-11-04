import { useEffect, useRef, useState } from 'react';
import type { Id } from '../../domain/types';
import { cancelPaymentRequest, confirmPaymentRequest, createPaymentRequest, sendManualMessage, type CreatePaymentRequestInput } from '../../engine/commands';
import { formatMoney } from '../../engine/format';
import { getPaymentRequest, paymentRequestEmail, paymentRequestTitle, qrAvailable } from '../../engine/payments';
import { clientName, getClient } from '../../engine/selectors';
import { useActor, useClinic, useCommand } from '../../store/hooks';
import { Button, Callout, ConfirmDialog, Dialog, Spinner } from '../../ui';
import { QrPaymentCard } from './QrPaymentCard';
import './payments.css';

export interface QrPaymentDialogProps {
  open: boolean;
  onClose: () => void;
  /** Existující platební výzva. */
  requestId?: Id | null;
  /**
   * Údaje pro novou výzvu – vytvoří se při otevření dialogu (k rezervaci a poplatku se použije už čekající výzva).
   * Použije se, jen když chybí `requestId`.
   */
  create?: CreatePaymentRequestInput | null;
  /** Po potvrzení platby („Platba přijata“). */
  onPaid?: (requestId: Id) => void;
  /** Po zrušení výzvy. */
  onCancelled?: (requestId: Id) => void;
  /** Jen zobrazit QR a údaje (bez potvrzení a zrušení) – např. pro roli bez přístupu k financím. */
  readOnly?: boolean;
}

/**
 * QR platba na recepci: personál ukáže klientovi QR kód, po zaplacení potvrdí „Platba přijata“, případně pošle
 * platební údaje e-mailem (simulace odeslání) nebo výzvu zruší. Zavřením dialogu zůstane výzva mezi čekajícími.
 */
export function QrPaymentDialog({ open, onClose, requestId, create, onPaid, onCancelled, readOnly }: QrPaymentDialogProps): JSX.Element | null {
  const clinic = useClinic();
  const actor = useActor();
  const run = useCommand();
  const [createdId, setCreatedId] = useState<Id | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const attempted = useRef(false);

  // nová výzva vznikne jednou při otevření (ref chrání i před dvojím spuštěním efektu ve StrictMode)
  useEffect(() => {
    if (!open) {
      attempted.current = false;
      setCreatedId(null);
      setError(null);
      setConfirmCancel(false);
      return;
    }
    if (requestId || !create || attempted.current) return;
    attempted.current = true;
    const r = run(createPaymentRequest, create, { quiet: true });
    if (r.ok) setCreatedId(r.value);
    else setError(r.error);
  }, [open, requestId, create, run]);

  const id = requestId ?? createdId;
  const req = id ? getPaymentRequest(clinic, id) : undefined;
  const client = req ? getClient(clinic, req.clientId) : undefined;
  const canManage = !readOnly && actor.role !== 'client' && actor.role !== 'therapist';
  const pending = req?.status === 'pending';
  const scannable = qrAvailable(clinic);
  // Kdo platbu potvrzuje: majitelka a recepce samy, ostatní (terapeut, jen zobrazení) se jen dozví, že to udělá recepce.
  const hint = canManage
    ? `${scannable ? 'Klient naskenuje QR kód v aplikaci své banky. ' : ''}Po připsání platby ji potvrďte – do té doby zůstane výzva mezi čekajícími platbami.`
    : `${scannable ? 'Klient naskenuje QR kód v aplikaci své banky. ' : ''}Platbu po připsání na účet potvrdí recepce.`;

  const confirm = (): void => {
    if (!req) return;
    const r = run(confirmPaymentRequest, { requestId: req.id }, { success: `Platba ${formatMoney(req.amount)} přijata` });
    if (r.ok) {
      onPaid?.(req.id);
      onClose();
    }
  };
  const sendEmail = (): void => {
    if (!req || !client) return;
    const mail = paymentRequestEmail(clinic, req);
    run(sendManualMessage, { clientId: client.id, channel: 'email', subject: mail.subject, body: mail.body }, { success: 'Platební údaje odeslány e-mailem (simulace odeslání)', quiet: true });
  };
  const cancel = (): void => {
    if (!req) return;
    const r = run(cancelPaymentRequest, { requestId: req.id, reason: 'Zrušeno na recepci' }, { success: 'QR platba zrušena' });
    if (r.ok) {
      onCancelled?.(req.id);
      onClose();
    }
  };

  let body: JSX.Element;
  if (error) {
    body = (
      <Callout tone="danger" title="QR platbu nelze vystavit">
        {error}
      </Callout>
    );
  } else if (!req) {
    body = (
      <div className="pay-dialog__loading">
        <Spinner size={20} label="Připravuji QR platbu" />
      </div>
    );
  } else {
    body = (
      <div className="pay-dialog">
        <QrPaymentCard request={req} title={`${paymentRequestTitle(clinic, req)}${client ? ' · ' + clientName(client) : ''}`} />
        {pending && <p className="pay-dialog__hint">{hint}</p>}
        {pending && canManage && (
          <div className="pay-dialog__more">
            <Button
              variant="ghost"
              size="sm"
              icon="mail"
              onClick={sendEmail}
              disabled={!client?.email}
              title={client?.email ? undefined : 'Klient nemá vyplněný e-mail'}
            >
              Poslat platební údaje e-mailem
            </Button>
            <Button variant="ghost" size="sm" icon="x" onClick={() => setConfirmCancel(true)}>
              Zrušit QR platbu
            </Button>
          </div>
        )}
        {pending && canManage && !client?.email && <p className="pay-dialog__note">Klient nemá vyplněný e-mail – údaje mu sdělte jinak.</p>}
      </div>
    );
  }

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title="QR platba"
        size="lg"
        footer={
          pending && canManage ? (
            <>
              <Button variant="secondary" onClick={onClose}>
                Zavřít
              </Button>
              <Button variant="primary" icon="check" onClick={confirm}>
                Platba přijata
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={onClose}>
              Zavřít
            </Button>
          )
        }
      >
        {body}
      </Dialog>
      <ConfirmDialog
        open={open && confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Zrušit QR platbu?"
        message={req ? `Výzva VS ${req.vs} na ${formatMoney(req.amount)} se zruší. Platbu lze pak přijmout jinak.` : undefined}
        confirmLabel="Zrušit QR platbu"
        tone="danger"
        onConfirm={cancel}
      />
    </>
  );
}
