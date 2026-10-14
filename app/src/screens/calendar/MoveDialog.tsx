import { useMemo } from 'react';
import type { Id, LocalDateTime } from '../../domain/types';
import { checkBookingSlot } from '../../engine/availability';
import { rescheduleBooking } from '../../engine/commands';
import { formatDateTimeShort, formatDayShort, formatTimeRange } from '../../engine/format';
import { evaluateCancellation } from '../../engine/policy';
import { clientName, getBooking, getClient, getService, getTherapist, therapistName } from '../../engine/selectors';
import { addMinutes, dateOf, diffMinutes } from '../../engine/time';
import { useClinic, useCommand, useNow } from '../../store/hooks';
import { Callout, ConfirmDialog, Icon, cx } from '../../ui';
import './calendar.css';

export interface MoveRequest {
  bookingId: Id;
  therapistId: Id;
  start: LocalDateTime;
}

interface SlotView {
  start: LocalDateTime;
  end: LocalDateTime;
  therapistId: Id;
}

/** „St 14. 10. 9:00–9:45 · Mgr. Tereza Malá → Čt 15. 10. 10:15–11:00 · Mgr. Jakub Říha“. */
export function MoveSummary({ from, to }: { from: SlotView; to: SlotView }): JSX.Element {
  const clinic = useClinic();
  const sameTherapist = from.therapistId === to.therapistId;
  return (
    <div className="cal-move">
      <div className="cal-move__side">
        <span className="cal-move__label">Původně</span>
        <span className="cal-move__time tnum">{formatTimeRange(from.start, from.end)}</span>
        <span className="cal-move__who tnum">{formatDayShort(from.start)}</span>
        <span className="cal-move__who">{therapistName(getTherapist(clinic, from.therapistId))}</span>
      </div>
      <Icon name="arrowRight" size={18} className="cal-move__arrow" />
      <div className="cal-move__side is-new">
        <span className="cal-move__label">Nově</span>
        <span className="cal-move__time tnum">{formatTimeRange(to.start, to.end)}</span>
        <span className={cx('cal-move__who tnum', dateOf(from.start) !== dateOf(to.start) && 'is-changed')}>{formatDayShort(to.start)}</span>
        <span className={cx('cal-move__who', !sameTherapist && 'is-changed')}>{therapistName(getTherapist(clinic, to.therapistId))}</span>
      </div>
    </div>
  );
}

/** Potvrzení přesunu po přetažení bloku v kalendáři. */
export function MoveDialog({ request, onClose }: { request: MoveRequest | null; onClose: () => void }): JSX.Element | null {
  if (!request) return null;
  return <MoveConfirm request={request} onClose={onClose} />;
}

function MoveConfirm({ request, onClose }: { request: MoveRequest; onClose: () => void }): JSX.Element | null {
  const clinic = useClinic();
  const now = useNow();
  const run = useCommand();
  const b = getBooking(clinic, request.bookingId);
  const check = useMemo(
    () =>
      b
        ? checkBookingSlot(clinic, {
            serviceId: b.serviceId,
            therapistId: request.therapistId,
            start: request.start,
            clientId: b.clientId,
            now,
            mode: 'staff',
            ignoreBookingId: b.id,
          })
        : null,
    [clinic, b, request, now],
  );
  if (!b) return null;
  const svc = getService(clinic, b.serviceId);
  const client = getClient(clinic, b.clientId);
  const end = addMinutes(request.start, diffMinutes(b.end, b.start));
  const warnings = check?.warnings ?? [];
  const errors = check?.errors ?? [];
  const ev = evaluateCancellation(clinic, b, now, 'staff');

  return (
    <ConfirmDialog
      open
      onClose={onClose}
      title="Přesunout termín?"
      message={`${clientName(client)} · ${svc?.name ?? ''}`}
      confirmLabel={warnings.length ? 'Přesunout i přesto' : 'Přesunout'}
      confirmDisabled={!check || errors.length > 0}
      onConfirm={() => {
        run(
          rescheduleBooking,
          { bookingId: b.id, start: request.start, therapistId: request.therapistId, override: warnings.length > 0 },
          { success: `Termín přesunut na ${formatDayShort(request.start)} ${formatTimeRange(request.start, end)}` },
        );
      }}
    >
      <div className="cal-form cal-form--tight">
        <MoveSummary from={{ start: b.start, end: b.end, therapistId: b.therapistId }} to={{ start: request.start, end, therapistId: request.therapistId }} />
        {errors.length > 0 && (
          <Callout tone="danger" title="Sem termín přesunout nelze">
            {errors.join(' ')}
          </Callout>
        )}
        {warnings.length > 0 && (
          <Callout tone="warning" title="Upozornění" icon="alert">
            <ul className="cal-msgs">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </Callout>
        )}
        <p className="cal-hint">
          {ev.phase === 'free'
            ? `Přesun je v bezplatné lhůtě (do ${formatDateTimeShort(ev.freeUntil)}).`
            : 'Bezplatná lhůta už uplynula – personál může termín přesunout bez sankce.'}{' '}
          Klient dostane zprávu o přesunu a původní čas se nabídne čekající listině.
        </p>
      </div>
    </ConfirmDialog>
  );
}
