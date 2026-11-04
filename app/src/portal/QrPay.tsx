import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { ClinicState, Id, LocalDateTime, PaymentPurpose, PaymentRequest } from '../domain/types';
import { QrPaymentCard } from '../components/payments';
import { cancelPaymentRequest, confirmPaymentRequest, creditBonusFor, notifyPaymentSent } from '../engine/commands';
import { formatDateTimeShort, formatMoney } from '../engine/format';
import { isValidIban } from '../engine/qr';
import { getBooking } from '../engine/selectors';
import { useClinic, useCommand, useNow } from '../store/hooks';
import { dispatch } from '../store/store';
import { Button, Callout, ConfirmDialog, Icon, cx, toast, type IconName } from '../ui';
import { usePortal } from './context';
import { clientPendingRequests, isOverdue, paymentsCount, QR_ICON } from './logic';
import { StateChip } from './parts';
import './portal-payments.css';

/**
 * QR platba v klientském portálu: QR kód s platebními údaji, „Zaplatil(a) jsem“,
 * přehled čekajících plateb a testovací simulace připsání peněz.
 */

const PURPOSE_ICON: Record<PaymentPurpose, IconName> = {
  booking: 'calendarCheck',
  package: 'ticket',
  credit_topup: 'wallet',
  storno_fee: 'receipt',
};

/** Co se stane po zaplacení (text pod platebními údaji). */
export const QR_HINT: Record<PaymentPurpose, string> = {
  booking: 'Termín máte rezervovaný, po připsání platby bude zaplacený.',
  package: 'Permanentka se aktivuje po připsání platby.',
  credit_topup: 'Kredit se připíše po připsání platby.',
  storno_fee: 'Poplatek bude uhrazený po připsání platby.',
};

