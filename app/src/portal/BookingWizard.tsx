import { useEffect, useMemo, useRef, useState } from 'react';
import type { Booking, ClinicState, Id, LocalDate, LocalDateTime, MakeupRight, Service } from '../domain/types';
import { TherapistAvatar, ToneDot } from '../components/domain';
import { checkBookingSlot, type Slot } from '../engine/availability';
import { createBooking, joinWaitlist, leaveWaitlist, rescheduleBooking } from '../engine/commands';
import {
  countLabel,
  formatDateLong,
  formatDayShort,
  formatDuration,
  formatMoney,
  formatTime,
  formatTimeRange,
  WEEKDAY_SHORT,
} from '../engine/format';
import { paymentLabel } from '../engine/messages';
import { evaluateCancellation } from '../engine/policy';
import {
  bookingsOfClient,
  eligiblePackages,
  getBooking,
  getCategory,
  getMakeup,
  getService,
  getSession,
  getTherapist,
  therapistName,
  therapistShort,
} from '../engine/selectors';
import { addDays, dateOf, daysBetween, weekdayOf } from '../engine/time';
import { useClinic, useCommand, useNow } from '../store/hooks';
import type { PortalRoute } from '../store/session';
import {
  ActionBar,
  Badge,
  Button,
  Callout,
  Card,
  Checkbox,
  ChoiceChips,
  DescriptionList,
  EmptyState,
  Field,
  Icon,
  IconButton,
  Progress,
  RadioCards,
  Textarea,
  cx,
} from '../ui';
import { usePortal } from './context';
import {
  activeTherapistsFor,
  bookableServices,
  bookingTitle,
  calendarText,
  dayInfo,
  defaultPaymentKey,
  draftBooking,
  excuseSentence,
  groupByDayPart,
  monthRangeLabel,
  nearestFreeDate,
  paymentOptions,
  placeLabel,
  relativeDay,
  slotsFor,
  termsInfo,
  upcomingCount,
  watchFor,
  whenLabel,
  type DayInfo,
  type DayQuery,
} from './logic';
import { PaymentPicker, PolicySheet, SimulatedPaymentNote, TermsBox, useSimulatedPayment } from './payment';
import { CopyBlock, DateBadge, MetaLine, ResultHero, Screen, SectionTitle, Sheet, StateChip, StepProgress } from './parts';

type Step = 'sluzba' | 'terapeut' | 'termin' | 'souhrn' | 'hotovo';
type RezervaceRoute = Extract<PortalRoute, { name: 'rezervace' }>;

interface Flow {
  kind: 'new' | 'makeup' | 'reschedule';
  services: Service[];
  original?: Booking;
  makeup?: MakeupRight;
  /** Přesun po bezplatné lhůtě – uplatní se omluvenka. */
  useExcuse?: boolean;
  /** Poslední den pro výběr (lhůta náhrady). */
  lastDate: LocalDate | null;
  /** Termín nejpozději (lhůta náhrady). */
  latestStart: LocalDateTime | null;
  invalid?: { title: string; text: string };
}

const STRIP_DAYS = 14;

function resolveFlow(s: ClinicState, clientId: Id, route: RezervaceRoute, now: LocalDateTime): Flow {
  const all = bookableServices(s, clientId);
  if (route.rescheduleBookingId) {
    const b = getBooking(s, route.rescheduleBookingId);
    const base: Flow = { kind: 'reschedule', services: [], lastDate: null, latestStart: null };
    if (!b || b.clientId !== clientId || b.status !== 'confirmed' || b.start <= now) {
      return { ...base, invalid: { title: 'Termín už nelze přesunout', text: 'Termín mezitím začal, proběhl nebo byl zrušený.' } };
    }
    const svc = getService(s, b.serviceId);
    if (!svc) return { ...base, invalid: { title: 'Služba už není v nabídce', text: 'Termín přesune recepce.' } };
    if (svc.newClientsOnly) {
      return {
        ...base,
        original: b,
        invalid: {
          title: 'Vstupní vyšetření přesune recepce',
          text: 'Napište nebo zavolejte na recepci, rádi vám najdou jiný čas. Případně termín zrušte a zarezervujte si nový.',
        },
      };
    }
    const ev = evaluateCancellation(s, b, now, 'client');
    if (ev.phase !== 'free' && !ev.excuse.allowed) {
      return {
        ...base,
        original: b,
        invalid: {
          title: 'Termín už nelze přesunout',
          text: `Bezplatná lhůta pro přesun uplynula a omluvenku teď uplatnit nejde (${ev.excuse.reason.replace(/\.$/, '').toLocaleLowerCase('cs-CZ')}). V detailu termínu ho můžete zrušit.`,
        },
      };
    }
    return { ...base, original: b, services: [svc], useExcuse: ev.phase !== 'free' };
  }
  if (route.makeupId) {
    const m = getMakeup(s, route.makeupId);
    if (m && m.clientId === clientId && m.status === 'open' && m.validUntil > now) {
      return { kind: 'makeup', makeup: m, services: all.filter((x) => m.serviceIds.includes(x.id)), lastDate: dateOf(m.validUntil), latestStart: m.validUntil };
    }
    return {
      kind: 'makeup',
      services: [],
      lastDate: null,
      latestStart: null,
      invalid: { title: 'Náhrada už není k dispozici', text: 'Náhradu jste už využili nebo jí uplynula lhůta. Termín si můžete zarezervovat běžně.' },
    };
  }
  return { kind: 'new', services: all, lastDate: null, latestStart: null };
}

