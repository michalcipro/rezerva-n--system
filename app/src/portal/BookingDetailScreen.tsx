import { useMemo, useState } from 'react';
import type { Booking, ClinicState, Id } from '../domain/types';
import { PolicyTimeline } from '../components/PolicyTimeline';
import { BookingStatusBadges, TherapistAvatar } from '../components/domain';
import { cancelBooking } from '../engine/commands';
import type { CancelOptionKind, CancellationEvaluation } from '../engine/policy';
import {
  countLabel,
  formatDateLong,
  formatDateTimeShort,
  formatDayShort,
  formatDuration,
  formatMoney,
  formatPercent,
  formatTimeRange,
} from '../engine/format';
import { paymentLabel } from '../engine/messages';
import {
  clientCredit,
  getBooking,
  getCategory,
  getPackage,
  getService,
  getTherapist,
  packageUsage,
  therapistName,
} from '../engine/selectors';
import { dateOf } from '../engine/time';
import { useClinic, useCommand, useNow } from '../store/hooks';
import {
  ActionBar,
  Badge,
  Button,
  Callout,
  Card,
  ChoiceChips,
  ConfirmDialog,
  DescriptionList,
  EmptyState,
  Field,
  Icon,
  Input,
  RadioCards,
  type RadioCardOption,
} from '../ui';
import { usePortal } from './context';
import { bookableServices, bookingTitle, calendarText, cancelState, excuseSentence, placeLabel, startsIn } from './logic';
import { PolicySheet } from './payment';
import { CopyBlock, DateBadge, ResultHero, Screen, SectionTitle, StateChip } from './parts';

type Mode = 'detail' | 'cancel' | 'done';

interface CancelResult {
  kind: CancelOptionKind;
  message: string;
}

export function BookingDetailScreen({ bookingId }: { bookingId: Id }): JSX.Element {
  const clinic = useClinic();
  const { client, go } = usePortal();
  const [mode, setMode] = useState<Mode>('detail');
  const [result, setResult] = useState<CancelResult | null>(null);
  const b = getBooking(clinic, bookingId);

  if (!b || b.clientId !== client.id) {
    return (
      <Screen title="Detail termínu" onBack={() => go({ name: 'moje' })}>
        <EmptyState
          icon="calendarX"
          title="Termín jsme nenašli"
          text="Možná patří jinému účtu nebo byl odstraněn."
          action={<Button onClick={() => go({ name: 'moje' })}>Moje termíny</Button>}
        />
      </Screen>
    );
  }
  if (mode === 'done' && result) return <CancelDone key="done" booking={b} result={result} />;
  if (mode === 'cancel')
    return (
      <CancelFlow
        key="cancel"
        booking={b}
        onBack={() => setMode('detail')}
        onDone={(r) => {
          setResult(r);
          setMode('done');
        }}
      />
    );
  return <Detail key="detail" booking={b} onCancel={() => setMode('cancel')} />;
}

/* ------------------------------------------------------------------ */
/* Detail                                                              */
/* ------------------------------------------------------------------ */

