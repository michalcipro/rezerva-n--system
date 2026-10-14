import { useMemo, useState } from 'react';
import type { Booking, Id, LocalDate, LocalDateTime, PaymentMethod } from '../../domain/types';
import { availableSlots, checkBookingSlot } from '../../engine/availability';
import { createBooking, joinWaitlist } from '../../engine/commands';
import {
  countLabel,
  formatDate,
  formatDateTimeShort,
  formatDayShort,
  formatDuration,
  formatMoney,
  formatTimeRange,
} from '../../engine/format';
import {
  clientCredit,
  clientName,
  eligibleMakeups,
  eligiblePackages,
  getClient,
  getRoom,
  getService,
  getSession,
  getTherapist,
  packageUsage,
  therapistName,
} from '../../engine/selectors';
import { addHours, addMinutes, combine, dateOf } from '../../engine/time';
import { useClinic, useCommand, useNow } from '../../store/hooks';
import { navigate, setSession } from '../../store/session';
import { Badge, Button, Dialog, Field, RadioCards, Segmented, Select, Textarea, toast, type RadioCardOption } from '../../ui';
import { defaultServiceFor, servicesByCategory } from './model';
import { ClientPicker, ServiceSelect, SessionPicker, SlotCheckNotice, SlotPicker } from './pickers';
import './calendar.css';

export interface NewBookingInitial {
  clientId?: Id;
  serviceId?: Id;
  therapistId?: Id;
  start?: LocalDateTime;
  sessionId?: Id;
  /** Předvybraná náhrada (rezervace náhradního termínu). */
  makeupId?: Id;
}

export interface NewBookingDialogProps {
  open: boolean;
  onClose: () => void;
  initial?: NewBookingInitial;
  /** Volitelně: po vytvoření (např. otevřít detail). */
  onCreated?: (bookingId: Id) => void;
}

/** Nová rezervace (recepce / terapeut): klient, služba, terapeut, volný čas, platba. */
export function NewBookingDialog({ open, onClose, initial, onCreated }: NewBookingDialogProps): JSX.Element | null {
  if (!open) return null;
  return <NewBookingForm onClose={onClose} initial={initial} onCreated={onCreated} />;
}

interface PayOption {
  key: string;
  method: PaymentMethod;
  packageId?: Id;
  makeupId?: Id;
  title: string;
  description: string;
  aside: string;
  disabled?: boolean;
  badge?: string;
}

