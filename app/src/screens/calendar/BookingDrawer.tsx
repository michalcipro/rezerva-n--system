import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Booking, ClinicState, Id, LocalDateTime, MoneyMethod } from '../../domain/types';
import { cancelSession, markCompleted, markNoShow, payFee, settleBooking, updateBookingNote, waiveFee } from '../../engine/commands';
import {
  countLabel,
  formatDate,
  formatDateTimeShort,
  formatDayShort,
  formatMoney,
  formatPercent,
  formatRelative,
  formatSpan,
  formatTimeRange,
} from '../../engine/format';
import { paymentLabel } from '../../engine/messages';
import { evaluateCancellation, type CancellationEvaluation } from '../../engine/policy';
import {
  bookingsOfSession,
  clientCredit,
  clientName,
  excuseStatusFor,
  getBooking,
  getClient,
  getRoom,
  getService,
  getSession,
  getTherapist,
  isOccupying,
  therapistName,
} from '../../engine/selectors';
import { addHours, diffMinutes } from '../../engine/time';
import { PolicyTimeline } from '../../components/PolicyTimeline';
import { ClientAvatar } from '../../components/domain';
import { useActor, useClinic, useCommand, useNow } from '../../store/hooks';
import { navigate, setSession } from '../../store/session';
import {
  Badge,
  Button,
  Callout,
  ConfirmDialog,
  DescriptionList,
  Dialog,
  Drawer,
  EmptyState,
  Field,
  IconButton,
  Menu,
  Progress,
  StackedBar,
  StatusPill,
  Textarea,
  cx,
  type DescriptionItem,
  type MenuEntry,
} from '../../ui';
import { CancelBookingDialog } from './CancelBookingDialog';
import { NewBookingDialog, type NewBookingInitial } from './NewBookingDialog';
import { RescheduleDialog } from './RescheduleDialog';
import { activeOfferGroups, isFirstVisit, noShowLabel, packageEntry, paymentHint, waitingForSession } from './model';
import './calendar.css';

type DialogKind = 'cancel' | 'clinic' | 'reschedule' | 'noshow' | 'waive' | 'rebook' | 'makeup';

const CHANNEL_LABEL: Record<Booking['channel'], string> = { online: 'Online', recepce: 'Recepce', telefon: 'Telefon' };
const MONEY_LABEL: Record<MoneyMethod | 'credit' | 'package_entry', string> = {
  cash: 'hotově',
  card: 'kartou',
  online: 'online',
  transfer: 'převodem',
  credit: 'z kreditu',
  package_entry: 'vstupem z permanentky',
};

/* ------------------------------------------------------------------ */
/* Detail rezervace                                                    */
/* ------------------------------------------------------------------ */

export interface BookingDrawerProps {
  bookingId: Id | null;
  onClose: () => void;
}

/** Detail rezervace v bočním panelu (na telefonu spodní list) se všemi akcemi podle stavu. */
export function BookingDrawer({ bookingId, onClose }: BookingDrawerProps): JSX.Element | null {
  const clinic = useClinic();
  // Přepnutí na jiného účastníka lekce uvnitř panelu (platí jen pro aktuálně otevřenou rezervaci).
  const [switched, setSwitched] = useState<{ parent: Id; id: Id } | null>(null);
  const viewId = bookingId && switched && switched.parent === bookingId ? switched.id : bookingId;
  const booking = viewId ? getBooking(clinic, viewId) : undefined;
  if (!bookingId || !booking) return null;
  const close = (): void => {
    setSwitched(null);
    onClose();
  };
  return <BookingDrawerView booking={booking} onClose={close} onSwitch={(id) => setSwitched({ parent: bookingId, id })} />;
}

