import { useMemo, useState } from 'react';
import type { WaitlistEntry } from '../domain/types';
import { TherapistAvatar } from '../components/domain';
import { acceptWaitlistOffer, declineWaitlistOffer } from '../engine/commands';
import { formatDateLong, formatMoney, formatSpan, formatTime, formatTimeRange } from '../engine/format';
import { getService, getSession, getTherapist, therapistName } from '../engine/selectors';
import { addMinutes, diffMinutes } from '../engine/time';
import { useClinic, useCommand, useNow } from '../store/hooks';
import { Button, Checkbox, ConfirmDialog, Icon, Progress } from '../ui';
import { usePortal } from './context';
import { defaultPaymentKey, draftBooking, paymentOptions, placeLabel, termsInfo, whenLabel } from './logic';
import { PaymentPicker, PolicySheet, SimulatedPaymentNote, TermsBox, useSimulatedPayment } from './payment';
import { Sheet } from './parts';

/** Nabídka uvolněného termínu z čekací listiny – s odpočtem do vypršení. */
export function OfferCard({ entry }: { entry: WaitlistEntry }): JSX.Element | null {
  const clinic = useClinic();
  const now = useNow();
  const run = useCommand();
  const { client } = usePortal();
  const [accepting, setAccepting] = useState(false);
  const [declining, setDeclining] = useState(false);
  const offer = entry.offer;
  if (!offer) return null;
  const svc = getService(clinic, entry.serviceId);
  const ses = offer.sessionId ? getSession(clinic, offer.sessionId) : undefined;
  const end = ses?.end ?? addMinutes(offer.start, svc?.durationMin ?? 60);
  const t = getTherapist(clinic, offer.therapistId);
  const left = Math.max(0, diffMinutes(offer.expiresAt, now));
  const total = Math.max(1, diffMinutes(offer.expiresAt, offer.offeredAt));
  const urgent = left <= 30;
  const titleId = `por-offer-${entry.id}`;
  const place = placeLabel(clinic, { serviceId: entry.serviceId, roomId: ses?.roomId ?? t?.roomId ?? '' });

  return (
    <article className={'por-offer' + (urgent ? ' is-urgent' : '')} aria-labelledby={titleId}>
      <div className="por-offer__head">
        <span className="por-offer__eyebrow">
          <Icon name="zap" size={14} />
          Uvolnil se termín
        </span>
        <span className="por-offer__timer tnum" aria-label={`Nabídka platí ještě ${formatSpan(left)}`}>
          <Icon name="hourglass" size={14} />
          {formatSpan(left)}
        </span>
      </div>
      <h3 id={titleId} className="por-offer__title">
        {ses?.title ?? svc?.name ?? 'Termín'}
      </h3>
      <p className="por-offer__when tnum">
        {whenLabel(offer.start, now)}–{formatTime(end)}
      </p>
      <p className="por-offer__who">
        <TherapistAvatar therapist={t} size="xs" />
        {therapistName(t)}
        {place ? ` · ${place}` : ''}
      </p>
      <Progress value={left} max={total} size="xs" tone={urgent ? 'danger' : 'warning'} label="Zbývající čas nabídky" />
      <p className="por-offer__note">
        Nabídku dostalo víc čekajících – termín získá, kdo potvrdí první. Platí do {formatTime(offer.expiresAt)}.
      </p>
      {client.blocked ? (
        <p className="por-offer__note">Online rezervace máte pozastavené – termín vám může potvrdit recepce.</p>
      ) : (
        <div className="por-offer__actions">
          <Button variant="secondary" size="lg" onClick={() => setDeclining(true)}>
            Odmítnout
          </Button>
          <Button variant="primary" size="lg" onClick={() => setAccepting(true)}>
            Potvrdit termín
          </Button>
        </div>
      )}
      {accepting && <AcceptOfferSheet entry={entry} onClose={() => setAccepting(false)} />}
      <ConfirmDialog
        open={declining}
        onClose={() => setDeclining(false)}
        title="Odmítnout nabídku?"
        message="Termín nabídneme dalšímu čekajícímu. Hlídání vám zůstane – když se uvolní jiný čas, ozveme se znovu."
        confirmLabel="Odmítnout"
        cancelLabel="Zpět"
        onConfirm={() => {
          run(declineWaitlistOffer, { entryId: entry.id }, { success: 'Nabídku jste odmítli' });
        }}
      />
    </article>
  );
}

