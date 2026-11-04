import { useState } from 'react';
import type { Booking, Id, PaymentRequest } from '../domain/types';
import { QrPaymentCard } from '../components/payments';
import { cancelPaymentRequest, createPaymentRequest } from '../engine/commands';
import { formatDateTimeShort, formatMoney } from '../engine/format';
import { getPaymentRequest, isPaymentRequestOverdue, paymentRequestTitle, qrAvailable } from '../engine/payments';
import { useClinic, useCommand, useNow } from '../store/hooks';
import { Button, Callout, ConfirmDialog, Icon, cx, type ButtonProps } from '../ui';
import { usePortal } from './context';
import { dueLabel, qrAfterPayment } from './logic';
import { Sheet } from './parts';

/* ------------------------------------------------------------------ */
/* Vysvětlení před potvrzením                                          */
/* ------------------------------------------------------------------ */

/**
 * Vysvětlení QR platby při výběru způsobu platby: co se stane po potvrzení, do kdy zaplatit
 * a kdy se rezervace / permanentka / kredit potvrdí.
 */
export function QrPayNote({
  purpose,
  amount,
  due,
  packageTemplateId,
  bonus = 0,
}: {
  purpose: PaymentRequest['purpose'];
  amount: number;
  due: string;
  packageTemplateId?: Id;
  bonus?: number;
}): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  return (
    <Callout tone="accent" icon="qr" title="QR platba převodem">
      Po potvrzení vám ukážeme QR kód na {formatMoney(amount)}. Naskenujete ho v aplikaci své banky a zaplatíte {dueLabel(due, now)}.{' '}
      {qrAfterPayment(clinic, { purpose, amount, packageTemplateId }, bonus)}
    </Callout>
  );
}

/* ------------------------------------------------------------------ */
/* QR kód s údaji a postupem                                           */
/* ------------------------------------------------------------------ */

/** Co se stane s platbou odeslanou podle výzvy, která se mezitím zrušila (personál ji potvrdí podle VS). */
const ALREADY_PAID: Record<PaymentRequest['purpose'], string> = {
  booking: 'Pokud jste ji už odeslali, nic se neztratí – po připsání ji podle variabilního symbolu použijeme na termín, nebo vám ji připíšeme na kredit.',
  storno_fee: 'Pokud jste ji už odeslali, nic se neztratí – po připsání ji podle variabilního symbolu použijeme na poplatek, nebo vám ji připíšeme na kredit.',
  package: 'Pokud jste ji už odeslali, nic se neztratí – po připsání vám ji podle variabilního symbolu připíšeme na kredit a permanentku si z něj můžete koupit.',
  credit_topup: 'Pokud jste ji už odeslali, nic se neztratí – po připsání vám ji podle variabilního symbolu připíšeme na kredit.',
};

/** QR kód, platební údaje a srozumitelný postup – co udělat a co se stane po zaplacení. */
export function QrPaymentPanel({ request, bonus = 0 }: { request: PaymentRequest; bonus?: number }): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const overdue = isPaymentRequestOverdue(request, now);
  // Bez QR kódu (QR vypnutá nebo chybí účet) radí jen karta – postup se skenováním by si odporoval.
  const scannable = qrAvailable(clinic);
  return (
    <div className="por-qr">
      {request.status === 'paid' ? (
        <Callout tone="success" icon="checkCircle" title="Zaplaceno">
          Platbu jsme přijali{request.paidAt ? ` ${formatDateTimeShort(request.paidAt)}` : ''}. Děkujeme.
        </Callout>
      ) : request.status === 'cancelled' ? (
        <Callout tone="neutral" icon="info" title="QR platba je zrušená">
          Tuto platbu už neplaťte. {ALREADY_PAID[request.purpose]}
        </Callout>
      ) : overdue ? (
        <Callout tone="warning" title="Po splatnosti">
          Splatnost uplynula {formatDateTimeShort(request.dueAt)}. Pokud jste už zaplatili, nic nedělejte – platbu potvrdíme, jakmile ji uvidíme
          na účtu. Jinak prosím zaplaťte co nejdřív.
        </Callout>
      ) : null}
      <QrPaymentCard request={request} title={paymentRequestTitle(clinic, request)} className="por-qr__card" />
      {request.status === 'pending' && scannable && (
        <ol className="por-qr__steps">
          <li>Otevřete aplikaci své banky a naskenujte QR kód. Údaje můžete zadat i ručně.</li>
          <li>Zkontrolujte částku a variabilní symbol {request.vs} – podle něj platbu spárujeme – a platbu odešlete.</li>
          <li>{qrAfterPayment(clinic, request, bonus)}</li>
        </ol>
      )}
      {request.status === 'pending' && scannable && !overdue && (
        <p className="por-note">
          Zaplaťte prosím {dueLabel(request.dueAt, now)}. QR kód najdete kdykoli znovu v Účtu → Kredit a platby.
        </p>
      )}
    </div>
  );
}