function NewBookingForm({ onClose, initial, onCreated }: Omit<NewBookingDialogProps, 'open'>): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const run = useCommand();
  const today = dateOf(now);
  const policy = clinic.settings.policy;

  const initSession = initial?.sessionId ? getSession(clinic, initial.sessionId) : undefined;
  const groups = useMemo(() => servicesByCategory(clinic), [clinic]);

  const [clientId, setClientId] = useState<Id | null>(initial?.clientId && getClient(clinic, initial.clientId) ? initial.clientId : null);
  const [serviceId, setServiceId] = useState<Id>(() => {
    if (initSession) return initSession.serviceId;
    if (initial?.serviceId && getService(clinic, initial.serviceId)?.active) return initial.serviceId;
    return defaultServiceFor(clinic, initial?.therapistId)?.id ?? groups[0]?.services[0]?.id ?? '';
  });
  const service = getService(clinic, serviceId);
  const isGroup = service?.kind === 'group';

  const therapistOptions = useMemo(
    () =>
      (service?.therapistIds ?? [])
        .map((id) => getTherapist(clinic, id))
        .filter((t): t is NonNullable<typeof t> => !!t && t.active)
        .sort((a, b) => a.order - b.order),
    [clinic, service],
  );

  const [therapistChoice, setTherapistChoice] = useState<Id | 'any'>(() => {
    const svc = getService(clinic, serviceId);
    if (initial?.therapistId && svc?.therapistIds.includes(initial.therapistId)) return initial.therapistId;
    return svc?.therapistIds[0] ?? 'any';
  });
  const [date, setDate] = useState<LocalDate>(initSession ? dateOf(initSession.start) : initial?.start ? dateOf(initial.start) : today);
  const [start, setStart] = useState<LocalDateTime | null>(initial?.start ?? null);
  const [slotTherapist, setSlotTherapist] = useState<Id | null>(null);
  const [manual, setManual] = useState<boolean>(() => {
    // Klik do mřížky mimo volný čas → rovnou ruční zadání s upozorněním.
    if (!initial?.start || !initial.therapistId) return false;
    const svc = getService(clinic, serviceId);
    if (!svc || svc.kind === 'group') return false;
    const slots = availableSlots(clinic, { serviceId, therapistId: initial.therapistId, date: dateOf(initial.start), now, mode: 'staff' });
    return !slots.some((sl) => sl.start === initial.start);
  });
  const [sessionId, setSessionId] = useState<Id | null>(initSession?.id ?? null);
  const [payment, setPayment] = useState<string | null>(initial?.makeupId ? 'makeup:' + initial.makeupId : null);
  const [channel, setChannel] = useState<Booking['channel']>('recepce');
  const [note, setNote] = useState('');
  const [override, setOverride] = useState(false);

  const session = isGroup && sessionId ? getSession(clinic, sessionId) : undefined;
  const therapistId: Id | null = isGroup ? session?.therapistId ?? null : therapistChoice === 'any' ? slotTherapist : therapistChoice;
  const effectiveStart: LocalDateTime | null = isGroup ? session?.start ?? null : start;
  const price = service?.priceCzk ?? 0;

  /* ---------- změny ---------- */
  const changeService = (id: Id): void => {
    const svc = getService(clinic, id);
    setServiceId(id);
    setOverride(false);
    if (!svc) return;
    if (svc.kind === 'group') {
      setStart(null);
      setManual(false);
      setSessionId(null);
    } else {
      setSessionId(null);
      if (therapistChoice !== 'any' && !svc.therapistIds.includes(therapistChoice)) setTherapistChoice(svc.therapistIds[0] ?? 'any');
      if (therapistChoice === 'any' && svc.therapistIds.length <= 1) setTherapistChoice(svc.therapistIds[0] ?? 'any');
    }
  };
  const changeDate = (d: LocalDate): void => {
    setDate(d);
    setOverride(false);
    if (isGroup) setSessionId(null);
    else if (manual && start) setStart(combine(d, start.slice(11, 16)));
    else setStart(null);
  };

  /* ---------- kontrola termínu ---------- */
  const check = useMemo(() => {
    if (!clientId || !service) return null;
    if (isGroup) {
      if (!session) return null;
      return checkBookingSlot(clinic, { serviceId, therapistId: session.therapistId, start: session.start, clientId, now, mode: 'staff', sessionId: session.id });
    }
    if (!start || !therapistId) return null;
    return checkBookingSlot(clinic, { serviceId, therapistId, start, clientId, now, mode: 'staff' });
  }, [clinic, clientId, service, isGroup, session, serviceId, start, therapistId, now]);

  /* ---------- platba ---------- */
  const payOptions: PayOption[] = useMemo(() => {
    if (!clientId || !service) return [];
    const out: PayOption[] = [];
    const bookingDate = effectiveStart ? dateOf(effectiveStart) : date;
    const mkStart = effectiveStart ?? combine(date, '00:00');
    for (const mk of eligibleMakeups(clinic, clientId, serviceId, mkStart, now)) {
      const src = clinic.bookings.find((b) => b.id === mk.sourceBookingId);
      out.push({
        key: 'makeup:' + mk.id,
        method: 'makeup',
        makeupId: mk.id,
        title: 'Náhrada za omluvený termín',
        description:
          (src ? `za ${formatDayShort(src.start)} · ` : '') +
          `čerpat do ${formatDateTimeShort(mk.validUntil)}` +
          (mk.value > 0 && mk.value < price ? ` · kryje ${formatMoney(mk.value)}, zbytek na místě` : ''),
        aside: 'předplaceno',
        badge: 'Náhrada',
      });
    }
    for (const p of eligiblePackages(clinic, clientId, serviceId, bookingDate, today)) {
      const u = packageUsage(clinic, p, today);
      out.push({
        key: 'package:' + p.id,
        method: 'package',
        packageId: p.id,
        title: `Permanentka ${p.name}`,
        description: `zbývá ${countLabel(u.free, ['vstup', 'vstupy', 'vstupů'])} z ${u.total} · platnost do ${formatDate(u.validUntil)}`,
        aside: '1 vstup',
      });
    }
    const credit = clientCredit(clinic, clientId);
    out.push({ key: 'onsite', method: 'onsite', title: 'Na místě', description: 'Kartou nebo hotově při návštěvě.', aside: formatMoney(price) });
    out.push({
      key: 'credit',
      method: 'credit',
      title: 'Z kreditu',
      description: credit >= price ? `Zůstatek ${formatMoney(credit)}, po platbě ${formatMoney(credit - price)}.` : `Zůstatek ${formatMoney(credit)} nestačí.`,
      aside: formatMoney(price),
      disabled: credit < price,
    });
    out.push({ key: 'online', method: 'online', title: 'Kartou online', description: 'Simulace platební brány – zaplaceno ihned.', aside: formatMoney(price) });
    out.push({ key: 'free', method: 'free', title: 'Zdarma', description: 'Např. kontrola nebo reklamace.', aside: formatMoney(0) });
    return out;
  }, [clinic, clientId, service, serviceId, effectiveStart, date, now, today, price]);

  const selectedPay = payOptions.find((o) => o.key === payment && !o.disabled) ?? payOptions.find((o) => !o.disabled) ?? null;

  /* ---------- odeslání ---------- */
  const warnings = check?.warnings ?? [];
  const blocking = !!check && check.errors.length > 0;
  const needsOverride = warnings.length > 0 && !override;
  const sessionFull = isGroup && !!check && check.errors.some((e) => e.includes('plně obsazená'));
  const ready = !!clientId && !!service && !!therapistId && !!effectiveStart && !!check && !blocking && !needsOverride && !!selectedPay;

  const reasonMissing = !clientId
    ? 'Vyberte klienta.'
    : !service
      ? 'Vyberte službu.'
      : isGroup && !session
        ? 'Vyberte termín lekce.'
        : !effectiveStart || !therapistId
          ? 'Vyberte čas.'
          : blocking
            ? 'Termín nelze použít.'
            : needsOverride
              ? 'Potvrďte upozornění zaškrtnutím.'
              : '';

  const submit = (): void => {
    if (!ready || !clientId || !service || !therapistId || !effectiveStart || !selectedPay) return;
    const r = run(
      createBooking,
      {
        clientId,
        serviceId,
        therapistId,
        start: effectiveStart,
        sessionId: isGroup ? session?.id : undefined,
        payment: { method: selectedPay.method, packageId: selectedPay.packageId, makeupId: selectedPay.makeupId },
        channel,
        note: note.trim() || undefined,
        override: warnings.length > 0 && override,
      },
      { quiet: true },
    );
    if (!r.ok) return;
    const client = getClient(clinic, clientId);
    const at = effectiveStart;
    toast.success('Rezervace vytvořena', {
      description: [`${clientName(client)} · ${service.name} · ${formatDayShort(at)} ${formatTimeRange(at, addMinutes(at, service.durationMin))}`, ...r.notices].join(' '),
      action: {
        label: 'Zobrazit v kalendáři',
        onClick: () => {
          setSession({ calendarDate: dateOf(at), calendarView: 'day' });
          navigate({ name: 'kalendar' });
        },
      },
    });
    onCreated?.(r.value);
    onClose();
  };

  const joinWaitlistFor = (opts: { sessionId?: Id }): void => {
    if (!clientId || !service) return;
    const ses = opts.sessionId ? getSession(clinic, opts.sessionId) : undefined;
    const r = run(
      joinWaitlist,
      {
        clientId,
        serviceId,
        therapistId: ses ? null : therapistChoice === 'any' ? null : therapistChoice,
        dateFrom: ses ? dateOf(ses.start) : date,
        sessionId: ses?.id,
        note: note.trim() || undefined,
      },
      { success: ses ? `Klient čeká na místo – ${ses.title} ${formatDayShort(ses.start)}` : `Klient je na čekací listině na ${formatDayShort(date)}` },
    );
    if (r.ok) onClose();
  };

  const freeUntil = effectiveStart ? addHours(effectiveStart, -(isGroup ? policy.groupCancelHours : policy.freeCancelHours)) : null;
  const therapist = therapistId ? getTherapist(clinic, therapistId) : undefined;
  const room = isGroup && session ? getRoom(clinic, session.roomId) : therapist ? getRoom(clinic, therapist.roomId) : undefined;
  const noSlotsToday =
    !isGroup &&
    !manual &&
    !!service &&
    !!clientId &&
    availableSlots(clinic, { serviceId, therapistId: therapistChoice, date, now, mode: 'staff', clientId }).filter((sl) => date !== today || sl.start >= now).length === 0 &&
    date >= today;

  const payCards: RadioCardOption<string>[] = payOptions.map((o) => ({
    value: o.key,
    title: o.title,
    description: o.description,
    aside: o.aside,
    disabled: o.disabled,
    badge: o.badge ? <Badge tone="info">{o.badge}</Badge> : undefined,
  }));

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={initSession ? 'Přidat účastníka lekce' : 'Nová rezervace'}
      description={initSession ? `${initSession.title} · ${formatDayShort(initSession.start)} ${formatTimeRange(initSession.start, initSession.end)}` : undefined}
      footer={
        <>
          {reasonMissing && <span className="cal-footnote">{reasonMissing}</span>}
          <Button variant="secondary" onClick={onClose}>
            Zpět
          </Button>
          <Button variant="primary" icon="calendarPlus" disabled={!ready} onClick={submit}>
            Vytvořit rezervaci
          </Button>
        </>
      }
    >
      <div className="cal-form">
        <section className="cal-form__section" aria-labelledby="nb-client">
          <h3 id="nb-client" className="cal-form__title">
            Klient
          </h3>
          <ClientPicker clientId={clientId} onChange={(id) => setClientId(id)} />
        </section>

        <section className="cal-form__section" aria-labelledby="nb-service">
          <h3 id="nb-service" className="cal-form__title">
            Služba a terapeut
          </h3>
          <div className={isGroup ? 'cal-form__one' : 'cal-grid2'}>
            <Field label="Služba" hint={service ? `${formatDuration(service.durationMin)} · ${formatMoney(service.priceCzk)}${service.newClientsOnly ? ' · jen pro nové klienty' : ''}` : undefined}>
              <ServiceSelect groups={groups} value={serviceId} onChange={changeService} disabled={!!initSession} />
            </Field>
            {!isGroup && (
              <Field label="Terapeut">
                <Select
                  value={therapistChoice}
                  onValueChange={(v) => {
                    setTherapistChoice(v);
                    setSlotTherapist(null);
                    setOverride(false);
                    if (!manual) setStart(null);
                  }}
                  options={[
                    ...(therapistOptions.length > 1 ? [{ value: 'any', label: 'Kdokoli – první volný' }] : []),
                    ...therapistOptions.map((t) => ({ value: t.id, label: therapistName(t) })),
                  ]}
                />
              </Field>
            )}
          </div>
        </section>

        <section className="cal-form__section" aria-labelledby="nb-time">
          <h3 id="nb-time" className="cal-form__title">
            {isGroup ? 'Termín lekce' : 'Datum a čas'}
          </h3>
          {service && isGroup ? (
            <SessionPicker
              serviceId={serviceId}
              date={date}
              onDateChange={changeDate}
              value={sessionId}
              onChange={(id) => {
                setSessionId(id);
                setOverride(false);
              }}
              clientId={clientId}
              onWaitlist={(id) => joinWaitlistFor({ sessionId: id })}
            />
          ) : service ? (
            <SlotPicker
              serviceId={serviceId}
              therapistId={therapistChoice}
              date={date}
              onDateChange={changeDate}
              value={start}
              valueTherapistId={slotTherapist}
              onChange={(s, t) => {
                setStart(s);
                setSlotTherapist(t);
                setOverride(false);
              }}
              clientId={clientId}
              manual={manual}
              onManualChange={(m) => {
                setManual(m);
                setOverride(false);
                if (!m) setStart(null);
              }}
            />
          ) : null}
          {!sessionFull && (
            <SlotCheckNotice
              check={check}
              override={override}
              onOverride={setOverride}
              pending={!clientId && (start || session) ? 'Po výběru klienta se termín ověří (souběh, pracovní doba, pravidla).' : undefined}
            />
          )}
          {noSlotsToday && clinic.settings.waitlist.enabled && (
            <div className="cal-row">
              <Button size="sm" variant="secondary" icon="hourglass" onClick={() => joinWaitlistFor({})}>
                Přidat na čekací listinu na {formatDayShort(date)}
              </Button>
            </div>
          )}
        </section>

        <section className="cal-form__section" aria-labelledby="nb-pay">
          <h3 id="nb-pay" className="cal-form__title">
            Platba
          </h3>
          {clientId ? (
            <RadioCards aria-label="Způsob platby" columns={2} value={selectedPay?.key ?? null} onChange={setPayment} options={payCards} />
          ) : (
            <p className="cal-hint">Možnosti platby (permanentky, kredit, náhrady) se ukážou po výběru klienta.</p>
          )}
        </section>

        <section className="cal-form__section" aria-labelledby="nb-more">
          <h3 id="nb-more" className="cal-form__title">
            Kanál a poznámka
          </h3>
          <div className="cal-form__inline">
            <Segmented
              aria-label="Kanál rezervace"
              value={channel === 'online' ? 'recepce' : channel}
              onChange={(v) => setChannel(v)}
              options={[
                { value: 'recepce', label: 'Recepce', icon: 'building' },
                { value: 'telefon', label: 'Telefon', icon: 'phone' },
              ]}
            />
          </div>
          <Field label="Poznámka k termínu" optional>
            <Textarea value={note} onValueChange={setNote} rows={2} placeholder="Např. kontrola po 3 týdnech, přinést zprávu z MRI" />
          </Field>
        </section>

        <section className="cal-summary" aria-label="Souhrn rezervace">
          <dl className="cal-summary__list">
            <div>
              <dt>Klient</dt>
              <dd>{clientId ? clientName(getClient(clinic, clientId)) : '—'}</dd>
            </div>
            <div>
              <dt>Služba</dt>
              <dd>{service ? `${service.name} · ${formatMoney(price)}` : '—'}</dd>
            </div>
            <div>
              <dt>Termín</dt>
              <dd className="tnum">
                {effectiveStart && service
                  ? `${formatDayShort(effectiveStart)} ${formatTimeRange(effectiveStart, isGroup && session ? session.end : addMinutes(effectiveStart, service.durationMin))}`
                  : '—'}
              </dd>
            </div>
            <div>
              <dt>Terapeut</dt>
              <dd>{therapist ? `${therapistName(therapist)}${room ? ' · ' + room.name : ''}` : '—'}</dd>
            </div>
            <div>
              <dt>Platba</dt>
              <dd>{selectedPay ? selectedPay.title : '—'}</dd>
            </div>
            <div>
              <dt>Storno</dt>
              <dd className="tnum">{freeUntil ? (freeUntil > now ? `zdarma do ${formatDateTimeShort(freeUntil)}` : 'bezplatná lhůta už uplynula') : '—'}</dd>
            </div>
          </dl>
        </section>
      </div>
    </Dialog>
  );
}