export function BookingWizard({ route }: { route: RezervaceRoute }): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const run = useCommand();
  const { client, go, scrollToTop } = usePortal();
  const today = dateOf(now);
  const [flow] = useState(() => resolveFlow(clinic, client.id, route, now));
  const original = flow.original;

  /* ---------- výchozí stav podle vstupu ---------- */
  const init = useMemo(() => {
    let serviceId: Id | null = null;
    let therapistId: Id | 'any' | null = null;
    if (original) {
      serviceId = original.serviceId;
      therapistId = original.sessionId ? 'any' : original.therapistId;
    } else if (flow.services.length === 1 && flow.kind === 'makeup') {
      serviceId = flow.services[0].id;
    } else if (route.serviceId && flow.services.some((x) => x.id === route.serviceId)) {
      serviceId = route.serviceId;
    }
    if (serviceId && therapistId === null) {
      const svc = getService(clinic, serviceId);
      if (svc) therapistId = autoTherapist(clinic, svc);
    }
    let date: LocalDate | null = null;
    if (serviceId && therapistId) {
      const q: DayQuery = { serviceId, therapistId, now, clientId: client.id, ignoreBookingId: original?.id, lastDate: flow.lastDate };
      date = nearestFreeDate(clinic, q, today) ?? today;
    }
    return { serviceId, therapistId, date };
    // jen při otevření průvodce
  }, []);

  const [serviceId, setServiceId] = useState<Id | null>(init.serviceId);
  const [therapistId, setTherapistId] = useState<Id | 'any' | null>(init.therapistId);
  const maxWin = maxWindowStart(clinic, flow, today);
  const [date, setDate] = useState<LocalDate | null>(init.date);
  const [winStart, setWinStart] = useState<LocalDate>(() => (init.date ? windowFor(init.date, today, maxWin) : today));
  const [slot, setSlot] = useState<Slot | null>(null);
  const [payKey, setPayKey] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [agree, setAgree] = useState(false);
  const [doneId, setDoneId] = useState<Id | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [step, setStepRaw] = useState<Step>(() => (!init.serviceId ? 'sluzba' : init.therapistId === null ? 'terapeut' : 'termin'));
  const pay = useSimulatedPayment();

  const service = serviceId ? getService(clinic, serviceId) : undefined;
  const therapists = useMemo(() => (service ? activeTherapistsFor(clinic, service) : []), [clinic, service]);

  const query: DayQuery | null =
    service && therapistId
      ? { serviceId: service.id, therapistId, now, clientId: client.id, ignoreBookingId: original?.id, lastDate: flow.lastDate }
      : null;

  /* ---------- kroky ---------- */
  const serviceLocked = !!original || (flow.kind === 'makeup' && flow.services.length === 1);
  const therapistStep = !service || (service.kind === 'individual' && therapists.length > 1);
  const steps: Step[] = [...(serviceLocked ? [] : (['sluzba'] as Step[])), ...(therapistStep ? (['terapeut'] as Step[]) : []), 'termin', 'souhrn'];
  const stepIndex = steps.indexOf(step);

  const setStep = (next: Step): void => {
    setStepRaw(next);
    scrollToTop();
  };

  const exit = (): void => {
    if (original) go({ name: 'termin', bookingId: original.id });
    else go({ name: 'domu' });
  };

  const back = (): void => {
    const i = steps.indexOf(step);
    if (step === 'hotovo' || i <= 0) exit();
    else setStep(steps[i - 1]);
  };

  /* ---------- výběry ---------- */
  const startTime = (svc: Service, th: Id | 'any'): void => {
    const q: DayQuery = { serviceId: svc.id, therapistId: th, now, clientId: client.id, ignoreBookingId: original?.id, lastDate: flow.lastDate };
    const first = nearestFreeDate(clinic, q, today) ?? today;
    setDate(first);
    setWinStart(windowFor(first, today, maxWin));
    setSlot(null);
  };

  const pickService = (svc: Service): void => {
    setServiceId(svc.id);
    setSlot(null);
    setPayKey(null);
    const th = autoTherapist(clinic, svc);
    setTherapistId(th);
    if (th) {
      startTime(svc, th);
      setStep('termin');
    } else setStep('terapeut');
  };

  const pickTherapist = (th: Id | 'any'): void => {
    if (!service) return;
    setTherapistId(th);
    startTime(service, th);
    setStep('termin');
  };

  if (flow.invalid) {
    return (
      <Screen title={flow.kind === 'reschedule' ? 'Přesunout termín' : 'Náhradní termín'} onBack={exit} dock={null}>
        <EmptyState
          icon="calendarX"
          title={flow.invalid.title}
          text={flow.invalid.text}
          action={
            <div className="por-empty-actions">
              {original && (
                <Button variant="primary" onClick={() => go({ name: 'termin', bookingId: original.id })}>
                  Zpět na termín
                </Button>
              )}
              <Button variant={original ? 'secondary' : 'primary'} onClick={() => go({ name: 'rezervace' })}>
                Nová rezervace
              </Button>
            </div>
          }
        />
      </Screen>
    );
  }

  const title = flow.kind === 'reschedule' ? 'Přesunout termín' : flow.kind === 'makeup' ? 'Náhradní termín' : 'Nová rezervace';
  const progressRight =
    step !== 'hotovo' && stepIndex >= 0 ? <span className="por-top__step tnum">{`Krok ${stepIndex + 1} z ${steps.length}`}</span> : undefined;
  const progressBelow = step !== 'hotovo' && stepIndex >= 0 ? <StepProgress step={stepIndex + 1} total={steps.length} /> : undefined;

  const banner = <FlowBanner flow={flow} />;

  /* ---------- 1) služba ---------- */
  if (step === 'sluzba') {
    return (
      <Screen key="sluzba" title={title} onBack={back} right={progressRight} below={progressBelow} dock={flow.kind === 'new' ? undefined : null}>
        {banner}
        <ServiceStep flow={flow} onPick={pickService} />
      </Screen>
    );
  }

  if (!service) {
    return (
      <Screen title={title} onBack={exit} dock={null}>
        <EmptyState icon="info" title="Služba není dostupná" text="Vyberte prosím jinou službu." action={<Button onClick={() => setStep('sluzba')}>Vybrat službu</Button>} />
      </Screen>
    );
  }

  /* ---------- 2) terapeut ---------- */
  if (step === 'terapeut') {
    return (
      <Screen key="terapeut" title={title} onBack={back} right={progressRight} below={progressBelow} dock={null}>
        {banner}
        <ServiceSummary service={service} onChange={serviceLocked ? undefined : () => setStep('sluzba')} />
        <TherapistStep service={service} flow={flow} onPick={pickTherapist} />
      </Screen>
    );
  }

  /* ---------- 5) hotovo ---------- */
  if (step === 'hotovo' && doneId) {
    return <DoneStep bookingId={doneId} rescheduledFrom={original} onHome={() => go({ name: 'domu' })} />;
  }

  if (!query || !therapistId) {
    return (
      <Screen title={title} onBack={back} dock={null}>
        <EmptyState icon="info" title="Vyberte terapeuta" action={<Button onClick={() => setStep('terapeut')}>Vybrat</Button>} />
      </Screen>
    );
  }

  const currentDate = date ?? today;
  const slotTherapist = slot ? getTherapist(clinic, slot.therapistId) : therapistId !== 'any' ? getTherapist(clinic, therapistId) : undefined;

  /* platba – náhled pro lištu i souhrn */
  const payOpts = slot && !original ? paymentOptions(clinic, { clientId: client.id, serviceId: service.id, start: slot.start, now }) : [];
  const effectivePayKey = payKey && payOpts.some((o) => o.key === payKey && !o.disabled) ? payKey : defaultPaymentKey(payOpts, flow.makeup?.id);
  const payment = payOpts.find((o) => o.key === effectivePayKey) ?? null;

  const draft =
    slot && (payment || original)
      ? original
        ? rescheduledDraft(original, slot, !!flow.useExcuse)
        : draftBooking(clinic, {
            clientId: client.id,
            serviceId: service.id,
            therapistId: slot.therapistId,
            start: slot.start,
            end: slot.end,
            sessionId: slot.sessionId,
            payment: payment!.payment,
            now,
          })
      : null;
  const terms = draft ? termsInfo(clinic, draft, now) : null;

  /* ---------- 3) termín ---------- */
  if (step === 'termin') {
    const freeHours = service.kind === 'group' ? clinic.settings.policy.groupCancelHours : clinic.settings.policy.freeCancelHours;
    const summary = (
      <div className="por-sum">
        <div className="por-sum__row">
          <span className="por-sum__when tnum">{slot ? `${formatDayShort(slot.start)} · ${formatTimeRange(slot.start, slot.end)}` : 'Vyberte čas'}</span>
          {slotTherapist && <span className="por-sum__who">{therapistName(slotTherapist)}</span>}
        </div>
        {slot && original && <span className="por-sum__line">Platba zůstává: {paymentLabel(clinic, original)}</span>}
        {slot && payment && <span className="por-sum__line">Platba: {payment.summary}</span>}
        <span className="por-sum__policy">
          <Icon name="clock" size={14} />
          {original
            ? flow.useExcuse
              ? 'Přesun po lhůtě se počítá jako omluvenka'
              : 'Přesun je zdarma'
            : terms
              ? terms.short
              : `Zrušení zdarma až ${freeHours} h před termínem`}
        </span>
      </div>
    );
    return (
      <Screen
        key="termin"
        title={title}
        onBack={back}
        right={progressRight}
        below={progressBelow}
        dock={
          <ActionBar summary={summary}>
            <Button variant="primary" size="lg" disabled={!slot} onClick={() => setStep('souhrn')}>
              Pokračovat
            </Button>
          </ActionBar>
        }
      >
        {banner}
        <ServiceSummary
          service={service}
          therapistId={therapistId}
          onChange={therapistStep ? () => setStep('terapeut') : serviceLocked ? undefined : () => setStep('sluzba')}
        />
        <TimeStep
          service={service}
          query={query}
          flow={flow}
          date={currentDate}
          winStart={winStart}
          slot={slot}
          onDate={(d) => {
            setDate(d);
            setSlot(null);
          }}
          onWindow={setWinStart}
          onSlot={setSlot}
        />
      </Screen>
    );
  }

  /* ---------- 4) souhrn ---------- */
  if (!slot || !draft || !terms) {
    return (
      <Screen title={title} onBack={() => setStep('termin')} dock={null}>
        <EmptyState icon="clock" title="Vyberte čas" action={<Button onClick={() => setStep('termin')}>Vybrat čas</Button>} />
      </Screen>
    );
  }

  const check = checkBookingSlot(clinic, {
    serviceId: service.id,
    therapistId: slot.therapistId,
    start: slot.start,
    clientId: client.id,
    now,
    mode: 'client',
    sessionId: slot.sessionId,
    ignoreBookingId: original?.id,
  });
  const online = payment?.payment.method === 'online';
  const canConfirm = check.ok && (original ? true : !!payment && agree);
  const ctaLabel = original
    ? flow.useExcuse
      ? 'Přesunout s omluvenkou'
      : 'Přesunout termín'
    : online && payment
      ? `Zaplatit ${formatMoney(payment.amount)} a rezervovat`
      : 'Potvrdit rezervaci';

  const confirm = (): void => {
    if (original) {
      const r = run(
        rescheduleBooking,
        { bookingId: original.id, start: slot.start, therapistId: slot.therapistId, sessionId: slot.sessionId, useExcuse: flow.useExcuse },
        { quiet: true },
      );
      if (r.ok) {
        setDoneId(r.value);
        setStep('hotovo');
      }
      return;
    }
    if (!payment) return;
    pay.run(online, () => {
      const r = run(
        createBooking,
        { clientId: client.id, serviceId: service.id, therapistId: slot.therapistId, start: slot.start, sessionId: slot.sessionId, payment: payment.payment, note },
        { quiet: true },
      );
      if (r.ok) {
        setDoneId(r.value);
        setStep('hotovo');
      } else if (!slotsFor(clinic, query, dateOf(slot.start)).some((x) => x.start === slot.start && (x.freeSpots === undefined || x.freeSpots > 0))) {
        setSlot(null);
        setStep('termin');
      }
    });
  };

  const totalLine = original
    ? `Platba zůstává: ${paymentLabel(clinic, original)}`
    : payment
      ? payment.payment.method === 'package' || payment.payment.method === 'makeup'
        ? payment.amount > 0
          ? `Doplatek na místě ${formatMoney(payment.amount)}`
          : `Hrazeno: ${payment.summary}`
        : payment.payment.method === 'onsite'
          ? `Zaplatíte na místě ${formatMoney(payment.amount)}`
          : `K úhradě teď ${formatMoney(payment.amount)}`
      : 'Vyberte způsob platby';

  return (
    <Screen
      key="souhrn"
      title={title}
      onBack={back}
      right={progressRight}
      below={progressBelow}
      dock={
        <ActionBar summary={<span className="por-sum__total">{totalLine}</span>}>
          <Button variant="primary" size="lg" disabled={!canConfirm} loading={pay.paying} onClick={confirm}>
            {pay.paying ? 'Probíhá platba…' : ctaLabel}
          </Button>
        </ActionBar>
      }
    >
      <BookingPreview service={service} slot={slot} original={original} />
      {!check.ok && (
        <Callout tone="danger" title="Termín teď nejde potvrdit">
          {check.errors[0]}
        </Callout>
      )}
      {original ? (
        <RescheduleNote flow={flow} />
      ) : (
        <>
          <PaymentPicker options={payOpts} value={effectivePayKey} onChange={setPayKey} />
          {online && payment && <SimulatedPaymentNote amount={formatMoney(payment.amount)} />}
          <Field label="Poznámka pro terapeuta" optional hint="Uvidí ji jen personál kliniky.">
            <Textarea rows={2} maxLength={300} value={note} onValueChange={setNote} placeholder="Např. bolest kolene po běhu" />
          </Field>
        </>
      )}
      <TermsBox terms={terms} onShowPolicy={() => setPolicyOpen(true)} title={original ? 'Podmínky nového termínu' : 'Storno podmínky'} />
      {!original && (
        <Checkbox
          className="por-agree"
          checked={agree}
          onChange={setAgree}
          label="Souhlasím se storno podmínkami"
          description="Potvrzení rezervace vám pošleme e-mailem."
        />
      )}
      <PolicySheet open={policyOpen} onClose={() => setPolicyOpen(false)} />
    </Screen>
  );
}