const CANCEL_TEXT: Record<PaymentRequest['purpose'], { action: string; title: string; message: string; confirm: string }> = {
  booking: {
    action: 'Zaplatím jinak',
    title: 'Zaplatit jinak?',
    message: 'QR platbu zrušíme. Termín vám zůstane rezervovaný a zaplatíte ho na recepci.',
    confirm: 'Zrušit QR platbu',
  },
  storno_fee: {
    action: 'Zaplatím jinak',
    title: 'Zaplatit jinak?',
    message: 'QR platbu zrušíme a poplatek uhradíte na recepci.',
    confirm: 'Zrušit QR platbu',
  },
  package: {
    action: 'Zrušit objednávku',
    title: 'Zrušit objednávku permanentky?',
    message: 'Objednávku i QR platbu zrušíme, permanentka se nevystaví.',
    confirm: 'Zrušit objednávku',
  },
  credit_topup: {
    action: 'Zrušit dobití',
    title: 'Zrušit dobití kreditu?',
    message: 'Dobití i QR platbu zrušíme, kredit se nepřipíše.',
    confirm: 'Zrušit dobití',
  },
};

/** Odkaz „Zaplatím jinak / Zrušit objednávku“ s potvrzením. */
function CancelQrLink({ request, onCancelled }: { request: PaymentRequest; onCancelled?: () => void }): JSX.Element {
  const run = useCommand();
  const [open, setOpen] = useState(false);
  const text = CANCEL_TEXT[request.purpose];
  return (
    <>
      <button type="button" className="link por-qr__cancel" onClick={() => setOpen(true)}>
        {text.action}
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={text.title}
        message={`${text.message} Pokud jste už platbu odeslali, nerušte ji – potvrdíme ji podle variabilního symbolu.`}
        confirmLabel={text.confirm}
        cancelLabel="Ponechat"
        tone="danger"
        onConfirm={() => {
          const r = run(cancelPaymentRequest, { requestId: request.id, reason: 'Zrušeno klientem v portálu' }, { success: 'QR platba je zrušená', quiet: true });
          if (r.ok) onCancelled?.();
        }}
      />
    </>
  );
}

/** Spodní panel s QR kódem čekající platby (detail termínu, účet). */
export function QrRequestSheet({ requestId, onClose, bonus }: { requestId: Id | null; onClose: () => void; bonus?: number }): JSX.Element {
  const clinic = useClinic();
  const request = requestId ? getPaymentRequest(clinic, requestId) : undefined;
  return (
    <Sheet
      open={!!request}
      onClose={onClose}
      title="QR platba"
      footer={
        <Button variant="primary" size="lg" full onClick={onClose}>
          {request?.status === 'pending' ? 'Rozumím' : 'Zavřít'}
        </Button>
      }
    >
      {request && (
        <div className="por-stack">
          <QrPaymentPanel request={request} bonus={bonus} />
          {request.status === 'pending' && <CancelQrLink request={request} onCancelled={onClose} />}
        </div>
      )}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Seznam čekajících plateb                                            */
/* ------------------------------------------------------------------ */

/** Čekající QR platby klienta – klik ukáže QR kód. */
export function PendingQrList({ requests, className }: { requests: PaymentRequest[]; className?: string }): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const [openId, setOpenId] = useState<Id | null>(null);
  return (
    <>
      <ul className={cx('por-card por-card--list por-qrlist', className)}>
        {requests.map((r) => {
          const overdue = isPaymentRequestOverdue(r, now);
          const title = paymentRequestTitle(clinic, r);
          return (
            <li key={r.id}>
              <button
                type="button"
                className="por-qrrow"
                onClick={() => setOpenId(r.id)}
                aria-label={`${title}, ${formatMoney(r.amount)}, ${overdue ? 'po splatnosti' : 'čeká na platbu'} – zobrazit QR kód`}
              >
                <span className={cx('por-qrrow__icon', overdue && 'is-overdue')} aria-hidden="true">
                  <Icon name="qr" size={18} />
                </span>
                <span className="por-qrrow__body">
                  <span className="por-qrrow__title">{title}</span>
                  <span className={cx('por-qrrow__meta tnum', overdue && 'is-overdue')}>
                    {overdue ? `Po splatnosti od ${formatDateTimeShort(r.dueAt)}` : `Zaplaťte ${dueLabel(r.dueAt, now)}`} · VS {r.vs}
                  </span>
                </span>
                <span className="por-qrrow__amount tnum">{formatMoney(r.amount)}</span>
                <Icon name="chevronRight" size={18} className="por-qrrow__chev" />
              </button>
            </li>
          );
        })}
      </ul>
      <QrRequestSheet requestId={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Tlačítko „Zaplatit QR platbou“ k termínu nebo poplatku              */
/* ------------------------------------------------------------------ */

/**
 * Vystaví (nebo znovu použije) QR platbu k termínu či storno poplatku a předá ji k zobrazení (`onShow`).
 * Příkaz k termínu i poplatku vrací už čekající výzvu, takže opakované klepnutí nevytvoří druhou.
 * Panel s QR kódem drží obrazovka – tlačítko po vystavení platby zmizí (nahradí ho „Zobrazit QR kód“).
 */
export function QrPayButton({
  booking,
  purpose,
  onShow,
  children,
  ...button
}: {
  booking: Booking;
  purpose: 'booking' | 'storno_fee';
  onShow: (requestId: Id) => void;
  children: string;
} & Omit<ButtonProps, 'onClick' | 'children'>): JSX.Element {
  const run = useCommand();
  const { client } = usePortal();
  const start = (): void => {
    const r = run(createPaymentRequest, { clientId: client.id, purpose, bookingId: booking.id }, { quiet: true });
    if (r.ok) onShow(r.value);
  };
  return (
    <Button icon="qr" {...button} onClick={start}>
      {children}
    </Button>
  );
}