function Detail({ booking: b, onCancel }: { booking: Booking; onCancel: () => void }): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const { client, go } = usePortal();
  const [policyOpen, setPolicyOpen] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const svc = getService(clinic, b.serviceId);
  const cat = svc ? getCategory(clinic, svc.categoryId) : undefined;
  const t = getTherapist(clinic, b.therapistId);
  const upcoming = b.status === 'confirmed' && b.end > now;
  const future = upcoming && b.start > now;
  const cs = upcoming ? cancelState(clinic, b, now) : null;
  const ev = cs?.ev;
  const makeup = useMemo(() => clinic.makeups.find((m) => m.sourceBookingId === b.id), [clinic.makeups, b.id]);
  const rebookable = !client.blocked && bookableServices(clinic, client.id).some((s) => s.id === b.serviceId);
  const pkg = b.payment.packageId ? getPackage(clinic, b.payment.packageId) : undefined;
  const pkgUsage = pkg ? packageUsage(clinic, pkg, dateOf(now)) : undefined;
  const canReschedule =
    !!ev && future && !client.blocked && !svc?.newClientsOnly && (ev.phase === 'free' || ev.excuse.allowed) && b.payment.method !== 'makeup';
  const place = placeLabel(clinic, b);

  const items = [
    {
      term: 'Služba',
      detail: (
        <span className="por-dd">
          <span>{svc?.name ?? bookingTitle(clinic, b)}</span>
          <span className="por-dd__sub tnum">
            {svc ? formatDuration(svc.durationMin) : ''} · {formatMoney(b.price)}
          </span>
        </span>
      ),
    },
    {
      term: b.sessionId ? 'Lektor' : 'Terapeut',
      detail: (
        <span className="por-dd por-dd--row">
          <TherapistAvatar therapist={t} size="xs" />
          <span className="por-dd">
            <span>{therapistName(t)}</span>
            {t?.focus && <span className="por-dd__sub">{t.focus}</span>}
          </span>
        </span>
      ),
    },
    { term: 'Místo', detail: place || '—' },
    {
      term: 'Platba',
      detail: (
        <span className="por-dd">
          <span>{paymentLabel(clinic, b)}</span>
          {pkg && pkgUsage && b.payment.method === 'package' && (
            <span className="por-dd__sub">
              zbývá {pkgUsage.free} z {countLabel(pkgUsage.total, ['vstupu', 'vstupů', 'vstupů'])}
            </span>
          )}
          {b.payment.method === 'onsite' && !b.payment.paid && <span className="por-dd__sub">kartou nebo hotově na recepci</span>}
        </span>
      ),
    },
    ...(b.note ? [{ term: 'Poznámka', detail: b.note }] : []),
    ...(b.rescheduledFrom ? [{ term: 'Přesunuto', detail: <span className="tnum">{`z ${formatDateTimeShort(b.rescheduledFrom)}`}</span> }] : []),
    {
      term: 'Rezervováno',
      detail: (
        <span className="tnum">
          {formatDateTimeShort(b.createdAt)}
          {b.channel === 'online' ? ' · online' : b.channel === 'telefon' ? ' · telefonicky' : ' · na recepci'}
        </span>
      ),
    },
  ];

  return (
    <Screen title="Detail termínu" onBack={() => go({ name: 'moje' })} backLabel="Zpět na moje termíny">
      <section className="por-dhero" aria-label="Termín">
        <DateBadge date={b.start} tone={cat?.tone} size="lg" muted={!upcoming} />
        <div className="por-dhero__body">
          <h2 className="por-dhero__title">{bookingTitle(clinic, b)}</h2>
          <p className="por-dhero__when tnum">{formatDateLong(b.start, { capital: true })}</p>
          <p className="por-dhero__time tnum">
            {formatTimeRange(b.start, b.end)}
            {future ? ` · ${startsIn(b.start, now)}` : ''}
          </p>
        </div>
      </section>
      <div className="por-dhero__badges">
        <BookingStatusBadges booking={b} />
      </div>

      {b.fee?.status === 'due' && (
        <Callout tone="warning" title="Poplatek k úhradě">
          {b.fee.reason === 'no_show' ? 'Poplatek za nedostavení' : 'Storno poplatek'} {formatMoney(b.fee.amount)} ({formatPercent(b.fee.pct)}) uhradíte na
          recepci při příští návštěvě.
        </Callout>
      )}

      {b.status === 'excused' && makeup && makeup.status === 'open' && makeup.validUntil > now && (
        <Callout
          tone="accent"
          icon="repeat"
          title="Náhradní termín"
          actions={
            !client.blocked ? (
              <Button size="sm" variant="primary" onClick={() => go({ name: 'rezervace', makeupId: makeup.id })}>
                Vybrat náhradní termín
              </Button>
            ) : undefined
          }
        >
          Termín jste omluvili. Náhradu si vyberte do {formatDayShort(makeup.validUntil)}.
        </Callout>
      )}
      {b.status === 'excused' && makeup && makeup.status === 'used' && makeup.usedBookingId && (
        <Callout tone="success" icon="checkCircle">
          Náhradu jste využili:{' '}
          <button type="button" className="link" onClick={() => go({ name: 'termin', bookingId: makeup.usedBookingId! })}>
            zobrazit náhradní termín
          </button>
          .
        </Callout>
      )}
      {b.status === 'excused' && makeup && makeup.status === 'expired' && (
        <Callout tone="neutral">Lhůta pro výběr náhradního termínu uplynula {formatDayShort(makeup.validUntil)}.</Callout>
      )}
      {b.cancel && b.status !== 'confirmed' && b.status !== 'completed' && (
        <Callout tone="neutral" icon="info" title={b.status === 'clinic_cancelled' ? 'Zrušila klinika' : b.cancel.excuse ? 'Omluveno' : 'Zrušeno'}>
          {formatDateTimeShort(b.cancel.at)}
          {b.cancel.by === 'staff' && b.status !== 'clinic_cancelled' ? ' · na recepci' : ''}
          {b.cancel.reason ? ` · ${b.cancel.reason}` : ''}
          {b.fee && b.fee.status === 'paid' && b.fee.settledBy === 'package_entry' ? ' · vstup z permanentky propadl' : ''}
          {b.fee && b.fee.status === 'paid' && b.fee.settledBy !== 'package_entry' && b.fee.amount > 0 ? ` · poplatek ${formatMoney(b.fee.amount)} uhrazen` : ''}
          {b.fee && b.fee.status === 'waived' ? ' · bez poplatku' : ''}
        </Callout>
      )}

      <Card padding="none" className="por-dcard">
        <DescriptionList items={items} termWidth={96} />
      </Card>

      {upcoming && ev && (
        <section className="por-card por-stack" aria-label="Storno podmínky">
          <PolicyTimeline evaluation={ev} now={now} start={b.start} title="Storno podmínky tohoto termínu" />
          <p className={`por-explain por-explain--${cs?.tone ?? 'neutral'}`}>{explain(ev, b, clinic)}</p>
          <button type="button" className="link por-terms__link" onClick={() => setPolicyOpen(true)}>
            Storno podmínky kliniky
          </button>
        </section>
      )}

      {future && (
        <div className="por-actions">
          <Button
            variant="secondary"
            size="lg"
            icon="repeat"
            disabled={!canReschedule}
            onClick={() => go({ name: 'rezervace', rescheduleBookingId: b.id })}
          >
            Přesunout
          </Button>
          <Button variant="danger-secondary" size="lg" icon="calendarX" onClick={onCancel} disabled={!ev || ev.options.length === 0}>
            {ev?.excuse.allowed ? 'Zrušit / omluvit' : 'Zrušit termín'}
          </Button>
        </div>
      )}
      {future && !canReschedule && ev && (
        <p className="por-note">
          {client.blocked
            ? 'Přesun vám teď domluví recepce.'
            : svc?.newClientsOnly
              ? 'Vstupní vyšetření přesune recepce.'
              : b.payment.method === 'makeup'
                ? 'Náhradní termín už nelze přesunout – můžete ho jen zrušit.'
                : 'Bezplatná lhůta uplynula a omluvenku už uplatnit nejde, proto termín nelze přesunout.'}
        </p>
      )}

      {future && (
        <section className="por-stack por-stack--tight">
          <button type="button" className="por-disclosure" aria-expanded={calOpen} onClick={() => setCalOpen((v) => !v)}>
            <Icon name="calendarPlus" size={18} />
            <span>Přidat do kalendáře</span>
            <Icon name={calOpen ? 'chevronUp' : 'chevronDown'} size={18} />
          </button>
          {calOpen && <CopyBlock text={calendarText(clinic, b)} label="Text události pro kalendář" />}
        </section>
      )}

      {!upcoming && rebookable && (
        <Button variant="primary" size="lg" full icon="repeat" onClick={() => go({ name: 'rezervace', serviceId: b.serviceId })}>
          Rezervovat znovu
        </Button>
      )}

      <PolicySheet open={policyOpen} onClose={() => setPolicyOpen(false)} />
    </Screen>
  );
}