function BookingDrawerView({ booking: b, onClose, onSwitch }: { booking: Booking; onClose: () => void; onSwitch: (id: Id) => void }): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const run = useCommand();
  const actor = useActor();
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [waiveReason, setWaiveReason] = useState('');

  const client = getClient(clinic, b.clientId);
  const svc = getService(clinic, b.serviceId);
  const therapist = getTherapist(clinic, b.therapistId);
  const room = getRoom(clinic, b.roomId);
  const ses = b.sessionId ? getSession(clinic, b.sessionId) : undefined;
  const ev = useMemo(() => (b.status === 'confirmed' ? evaluateCancellation(clinic, b, now, 'staff') : null), [clinic, b, now]);
  const started = b.start <= now;
  const inProgress = b.status === 'confirmed' && started && b.end > now;
  const credit = clientCredit(clinic, b.clientId);
  const showFinance = actor.role !== 'therapist';
  const unpaidOnsite = b.payment.method === 'onsite' && !b.payment.paid;
  const due = Math.max(0, b.price - b.payment.paidAmount);
  const feeDue = b.fee?.status === 'due';
  const feeWaivable = !!b.fee && b.fee.status === 'paid' && b.fee.amount > 0 && b.fee.settledBy !== 'package_entry';
  const openMakeup = clinic.makeups.find((m) => m.sourceBookingId === b.id && m.status === 'open' && m.validUntil > now);
  const noShowText = noShowLabel(client);
  const offer = isOccupying(b.status) ? undefined : activeOfferGroups(clinic, now).find((g) => g.therapistId === b.therapistId && g.start === b.start);

  /* ---------- akce ---------- */
  const complete = (method: MoneyMethod | 'credit' | null): void => {
    run(markCompleted, { bookingId: b.id, settleWith: method }, { success: method ? `Proběhlo · zaplaceno ${MONEY_LABEL[method]}` : 'Zapsáno: proběhlo' });
  };
  const settle = (method: MoneyMethod | 'credit'): void => {
    run(settleBooking, { bookingId: b.id, method }, { success: `Zaplaceno ${MONEY_LABEL[method]} · ${formatMoney(due)}` });
  };
  const pay = (method: MoneyMethod | 'credit'): void => {
    run(payFee, { bookingId: b.id, method }, { success: `Poplatek uhrazen ${MONEY_LABEL[method]}` });
  };
  const openClient = (): void => {
    onClose();
    navigate({ name: 'klient', clientId: b.clientId });
  };
  const showInCalendar = (): void => {
    setSession({ calendarDate: b.start.slice(0, 10), calendarView: 'day' });
    navigate({ name: 'kalendar' });
    onClose();
  };

  const moneyItems = (fn: (m: MoneyMethod | 'credit') => void, amount: number, later?: () => void): MenuEntry[] => {
    const items: MenuEntry[] = [
      { type: 'label', label: `K úhradě ${formatMoney(amount)}` },
      { id: 'card', label: 'Kartou', icon: 'card', onSelect: () => fn('card') },
      { id: 'cash', label: 'Hotově', icon: 'cash', onSelect: () => fn('cash') },
      { id: 'transfer', label: 'Převodem', icon: 'receipt', onSelect: () => fn('transfer') },
      { id: 'credit', label: `Z kreditu (zůstatek ${formatMoney(credit)})`, icon: 'wallet', disabled: credit < amount, onSelect: () => fn('credit') },
    ];
    if (later) items.push({ type: 'separator', id: 'sep' }, { id: 'later', label: 'Zaplatí později', icon: 'clock', onSelect: later });
    return items;
  };

  const footer: ReactNode[] = [];
  if (b.status === 'confirmed' && !started) {
    footer.push(
      <Button key="move" variant="secondary" icon="repeat" onClick={() => setDialog('reschedule')}>
        Přesunout
      </Button>,
      <Button key="cancel" variant={ev?.excuse.allowed ? 'soft' : 'danger-secondary'} icon="calendarX" onClick={() => setDialog('cancel')}>
        {ev?.options.some((o) => o.kind === 'excuse') ? 'Omluvit / zrušit' : 'Zrušit termín'}
      </Button>,
    );
  } else if (b.status === 'confirmed') {
    footer.push(
      unpaidOnsite && showFinance ? (
        <Menu
          key="done"
          align="start"
          label="Proběhlo – způsob úhrady"
          trigger={
            <Button variant="primary" icon="check" iconRight="chevronDown">
              Proběhlo
            </Button>
          }
          items={moneyItems((m) => complete(m), due, () => complete(null))}
        />
      ) : (
        <Button key="done" variant="primary" icon="check" onClick={() => complete(null)}>
          Proběhlo
        </Button>
      ),
      <Button key="noshow" variant="secondary" icon="userX" onClick={() => setDialog('noshow')}>
        {noShowText}
      </Button>,
    );
  } else if (b.status === 'completed') {
    if (unpaidOnsite && showFinance)
      footer.push(
        <Menu
          key="settle"
          align="start"
          label="Přijmout platbu"
          trigger={
            <Button variant="primary" icon="coins" iconRight="chevronDown">
              Přijmout platbu
            </Button>
          }
          items={moneyItems(settle, due)}
        />,
      );
    footer.push(
      <Button key="rebook" variant="secondary" icon="calendarPlus" onClick={() => setDialog('rebook')}>
        Další termín
      </Button>,
    );
  } else {
    if (feeDue && b.fee && showFinance) {
      footer.push(
        <Menu
          key="fee"
          align="start"
          label="Uhradit poplatek"
          trigger={
            <Button variant="primary" icon="coins" iconRight="chevronDown">
              Uhradit poplatek
            </Button>
          }
          items={moneyItems(pay, b.fee.amount)}
        />,
        <Button key="waive" variant="secondary" onClick={() => setDialog('waive')}>
          Odpustit
        </Button>,
      );
    } else if (b.status === 'excused' && openMakeup) {
      footer.push(
        <Button key="makeup" variant="primary" icon="calendarPlus" onClick={() => setDialog('makeup')}>
          Rezervovat náhradu
        </Button>,
      );
    }
    if (b.status === 'no_show' && !feeDue)
      footer.push(
        <Button key="fix" variant="secondary" icon="check" onClick={() => complete(null)}>
          Opravit na Proběhlo
        </Button>,
      );
    if (footer.length < 2)
      footer.push(
        <Button key="rebook" variant={footer.length ? 'secondary' : 'primary'} icon="calendarPlus" onClick={() => setDialog('rebook')}>
          Nová rezervace
        </Button>,
      );
  }

  const menu: MenuEntry[] = [
    { id: 'client', label: 'Otevřít kartu klienta', icon: 'user', onSelect: openClient },
    { id: 'calendar', label: 'Zobrazit v kalendáři', icon: 'calendar', onSelect: showInCalendar },
    { id: 'rebook', label: 'Nová rezervace pro klienta', icon: 'calendarPlus', onSelect: () => setDialog('rebook') },
  ];
  if (b.status === 'confirmed') {
    menu.push({ type: 'separator', id: 's1' });
    if (started) menu.push({ id: 'move', label: 'Přesunout', icon: 'repeat', onSelect: () => setDialog('reschedule') });
    if (ev?.options.some((o) => o.kind === 'clinic'))
      menu.push({ id: 'clinic', label: 'Zrušit ze strany kliniky', icon: 'building', danger: true, onSelect: () => setDialog('clinic') });
  }
  if (b.status === 'completed') menu.push({ type: 'separator', id: 's2' }, { id: 'ns', label: `Opravit: ${noShowText.toLowerCase()}`, icon: 'userX', onSelect: () => setDialog('noshow') });
  if (b.status === 'no_show' && feeDue) menu.push({ type: 'separator', id: 's3' }, { id: 'fix', label: 'Opravit na Proběhlo', icon: 'check', onSelect: () => complete(null) });
  if (feeWaivable && showFinance) menu.push({ type: 'separator', id: 's4' }, { id: 'waive', label: 'Odpustit poplatek (vrátit na kredit)', icon: 'undo', onSelect: () => setDialog('waive') });

  /* ---------- údaje ---------- */
  const details = buildDetails({ b, clinic, now, showFinance, credit, ev });
  const rebookInitial: NewBookingInitial = { clientId: b.clientId, serviceId: svc?.kind === 'group' ? undefined : b.serviceId, therapistId: b.therapistId };

  return (
    <Drawer
      open
      onClose={onClose}
      size="md"
      title={ses ? 'Účastník skupinové lekce' : 'Detail rezervace'}
      headerActions={<Menu trigger={<IconButton icon="more" label="Další akce s rezervací" size="sm" />} items={menu} label="Další akce s rezervací" />}
      footer={footer.length ? <div className="cal-dr__footer">{footer}</div> : undefined}
    >
      <div className="cal-dr">
        <div className="cal-dr__head">
          <ClientAvatar client={client} size="md" />
          <div className="cal-dr__who">
            <button type="button" className="cal-dr__name" onClick={openClient}>
              {clientName(client)}
            </button>
            <span className="cal-dr__service">
              {svc?.name ?? 'Služba'}
              {svc?.remote ? ' · online' : ''}
            </span>
          </div>
          <StatusPill status={b.status} label={b.status === 'no_show' ? noShowText : undefined} appearance="plain" />
        </div>

        <div className={cx('cal-dr__when', inProgress && 'is-live')}>
          <div className="cal-dr__when-row">
            <span className="cal-dr__time">{formatTimeRange(b.start, b.end)}</span>
            <span className="cal-dr__date">{formatDayShort(b.start)}</span>
            {inProgress && <Badge tone="accent" dot>Probíhá · zbývá {formatSpan(diffMinutes(b.end, now))}</Badge>}
          </div>
          <span className="cal-dr__where">{[therapistName(therapist), room?.name].filter(Boolean).join(' · ')}</span>
        </div>

        <div className="cal-dr__badges">
          {isFirstVisit(clinic, b) && isOccupying(b.status) && <Badge tone="accent">Nový klient</Badge>}
          {b.fee?.status === 'due' && <Badge tone="warning">Poplatek {formatMoney(b.fee.amount)} k úhradě</Badge>}
          {b.fee?.status === 'waived' && b.fee.amount > 0 && <Badge tone="neutral">Poplatek odpuštěn</Badge>}
          {b.status === 'completed' && unpaidOnsite && <Badge tone="warning">Čeká na platbu</Badge>}
          {b.makeupForBookingId && <Badge tone="info">Náhradní termín</Badge>}
          {b.fromWaitlist && <Badge tone="accent">Z čekací listiny</Badge>}
          {b.rescheduledFrom && (
            <Badge tone="neutral" icon="repeat">
              Přesunuto
            </Badge>
          )}
          {client?.blocked && (
            <Badge tone="danger" icon="ban">
              Online rezervace zablokované
            </Badge>
          )}
        </div>

        {ev && <PolicySection ev={ev} now={now} start={b.start} />}

        {offer && (
          <Callout tone="accent" title="Uvolněno pro čekací listinu" icon="hourglass">
            Termín je nabídnut {countLabel(offer.entries.length, ['klientovi', 'klientům', 'klientům'])}:{' '}
            {offer.entries.map((w) => clientName(getClient(clinic, w.clientId))).join(', ')}. Nabídka vyprší za {formatSpan(diffMinutes(offer.expiresAt, now))} – potvrdí
            první, kdo odpoví.
          </Callout>
        )}

        <DescriptionList items={details} termWidth={92} />

        <NoteEditor booking={b} />

        {client?.internalNote && (
          <Callout tone="neutral" title="Interní poznámka ke klientovi" icon="lock">
            {client.internalNote}
          </Callout>
        )}

        {b.sessionId && <SessionPanel sessionId={b.sessionId} currentBookingId={b.id} onOpenBooking={onSwitch} />}

        <History booking={b} now={now} />
      </div>

      <CancelBookingDialog bookingId={b.id} open={dialog === 'cancel' || dialog === 'clinic'} initialOption={dialog === 'clinic' ? 'clinic' : undefined} onClose={() => setDialog(null)} />
      <RescheduleDialog bookingId={b.id} open={dialog === 'reschedule'} onClose={() => setDialog(null)} />
      <NewBookingDialog open={dialog === 'rebook'} onClose={() => setDialog(null)} initial={rebookInitial} />
      <NewBookingDialog
        open={dialog === 'makeup'}
        onClose={() => setDialog(null)}
        initial={{ clientId: b.clientId, serviceId: openMakeup?.serviceIds.includes(b.serviceId) ? b.serviceId : openMakeup?.serviceIds[0], therapistId: b.therapistId, makeupId: openMakeup?.id }}
      />
      <ConfirmDialog
        open={dialog === 'noshow'}
        onClose={() => setDialog(null)}
        tone="danger"
        title={`${noShowText}?`}
        message={`${clientName(client)} · ${svc?.name ?? ''} · ${formatDayShort(b.start)} ${formatTimeRange(b.start, b.end)}`}
        confirmLabel="Zapsat nedostavení"
        onConfirm={() => {
          run(markNoShow, { bookingId: b.id }, { success: (v) => v.message || 'Nedostavení zapsáno' });
        }}
      >
        <p className="cal-lead">{noShowConsequence(clinic, b)}</p>
      </ConfirmDialog>
      <Dialog
        open={dialog === 'waive'}
        onClose={() => setDialog(null)}
        size="sm"
        title="Odpustit poplatek"
        description={b.fee ? `${b.fee.reason === 'no_show' ? 'Poplatek za nedostavení' : 'Storno poplatek'} ${formatMoney(b.fee.amount)}` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)}>
              Zpět
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                const r = run(waiveFee, { bookingId: b.id, reason: waiveReason.trim() || 'Odpuštěno personálem' }, { success: 'Poplatek odpuštěn', quiet: true });
                if (r.ok) {
                  setWaiveReason('');
                  setDialog(null);
                }
              }}
            >
              Odpustit poplatek
            </Button>
          </>
        }
      >
        <div className="cal-form">
          {b.fee?.status === 'paid' && <p className="cal-lead">Zaplacená částka se klientovi vrátí na kredit.</p>}
          <Field label="Důvod" hint="Uloží se do historie rezervace.">
            <Textarea value={waiveReason} onValueChange={setWaiveReason} rows={2} placeholder="Např. doložená nemoc, první zkušenost" data-autofocus="" />
          </Field>
        </div>
      </Dialog>
    </Drawer>
  );
}