function AcceptOfferSheet({ entry, onClose }: { entry: WaitlistEntry; onClose: () => void }): JSX.Element | null {
  const clinic = useClinic();
  const now = useNow();
  const run = useCommand();
  const { client, go } = usePortal();
  const offer = entry.offer;
  const [payKey, setPayKey] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const pay = useSimulatedPayment();
  const options = useMemo(
    () => (offer ? paymentOptions(clinic, { clientId: client.id, serviceId: entry.serviceId, start: offer.start, now }) : []),
    [clinic, client.id, entry.serviceId, offer, now],
  );
  if (!offer) return null;
  const key = payKey && options.some((o) => o.key === payKey && !o.disabled) ? payKey : defaultPaymentKey(options);
  const selected = options.find((o) => o.key === key) ?? null;
  const svc = getService(clinic, entry.serviceId);
  const ses = offer.sessionId ? getSession(clinic, offer.sessionId) : undefined;
  const end = ses?.end ?? addMinutes(offer.start, svc?.durationMin ?? 60);
  const t = getTherapist(clinic, offer.therapistId);
  const terms = selected
    ? termsInfo(
        clinic,
        draftBooking(clinic, {
          clientId: client.id,
          serviceId: entry.serviceId,
          therapistId: offer.therapistId,
          start: offer.start,
          end,
          sessionId: offer.sessionId,
          payment: selected.payment,
          now,
        }),
        now,
      )
    : null;
  const online = selected?.payment.method === 'online';

  const confirm = (): void => {
    if (!selected) return;
    pay.run(online, () => {
      const r = run(acceptWaitlistOffer, { entryId: entry.id, payment: selected.payment }, { success: 'Termín je váš', quiet: true });
      if (r.ok) {
        onClose();
        go({ name: 'termin', bookingId: r.value });
      }
    });
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Potvrdit uvolněný termín"
      footer={
        <Button variant="primary" size="lg" full loading={pay.paying} disabled={!selected || !agree} onClick={confirm}>
          {pay.paying ? 'Probíhá platba…' : online && selected ? `Zaplatit ${formatMoney(selected.amount)} a potvrdit` : 'Potvrdit termín'}
        </Button>
      }
    >
      <div className="por-stack">
        <div className="por-offer-sum">
          <span className="por-offer-sum__title">{ses?.title ?? svc?.name}</span>
          <span className="por-offer-sum__when tnum">
            {formatDateLong(offer.start, { capital: true, year: false })} · {formatTimeRange(offer.start, end)}
          </span>
          <span className="por-offer-sum__who">
            <TherapistAvatar therapist={t} size="xs" />
            {therapistName(t)}
          </span>
          <span className="por-offer-sum__left tnum">
            <Icon name="hourglass" size={14} />
            Nabídka platí ještě {formatSpan(Math.max(0, diffMinutes(offer.expiresAt, now)))}
          </span>
        </div>
        <PaymentPicker options={options} value={key} onChange={setPayKey} />
        {online && selected && <SimulatedPaymentNote amount={formatMoney(selected.amount)} />}
        {terms && <TermsBox terms={terms} onShowPolicy={() => setPolicyOpen(true)} />}
        <Checkbox className="por-agree" checked={agree} onChange={setAgree} label="Souhlasím se storno podmínkami" />
      </div>
      <PolicySheet open={policyOpen} onClose={() => setPolicyOpen(false)} />
    </Sheet>
  );
}
