/**
 * QR platby na straně personálu – společné pomocníky pro kalendář, kartu klienta a přehled.
 * Platební údaje a samotný dialog jsou ve sdílených komponentách (`components/payments`);
 * tady jsou jen texty, koncepty plateb pro dialog a upozornění „Čeká na QR platbu“.
 */
import type { Booking, ClinicState, Id, LocalDateTime, PackageTemplate, PaymentRequest, PaymentSettings } from '../../domain/types';
import type { QrPaymentDraft } from '../../components/payments';
import { formatDateTimeShort, formatDayShort, formatMoney, formatTime } from '../../engine/format';
import { qrReady } from '../../engine/qr';
import { getService } from '../../engine/selectors';
import { packageEntryIndex, type VisitContext } from '../../engine/visits';
import { Badge, Button, Callout, type MenuAction } from '../../ui';
import './payments.css';

/* ------------------------------------------------------------------ */
/* Dostupnost                                                          */
/* ------------------------------------------------------------------ */

/** Proč teď QR platbu nabídnout nejde (null = jde). */
export function qrUnavailableReason(p: PaymentSettings | undefined): string | null {
  if (qrReady(p)) return null;
  if (!p?.qrEnabled) return 'QR platba je vypnutá v Nastavení → Platby.';
  return 'Pro QR platbu nastavte účet v Nastavení → Platby.';
}

/** Položka „QR platba“ do nabídky způsobů úhrady (nedostupná = zašedlá s krátkým vysvětlením). */
export function qrMenuItem(p: PaymentSettings | undefined, onSelect: () => void): MenuAction {
  const ready = qrReady(p);
  return {
    id: 'qr',
    label: 'QR platba',
    icon: 'grid',
    disabled: !ready,
    hint: ready ? undefined : p?.qrEnabled ? 'nastavte účet' : 'vypnuto',
    onSelect,
  };
}

/* ------------------------------------------------------------------ */
/* Koncepty plateb pro QrPaymentDialog                                 */
/* ------------------------------------------------------------------ */

/** „Út 10. 11. 16:00“ – stejně jako v popisu výzvy, kterou vytvoří engine. */
export const whenLabel = (start: LocalDateTime): string => `${formatDayShort(start)} ${formatTime(start)}`;

/** Úhrada termínu (zbývající částka). */
export function bookingQrDraft(s: ClinicState, b: Booking): QrPaymentDraft {
  return {
    input: { clientId: b.clientId, purpose: 'booking', bookingId: b.id },
    label: `${getService(s, b.serviceId)?.name ?? 'Termín'} ${whenLabel(b.start)}`,
    amount: Math.max(0, b.price - b.payment.paidAmount),
  };
}

/** Úhrada storno poplatku / poplatku za nedostavení. */
export function feeQrDraft(b: Booking): QrPaymentDraft | null {
  if (!b.fee || b.fee.status !== 'due') return null;
  return {
    input: { clientId: b.clientId, purpose: 'storno_fee', bookingId: b.id },
    label: `${b.fee.reason === 'no_show' ? 'Poplatek za nedostavení' : 'Storno poplatek'} ${whenLabel(b.start)}`,
    amount: b.fee.amount,
  };
}

/** Nákup permanentky – permanentka vznikne až po zaplacení. */
export function packageQrDraft(clientId: Id, tpl: PackageTemplate): QrPaymentDraft {
  return { input: { clientId, purpose: 'package', packageTemplateId: tpl.id }, label: `Permanentka ${tpl.name}`, amount: tpl.priceCzk };
}

/** Dobití kreditu – připíše se (i s bonusem) až po zaplacení. */
export function topUpQrDraft(clientId: Id, amount: number): QrPaymentDraft {
  return { input: { clientId, purpose: 'credit_topup', amount }, label: 'Dobití kreditu', amount };
}

/* ------------------------------------------------------------------ */
/* Přehled vstupů                                                      */
/* ------------------------------------------------------------------ */

/** Předpočítané údaje pro `visitPaymentInfo` nad celým seznamem (pořadí vstupů, čekající výzvy). */
export function visitContextOf(s: ClinicState): VisitContext {
  const pending = new Map<Id, PaymentRequest>();
  for (const r of s.paymentRequests) if (r.status === 'pending' && r.purpose === 'booking' && r.bookingId) pending.set(r.bookingId, r);
  return { entryIndex: packageEntryIndex(s), pending };
}

/** „VS 26110007 · splatné do Čt 5. 11. 16:00“ nebo „VS … · po splatnosti (…)“. */
export function requestDueText(r: PaymentRequest, now: LocalDateTime): string {
  return r.dueAt < now ? `po splatnosti (${formatDateTimeShort(r.dueAt)})` : `splatné do ${formatDateTimeShort(r.dueAt)}`;
}

/* ------------------------------------------------------------------ */
/* Upozornění „Čeká na QR platbu“                                      */
/* ------------------------------------------------------------------ */

export interface QrRequestCalloutProps {
  request: PaymentRequest;
  now: LocalDateTime;
  title?: string;
  onShowQr: () => void;
  onConfirm: () => void;
  className?: string;
}

/** Čekající QR výzva u termínu nebo poplatku: VS, splatnost, „Ukázat QR“ a „Platba přijata“. */
export function QrRequestCallout({ request: r, now, title = 'Čeká na QR platbu', onShowQr, onConfirm, className }: QrRequestCalloutProps): JSX.Element {
  const overdue = r.dueAt < now;
  return (
    <Callout
      tone={overdue ? 'danger' : 'warning'}
      title={title}
      className={['pay-callout', className].filter(Boolean).join(' ')}
      actions={
        <>
          <Button size="sm" variant="secondary" icon="grid" onClick={onShowQr}>
            Ukázat QR
          </Button>
          <Button size="sm" variant="primary" icon="check" onClick={onConfirm}>
            Platba přijata
          </Button>
        </>
      }
    >
      <span className="pay-callout__line tnum">
        <strong>{formatMoney(r.amount)}</strong> · VS {r.vs} · <span className={overdue ? 'pay-callout__overdue' : undefined}>{requestDueText(r, now)}</span>
      </span>
      {r.clientNotifiedAt && (
        <span className="pay-callout__note">
          <Badge tone="info" size="sm" dot="ring">
            Klient hlásí odeslání
          </Badge>
          <span className="tnum">{formatDateTimeShort(r.clientNotifiedAt)}</span>
        </span>
      )}
    </Callout>
  );
}