function noShowConsequence(clinic: ClinicState, b: Booking): string {
  const pct = clinic.settings.policy.noShowFeePct;
  const limit = clinic.settings.policy.blockAfterNoShows;
  let text: string;
  if (b.payment.method === 'package') text = 'Vstup z permanentky propadne.';
  else if (b.payment.method === 'makeup') text = 'Náhradní termín propadne.';
  else if (b.payment.paid && b.payment.paidAmount > 0) {
    const fee = Math.round((b.payment.paidAmount * pct) / 100);
    text = `Poplatek ${formatMoney(fee)} (${formatPercent(pct)}) se ponechá z platby` + (b.payment.paidAmount - fee > 0 ? `, zbytek se vrátí na kredit.` : '.');
  } else {
    const fee = Math.round((b.price * pct) / 100);
    text = fee > 0 ? `Poplatek ${formatMoney(fee)} (${formatPercent(pct)}) se strhne z kreditu, pokud stačí; jinak zůstane k úhradě.` : 'Bez poplatku.';
  }
  if (limit > 0) text += ` Po ${countLabel(limit, ['nedostavení', 'nedostaveních', 'nedostaveních'])} za 90 dní se klientovi pozastaví online rezervace.`;
  return text;
}

/* ------------------------------------------------------------------ */
/* Storno podmínky teď                                                 */
/* ------------------------------------------------------------------ */