/** Nový termín po přesunu – po lhůtě se platí náhradou za omluvený termín. */
function rescheduledDraft(original: Booking, slot: Slot, useExcuse: boolean): Booking {
  const p = original.payment;
  const prepaid = p.method === 'package' || (p.paid && p.paidAmount > 0);
  return {
    ...original,
    start: slot.start,
    end: slot.end,
    therapistId: slot.therapistId,
    sessionId: slot.sessionId ?? original.sessionId,
    payment:
      useExcuse && prepaid
        ? { method: 'makeup', paid: true, paidAmount: p.packageId ? 0 : p.paidAmount, packageId: p.packageId }
        : useExcuse
          ? { method: 'onsite', paid: false, paidAmount: 0 }
          : p,
  };
}

/** Terapeut, kterého lze doplnit automaticky (skupinová lekce / jediný terapeut). */
function autoTherapist(s: ClinicState, svc: Service): Id | 'any' | null {
  if (svc.kind === 'group') return 'any';
  const list = activeTherapistsFor(s, svc);
  if (list.length === 1) return list[0].id;
  return null;
}

/** Poslední možný začátek pásu dní (horizont rezervací nebo lhůta náhrady). */
function maxWindowStart(s: ClinicState, flow: Flow, today: LocalDate): LocalDate {
  const horizon = s.settings.bookingRules.horizonDays;
  const last = flow.lastDate ? Math.min(horizon, daysBetween(today, flow.lastDate)) : horizon;
  return addDays(today, Math.max(0, last - STRIP_DAYS + 1));
}

