import { useState } from 'react';
import type { Id } from '../../domain/types';
import { cancelPaymentRequest, confirmPaymentRequest, createPaymentRequest, receiveQrPayment, type PaymentRequestInput } from '../../engine/commands';
import { nextVs, pendingRequestFor, qrReady } from '../../engine/qr';
import { getClient } from '../../engine/selectors';
import { useClinic, useCommand, useNow } from '../../store/hooks';
import { navigate, useSession } from '../../store/session';
import { Button, Callout, Dialog } from '../../ui';
import { QrPaymentCard } from './QrPaymentCard';

export interface QrPaymentDraft {
  /** Co se platí – vstup pro příkazy receiveQrPayment / createPaymentRequest. */
  input: PaymentRequestInput;
  /** Popis platby, např. „Permanentka Fyzio 10“. */
  label: string;
  amount: number;
}

export interface QrPaymentDialogProps {
  open: boolean;
  onClose: () => void;
  /** Existující výzva: ukázat QR, potvrdit přijetí, případně výzvu zrušit. */
  requestId?: Id;
  /** Nová platba na recepci – výzva vznikne až potvrzením (nebo „Zaplatí později“). */
  draft?: QrPaymentDraft;
  /** Po zaplacení (`paid`) nebo po vytvoření výzvy k pozdější úhradě. */
  onDone?: (result: { requestId: Id; paid: boolean }) => void;
}

/**
 * Recepce: klient naskenuje QR v bankovní aplikaci a zaplatí; personál po potvrzení platby klikne
 * „Platba přijata“. Varianta „Zaplatí později“ vytvoří platební výzvu a pošle údaje e-mailem.
 */
export function QrPaymentDialog(props: QrPaymentDialogProps): JSX.Element | null {
  if (!props.open) return null;
  return <QrPaymentDialogInner {...props} />;
}

function QrPaymentDialogInner({ onClose, requestId, draft, onDone }: QrPaymentDialogProps): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const run = useCommand();
  const session = useSession();
  // variabilní symbol nové platby se určí jednou při otevření, aby se QR nepřekresloval
  const [draftVs] = useState(() => nextVs(clinic, now));

  const linked =
    draft && (draft.input.purpose === 'booking' || draft.input.purpose === 'storno_fee') && draft.input.bookingId
      ? pendingRequestFor(clinic, draft.input.bookingId, draft.input.purpose)
      : undefined;
  const request = requestId ? clinic.paymentRequests.find((r) => r.id === requestId) : linked;
  const clientId = request?.clientId ?? draft?.input.clientId ?? '';
  const client = getClient(clinic, clientId);
  const ready = qrReady(clinic.settings.payments);
  const pending = request ? request.status === 'pending' : true;

  const finish = (result: { requestId: Id; paid: boolean }): void => {
    onDone?.(result);
    onClose();
  };

  const accept = (): void => {
    if (request) {
      const r = run(confirmPaymentRequest, { requestId: request.id }, { success: (v) => v.message });
      if (r.ok) finish({ requestId: request.id, paid: true });
    } else if (draft) {
      const r = run(receiveQrPayment, { ...draft.input, vs: draftVs }, { success: (v) => v.message });
      if (r.ok) finish({ requestId: r.value.requestId, paid: true });
    }
  };

  const later = (): void => {
    if (!draft) return;
    const r = run(createPaymentRequest, { ...draft.input, vs: draftVs, sendEmail: true }, { success: 'Platební výzva vytvořena' });
    if (r.ok) finish({ requestId: r.value.requestId, paid: false });
  };

  const cancelRequest = (): void => {
    if (!request) return;
    const r = run(cancelPaymentRequest, { requestId: request.id }, { success: 'Výzva zrušena' });
    if (r.ok) onClose();
  };

  let footer: JSX.Element;
  if (!ready && !request) {
    footer = <Button onClick={onClose}>Zavřít</Button>;
  } else if (!pending) {
    footer = <Button onClick={onClose}>Zavřít</Button>;
  } else {
    footer = (
      <>
        {request ? (
          <Button variant="danger-secondary" onClick={cancelRequest}>
            Zrušit výzvu
          </Button>
        ) : (
          <Button variant="ghost" onClick={onClose}>
            Zrušit
          </Button>
        )}
        {!request && draft && (
          <Button variant="secondary" icon="send" onClick={later}>
            {client?.email ? 'Zaplatí později (poslat e-mailem)' : 'Zaplatí později'}
          </Button>
        )}
        <Button variant="primary" icon="check" onClick={accept}>
          Platba přijata
        </Button>
      </>
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title="Platba QR kódem"
      description={
        request
          ? 'Klient platí převodem podle variabilního symbolu. Až peníze dorazí na účet (nebo vám klient ukáže potvrzení), potvrďte přijetí.'
          : 'Ať klient naskenuje kód v bankovní aplikaci a zaplatí. Jakmile vám ukáže potvrzení platby, klikněte na Platba přijata.'
      }
      footer={footer}
    >
      {!ready && !request ? (
        <Callout
          tone="warning"
          title="QR platba není nastavená"
          actions={
            session.role === 'owner' ? (
              <Button
                size="sm"
                onClick={() => {
                  onClose();
                  navigate({ name: 'nastaveni' });
                }}
              >
                Otevřít nastavení
              </Button>
            ) : undefined
          }
        >
          Doplňte číslo účtu kliniky v Nastavení → Platby a zapněte QR platbu.
        </Callout>
      ) : request ? (
        <QrPaymentCard
          clinic={clinic}
          clientId={request.clientId}
          amount={request.amount}
          vs={request.vs}
          label={request.label}
          dueAt={request.dueAt}
          now={now}
          status={request.status}
          hint={request.clientNotifiedAt ? 'Klient v portálu oznámil, že platbu odeslal.' : undefined}
        />
      ) : draft ? (
        <QrPaymentCard clinic={clinic} clientId={draft.input.clientId} amount={draft.amount} vs={draftVs} label={draft.label} />
      ) : null}
    </Dialog>
  );
}
