import { useMemo, useState } from 'react';
import type { Id } from '../../domain/types';
import { cancelBooking } from '../../engine/commands';
import { formatDayShort, formatMoney, formatPercent, formatTimeRange } from '../../engine/format';
import { evaluateCancellation, type CancelOptionKind } from '../../engine/policy';
import { clientName, getBooking, getClient, getService } from '../../engine/selectors';
import { PolicyTimeline } from '../../components/PolicyTimeline';
import { useClinic, useCommand, useNow } from '../../store/hooks';
import { Badge, Button, ChoiceChips, Dialog, EmptyState, Field, RadioCards, Textarea, toast } from '../../ui';
import './calendar.css';

export interface CancelBookingDialogProps {
  bookingId: Id | null;
  open: boolean;
  onClose: () => void;
  /** Předvybraná volba (např. „clinic“ z menu detailu). */
  initialOption?: CancelOptionKind;
}

const REASONS = ['Nemoc', 'Pracovní důvody', 'Rodina', 'Doprava', 'Jiné'] as const;

/** Zrušení / omluvení termínu: časová osa podmínek a volby z evaluateCancellation (staff). */
export function CancelBookingDialog({ bookingId, open, onClose, initialOption }: CancelBookingDialogProps): JSX.Element | null {
  if (!open || !bookingId) return null;
  return <CancelForm bookingId={bookingId} onClose={onClose} initialOption={initialOption} />;
}

function confirmLabel(kind: CancelOptionKind | null, fee: number): string {
  switch (kind) {
    case 'excuse':
      return 'Omluvit termín';
    case 'grace':
      return 'Zrušit bez poplatku';
    case 'fee':
      return fee > 0 ? `Zrušit s poplatkem ${formatMoney(fee)}` : 'Zrušit termín';
    case 'clinic':
      return 'Zrušit ze strany kliniky';
    default:
      return 'Zrušit termín';
  }
}

function CancelForm({ bookingId, onClose, initialOption }: { bookingId: Id; onClose: () => void; initialOption?: CancelOptionKind }): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const run = useCommand();
  const booking = getBooking(clinic, bookingId);
  const ev = useMemo(() => (booking ? evaluateCancellation(clinic, booking, now, 'staff') : null), [clinic, booking, now]);
  const options = ev?.options ?? [];
  const [choice, setChoice] = useState<CancelOptionKind | null>(() => {
    if (initialOption && options.some((o) => o.kind === initialOption)) return initialOption;
    return options.find((o) => o.recommended)?.kind ?? options[0]?.kind ?? null;
  });
  const [reasonChip, setReasonChip] = useState<string | null>(null);
  const [reasonText, setReasonText] = useState('');

  const selected = options.find((o) => o.kind === choice) ?? null;
  const client = booking ? getClient(clinic, booking.clientId) : undefined;
  const service = booking ? getService(clinic, booking.serviceId) : undefined;
  const isClinic = choice === 'clinic';

  const submit = (): void => {
    if (!booking || !selected) return;
    const reason = [reasonChip, reasonText.trim()].filter(Boolean).join(' – ');
    const r = run(cancelBooking, { bookingId: booking.id, option: selected.kind, reason }, { quiet: true });
    if (r.ok) {
      const head = selected.kind === 'excuse' ? 'Termín omluven' : selected.kind === 'clinic' ? 'Termín zrušen klinikou' : 'Termín zrušen';
      toast.success(head, { description: [r.value.message, ...r.notices].filter(Boolean).join(' ') || undefined });
      onClose();
    }
  };

  const title = booking && booking.status !== 'confirmed' ? 'Termín už nelze zrušit' : isClinic ? 'Zrušit ze strany kliniky' : 'Zrušit nebo omluvit termín';

  return (
    <Dialog
      open
      onClose={onClose}
      size="md"
      title={title}
      description={
        booking ? (
          <span className="tnum">
            {clientName(client)} · {service?.name ?? ''} · {formatDayShort(booking.start)} {formatTimeRange(booking.start, booking.end)}
          </span>
        ) : undefined
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} data-autofocus={selected?.feeAmount ? '' : undefined}>
            Zpět
          </Button>
          {selected && (
            <Button variant={selected.kind === 'fee' && selected.feeAmount > 0 ? 'danger' : 'primary'} onClick={submit}>
              {confirmLabel(selected.kind, selected.feeAmount)}
            </Button>
          )}
        </>
      }
    >
      {!booking || !ev ? (
        <EmptyState compact icon="alertCircle" title="Rezervace nebyla nalezena" />
      ) : booking.status !== 'confirmed' || options.length === 0 ? (
        <EmptyState
          compact
          icon="info"
          title={booking.status !== 'confirmed' ? 'Rezervace už není aktivní' : 'Pro tento termín teď není žádná volba zrušení'}
          text={ev.phase === 'past' ? 'Termín už proběhl – zapište docházku nebo nedostavení v detailu.' : undefined}
        />
      ) : (
        <div className="cal-form">
          <PolicyTimeline evaluation={ev} now={now} start={booking.start} />
          <p className="cal-lead">
            {ev.phase === 'free' && 'Jsme v bezplatné lhůtě – termín lze zrušit bez poplatku.'}
            {ev.phase === 'late' &&
              `Bezplatná lhůta uplynula, storno teď ${formatPercent(ev.feePct)}. ` +
                (ev.excuse.allowed
                  ? `Klient může použít omluvenku (zbývá ${ev.excuse.remaining} z ${ev.excuse.total}).`
                  : ev.excuse.reason)}
            {ev.phase === 'started' && 'Termín už začal – zbývá jen zrušení ze strany kliniky.'}
          </p>
          <RadioCards
            legend="Jak termín zrušit"
            value={choice}
            onChange={setChoice}
            options={options.map((o) => ({
              value: o.kind,
              title: o.title,
              description: o.description,
              badge: o.recommended ? (
                <Badge tone="success">Doporučeno</Badge>
              ) : o.staffOnly ? (
                <Badge tone="neutral">Jen personál</Badge>
              ) : undefined,
              aside: o.feeAmount > 0 ? formatMoney(o.feeAmount) : 'bez poplatku',
            }))}
          />
          <Field label="Důvod" optional>
            <div className="cal-reason">
              <ChoiceChips aria-label="Důvod zrušení" value={reasonChip} onChange={(v) => setReasonChip(v === reasonChip ? null : v)} options={REASONS.map((r) => ({ value: r, label: r }))} />
            </div>
          </Field>
          <Field label="Poznámka k důvodu" optional hint={isClinic ? 'Klient dostane omluvnou zprávu s tímto důvodem.' : 'Klient dostane potvrzení zrušení e-mailem nebo SMS podle svých souhlasů.'}>
            <Textarea value={reasonText} onValueChange={setReasonText} rows={2} placeholder={isClinic ? 'Např. nemoc terapeuta' : 'Např. horečka, doloží potvrzení'} />
          </Field>
        </div>
      )}
    </Dialog>
  );
}
