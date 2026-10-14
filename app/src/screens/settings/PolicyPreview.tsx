import { useId, useMemo, useState } from 'react';
import type { CancellationPolicy } from '../../domain/types';
import { formatDateTimeShort, formatDayShort, formatMoney, formatNumber, formatPercent } from '../../engine/format';
import { evaluateCancellation } from '../../engine/policy';
import { addDays, addMinutes, combine, dateOf, diffMinutes } from '../../engine/time';
import { useClinic, useNow } from '../../store/hooks';
import { Badge, Icon, Segmented, Select } from '../../ui';
import { PolicyTimeline } from '../../components/PolicyTimeline';
import {
  byOrder,
  cx,
  fallbackService,
  hoursText,
  policyClauses,
  policyRows,
  previewBooking,
  previewClinic,
  previewPackage,
  tiersFromEvaluation,
} from './helpers';

type Kind = 'individual' | 'group';
type Payment = 'onsite' | 'package';

/**
 * Živý náhled storno podmínek nad fiktivní rezervací zítra v 9:00.
 * Vše se počítá čistě nad kopií stavu s rozpracovanými podmínkami – skutečná data se nemění.
 */
export function PolicyPreview({ policy }: { policy: CancellationPolicy }): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const sliderId = useId();
  const [kind, setKind] = useState<Kind>('individual');
  const [payment, setPayment] = useState<Payment>('onsite');
  const [serviceId, setServiceId] = useState('');
  const [hours, setHours] = useState<number | null>(null);

  const services = useMemo(
    () => clinic.services.filter((s) => s.active && s.kind === kind && s.priceCzk > 0).sort(byOrder),
    [clinic.services, kind],
  );
  const service = services.find((s) => s.id === serviceId) ?? services[0] ?? fallbackService(kind);
  const individual = clinic.services.filter((s) => s.active && s.kind === 'individual').sort(byOrder)[0] ?? fallbackService('individual');

  const start = combine(addDays(dateOf(now), 1), '09:00');
  const windowHours = kind === 'group' ? policy.groupCancelHours : policy.freeCancelHours;
  const maxHours = Math.min(192, Math.max(24, Math.ceil((windowHours * 1.5 + 6) / 6) * 6));
  const realHours = Math.max(0, diffMinutes(start, now) / 60);
  const sliderValue = hours === null ? Math.min(maxHours, Math.round(realHours)) : Math.min(maxHours, hours);
  const cancelAt = hours === null && realHours <= maxHours ? now : addMinutes(start, -Math.round(sliderValue * 60));
  const hoursBefore = Math.max(0, diffMinutes(start, cancelAt) / 60);

  const pkg = useMemo(() => (payment === 'package' ? previewPackage(clinic, service, policy, now) : undefined), [payment, clinic, service, policy, now]);
  const state = useMemo(() => previewClinic(clinic, policy, pkg), [clinic, policy, pkg]);
  const booking = previewBooking({ service, start, createdAt: now, payment });
  const ev = evaluateCancellation(state, booking, cancelAt, 'client');

  const summaryState = useMemo(() => previewClinic(clinic, policy), [clinic, policy]);
  const summaryEval = evaluateCancellation(summaryState, previewBooking({ service: individual, start, createdAt: now, payment: 'onsite' }), now, 'client');
  const input = {
    policy,
    tiers: tiersFromEvaluation(summaryEval, start),
    packageExcuses: clinic.packageTemplates.filter((t) => t.active).map((t) => t.excusesAllowed),
  };
  const rows = policyRows(input);
  const clauses = policyClauses(input);

  let outcomeTone: 'success' | 'warning' | 'danger' | 'neutral' = 'neutral';
  let outcome = '';
  let outcomeDetail = '';
  if (ev.phase === 'free') {
    outcomeTone = 'success';
    outcome = 'Zrušení zdarma';
    outcomeDetail = payment === 'package' ? 'Vstup se vrátí na permanentku.' : 'Klient nic neplatí.';
  } else if (ev.phase === 'late') {
    outcomeTone = ev.feePct >= 100 ? 'danger' : 'warning';
    outcome = payment === 'package' && (ev.isGroup || policy.packageLateHandling === 'forfeit_entry') ? 'Vstup propadne' : ev.feePct > 0 ? `Poplatek ${formatMoney(ev.feeAmount)}` : 'Bez poplatku';
    outcomeDetail = ev.lateImpact;
    if (ev.excuse.allowed) outcomeDetail += ` Klient ale může termín omluvit (zbývá ${ev.excuse.remaining} z ${ev.excuse.total}).`;
    else if (ev.grace) outcomeDetail += ' Klient ale může využít první pozdní storno zdarma.';
  } else {
    outcomeTone = 'danger';
    outcome = 'Termín už začal';
    outcomeDetail =
      payment === 'package'
        ? 'Zrušit už nelze. Když klient nepřijde, vstup z permanentky propadne.'
        : `Zrušit už nelze. Když klient nepřijde, účtuje se ${formatPercent(policy.noShowFeePct)} (${formatMoney(Math.round((service.priceCzk * policy.noShowFeePct) / 100))}).`;
  }

  return (
    <div className="set-preview">
      <div className="set-preview__card">
        <div className="set-preview__head">
          <span className="set-preview__title">
            <Icon name="eye" size={16} /> Živý náhled
          </span>
          <span className="set-preview__hint">mění se s každou úpravou</span>
        </div>

        <div className="set-preview__controls">
          <Segmented<Kind>
            aria-label="Typ termínu v náhledu"
            size="sm"
            full
            value={kind}
            onChange={(k) => {
              setKind(k);
              setServiceId('');
            }}
            options={[
              { value: 'individual', label: 'Individuální' },
              { value: 'group', label: 'Skupinová lekce' },
            ]}
          />
          <Segmented<Payment>
            aria-label="Platba v náhledu"
            size="sm"
            full
            value={payment}
            onChange={setPayment}
            options={[
              { value: 'onsite', label: 'Platba na místě' },
              { value: 'package', label: 'Permanentka' },
            ]}
          />
          {services.length > 1 && (
            <Select
              size="sm"
              aria-label="Služba v náhledu"
              value={service.id}
              onValueChange={setServiceId}
              options={services.map((s) => ({ value: s.id, label: `${s.name} · ${formatMoney(s.priceCzk)}` }))}
            />
          )}
        </div>

        <p className="set-preview__booking">
          <Icon name="calendar" size={14} />
          <span>
            <strong>{service.name}</strong> · {formatDayShort(start)} 9:00 ·{' '}
            {payment === 'package' && pkg ? `permanentka ${pkg.name} (vstup ${formatMoney(Math.round(pkg.priceCzk / pkg.entriesTotal))})` : formatMoney(service.priceCzk)}
          </span>
        </p>

        <PolicyTimeline evaluation={ev} now={cancelAt} start={start} title="Fiktivní rezervace zítra v 9:00" />

        <div className="set-preview__slider">
          <div className="set-preview__slider-head">
            <label htmlFor={sliderId}>Klient ruší</label>
            <output htmlFor={sliderId} className="tnum">
              {hoursBefore >= 1 ? `${hoursText(Math.round(hoursBefore))} předem` : hoursBefore > 0 ? 'méně než hodinu předem' : 'po začátku'} ·{' '}
              {formatDateTimeShort(cancelAt)}
            </output>
          </div>
          <input
            id={sliderId}
            type="range"
            className="set-range-input"
            min={0}
            max={maxHours}
            step={1}
            value={sliderValue}
            aria-valuetext={`${hoursText(sliderValue)} před začátkem`}
            onChange={(e) => setHours(Number(e.target.value))}
          />
          <div className="set-preview__scale" aria-hidden="true">
            <span>{formatNumber(maxHours)} h předem</span>
            <span>začátek</span>
          </div>
          {hours !== null && (
            <button type="button" className="link set-preview__reset" onClick={() => setHours(null)}>
              Vrátit na teď ({formatDateTimeShort(now)})
            </button>
          )}
        </div>

        <div className={cx('set-outcome', `set-outcome--${outcomeTone}`)} aria-live="polite">
          <span className="set-outcome__title">{outcome}</span>
          <span className="set-outcome__text">{outcomeDetail}</span>
        </div>

        {ev.options.length > 0 && (
          <div className="set-preview__options">
            <span className="set-preview__label">Klient uvidí tyto možnosti</span>
            <ul>
              {ev.options.map((o) => (
                <li key={o.kind} className={cx('set-option', o.recommended && 'is-recommended')}>
                  <span className="set-option__title">
                    {o.title}
                    {o.recommended && ev.options.length > 1 && (
                      <Badge size="sm" tone="success">
                        Doporučeno
                      </Badge>
                    )}
                  </span>
                  <span className="set-option__desc">{o.description}</span>
                  {o.feeAmount > 0 && <span className="set-option__fee tnum">{formatMoney(o.feeAmount)}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="set-clientview" aria-labelledby="set-clientview-h">
        <div className="set-clientview__head">
          <h3 id="set-clientview-h" className="set-clientview__title">
            Storno podmínky
          </h3>
          <span className="set-clientview__badge">jak je čte klient</span>
        </div>
        <ul className="set-policy-rows">
          {rows.map((r, i) => (
            <li key={i} className={`set-policy-row set-policy-row--${r.tone}`}>
              <span className="set-policy-row__label">{r.label}</span>
              <span className="set-policy-row__value">{r.value}</span>
            </li>
          ))}
        </ul>
        <div className="set-clauses">
          {clauses.map((c) => (
            <p key={c.id} className="set-clause">
              <strong>{c.title}.</strong> {c.text}
            </p>
          ))}
        </div>
        <p className="set-clientview__foot">Text se skládá automaticky z nastavení – po uložení platí pro nové i stávající rezervace.</p>
      </div>
    </div>
  );
}