/** Výsledek zaplacené výzvy srozumitelně pro klienta. */
export function paidMessage(s: ClinicState, r: PaymentRequest): string {
  switch (r.purpose) {
    case 'booking': {
      const b = r.bookingId ? getBooking(s, r.bookingId) : undefined;
      return b?.payment.paid && b.payment.settledBy === 'qr' ? 'Termín je zaplacený.' : `Termín už na platbu nečekal, ${formatMoney(r.amount)} jsme připsali na váš kredit.`;
    }
    case 'storno_fee': {
      const b = r.bookingId ? getBooking(s, r.bookingId) : undefined;
      return b?.fee?.settledBy === 'qr' ? 'Poplatek je uhrazený.' : `Poplatek už nebyl k úhradě, ${formatMoney(r.amount)} jsme připsali na váš kredit.`;
    }
    case 'package':
      return r.packageId ? `${r.label} je aktivní.` : `Permanentka už není v nabídce, ${formatMoney(r.amount)} jsme připsali na váš kredit.`;
    case 'credit_topup':
    default: {
      const bonus = creditBonusFor(s, r.amount);
      return `Kredit ${formatMoney(r.amount)} je připsaný${bonus ? ` i s bonusem ${formatMoney(bonus)}` : ''}.`;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Akce                                                                */
/* ------------------------------------------------------------------ */

export function useQrActions(): {
  notify: (requestId: Id) => boolean;
  simulate: (requestId: Id) => boolean;
  cancel: (requestId: Id) => boolean;
} {
  const run = useCommand();
  return {
    notify: (requestId) => run(notifyPaymentSent, { requestId }, { success: 'Děkujeme, platbu potvrdíme po připsání' }).ok,
    // Testovací verze: platbu „potvrdí banka“ – v ostrém provozu to udělá recepce podle výpisu.
    simulate: (requestId) => {
      const r = dispatch(confirmPaymentRequest, { requestId }, { actor: { role: 'owner', name: 'Banka (simulace)' } });
      if (!r.ok) {
        toast(r.error, { tone: 'danger' });
        return false;
      }
      toast(r.value.message, { tone: 'success', description: 'Test: peníze „dorazily“ a klinika platbu potvrdila.' });
      return true;
    },
    cancel: (requestId) => run(cancelPaymentRequest, { requestId }, { success: 'QR platba je zrušená' }).ok,
  };
}

/** Testovací tlačítko – v ostré verzi nebude. */
export function QrTestZone({ requestId }: { requestId: Id }): JSX.Element {
  const { simulate } = useQrActions();
  return (
    <div className="por-qrtest">
      <span className="por-qrtest__label">
        <Icon name="zap" size={14} />
        Jen pro testování
      </span>
      <Button size="sm" variant="secondary" full onClick={() => simulate(requestId)}>
        Simulovat připsání platby (test)
      </Button>
      <span className="por-qrtest__note">Jako by peníze dorazily na účet a klinika platbu potvrdila.</span>
    </div>
  );
}

/** Tlačítko „Zaplatil(a) jsem“, po oznámení stav s časem. */
export function NotifyAction({ request }: { request: PaymentRequest }): JSX.Element {
  const { notify } = useQrActions();
  const sentRef = useRef<HTMLDivElement>(null);
  const [sentHere, setSentHere] = useState(false);
  // tlačítko zmizí – fokus přejde na potvrzení, aby se neztratil
  useEffect(() => {
    if (sentHere && request.clientNotifiedAt) sentRef.current?.focus({ preventScroll: true });
  }, [sentHere, request.clientNotifiedAt]);
  if (request.clientNotifiedAt) {
    return (
      <div ref={sentRef} className="por-qr__sent" tabIndex={-1}>
        <StateChip tone="success" icon="checkCircle">
          Oznámili jste odeslání · {formatDateTimeShort(request.clientNotifiedAt)}
        </StateChip>
        <span className="por-qr__sent-text">Platbu potvrdíme, jakmile dorazí na účet kliniky.</span>
      </div>
    );
  }
  return (
    <Button variant="primary" size="lg" icon="check" full onClick={() => setSentHere(notify(request.id))}>
      Zaplatil(a) jsem
    </Button>
  );
}

/* ------------------------------------------------------------------ */
/* QR karta výzvy                                                      */
/* ------------------------------------------------------------------ */

const SAME_PHONE_TIP = 'Platíte z tohoto telefonu? Zkopírujte číslo účtu a VS, nebo si QR uložte jako snímek obrazovky a nahrajte ho v bankovní aplikaci.';

export interface QrRequestCardProps {
  requestId: Id;
  /** Co se stane po zaplacení (výchozí podle účelu). */
  hint?: ReactNode;
  /** Tlačítko „Zaplatil(a) jsem“ a testovací simulace pod kartou. */
  withActions?: boolean;
}

/** QR kód a platební údaje jedné výzvy; po zaplacení potvrzení, po zrušení poznámka. */
export function QrRequestCard({ requestId, hint, withActions = true }: QrRequestCardProps): JSX.Element | null {
  const clinic = useClinic();
  const now = useNow();
  const r = clinic.paymentRequests.find((x) => x.id === requestId);
  if (!r) return null;
  if (r.status === 'paid') {
    return (
      <Callout tone="success" title="Platba přijata" className="por-qr-done">
        {paidMessage(clinic, r)}
      </Callout>
    );
  }
  if (r.status === 'cancelled') {
    return (
      <Callout tone="neutral" icon="info">
        Tato QR platba je zrušená.
      </Callout>
    );
  }
  if (!isValidIban(clinic.settings.payments.iban)) {
    // klinika mezitím odebrala účet – QR by nevedl nikam
    return (
      <Callout tone="warning" title="Platební údaje teď nejsou k dispozici">
        Platbu {formatMoney(r.amount)} (VS {r.vs}) zatím neposílejte a ozvěte se prosím klinice na{' '}
        <a href={`mailto:${clinic.settings.senderEmail}`}>{clinic.settings.senderEmail}</a>.
      </Callout>
    );
  }
  return (
    <div className="por-qr">
      <QrPaymentCard
        clinic={clinic}
        clientId={r.clientId}
        amount={r.amount}
        vs={r.vs}
        label={r.label}
        dueAt={r.dueAt}
        now={now}
        status="pending"
        qrSize={200}
        hint={
          <>
            <span className="por-qr__hint">{hint ?? QR_HINT[r.purpose]}</span>
            <span className="por-qr__tip">{SAME_PHONE_TIP}</span>
          </>
        }
        actions={withActions ? <NotifyAction request={r} /> : undefined}
      />
      {withActions && <QrTestZone requestId={r.id} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panel v detailu termínu (sbalitelný)                                */
/* ------------------------------------------------------------------ */

export interface QrRequestPanelProps {
  requestId: Id;
  title: string;
  hint?: ReactNode;
  /** Zrušení výzvy (např. „Zaplatím na místě“) s potvrzením. */
  cancel?: { label: string; title: string; message: ReactNode; confirmLabel: string };
}

export function QrRequestPanel({ requestId, title, hint, cancel }: QrRequestPanelProps): JSX.Element | null {
  const clinic = useClinic();
  const now = useNow();
  const actions = useQrActions();
  const r = clinic.paymentRequests.find((x) => x.id === requestId);
  const [open, setOpen] = useState(() => !r?.clientNotifiedAt);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const titleId = useId();
  const bodyId = useId();
  if (!r || r.status === 'cancelled') return null;
  if (r.status === 'paid') {
    return (
      <Callout tone="success" title="Platba přijata" className="por-qr-done">
        {paidMessage(clinic, r)}
      </Callout>
    );
  }
  const overdue = isOverdue(r, now);
  return (
    <section className={cx('por-qrp', overdue && 'is-overdue')} aria-labelledby={titleId}>
      <div className="por-qrp__head">
        <span className="por-qrp__icon" aria-hidden="true">
          <Icon name={QR_ICON} size={18} />
        </span>
        <div className="por-qrp__titles">
          <h2 id={titleId} className="por-qrp__title">
            {title}
          </h2>
          <span className={cx('por-qrp__meta tnum', overdue && 'is-overdue')}>
            {overdue ? 'Po splatnosti' : 'Splatné do'}{' '}
            <span className="nowrap">{overdue ? `(${formatDateTimeShort(r.dueAt)})` : formatDateTimeShort(r.dueAt)}</span>
          </span>
        </div>
        <span className="por-qrp__amount tnum">{formatMoney(r.amount)}</span>
      </div>
      <button type="button" className="por-qrp__toggle" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((v) => !v)}>
        <span>{open ? 'Skrýt QR kód a platební údaje' : 'Zobrazit QR kód a platební údaje'}</span>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={18} />
      </button>
      <div id={bodyId} hidden={!open}>
        {open && <QrRequestCard requestId={r.id} hint={hint} withActions={false} />}
      </div>
      <div className="por-qrp__actions">
        <NotifyAction request={r} />
        {cancel && (
          <Button variant="ghost" size="lg" full onClick={() => setConfirmOpen(true)}>
            {cancel.label}
          </Button>
        )}
      </div>
      <QrTestZone requestId={r.id} />
      {cancel && (
        <ConfirmDialog
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          title={cancel.title}
          message={
            <>
              {cancel.message}
              {r.clientNotifiedAt ? ' Platbu jste už ale oznámili jako odeslanou – pokud odešla, ozvěte se prosím klinice.' : ''}
            </>
          }
          confirmLabel={cancel.confirmLabel}
          cancelLabel="Ponechat QR platbu"
          onConfirm={() => {
            actions.cancel(r.id);
          }}
        />
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Čekající platby (účet)                                              */
/* ------------------------------------------------------------------ */

const CANCEL_TEXT: Record<PaymentPurpose, string> = {
  booking: 'Termín vám zůstane a zaplatíte ho na místě.',
  package: 'Permanentka se nevytvoří. Koupit ji můžete kdykoli znovu.',
  credit_topup: 'Kredit se nedobije. Dobít ho můžete kdykoli znovu.',
  storno_fee: 'Poplatek zůstane k úhradě – zaplatíte ho na recepci, nebo později QR kódem.',
};

function PendingPaymentItem({ request: r }: { request: PaymentRequest }): JSX.Element {
  const now = useNow();
  const { go } = usePortal();
  const actions = useQrActions();
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const bodyId = useId();
  const overdue = isOverdue(r, now);
  return (
    <li className={cx('por-pp', overdue && 'is-overdue')}>
      <div className="por-pp__head">
        <span className="por-pp__icon" aria-hidden="true">
          <Icon name={PURPOSE_ICON[r.purpose]} size={18} />
        </span>
        <div className="por-pp__body">
          <span className="por-pp__title">{r.label}</span>
          <span className="por-pp__meta tnum">
            VS {r.vs} ·{' '}
            {overdue ? (
              <strong className="por-pp__overdue nowrap">po splatnosti ({formatDateTimeShort(r.dueAt)})</strong>
            ) : (
              <span className="nowrap">splatné do {formatDateTimeShort(r.dueAt)}</span>
            )}
          </span>
        </div>
        <span className="por-pp__amount tnum">{formatMoney(r.amount)}</span>
      </div>
      {r.clientNotifiedAt && (
        <StateChip tone="success" icon="checkCircle">
          Oznámili jste odeslání · {formatDateTimeShort(r.clientNotifiedAt)}
        </StateChip>
      )}
      <div className="por-pp__actions">
        <Button size="sm" variant={open ? 'secondary' : 'primary'} icon={open ? 'chevronUp' : QR_ICON} aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((v) => !v)}>
          {open ? 'Skrýt QR' : 'Zobrazit QR'}
        </Button>
        {r.bookingId && (r.purpose === 'booking' || r.purpose === 'storno_fee') && (
          <Button size="sm" variant="ghost" onClick={() => go({ name: 'termin', bookingId: r.bookingId! })}>
            Termín
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setConfirmOpen(true)}>
          Zrušit
        </Button>
      </div>
      <div id={bodyId} hidden={!open}>
        {open && <QrRequestCard requestId={r.id} />}
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Zrušit QR platbu?"
        message={
          <>
            <strong className="tnum">
              {r.label} · {formatMoney(r.amount)}
            </strong>
            <br />
            {CANCEL_TEXT[r.purpose]}
            {r.clientNotifiedAt ? ' Platbu jste ale oznámili jako odeslanou – pokud odešla, ozvěte se prosím klinice.' : ''}
          </>
        }
        confirmLabel="Zrušit platbu"
        cancelLabel="Ponechat"
        tone="danger"
        onConfirm={() => {
          actions.cancel(r.id);
        }}
      />
    </li>
  );
}

function PaidItem({ request: r }: { request: PaymentRequest }): JSX.Element {
  const clinic = useClinic();
  return (
    <li className="por-pp is-paid">
      <div className="por-pp__head">
        <span className="por-pp__icon" aria-hidden="true">
          <Icon name="checkCircle" size={18} />
        </span>
        <div className="por-pp__body">
          <span className="por-pp__eyebrow">Zaplaceno</span>
          <span className="por-pp__title">{r.label}</span>
          <span className="por-pp__meta">{r.purpose === 'package' && r.packageId ? 'Permanentka je aktivní.' : paidMessage(clinic, r)}</span>
        </div>
        <span className="por-pp__amount tnum">{formatMoney(r.amount)}</span>
      </div>
    </li>
  );
}

export interface PendingPaymentsSectionProps {
  title: string;
  /** Jen výzvy daného účelu (permanentky, kredit…). */
  purpose?: PaymentPurpose;
  /** Po otevření posunout na sekci a dát jí fokus (odkaz z domovské obrazovky). */
  focusOnMount?: boolean;
}

/**
 * Čekající QR platby klienta. Platby zaplacené během prohlížení zůstanou v seznamu
 * s potvrzením, aby bylo vidět, co se stalo.
 */
export function PendingPaymentsSection({ title, purpose, focusOnMount }: PendingPaymentsSectionProps): JSX.Element | null {
  const clinic = useClinic();
  const { client } = usePortal();
  const ref = useRef<HTMLElement>(null);
  const headingId = useId();
  const seen = useRef<Id[]>([]);
  const pending = clientPendingRequests(clinic, client.id, purpose);
  for (const r of pending) if (!seen.current.includes(r.id)) seen.current.push(r.id);
  const rows = seen.current
    .map((id) => clinic.paymentRequests.find((r) => r.id === id))
    .filter((r): r is PaymentRequest => !!r && (r.status === 'pending' || r.status === 'paid'));
  const visible = rows.length > 0;

  useEffect(() => {
    if (!focusOnMount) return undefined;
    // až po obrazovce (ta při otevření dává fokus nadpisu h1)
    const frame = requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.scrollIntoView({ block: 'start' });
      el.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
    // jen při otevření
  }, []);

  if (!visible) return null;
  return (
    <section ref={ref} className="por-stack por-stack--tight por-pps" aria-labelledby={headingId}>
      <div className="por-sect">
        <h2 id={headingId} className="por-sect__title" tabIndex={-1}>
          {title}
          {pending.length > 0 && <span className="por-pps__count tnum"> · {pending.length}</span>}
        </h2>
      </div>
      <ul className="por-pplist">
        {rows.map((r) => (r.status === 'pending' ? <PendingPaymentItem key={r.id} request={r} /> : <PaidItem key={r.id} request={r} />))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Domovská obrazovka                                                  */
/* ------------------------------------------------------------------ */

/** „Čeká na zaplacení: 2 platby · 4 280 Kč“ s odkazem na QR. */
export function PendingPaymentsNotice(): JSX.Element | null {
  const clinic = useClinic();
  const now = useNow();
  const { client, go, openAccount } = usePortal();
  const pending = clientPendingRequests(clinic, client.id);
  if (!pending.length) return null;
  const total = pending.reduce((sum, r) => sum + r.amount, 0);
  const overdue = pending.filter((r) => isOverdue(r, now)).length;
  const single = pending.length === 1 ? pending[0] : null;
  const toBooking = single?.bookingId && (single.purpose === 'booking' || single.purpose === 'storno_fee') ? single.bookingId : null;
  const detail = single
    ? `${single.label} · ${overdue ? 'po splatnosti' : `splatné do ${formatDateTimeShort(single.dueAt)}`}`
    : overdue
      ? `${paymentsCount(overdue)} po splatnosti`
      : `Nejbližší splatnost ${formatDateTimeShort(pending[0].dueAt)}`;
  return (
    <article className={cx('por-qrnotice', overdue > 0 && 'is-overdue')} aria-labelledby="por-qrnotice-title">
      <span className="por-qrnotice__icon" aria-hidden="true">
        <Icon name={QR_ICON} size={18} />
      </span>
      <div className="por-qrnotice__body">
        <h2 id="por-qrnotice-title" className="por-qrnotice__title tnum">
          Čeká na zaplacení: {paymentsCount(pending.length)} · {formatMoney(total)}
        </h2>
        <p className="por-qrnotice__text tnum">{detail}</p>
      </div>
      <Button
        size="sm"
        variant="primary"
        className="por-qrnotice__btn"
        onClick={() => (toBooking ? go({ name: 'termin', bookingId: toBooking }) : openAccount('root', 'platby'))}
      >
        Zobrazit QR
      </Button>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Výběr QR platby (před potvrzením)                                   */
/* ------------------------------------------------------------------ */

/** Co klienta čeká, když zvolí QR platbu předem. */
export function QrChoiceNote({ amount, dueAt }: { amount: number; dueAt: LocalDateTime }): JSX.Element {
  return (
    <Callout tone="info" icon={QR_ICON} title="QR platba předem">
      Po potvrzení uvidíte QR kód k zaplacení {formatMoney(amount)} – stačí ho naskenovat v bankovní aplikaci. Zaplaťte prosím do{' '}
      {formatDateTimeShort(dueAt)}. Když platbu nestihnete, zaplatíte na místě.
    </Callout>
  );
}

/* ------------------------------------------------------------------ */
/* Krok s QR ve spodním panelu (nákup permanentky, dobití kreditu)     */
/* ------------------------------------------------------------------ */

/** Titulek a tlačítko panelu podle stavu výzvy (panel zůstává stejný, mění se obsah). */
export function useQrStep(requestId: Id | null, paidTitle: string, onClose: () => void): { title: string; footer: ReactNode } | null {
  const clinic = useClinic();
  if (!requestId) return null;
  const paid = clinic.paymentRequests.find((x) => x.id === requestId)?.status === 'paid';
  return {
    title: paid ? paidTitle : 'Zaplaťte QR kódem',
    footer: (
      <Button variant={paid ? 'primary' : 'secondary'} size="lg" full onClick={onClose}>
        {paid ? 'Hotovo' : 'Zavřít'}
      </Button>
    ),
  };
}

export function QrStep({ requestId, hint }: { requestId: Id; hint?: ReactNode }): JSX.Element {
  const clinic = useClinic();
  const ref = useRef<HTMLDivElement>(null);
  const pending = clinic.paymentRequests.find((x) => x.id === requestId)?.status === 'pending';
  // panel zůstává stejný jako u výběru – začít nahoře a ohlásit nový obsah čtečce
  useEffect(() => {
    const el = ref.current;
    el?.closest('[data-overlay-body]')?.scrollTo({ top: 0 });
    el?.focus({ preventScroll: true });
  }, []);
  return (
    <div ref={ref} className="por-qrstep" tabIndex={-1} role="group" aria-label="QR platba">
      {pending && <p className="por-qrstep__lead">Naskenujte QR kód v bankovní aplikaci. Platbu najdete i později v Účtu mezi čekajícími platbami.</p>}
      <QrRequestCard requestId={requestId} hint={hint} />
    </div>
  );
}