function explain(ev: CancellationEvaluation, b: Booking, clinic: ClinicState): string {
  if (ev.phase === 'free') return `Teď termín zrušíte nebo přesunete zdarma – nejpozději ${formatDateTimeShort(ev.freeUntil)}.`;
  if (ev.phase === 'started') return 'Termín právě probíhá.';
  if (ev.phase === 'past') return 'Termín už proběhl.';
  const impact = ev.lateImpact.replace(/\.$/, '');
  const base = `Bezplatná lhůta skončila ${formatDateTimeShort(ev.freeUntil)}. Při zrušení teď: ${impact.charAt(0).toLowerCase() + impact.slice(1)}.`;
  if (ev.excuse.allowed) return `${base} Při nemoci ale můžete termín omluvit bez poplatku (${excuseSentence(clinic, ev.excuse)}).`;
  if (ev.grace) return `${base} Máte ale k dispozici první pozdní zrušení zdarma.`;
  if (b.payment.method !== 'makeup' && ev.excuse.reason) return `${base} ${ev.excuse.reason}`;
  return base;
}

/* ------------------------------------------------------------------ */
/* Zrušení / omluvení                                                  */
/* ------------------------------------------------------------------ */

const REASONS = ['Nemoc', 'Práce', 'Rodina', 'Jiné'] as const;