/** Začátek pásu tak, aby byl daný den vidět (s trochou kontextu před ním). */
function windowFor(date: LocalDate, today: LocalDate, maxStart: LocalDate): LocalDate {
  let start = daysBetween(today, date) < STRIP_DAYS ? today : addDays(date, -2);
  if (start > maxStart) start = maxStart;
  if (start < today) start = today;
  return start;
}

/* ------------------------------------------------------------------ */
/* Bannery                                                             */
/* ------------------------------------------------------------------ */

function FlowBanner({ flow }: { flow: Flow }): JSX.Element | null {
  const clinic = useClinic();
  const now = useNow();
  if (flow.makeup) {
    const src = getBooking(clinic, flow.makeup.sourceBookingId);
    return (
      <Callout tone="accent" icon="repeat">
        Náhrada za omluvený termín{src ? ` ${formatDayShort(src.start)}` : ''} · vyberte do {formatDayShort(flow.makeup.validUntil)}
      </Callout>
    );
  }
  if (flow.original) {
    const ex = evaluateCancellation(clinic, flow.original, now, 'client').excuse;
    return (
      <Callout tone={flow.useExcuse ? 'warning' : 'accent'} icon="repeat">
        Přesouváte {bookingTitle(clinic, flow.original)} {formatDayShort(flow.original.start)} {formatTimeRange(flow.original.start, flow.original.end)}.{' '}
        {flow.useExcuse ? `Po lhůtě se přesun počítá jako omluvenka (${excuseSentence(clinic, ex)}).` : 'Přesun je zdarma.'}
      </Callout>
    );
  }
  return null;
}

function RescheduleNote({ flow }: { flow: Flow }): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  if (!flow.original) return <></>;
  const ev = evaluateCancellation(clinic, flow.original, now, 'client');
  return flow.useExcuse ? (
    <Callout tone="warning" title="Přesun s omluvenkou">
      Bezplatná lhůta uplynula, proto se původní termín omluví ({excuseSentence(clinic, ev.excuse)}). Nový termín uhradíte náhradou za
      omluvený termín{flow.original.payment.method === 'package' ? ' z permanentky' : ''}.
    </Callout>
  ) : (
    <Callout tone="success" icon="checkCircle" title="Přesun zdarma">
      Jste v bezplatné lhůtě – původní termín uvolníme, platba se převede na nový čas.
    </Callout>
  );
}

/* ------------------------------------------------------------------ */
/* Krok 1: služba                                                      */
/* ------------------------------------------------------------------ */