function PolicySection({ ev, now, start }: { ev: CancellationEvaluation; now: LocalDateTime; start: LocalDateTime }): JSX.Element {
  let tone: 'success' | 'warning' | 'info' = 'info';
  let title = 'Storno teď';
  let text = '';
  if (ev.phase === 'free') {
    tone = 'success';
    title = 'Storno teď zdarma';
    const next = ev.segments[1];
    text = `Zdarma do ${formatDateTimeShort(ev.freeUntil)} (ještě ${formatSpan(diffMinutes(ev.freeUntil, now))}).` + (next ? ` Potom ${next.label.toLowerCase()}.` : '');
  } else if (ev.phase === 'late') {
    tone = 'warning';
    title = `Storno teď ${formatPercent(ev.feePct)}`;
    text = ev.lateImpact + (ev.excuse.allowed ? ` Lze použít omluvenku – bez sankce (zbývá ${ev.excuse.remaining} z ${ev.excuse.total}).` : ev.excuse.reason ? ` ${ev.excuse.reason}` : '') + (ev.grace ? ' Klient má nárok na první pozdní storno zdarma.' : '');
  } else if (ev.phase === 'started') {
    title = 'Termín probíhá';
    text = 'Zapište docházku (Proběhlo), případně nedostavení.';
  } else {
    title = 'Termín skončil';
    text = 'Zapište, jak termín proběhl.';
  }
  return (
    <div className="cal-dr__policy">
      <Callout tone={tone} title={title}>
        {text}
      </Callout>
      {(ev.phase === 'free' || ev.phase === 'late') && <PolicyTimeline evaluation={ev} now={now} start={start} title="Storno podmínky tohoto termínu" />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Údaje o rezervaci                                                   */
/* ------------------------------------------------------------------ */

function buildDetails({
  b,
  clinic,
  now,
  showFinance,
  credit,
  ev,
}: {
  b: Booking;
  clinic: ClinicState;
  now: LocalDateTime;
  showFinance: boolean;
  credit: number;
  ev: CancellationEvaluation | null;
}): DescriptionItem[] {
  const items: DescriptionItem[] = [];
  const today = now.slice(0, 10);
  const client = getClient(clinic, b.clientId);

  // Platba
  let pay: ReactNode = <span className="cal-strong">{capitalize(paymentLabel(clinic, b))}</span>;
  if (b.payment.method === 'package') {
    const e = packageEntry(clinic, b, today);
    if (e) {
      pay = (
        <div className="cal-pay">
          <span className="cal-strong">
            Permanentka {e.name}
            {e.index > 0 && <span className="cal-soft"> — vstup {e.index}/{e.total}</span>}
          </span>
          <StackedBar
            cells
            size="sm"
            legend={false}
            segments={[
              { value: e.used, tone: 'neutral', label: 'absolvováno' },
              { value: e.forfeited, tone: 'danger', label: 'propadlo' },
              { value: e.reserved, tone: 'accent', label: 'rezervováno' },
              { value: e.free, tone: 'empty', label: 'volné' },
            ]}
          />
          <span className="cal-soft">
            platnost do {formatDate(e.validUntil)} · {countLabel(e.free, ['volný vstup', 'volné vstupy', 'volných vstupů'])}
          </span>
        </div>
      );
    }
  } else if (b.payment.method === 'onsite') {
    pay = b.payment.paid ? (
      <span>
        <span className="cal-strong">Zaplaceno {b.payment.settledBy ? MONEY_LABEL[b.payment.settledBy] : ''}</span> · {formatMoney(b.payment.paidAmount)}
        {b.payment.paidAt ? <span className="cal-soft"> · {formatDateTimeShort(b.payment.paidAt)}</span> : null}
      </span>
    ) : (
      <span>
        <span className="cal-strong">Na místě · {formatMoney(b.price)}</span>{' '}
        <span className={b.status === 'completed' ? 'text-warning' : 'cal-soft'}>{b.status === 'completed' ? '· zatím nezaplaceno' : '· platí se při návštěvě'}</span>
      </span>
    );
  } else if (b.payment.method === 'makeup') {
    const src = b.makeupForBookingId ? getBooking(clinic, b.makeupForBookingId) : undefined;
    pay = (
      <span>
        <span className="cal-strong">Náhrada za omluvený termín</span>
        {src && <span className="cal-soft"> {formatDayShort(src.start)}</span>}
      </span>
    );
  }
  if (showFinance || b.payment.method === 'package') items.push({ term: 'Platba', detail: pay });

  // Poplatek
  if (b.fee) {
    const f = b.fee;
    const what = f.reason === 'no_show' ? 'Za nedostavení' : 'Storno poplatek';
    const state =
      f.status === 'due' ? (
        <Badge tone="warning">k úhradě</Badge>
      ) : f.status === 'paid' ? (
        <Badge tone="neutral">
          uhrazeno{' '}
          {f.settledBy === 'credit' && b.payment.paidAmount > 0 && b.payment.method !== 'credit'
            ? 'z platby za termín'
            : f.settledBy
              ? MONEY_LABEL[f.settledBy]
              : ''}
        </Badge>
      ) : (
        <Badge tone="success">odpuštěno</Badge>
      );
    items.push({
      term: 'Poplatek',
      detail: (
        <span className="cal-stack">
          <span>
            {what} {formatMoney(f.amount)} ({formatPercent(f.pct)}) {state}
          </span>
          {f.waivedReason && <span className="cal-soft">{f.waivedReason}</span>}
        </span>
      ),
    });
  }

  // Zrušení
  if (b.cancel) {
    items.push({
      term: b.status === 'excused' ? 'Omluveno' : 'Zrušeno',
      detail: (
        <span className="cal-stack">
          <span className="tnum">
            {formatDateTimeShort(b.cancel.at)} · {b.cancel.by === 'client' ? 'klientem' : 'personálem'}
            {b.cancel.grace ? ' · první pozdní storno zdarma' : ''}
          </span>
          {b.cancel.reason && <span className="cal-soft">{b.cancel.reason}</span>}
        </span>
      ),
    });
  }

  // Omluvenky
  if (b.status === 'confirmed') {
    const ex = excuseStatusFor(clinic, b, now);
    items.push({
      term: 'Omluvenky',
      detail: (
        <span className="cal-excuses">
          <span className="cal-dots" aria-hidden="true">
            {Array.from({ length: Math.min(ex.total, 8) }, (_, i) => (
              <span key={i} className={cx('cal-dots__dot', i < ex.used && 'is-used')} />
            ))}
          </span>
          <span>
            {ex.used} z {ex.total} využito
            <span className="cal-soft">
              {' '}
              · {ex.scope === 'package' ? `k permanentce ${ex.packageName ?? ''}` : `za ${clinic.settings.policy.excuses.perClientMonths} měsíců`}
              {ev && !ev.excuse.allowed && ev.phase === 'late' ? ` · ${ev.excuse.reason}` : ''}
            </span>
          </span>
        </span>
      ),
    });
  }

  // Připomínka
  const reminder = reminderText(clinic, b, now);
  if (reminder) items.push({ term: 'Připomínka', detail: reminder });

  // Kanál
  items.push({
    term: 'Vytvořeno',
    detail: (
      <span className="tnum">
        {CHANNEL_LABEL[b.channel]} · {b.createdBy === 'client' ? 'klientem' : 'personálem'} · {formatDateTimeShort(b.createdAt)}
        {b.rescheduledFrom && <span className="cal-soft"> · přesunuto z {formatDateTimeShort(b.rescheduledFrom)}</span>}
      </span>
    ),
  });

  // Kontakt
  if (client && (client.phone || client.email)) {
    items.push({
      term: 'Kontakt',
      detail: (
        <span className="cal-stack">
          {client.phone && <a href={`tel:${client.phone.replace(/\s/g, '')}`}>{client.phone}</a>}
          {client.email && <a href={`mailto:${client.email}`}>{client.email}</a>}
        </span>
      ),
    });
  }
  if (showFinance) items.push({ term: 'Kredit', detail: <span className="tnum">{formatMoney(credit)}</span> });
  return items;
}

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function reminderText(clinic: ClinicState, b: Booking, now: LocalDateTime): ReactNode {
  const msgs = clinic.messages.filter((m) => m.bookingId === b.id && m.kind === 'reminder');
  const sent = msgs.filter((m) => m.status === 'sent');
  const skipped = msgs.filter((m) => m.status === 'skipped');
  if (sent.length) {
    const channels = [...new Set(sent.map((m) => (m.channel === 'sms' ? 'SMS' : 'e-mail')))].join(' + ');
    return (
      <span className="cal-okline cal-okline--inline">
        {channels} odeslán{sent.length > 1 ? 'y' : 'a'} {formatRelative(sent[0].at, now)}
        {skipped.length ? <span className="cal-soft"> · {skipped[0].channel === 'sms' ? 'SMS' : 'e-mail'} neodeslán: {skipped[0].skipReason}</span> : null}
      </span>
    );
  }
  if (skipped.length) return <span className="text-warning">Neodesláno – {skipped[0].skipReason}</span>;
  if (b.reminderSentAt) return <span>Odesláno {formatDateTimeShort(b.reminderSentAt)}</span>;
  if (b.status !== 'confirmed' || b.start <= now) return null;
  if (!clinic.settings.reminders.enabled) return <span className="cal-soft">Připomínky jsou v nastavení vypnuté.</span>;
  const at = addHours(b.start, -clinic.settings.reminders.hoursBefore);
  return <span className="cal-soft tnum">{at > now ? `Odešle se ${formatDateTimeShort(at)}` : 'Odešle se při nejbližší kontrole'}</span>;
}

/* ------------------------------------------------------------------ */
/* Poznámka                                                            */
/* ------------------------------------------------------------------ */

function NoteEditor({ booking: b }: { booking: Booking }): JSX.Element {
  const run = useCommand();
  const [draft, setDraft] = useState(b.note);
  useEffect(() => setDraft(b.note), [b.id, b.note]);
  const dirty = draft.trim() !== b.note.trim();
  return (
    <div className="cal-note">
      <Field label="Poznámka k termínu" optional>
        <Textarea value={draft} onValueChange={setDraft} rows={2} placeholder="Např. kontrola po 3 týdnech, cviky na hrudní páteř" />
      </Field>
      {dirty && (
        <div className="cal-row">
          <Button size="sm" variant="primary" onClick={() => run(updateBookingNote, { bookingId: b.id, note: draft }, { success: 'Poznámka uložena' })}>
            Uložit poznámku
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDraft(b.note)}>
            Vrátit
          </Button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Historie změn a zpráv                                               */
/* ------------------------------------------------------------------ */

function History({ booking: b, now }: { booking: Booking; now: LocalDateTime }): JSX.Element | null {
  const clinic = useClinic();
  const [all, setAll] = useState(false);
  const entries = useMemo(() => {
    const out: { id: string; at: LocalDateTime; title: string; detail: string; meta: string; tone: 'audit' | 'message' | 'skipped' }[] = [];
    for (const a of clinic.audit) if (a.bookingId === b.id) out.push({ id: a.id, at: a.at, title: a.action, detail: a.detail, meta: a.actor, tone: 'audit' });
    for (const m of clinic.messages) {
      if (m.bookingId !== b.id) continue;
      const tpl = clinic.templates.find((t) => t.key === m.kind);
      out.push({
        id: m.id,
        at: m.at,
        title: `${m.channel === 'sms' ? 'SMS' : 'E-mail'}: ${tpl?.name ?? 'zpráva'}`,
        detail: m.status === 'sent' ? m.subject || 'odesláno' : `neodesláno – ${m.skipReason ?? ''}`,
        meta: '',
        tone: m.status === 'sent' ? 'message' : 'skipped',
      });
    }
    return out.sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0));
  }, [clinic.audit, clinic.messages, clinic.templates, b.id]);
  if (!entries.length) return null;
  const shown = all ? entries : entries.slice(0, 6);
  return (
    <section className="cal-hist" aria-labelledby={`hist-${b.id}`}>
      <h3 id={`hist-${b.id}`} className="cal-subtitle">
        Historie změn a zpráv
      </h3>
      <ol className="cal-hist__list">
        {shown.map((e) => (
          <li key={e.id} className={cx('cal-hist__item', `is-${e.tone}`)}>
            <span className="cal-hist__dot" aria-hidden="true" />
            <div className="cal-hist__body">
              <span className="cal-hist__title">{e.title}</span>
              {e.detail && <span className="cal-hist__detail">{e.detail}</span>}
              <span className="cal-hist__meta tnum">
                {formatDateTimeShort(e.at)}
                {e.at <= now ? ` · ${formatRelative(e.at, now)}` : ''}
                {e.meta ? ` · ${e.meta}` : ''}
              </span>
            </div>
          </li>
        ))}
      </ol>
      {entries.length > 6 && (
        <button type="button" className="link cal-hist__more" onClick={() => setAll(!all)}>
          {all ? 'Zobrazit méně' : `Zobrazit vše (${entries.length})`}
        </button>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Skupinová lekce                                                     */
/* ------------------------------------------------------------------ */

export function SessionPanel({
  sessionId,
  currentBookingId,
  onOpenBooking,
  heading = true,
}: {
  sessionId: Id;
  currentBookingId?: Id;
  onOpenBooking: (id: Id) => void;
  heading?: boolean;
}): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const run = useCommand();
  const [dialog, setDialog] = useState<'add' | 'cancel' | null>(null);
  const [reason, setReason] = useState('');
  const ses = getSession(clinic, sessionId);
  if (!ses) return <EmptyState compact icon="alertCircle" title="Lekce nebyla nalezena" />;
  const all = bookingsOfSession(clinic, ses.id);
  const participants = all.filter((x) => isOccupying(x.status));
  const left = all.filter((x) => !isOccupying(x.status));
  const waiting = waitingForSession(clinic, ses.id);
  const free = Math.max(0, ses.capacity - participants.length);
  const past = ses.end <= now;
  const therapist = getTherapist(clinic, ses.therapistId);
  const room = getRoom(clinic, ses.roomId);
  const today = now.slice(0, 10);

  return (
    <section className="cal-ses" aria-label={`Skupinová lekce ${ses.title}`}>
      {heading && <h3 className="cal-subtitle">Skupinová lekce</h3>}
      <div className="cal-ses__head">
        <span className="cal-ses__title">„{ses.title}“</span>
        <span className="cal-ses__meta tnum">
          {formatDayShort(ses.start)} {formatTimeRange(ses.start, ses.end)} · {[therapistName(therapist), room?.name].filter(Boolean).join(' · ')}
        </span>
      </div>
      <Progress
        value={participants.length}
        max={ses.capacity}
        segments={ses.capacity}
        tone={free === 0 ? 'warning' : 'accent'}
        label="Obsazenost lekce"
        showValue={`${participants.length}/${ses.capacity}`}
      />
      {ses.cancelled && (
        <Callout tone="danger" title="Lekce je zrušená">
          Přihlášení dostali omluvnou zprávu a platby se vrátily.
        </Callout>
      )}
      <div className="cal-ses__group">
        <span className="cal-ses__label">Přihlášení · {participants.length}</span>
        {participants.length === 0 ? (
          <p className="cal-hint">Zatím nikdo. Přidejte prvního účastníka.</p>
        ) : (
          <ul className="cal-people">
            {participants.map((x) => {
              const c = getClient(clinic, x.clientId);
              return (
                <li key={x.id}>
                  <button type="button" className={cx('cal-person', x.id === currentBookingId && 'is-current')} onClick={() => onOpenBooking(x.id)} aria-current={x.id === currentBookingId || undefined}>
                    <ClientAvatar client={c} size="xs" />
                    <span className="cal-person__name">{clientName(c)}</span>
                    <span className="cal-person__meta">{x.status === 'confirmed' ? paymentHint(clinic, x, today) : ''}</span>
                    {x.status !== 'confirmed' && <StatusPill status={x.status} appearance="plain" label={x.status === 'no_show' ? noShowLabel(c) : undefined} />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {waiting.length > 0 && (
        <div className="cal-ses__group">
          <span className="cal-ses__label">Čekací listina · {waiting.length}</span>
          <ul className="cal-people">
            {waiting.map((w) => {
              const c = getClient(clinic, w.clientId);
              return (
                <li key={w.id} className="cal-person cal-person--static">
                  <ClientAvatar client={c} size="xs" />
                  <span className="cal-person__name">{clientName(c)}</span>
                  <span className="cal-person__meta">
                    {w.status === 'offered' && w.offer ? `nabídnuto · zbývá ${formatSpan(diffMinutes(w.offer.expiresAt, now))}` : `čeká ${formatRelative(w.createdAt, now)}`}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {left.length > 0 && (
        <details className="cal-ses__left">
          <summary>Odhlášení a zrušení · {left.length}</summary>
          <ul className="cal-people">
            {left.map((x) => {
              const c = getClient(clinic, x.clientId);
              return (
                <li key={x.id}>
                  <button type="button" className="cal-person" onClick={() => onOpenBooking(x.id)}>
                    <ClientAvatar client={c} size="xs" />
                    <span className="cal-person__name">{clientName(c)}</span>
                    <StatusPill status={x.status} appearance="plain" />
                  </button>
                </li>
              );
            })}
          </ul>
        </details>
      )}
      {!past && !ses.cancelled && (
        <div className="cal-row">
          {(free > 0 || clinic.settings.waitlist.enabled) && (
            <Button size="sm" variant="secondary" icon={free > 0 ? 'userPlus' : 'hourglass'} onClick={() => setDialog('add')}>
              {free > 0 ? 'Přidat účastníka' : 'Přidat na čekací listinu'}
            </Button>
          )}
          <Button size="sm" variant="danger-secondary" icon="calendarX" onClick={() => setDialog('cancel')}>
            Zrušit lekci
          </Button>
        </div>
      )}
      <NewBookingDialog open={dialog === 'add'} onClose={() => setDialog(null)} initial={{ sessionId: ses.id, serviceId: ses.serviceId }} />
      <ConfirmDialog
        open={dialog === 'cancel'}
        onClose={() => setDialog(null)}
        tone="danger"
        title="Zrušit celou lekci?"
        message={`„${ses.title}“ ${formatDayShort(ses.start)} ${formatTimeRange(ses.start, ses.end)} · ${countLabel(participants.length, ['přihlášený', 'přihlášení', 'přihlášených'])}`}
        confirmLabel="Zrušit lekci"
        onConfirm={() => {
          const r = run(cancelSession, { sessionId: ses.id, reason: reason.trim() || 'Zrušeno klinikou' }, {
            success: (n) => (n ? `Lekce zrušena · omluva odešla ${countLabel(n, ['účastníkovi', 'účastníkům', 'účastníkům'])}` : 'Lekce zrušena'),
          });
          if (r.ok) setReason('');
        }}
      >
        <div className="cal-form">
          <p className="cal-lead">Všem přihlášeným se termín zruší ze strany kliniky – bez poplatku a s vrácením platby. Dostanou omluvnou zprávu.</p>
          <Field label="Důvod" hint="Pošle se přihlášeným ve zprávě." optional>
            <Textarea value={reason} onValueChange={setReason} rows={2} placeholder="Např. nemoc lektora" />
          </Field>
        </div>
      </ConfirmDialog>
    </section>
  );
}

/** Detail skupinové lekce (klik na lekci v kalendáři). */
export function SessionDrawer({ sessionId, onClose, onOpenBooking }: { sessionId: Id | null; onClose: () => void; onOpenBooking: (id: Id) => void }): JSX.Element | null {
  const clinic = useClinic();
  const ses = sessionId ? getSession(clinic, sessionId) : undefined;
  if (!sessionId || !ses) return null;
  return (
    <Drawer open onClose={onClose} size="md" title="Skupinová lekce">
      <div className="cal-dr">
        <SessionPanel sessionId={sessionId} onOpenBooking={onOpenBooking} heading={false} />
      </div>
    </Drawer>
  );
}