function CancelFlow({ booking: b, onBack, onDone }: { booking: Booking; onBack: () => void; onDone: (r: CancelResult) => void }): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const run = useCommand();
  const { client, go } = usePortal();
  const svc = getService(clinic, b.serviceId);
  const cat = svc ? getCategory(clinic, svc.categoryId) : undefined;
  const t = getTherapist(clinic, b.therapistId);
  const ev = cancelState(clinic, b, now).ev;
  const options = ev.options.filter((o) => !o.staffOnly);
  const forfeit = ev.isGroup || (b.payment.method === 'package' && clinic.settings.policy.packageLateHandling === 'forfeit_entry');
  const canReschedule =
    !client.blocked && !svc?.newClientsOnly && b.payment.method !== 'makeup' && b.start > now && (ev.phase === 'free' || ev.excuse.allowed);
  const [choice, setChoice] = useState<string | null>(() => options.find((o) => o.recommended)?.kind ?? options[0]?.kind ?? null);
  const [reason, setReason] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const credit = clientCredit(clinic, client.id);

  const feeAside = (kind: CancelOptionKind, amount: number): string => {
    if (amount <= 0) return 'zdarma';
    if (kind === 'fee' && b.payment.method === 'makeup') return 'náhrada propadne';
    if (kind === 'fee' && forfeit && b.payment.method === 'package') return '1 vstup';
    return formatMoney(amount);
  };

  const describe = (kind: CancelOptionKind, description: string, amount: number): string => {
    if (kind === 'fee' && amount > 0 && b.payment.method === 'onsite' && !b.payment.paid) {
      return credit >= amount
        ? `${description.replace(/\.$/, '')} · uhradí se z kreditu (zůstatek ${formatMoney(credit)})`
        : `${description.replace(/\.$/, '')} · uhradíte na recepci`;
    }
    return description;
  };

  const radioOptions: RadioCardOption<string>[] = [
    ...options.map((o) => ({
      value: o.kind,
      title: o.title,
      description: describe(o.kind, o.description, o.feeAmount),
      aside: feeAside(o.kind, o.feeAmount),
      badge: o.recommended ? (
        <Badge tone="success" size="sm">
          Doporučeno
        </Badge>
      ) : undefined,
    })),
    ...(canReschedule
      ? [
          {
            value: 'reschedule',
            title: 'Přesunout na jiný termín',
            description:
              ev.phase === 'free'
                ? `Zdarma – vyberete nový čas a tento se uvolní.`
                : `Přesun po lhůtě se počítá jako omluva (${excuseSentence(clinic, ev.excuse)}).`,
            aside: ev.phase === 'free' ? 'zdarma' : 'omluvenka',
          },
        ]
      : []),
  ];

  const selected = options.find((o) => o.kind === choice);
  const reasonText = [reason, message.trim()].filter(Boolean).join(' – ');

  const cta =
    choice === 'reschedule'
      ? 'Vybrat nový termín'
      : choice === 'excuse'
        ? 'Omluvit termín'
        : choice === 'free'
          ? 'Zrušit termín zdarma'
          : choice === 'grace'
            ? 'Zrušit bez poplatku'
            : choice === 'fee'
              ? b.payment.method === 'makeup'
                ? 'Zrušit – náhrada propadne'
                : forfeit && b.payment.method === 'package'
                  ? 'Zrušit – vstup propadne'
                  : `Zrušit s poplatkem ${formatMoney(selected?.feeAmount ?? 0)}`
              : 'Pokračovat';

  const submit = (): void => {
    if (choice === 'reschedule') {
      go({ name: 'rezervace', rescheduleBookingId: b.id });
      return;
    }
    if (selected) setConfirmOpen(true);
  };

  const doCancel = (): void => {
    if (!selected) return;
    const r = run(cancelBooking, { bookingId: b.id, option: selected.kind, reason: reasonText }, { quiet: true });
    if (r.ok) onDone({ kind: selected.kind, message: r.value.message });
  };

  if (!options.length && !canReschedule) {
    return (
      <Screen title="Zrušit termín" onBack={onBack} dock={null}>
        <EmptyState
          icon="clock"
          title="Termín už zrušit nelze"
          text={ev.phase === 'started' ? 'Termín právě probíhá.' : 'Termín už začal nebo proběhl. S případnými dotazy se obraťte na recepci.'}
          action={<Button onClick={onBack}>Zpět na detail</Button>}
        />
      </Screen>
    );
  }

  return (
    <Screen
      title={ev.excuse.allowed ? 'Zrušit nebo omluvit' : 'Zrušit termín'}
      onBack={onBack}
      backLabel="Zpět na detail termínu"
      dock={
        <ActionBar>
          <Button variant={choice === 'fee' ? 'danger' : 'primary'} size="lg" disabled={!choice} onClick={submit}>
            {cta}
          </Button>
        </ActionBar>
      }
    >
      <section className="por-ccard" aria-label="Rušený termín">
        <DateBadge date={b.start} tone={cat?.tone} size="lg" />
        <div className="por-ccard__body">
          <span className="por-ccard__when tnum">
            {formatDayShort(b.start)} · {formatTimeRange(b.start, b.end)}
          </span>
          <span className="por-ccard__what">
            {bookingTitle(clinic, b)} · {therapistName(t)}
            {placeLabel(clinic, b) ? ` · ${placeLabel(clinic, b)}` : ''}
          </span>
          <span className="por-ccard__pay">
            <Icon name={b.payment.method === 'package' ? 'ticket' : b.payment.method === 'makeup' ? 'repeat' : 'receipt'} size={14} />
            {b.payment.method === 'package'
              ? `Hrazeno z permanentky ${b.payment.packageId ? getPackage(clinic, b.payment.packageId)?.name ?? '' : ''}`.trim()
              : b.payment.method === 'makeup'
                ? 'Náhradní termín za omluvenku'
                : `Platba ${paymentLabel(clinic, b)}`}
          </span>
        </div>
      </section>

      <section className="por-stack por-stack--tight" aria-label="Kdy rušíte">
        <PolicyTimeline evaluation={ev} now={now} start={b.start} title="Kdy rušíte" />
        <button type="button" className="link por-terms__link" onClick={() => setPolicyOpen(true)}>
          Storno podmínky kliniky
        </button>
      </section>

      {ev.phase === 'late' && !ev.excuse.allowed && b.payment.method !== 'makeup' && ev.excuse.reason && (
        <Callout tone="neutral" icon="info">
          Omluvenku teď uplatnit nejde: {ev.excuse.reason.charAt(0).toLowerCase() + ev.excuse.reason.slice(1)}
        </Callout>
      )}

      <RadioCards legend="Možnosti" value={choice} onChange={setChoice} options={radioOptions} />

      {choice !== 'reschedule' && (
        <section className="por-stack por-stack--tight" aria-labelledby="por-reason-title">
          <SectionTitle id="por-reason-title">Důvod</SectionTitle>
          <ChoiceChips
            aria-label="Důvod zrušení"
            size="lg"
            columns={4}
            value={reason}
            onChange={(v) => setReason((cur) => (cur === v ? null : v))}
            options={REASONS.map((r) => ({ value: r, label: r }))}
          />
          <Field label={`Zpráva pro ${b.sessionId ? 'lektora' : 'terapeuta'}`} optional>
            <Input size="lg" value={message} maxLength={200} onValueChange={setMessage} placeholder="Např. kdy by se vám hodil jiný termín" />
          </Field>
        </section>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={choice === 'excuse' ? 'Omluvit termín?' : 'Zrušit termín?'}
        message={
          <>
            <strong className="tnum">
              {bookingTitle(clinic, b)} · {formatDayShort(b.start)} {formatTimeRange(b.start, b.end)}
            </strong>
            <br />
            {selected ? describe(selected.kind, selected.description, selected.feeAmount) : ''}
          </>
        }
        confirmLabel={choice === 'excuse' ? 'Omluvit' : 'Zrušit termín'}
        cancelLabel="Ponechat termín"
        tone={choice === 'fee' ? 'danger' : 'primary'}
        onConfirm={doCancel}
      />
      <PolicySheet open={policyOpen} onClose={() => setPolicyOpen(false)} />
    </Screen>
  );
}

function CancelDone({ booking: b, result }: { booking: Booking; result: CancelResult }): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const { client, go } = usePortal();
  // stav po zrušení: náhrada vznikla jen u předplaceného omluveného termínu
  const openMakeup = clinic.makeups.find((m) => m.sourceBookingId === b.id && m.status === 'open' && m.validUntil > now);
  const excused = result.kind === 'excuse';
  const mailed = clinic.messages.some((m) => m.bookingId === b.id && m.status === 'sent' && m.channel === 'email' && m.at >= (b.cancel?.at ?? now));
  return (
    <Screen
      title={excused ? 'Omluvenka' : 'Zrušení termínu'}
      dock={
        <ActionBar>
          {openMakeup && !client.blocked ? (
            <>
              <Button variant="secondary" size="lg" onClick={() => go({ name: 'moje' })}>
                Později
              </Button>
              <Button variant="primary" size="lg" onClick={() => go({ name: 'rezervace', makeupId: openMakeup.id })}>
                Vybrat náhradní termín
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" size="lg" onClick={() => go({ name: 'moje' })}>
                Moje termíny
              </Button>
              {!client.blocked && (
                <Button variant="primary" size="lg" onClick={() => go({ name: 'rezervace', serviceId: b.serviceId })}>
                  Nový termín
                </Button>
              )}
            </>
          )}
        </ActionBar>
      }
    >
      <ResultHero tone={excused ? 'accent' : 'success'} icon={excused ? 'heart' : 'check'} title={excused ? 'Termín je omluvený' : 'Termín je zrušený'}>
        <span className="tnum">
          {bookingTitle(clinic, b)} · {formatDayShort(b.start)} {formatTimeRange(b.start, b.end)}
        </span>
      </ResultHero>
      <Callout tone={excused ? 'accent' : 'success'} icon={excused ? 'heart' : 'checkCircle'}>
        {result.message}
      </Callout>
      {openMakeup && (
        <Card padding="md" className="por-mkoffer">
          <span className="por-mkoffer__eyebrow">
            <Icon name="repeat" size={14} />
            Náhradní termín
          </span>
          <span className="por-mkoffer__title">Vyberte si náhradu do {formatDayShort(openMakeup.validUntil)}</span>
          <span className="por-mkoffer__text">
            Termín je předplacený, takže máte nárok na náhradu bez doplatku. Najdete ji i na úvodní obrazovce.
          </span>
        </Card>
      )}
      {mailed && (
        <StateChip tone="neutral" icon="mail">
          {`Potvrzení jsme poslali na ${client.email}.`}
        </StateChip>
      )}
    </Screen>
  );
}