function ServiceStep({ flow, onPick }: { flow: Flow; onPick: (svc: Service) => void }): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const { client, go } = usePortal();
  const today = dateOf(now);
  const [cat, setCat] = useState<string>('all');
  const limit = clinic.settings.bookingRules.maxUpcomingPerClient;
  const upcoming = upcomingCount(clinic, client.id, now);

  const groups = useMemo(() => {
    const map = new Map<string, Service[]>();
    for (const svc of flow.services) {
      const list = map.get(svc.categoryId) ?? [];
      list.push(svc);
      map.set(svc.categoryId, list);
    }
    return [...map.entries()]
      .map(([id, services]) => ({ cat: getCategory(clinic, id), id, services }))
      .sort((a, b) => (a.cat?.order ?? 99) - (b.cat?.order ?? 99));
  }, [clinic, flow.services]);

  const withPackage = useMemo(
    () => new Set(flow.services.filter((svc) => eligiblePackages(clinic, client.id, svc.id, today, today).length > 0).map((svc) => svc.id)),
    [clinic, client.id, flow.services, today],
  );

  if (!flow.services.length) {
    return (
      <EmptyState
        icon="calendarX"
        title="Online teď nic rezervovat nelze"
        text="Klinika zatím nenabízí žádné služby k online rezervaci. Ozvěte se prosím na recepci."
      />
    );
  }

  const visible = cat === 'all' ? groups : groups.filter((g) => g.id === cat);

  return (
    <>
      {upcoming >= limit && flow.kind !== 'makeup' && (
        <Callout
          tone="warning"
          title="Máte plný počet rezervací"
          actions={
            <Button size="sm" variant="secondary" onClick={() => go({ name: 'moje' })}>
              Moje termíny
            </Button>
          }
        >
          Najednou můžete mít nejvýše {countLabel(limit, ['nadcházející termín', 'nadcházející termíny', 'nadcházejících termínů'])}. Až
          některý proběhne nebo ho zrušíte, můžete rezervovat další.
        </Callout>
      )}
      {groups.length > 1 && (
        <div className="por-scroller">
          <ChoiceChips
            aria-label="Kategorie služeb"
            value={cat}
            onChange={setCat}
            className="por-catchips"
            options={[{ value: 'all', label: 'Vše' }, ...groups.map((g) => ({ value: g.id, label: g.cat?.name ?? 'Ostatní' }))]}
          />
        </div>
      )}
      {visible.map((g) => (
        <section key={g.id} className="por-stack" aria-labelledby={`por-cat-${g.id}`}>
          <SectionTitle id={`por-cat-${g.id}`}>
            <span className="por-cat-title">
              <ToneDot tone={g.cat?.tone ?? 'slate'} />
              {g.cat?.name ?? 'Ostatní'}
            </span>
          </SectionTitle>
          <div className="por-list">
            {g.services.map((svc) => (
              <button key={svc.id} type="button" className="por-svc" onClick={() => onPick(svc)}>
                <span className="por-svc__body">
                  <span className="por-svc__name">{svc.name}</span>
                  <span className="por-svc__meta tnum">
                    {formatDuration(svc.durationMin)} · {formatMoney(svc.priceCzk)}
                    {svc.kind === 'group' ? ` · skupina až ${svc.capacity} osob` : ''}
                  </span>
                  {svc.description && <span className="por-svc__desc">{svc.description}</span>}
                  {(withPackage.has(svc.id) || svc.remote || svc.newClientsOnly) && (
                    <span className="por-svc__badges">
                      {withPackage.has(svc.id) && (
                        <Badge tone="accent" icon="ticket">
                          Máte permanentku
                        </Badge>
                      )}
                      {svc.remote && (
                        <Badge tone="info" icon="video">
                          Videohovor
                        </Badge>
                      )}
                      {svc.newClientsOnly && <Badge tone="success">Pro nové klienty</Badge>}
                    </span>
                  )}
                </span>
                <Icon name="chevronRight" size={18} className="por-svc__chev" />
              </button>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

/** Karta vybrané služby a terapeuta s odkazem „Změnit“. */
function ServiceSummary({ service, therapistId, onChange }: { service: Service; therapistId?: Id | 'any' | null; onChange?: () => void }): JSX.Element {
  const clinic = useClinic();
  const cat = getCategory(clinic, service.categoryId);
  const t = therapistId && therapistId !== 'any' ? getTherapist(clinic, therapistId) : undefined;
  const who = service.kind === 'group' ? 'Skupinová lekce' : therapistId === 'any' ? 'Kdokoli z týmu' : t ? therapistName(t) : null;
  return (
    <div className="por-svcsum">
      <div className="por-svcsum__body">
        <span className="por-svcsum__name tnum">
          <ToneDot tone={cat?.tone ?? 'slate'} />
          {service.name} · {formatMoney(service.priceCzk)}
        </span>
        {who && (
          <span className="por-svcsum__who">
            {t ? (
              <TherapistAvatar therapist={t} size="xs" />
            ) : (
              <span className="por-svcsum__icon" aria-hidden="true">
                <Icon name="users" size={14} />
              </span>
            )}
            {who}
          </span>
        )}
      </div>
      {onChange && (
        <Button variant="ghost" size="lg" className="por-svcsum__change" onClick={onChange}>
          Změnit
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Krok 2: terapeut                                                    */
/* ------------------------------------------------------------------ */

function TherapistStep({ service, flow, onPick }: { service: Service; flow: Flow; onPick: (id: Id | 'any') => void }): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const { client } = usePortal();
  const today = dateOf(now);
  const therapists = useMemo(() => activeTherapistsFor(clinic, service), [clinic, service]);
  const allowAny = clinic.settings.bookingRules.allowAnyTherapist && therapists.length > 1;

  const last = useMemo(() => {
    const list = bookingsOfClient(clinic, client.id).filter((b) => b.serviceId === service.id && (b.status === 'completed' || b.status === 'confirmed'));
    return list.length ? list[list.length - 1].therapistId : null;
  }, [clinic, client.id, service.id]);

  const firstSlot = useMemo(() => {
    const out = new Map<string, Slot | null>();
    const ids: (Id | 'any')[] = [...(allowAny ? (['any'] as const) : []), ...therapists.map((t) => t.id)];
    for (const id of ids) {
      const q: DayQuery = { serviceId: service.id, therapistId: id, now, clientId: client.id, ignoreBookingId: flow.original?.id, lastDate: flow.lastDate };
      const d = nearestFreeDate(clinic, q, today);
      out.set(id, d ? slotsFor(clinic, q, d)[0] ?? null : null);
    }
    return out;
  }, [clinic, service.id, therapists, allowAny, now, client.id, flow.original?.id, flow.lastDate, today]);

  const nearest = (id: Id | 'any'): string => {
    const sl = firstSlot.get(id);
    if (!sl) return 'V nejbližších týdnech nemá volno';
    const who = id === 'any' ? ` · ${therapistShort(getTherapist(clinic, sl.therapistId))}` : '';
    return `Nejdřív ${whenLabel(sl.start, now)}${who}`;
  };

  return (
    <section className="por-stack" aria-labelledby="por-th-title">
      <SectionTitle id="por-th-title">Kdo vás ošetří</SectionTitle>
      <div className="por-list">
        {allowAny && (
          <button type="button" className="por-pick" onClick={() => onPick('any')}>
            <span className="por-pick__any" aria-hidden="true">
              <Icon name="users" size={18} />
            </span>
            <span className="por-pick__body">
              <span className="por-pick__name">Kdokoli z týmu</span>
              <span className="por-pick__focus">Nabídneme nejvíc volných časů</span>
              <span className="por-pick__next">
                <Icon name="zap" size={14} />
                {nearest('any')}
              </span>
            </span>
            <Icon name="chevronRight" size={18} className="por-pick__chev" />
          </button>
        )}
        {therapists.map((t) => (
          <button key={t.id} type="button" className="por-pick" onClick={() => onPick(t.id)}>
            <TherapistAvatar therapist={t} size="md" />
            <span className="por-pick__body">
              <span className="por-pick__name">
                {therapistName(t)}
                {last === t.id && (
                  <Badge tone="accent" size="sm">
                    Naposledy
                  </Badge>
                )}
              </span>
              <span className="por-pick__focus">{t.focus}</span>
              <span className={cx('por-pick__next', !firstSlot.get(t.id) && 'is-none')}>
                <Icon name={firstSlot.get(t.id) ? 'clock' : 'calendarX'} size={14} />
                {nearest(t.id)}
              </span>
            </span>
            <Icon name="chevronRight" size={18} className="por-pick__chev" />
          </button>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Krok 3: datum a čas                                                 */
/* ------------------------------------------------------------------ */

function TimeStep({
  service,
  query,
  flow,
  date,
  winStart,
  slot,
  onDate,
  onWindow,
  onSlot,
}: {
  service: Service;
  query: DayQuery;
  flow: Flow;
  date: LocalDate;
  winStart: LocalDate;
  slot: Slot | null;
  onDate: (d: LocalDate) => void;
  onWindow: (d: LocalDate) => void;
  onSlot: (s: Slot | null) => void;
}): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const today = dateOf(now);
  const maxWinStart = maxWindowStart(clinic, flow, today);

  const dates = useMemo(() => Array.from({ length: STRIP_DAYS }, (_, i) => addDays(winStart, i)), [winStart]);
  const days = useMemo(() => dates.map((d) => dayInfo(clinic, query, d)), [clinic, query.serviceId, query.therapistId, query.now, query.ignoreBookingId, dates]);
  const info = useMemo(() => dayInfo(clinic, query, date), [clinic, query.serviceId, query.therapistId, query.now, date]);

  const slots = useMemo(() => {
    let list = slotsFor(clinic, query, date);
    if (flow.latestStart) list = list.filter((sl) => sl.start <= flow.latestStart!);
    if (flow.original) list = list.filter((sl) => !(sl.start === flow.original!.start && sl.therapistId === flow.original!.therapistId));
    return list;
  }, [clinic, query.serviceId, query.therapistId, query.now, date, flow.latestStart, flow.original]);

  const nearest = useMemo(() => nearestFreeDate(clinic, query, today), [clinic, query.serviceId, query.therapistId, query.now]);
  const nearestSlot = useMemo(() => (nearest ? slotsFor(clinic, query, nearest)[0] ?? null : null), [clinic, nearest, query.serviceId, query.therapistId, query.now]);

  const jump = (d: LocalDate): void => {
    onDate(d);
    if (d < winStart || d > addDays(winStart, STRIP_DAYS - 1)) onWindow(windowFor(d, today, maxWinStart));
  };

  const shiftWindow = (dir: 1 | -1): void => {
    let next = addDays(winStart, dir * STRIP_DAYS);
    if (next < today) next = today;
    if (next > maxWinStart) next = maxWinStart;
    onWindow(next);
    // vybrat první den nového okna, kde je volno
    const firstFree = Array.from({ length: STRIP_DAYS }, (_, i) => addDays(next, i)).find((d) => dayInfo(clinic, query, d).status === 'free');
    onDate(firstFree ?? next);
  };

  const isGroup = service.kind === 'group';

  return (
    <>
      <section className="por-stack por-stack--tight" aria-labelledby="por-days-title">
        <div className="por-days-head">
          <h2 id="por-days-title" className="por-sect__title">
            {monthRangeLabel(dates)}
          </h2>
          <div className="por-days-nav">
            <IconButton icon="chevronLeft" label="Předchozí dny" size="lg" disabled={winStart <= today} onClick={() => shiftWindow(-1)} />
            <IconButton icon="chevronRight" label="Další dny" size="lg" disabled={winStart >= maxWinStart} onClick={() => shiftWindow(1)} />
          </div>
        </div>
        <DayStrip days={days} value={date} onChange={onDate} />
        {nearest && nearestSlot && nearest !== date && (
          <button type="button" className="por-nearest" onClick={() => jump(nearest)}>
            <Icon name="zap" size={16} />
            <span>
              Nejbližší volný termín: <strong>{whenLabel(nearestSlot.start, now)}</strong>
            </span>
            <Icon name="arrowRight" size={16} />
          </button>
        )}
      </section>

      <section className="por-stack" aria-label={`Časy – ${formatDateLong(date, { year: false })}`}>
        {isGroup ? (
          <SessionList service={service} date={date} slots={slots} slot={slot} onSlot={onSlot} info={info} nearest={nearest} onJump={jump} />
        ) : slots.length > 0 ? (
          groupByDayPart(slots).map((g) => (
            <div key={g.part} className="por-slots">
              <h3 className="por-slots__label">{g.label}</h3>
              <ChoiceChips
                aria-label={`${g.label}: volné časy`}
                shape="tile"
                size="lg"
                columns={4}
                value={slot?.start ?? null}
                onChange={(v) => onSlot(slots.find((x) => x.start === v) ?? null)}
                options={g.slots.map((sl) => ({
                  value: sl.start,
                  label: formatTime(sl.start),
                  ariaLabel:
                    `${formatTime(sl.start)} až ${formatTime(sl.end)}` +
                    (query.therapistId === 'any' ? `, ${therapistName(getTherapist(clinic, sl.therapistId))}` : ''),
                }))}
              />
            </div>
          ))
        ) : (
          <NoSlots service={service} query={query} date={date} info={info} nearest={nearest} nearestSlot={nearestSlot} onJump={jump} flow={flow} />
        )}
      </section>
    </>
  );
}

function DayStrip({ days, value, onChange }: { days: DayInfo[]; value: LocalDate; onChange: (d: LocalDate) => void }): JSX.Element {
  const now = useNow();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const strip = ref.current;
    const el = strip?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!strip || !el) return;
    const left = el.offsetLeft - strip.offsetLeft;
    if (left < strip.scrollLeft || left + el.offsetWidth > strip.scrollLeft + strip.clientWidth) {
      strip.scrollTo({ left: Math.max(0, left - 8), behavior: 'smooth' });
    }
  }, [value, days]);

  return (
    <div ref={ref} className="por-strip" role="group" aria-label="Výběr dne">
      {days.map((d) => {
        const rel = relativeDay(d.date, now);
        const disabled = d.status === 'off' || d.status === 'closed' || d.status === 'none';
        const sub =
          d.status === 'closed'
            ? 'zavřeno'
            : d.status === 'full'
              ? 'plno'
              : d.status === 'off' && d.offReason === 'deadline'
                ? 'po lhůtě'
                : '';
        const state =
          d.status === 'free'
            ? 'volné termíny'
            : d.status === 'full'
              ? 'obsazeno'
              : d.status === 'closed'
                ? 'zavřeno'
                : d.status === 'none'
                  ? 'bez lekce'
                  : d.offReason === 'deadline'
                    ? 'po lhůtě náhrady'
                    : 'mimo nabídku';
        return (
          <button
            key={d.date}
            type="button"
            className={cx('por-day', `por-day--${d.status}`)}
            aria-pressed={d.date === value}
            aria-label={`${formatDateLong(d.date, { year: false })}${rel ? ` (${rel})` : ''}, ${state}`}
            disabled={disabled}
            onClick={() => onChange(d.date)}
          >
            <span className="por-day__dow">{rel === 'dnes' ? 'dnes' : WEEKDAY_SHORT[weekdayOf(d.date)]}</span>
            <span className="por-day__num tnum">{Number(d.date.slice(8, 10))}</span>
            <span className="por-day__sub">{d.status === 'free' ? <span className="por-day__dot" /> : sub}</span>
          </button>
        );
      })}
    </div>
  );
}

function NoSlots({
  service,
  query,
  date,
  info,
  nearest,
  nearestSlot,
  onJump,
  flow,
}: {
  service: Service;
  query: DayQuery;
  date: LocalDate;
  info: DayInfo;
  nearest: LocalDate | null;
  nearestSlot: Slot | null;
  onJump: (d: LocalDate) => void;
  flow: Flow;
}): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const { client } = usePortal();
  const [watchOpen, setWatchOpen] = useState(false);
  const watch = watchFor(clinic, client.id, service.id, date);
  const canWatch = clinic.settings.waitlist.enabled && !flow.original && info.status !== 'closed' && date >= dateOf(now);
  const run = useCommand();
  const title =
    info.status === 'closed' ? 'V tento den nemáme otevřeno' : date === dateOf(now) ? 'Dnes už je obsazeno' : 'Tento den je plně obsazený';
  return (
    <div className="por-empty">
      <EmptyState
        compact
        icon="calendarX"
        title={title}
        text={
          watch
            ? undefined
            : canWatch
              ? 'Zkuste jiný den, nebo si nechte hlídat uvolnění – když někdo termín zruší, pošleme vám nabídku.'
              : 'Vyberte prosím jiný den.'
        }
        action={
          <div className="por-empty-actions">
            {nearest && nearestSlot && (
              <Button variant="primary" icon="zap" onClick={() => onJump(nearest)}>
                {`Nejbližší volný: ${whenLabel(nearestSlot.start, now)}`}
              </Button>
            )}
            {canWatch && !watch && (
              <Button variant="secondary" icon="bell" onClick={() => setWatchOpen(true)}>
                Hlídat uvolnění termínu
              </Button>
            )}
          </div>
        }
      />
      {watch && (
        <Callout
          tone="success"
          icon="bell"
          title="Hlídáme uvolnění"
          actions={
            <Button size="sm" variant="secondary" onClick={() => run(leaveWaitlist, { entryId: watch.id }, { success: 'Hlídání zrušeno' })}>
              Zrušit hlídání
            </Button>
          }
        >
          Jakmile se {watch.dateFrom === watch.dateTo ? `${formatDayShort(watch.dateFrom)}` : `mezi ${formatDayShort(watch.dateFrom)} a ${formatDayShort(watch.dateTo)}`}{' '}
          uvolní termín, pošleme vám nabídku e-mailem i SMS.
        </Callout>
      )}
      <WatchSheet open={watchOpen} onClose={() => setWatchOpen(false)} service={service} therapistId={query.therapistId} date={date} lastDate={flow.lastDate} />
    </div>
  );
}

function WatchSheet({
  open,
  onClose,
  service,
  therapistId,
  date,
  lastDate,
}: {
  open: boolean;
  onClose: () => void;
  service: Service;
  therapistId: Id | 'any';
  date: LocalDate;
  lastDate: LocalDate | null;
}): JSX.Element {
  const clinic = useClinic();
  const { client } = usePortal();
  const run = useCommand();
  const [range, setRange] = useState<'day' | 'week'>('day');
  const [note, setNote] = useState('');
  let weekEnd = addDays(date, 6);
  if (lastDate && weekEnd > lastDate) weekEnd = lastDate;
  const t = therapistId !== 'any' ? getTherapist(clinic, therapistId) : undefined;
  const minutes = clinic.settings.waitlist.offerMinutes;
  const submit = (): void => {
    const r = run(
      joinWaitlist,
      { clientId: client.id, serviceId: service.id, therapistId: therapistId === 'any' ? null : therapistId, dateFrom: date, dateTo: range === 'week' ? weekEnd : date, note },
      { success: 'Hlídáme uvolnění termínu' },
    );
    if (r.ok) onClose();
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Hlídat uvolnění"
      footer={
        <Button variant="primary" size="lg" full icon="bell" onClick={submit}>
          Hlídat
        </Button>
      }
    >
      <div className="por-stack">
        <p className="por-lead">
          {service.name}
          {t ? ` · ${therapistName(t)}` : ' · kdokoli z týmu'}. Když se uvolní termín, pošleme vám nabídku – platí {formatDuration(minutes)} a
          získá ho ten, kdo potvrdí první.
        </p>
        <RadioCards<'day' | 'week'>
          legend="Kdy se vám to hodí"
          value={range}
          onChange={setRange}
          options={[
            { value: 'day', title: `Jen ${formatDateLong(date, { year: false })}` },
            ...(weekEnd > date
              ? [{ value: 'week' as const, title: `Kterýkoli den do ${formatDayShort(weekEnd)}`, description: 'Větší šance, že se něco uvolní.' }]
              : []),
          ]}
        />
        <Field label="Poznámka" optional hint="Např. „ideálně ráno“.">
          <Textarea rows={2} maxLength={200} value={note} onValueChange={setNote} />
        </Field>
      </div>
    </Sheet>
  );
}

function SessionList({
  service,
  date,
  slots,
  slot,
  onSlot,
  info,
  nearest,
  onJump,
}: {
  service: Service;
  date: LocalDate;
  slots: Slot[];
  slot: Slot | null;
  onSlot: (s: Slot | null) => void;
  info: DayInfo;
  nearest: LocalDate | null;
  onJump: (d: LocalDate) => void;
}): JSX.Element {
  const clinic = useClinic();
  const { client } = usePortal();
  const run = useCommand();
  const waitlistOn = clinic.settings.waitlist.enabled;
  if (!slots.length) {
    return (
      <EmptyState
        compact
        icon="calendarX"
        title={info.status === 'none' ? 'V tento den lekce není' : 'Na lekci už se nelze přihlásit'}
        text="Vyberte prosím jiný den – dny s lekcí mají v kalendáři tečku."
        action={
          nearest ? (
            <Button variant="primary" icon="zap" onClick={() => onJump(nearest)}>
              {`Nejbližší lekce: ${formatDayShort(nearest)}`}
            </Button>
          ) : undefined
        }
      />
    );
  }
  return (
    <div className="por-list" role="list" aria-label={`Lekce ${service.name}`}>
      {slots.map((sl) => {
        const ses = sl.sessionId ? getSession(clinic, sl.sessionId) : undefined;
        const free = sl.freeSpots ?? 0;
        const cap = sl.capacity ?? service.capacity;
        const full = free <= 0;
        const selected = slot?.sessionId === sl.sessionId;
        const watch = sl.sessionId ? watchFor(clinic, client.id, service.id, date, sl.sessionId) : undefined;
        const t = getTherapist(clinic, sl.therapistId);
        return (
          <div key={sl.sessionId ?? sl.start} role="listitem" className={cx('por-session', selected && 'is-selected', full && 'is-full')}>
            <button type="button" className="por-session__main" aria-pressed={selected} disabled={full} onClick={() => onSlot(sl)}>
              <span className="por-session__time tnum">{formatTimeRange(sl.start, sl.end)}</span>
              <span className="por-session__body">
                <span className="por-session__title">{ses?.title ?? service.name}</span>
                <span className="por-session__meta">
                  {therapistName(t)}
                  {ses ? ` · ${placeLabel(clinic, { serviceId: service.id, roomId: ses.roomId })}` : ''}
                </span>
                <span className="por-session__spots">
                  <Progress
                    value={cap - free}
                    max={cap}
                    size="sm"
                    tone={full ? 'danger' : free <= 2 ? 'warning' : 'accent'}
                    label={`Obsazenost ${cap - free} z ${cap}`}
                  />
                  <span className={cx('por-session__free', full && 'is-full')}>
                    {full ? 'Plně obsazeno' : `${countLabel(free, ['volné místo', 'volná místa', 'volných míst'])} z ${cap}`}
                  </span>
                </span>
              </span>
              <span className="por-session__radio" aria-hidden="true" />
            </button>
            {full && waitlistOn && sl.sessionId && (
              <div className="por-session__wait">
                {watch ? (
                  <>
                    <StateChip tone="success" icon="bell">
                      Jste na čekací listině
                    </StateChip>
                    <Button size="sm" variant="ghost" onClick={() => run(leaveWaitlist, { entryId: watch.id }, { success: 'Odhlášeno z čekací listiny' })}>
                      Odhlásit
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon="bell"
                    onClick={() =>
                      run(
                        joinWaitlist,
                        { clientId: client.id, serviceId: service.id, therapistId: sl.therapistId, dateFrom: date, sessionId: sl.sessionId },
                        { success: 'Jste na čekací listině', quiet: true },
                      )
                    }
                  >
                    Přidat se na čekací listinu
                  </Button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Krok 4: souhrn                                                      */
/* ------------------------------------------------------------------ */

function BookingPreview({ service, slot, original }: { service: Service; slot: Slot; original?: Booking }): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const cat = getCategory(clinic, service.categoryId);
  const t = getTherapist(clinic, slot.therapistId);
  const ses = slot.sessionId ? getSession(clinic, slot.sessionId) : undefined;
  const place = placeLabel(clinic, { serviceId: service.id, roomId: ses?.roomId ?? t?.roomId ?? '' });
  return (
    <Card className="por-preview" padding="md">
      <div className="por-preview__head">
        <DateBadge date={slot.start} tone={cat?.tone} size="lg" />
        <div className="por-preview__titles">
          <span className="por-preview__title">{ses?.title ?? service.name}</span>
          <span className="por-preview__when tnum">
            {formatDateLong(slot.start, { capital: true, year: false })} · {formatTimeRange(slot.start, slot.end)}
          </span>
          <span className="por-preview__rel">{relativeDay(slot.start, now) || formatDuration(service.durationMin)}</span>
        </div>
      </div>
      <DescriptionList
        termWidth={92}
        items={[
          { term: service.kind === 'group' ? 'Lektor' : 'Terapeut', detail: therapistName(t) },
          { term: 'Místo', detail: place || '—' },
          { term: 'Cena', detail: <span className="tnum">{formatMoney(service.priceCzk)}</span> },
          ...(original
            ? [{ term: 'Původně', detail: <span className="por-strike tnum">{`${formatDayShort(original.start)} ${formatTimeRange(original.start, original.end)}`}</span> }]
            : []),
        ]}
      />
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Krok 5: hotovo                                                      */
/* ------------------------------------------------------------------ */

function DoneStep({ bookingId, rescheduledFrom, onHome }: { bookingId: Id; rescheduledFrom?: Booking; onHome: () => void }): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const { client, go } = usePortal();
  const b = getBooking(clinic, bookingId);
  if (!b) {
    return (
      <Screen title="Rezervace" dock={null}>
        <EmptyState icon="info" title="Termín nebyl nalezen" action={<Button onClick={onHome}>Domů</Button>} />
      </Screen>
    );
  }
  const t = getTherapist(clinic, b.therapistId);
  const emailed = clinic.messages.some((m) => m.bookingId === b.id && m.status === 'sent' && m.channel === 'email');
  const smsed = clinic.messages.some((m) => m.bookingId === b.id && m.status === 'sent' && m.channel === 'sms');
  return (
    <Screen
      title={rescheduledFrom ? 'Přesun termínu' : 'Rezervace'}
      dock={
        <ActionBar>
          <Button variant="secondary" size="lg" onClick={() => go({ name: 'termin', bookingId: b.id })}>
            Detail termínu
          </Button>
          <Button variant="primary" size="lg" onClick={onHome}>
            Hotovo
          </Button>
        </ActionBar>
      }
    >
      <ResultHero title={rescheduledFrom ? 'Termín je přesunutý' : 'Termín je rezervovaný'}>
        <span className="tnum">
          {bookingTitle(clinic, b)} · {whenLabel(b.start, now)}
        </span>
      </ResultHero>
      <Card padding="md">
        <DescriptionList
          termWidth={92}
          items={[
            { term: 'Kdy', detail: <span className="tnum">{`${formatDateLong(b.start, { capital: true })}, ${formatTimeRange(b.start, b.end)}`}</span> },
            { term: b.sessionId ? 'Lektor' : 'Terapeut', detail: therapistName(t) },
            { term: 'Místo', detail: placeLabel(clinic, b) || '—' },
            { term: 'Platba', detail: paymentLabel(clinic, b) },
            ...(rescheduledFrom ? [{ term: 'Původně', detail: <span className="por-strike tnum">{`${formatDayShort(rescheduledFrom.start)} ${formatTime(rescheduledFrom.start)}`}</span> }] : []),
          ]}
        />
      </Card>
      {(emailed || smsed) && (
        <MetaLine icon="mail">
          Potvrzení jsme poslali {emailed ? `na ${client.email}` : ''}
          {emailed && smsed ? ' a ' : ''}
          {smsed ? 'SMS' : ''}.
        </MetaLine>
      )}
      <section className="por-stack por-stack--tight">
        <SectionTitle>Přidat do kalendáře</SectionTitle>
        <CopyBlock text={calendarText(clinic, b)} label="Text události pro kalendář" />
      </section>
    </Screen>
  );
}
